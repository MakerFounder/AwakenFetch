/**
 * Injective (INJ) chain adapter.
 *
 * Fetches transactions from:
 *   1. Injective Explorer REST API — account transaction history
 *   2. Cosmos LCD endpoints — staking delegations and rewards
 *
 * and maps them to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - Transfers (MsgSend — bank sends/receives)
 *   - Staking (MsgDelegate, MsgUndelegate, MsgBeginRedelegate)
 *   - Rewards (MsgWithdrawDelegatorReward)
 *   - Swaps (MsgExecuteContract on DEX contracts — Helix, DojoSwap, etc.)
 *   - IBC transfers (MsgTransfer)
 *
 * The Injective Explorer API is public and requires no API key.
 * Address format: inj1… (bech32 with "inj" human-readable prefix, 42 chars).
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 INJ = 10^18 inj (smallest unit). */
const INJ_DECIMALS = 18;

/** Injective Explorer REST API base URL. */
const EXPLORER_API_BASE =
  "https://sentry.explorer.grpc-web.injective.network/api/explorer/v1";

/** Maximum results per page from the Explorer API. */
const PAGE_LIMIT = 100;

/**
 * Injective address regex.
 * Injective mainnet addresses: inj1 followed by 38 lowercase alphanumeric chars (bech32).
 */
const INJ_ADDRESS_REGEX = /^inj1[a-z0-9]{38}$/;

/** Known native denom for INJ. */
const INJ_DENOM = "inj";

// ---------------------------------------------------------------------------
// Explorer API response types
// ---------------------------------------------------------------------------

interface ExplorerCoin {
  denom: string;
  amount: string;
}

interface ExplorerMessage {
  type: string;
  value: Record<string, unknown>;
}

interface ExplorerEvent {
  type: string;
  attributes: Record<string, string>;
}

interface ExplorerTransaction {
  id: string;
  block_number: number;
  block_timestamp: string;
  hash: string;
  code: number;
  memo?: string;
  messages: ExplorerMessage[];
  tx_type: string;
  signatures?: unknown[];
  events?: ExplorerEvent[];
  gas_wanted: number;
  gas_used: number;
  gas_fee?: ExplorerCoin;
  error_log?: string;
}

interface ExplorerAccountTxsResponse {
  paging: {
    total: number;
    from: number;
    to: number;
  };
  data: ExplorerTransaction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw amount string with a denom to a human-readable number.
 * INJ uses 18 decimals; other tokens vary but we default to 18 for
 * factory/ and ibc/ denoms, and 6 for common stablecoins.
 */
export function parseAmount(amount: string, denom: string): number {
  const raw = Number(amount);
  if (Number.isNaN(raw) || raw === 0) return 0;

  // INJ native token: 18 decimals
  if (denom === INJ_DENOM || denom === "uinj") {
    // "inj" denom in Injective is actually in base units (10^18)
    return raw / Math.pow(10, INJ_DECIMALS);
  }

  // USDT, USDC, and other peggy tokens typically use 6 decimals
  if (
    denom.startsWith("peggy0x") ||
    denom.includes("usdt") ||
    denom.includes("usdc")
  ) {
    return raw / Math.pow(10, 6);
  }

  // IBC tokens — default to 6 decimals (most common)
  if (denom.startsWith("ibc/")) {
    return raw / Math.pow(10, 6);
  }

  // Factory tokens — default to 18 decimals
  if (denom.startsWith("factory/")) {
    return raw / Math.pow(10, INJ_DECIMALS);
  }

  // Fallback: assume 18 decimals
  return raw / Math.pow(10, INJ_DECIMALS);
}

/**
 * Convert a denom string to a human-readable currency symbol.
 */
export function denomToSymbol(denom: string): string {
  if (denom === INJ_DENOM) return "INJ";

  // Peggy bridge tokens (e.g., peggy0xdAC17F958D2ee523a2206206994597C13D831ec7 → USDT)
  const peggyMap: Record<string, string> = {
    "peggy0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
    "peggy0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
    "peggy0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  };

  const lowerDenom = denom.toLowerCase();
  if (peggyMap[lowerDenom]) return peggyMap[lowerDenom];

  // Shorten peggy addresses
  if (denom.startsWith("peggy0x")) {
    return `PEGGY-${denom.slice(7, 13).toUpperCase()}`;
  }

  // IBC denoms — shorten hash
  if (denom.startsWith("ibc/")) {
    return `IBC-${denom.slice(4, 10).toUpperCase()}`;
  }

  // Factory tokens — use the last segment
  if (denom.startsWith("factory/")) {
    const parts = denom.split("/");
    return parts[parts.length - 1].toUpperCase();
  }

  return denom.toUpperCase();
}

/**
 * Validate an Injective wallet address.
 *
 * Injective addresses use bech32 encoding with "inj" prefix.
 * Format: inj1<38 lowercase alphanumeric characters>
 * Total length: 42 characters.
 */
export function isValidInjectiveAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim().toLowerCase();
  return INJ_ADDRESS_REGEX.test(trimmed);
}

/**
 * Fetch JSON from Injective API with exponential backoff retry.
 */
async function fetchInjectiveWithRetry<T>(url: string): Promise<T> {
  return fetchWithRetry<T>(url, {
    errorLabel: "Injective API",
  });
}

// ---------------------------------------------------------------------------
// Message type classification
// ---------------------------------------------------------------------------

/** Cosmos SDK / Injective message types for classification. */
const MSG_SEND = "/cosmos.bank.v1beta1.MsgSend";
const MSG_MULTI_SEND = "/cosmos.bank.v1beta1.MsgMultiSend";
const MSG_DELEGATE = "/cosmos.staking.v1beta1.MsgDelegate";
const MSG_UNDELEGATE = "/cosmos.staking.v1beta1.MsgUndelegate";
const MSG_REDELEGATE = "/cosmos.staking.v1beta1.MsgBeginRedelegate";
const MSG_WITHDRAW_REWARDS =
  "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward";
const MSG_IBC_TRANSFER = "/ibc.applications.transfer.v1.MsgTransfer";
const MSG_EXECUTE_CONTRACT =
  "/cosmwasm.wasm.v1.MsgExecuteContract";
const MSG_EXEC = "/cosmos.authz.v1beta1.MsgExec";

// ---------------------------------------------------------------------------
// Transaction mapping
// ---------------------------------------------------------------------------

/**
 * Extract the first message type from an explorer transaction.
 */
function getPrimaryMessageType(tx: ExplorerTransaction): string {
  if (!tx.messages || tx.messages.length === 0) return "";
  return tx.messages[0].type ?? "";
}

/**
 * Extract fee information from an explorer transaction.
 */
function extractFee(tx: ExplorerTransaction): {
  feeAmount?: number;
  feeCurrency?: string;
} {
  if (!tx.gas_fee) return {};
  const amount = parseAmount(tx.gas_fee.amount, tx.gas_fee.denom);
  if (amount <= 0) return {};
  return {
    feeAmount: amount,
    feeCurrency: denomToSymbol(tx.gas_fee.denom),
  };
}

/**
 * Map a MsgSend transaction.
 */
function mapMsgSend(
  tx: ExplorerTransaction,
  msg: ExplorerMessage,
  address: string,
): Transaction | null {
  const value = msg.value;
  const fromAddress = (value.from_address as string) ?? "";
  const toAddress = (value.to_address as string) ?? "";
  const amounts = (value.amount as ExplorerCoin[]) ?? [];

  if (amounts.length === 0) return null;

  const coin = amounts[0];
  const quantity = parseAmount(coin.amount, coin.denom);
  const currency = denomToSymbol(coin.denom);
  const fee = extractFee(tx);
  const date = new Date(tx.block_timestamp);

  const normalizedAddress = address.trim().toLowerCase();
  const isSender = fromAddress.toLowerCase() === normalizedAddress;
  const isReceiver = toAddress.toLowerCase() === normalizedAddress;

  if (isSender && !isReceiver) {
    return {
      date,
      type: "send",
      sentQuantity: quantity,
      sentCurrency: currency,
      ...fee,
      txHash: tx.hash,
      notes: `Transfer to ${toAddress.slice(0, 10)}…`,
    };
  }

  if (isReceiver && !isSender) {
    return {
      date,
      type: "receive",
      receivedQuantity: quantity,
      receivedCurrency: currency,
      txHash: tx.hash,
      notes: `Transfer from ${fromAddress.slice(0, 10)}…`,
    };
  }

  // Self-transfer
  if (isSender && isReceiver) {
    return {
      date,
      type: "send",
      sentQuantity: quantity,
      sentCurrency: currency,
      receivedQuantity: quantity,
      receivedCurrency: currency,
      ...fee,
      txHash: tx.hash,
      notes: "Self-transfer",
    };
  }

  return null;
}

/**
 * Map a staking delegation transaction (MsgDelegate).
 */
function mapMsgDelegate(
  tx: ExplorerTransaction,
  msg: ExplorerMessage,
): Transaction {
  const value = msg.value;
  const amountObj = (value.amount as ExplorerCoin) ?? {
    amount: "0",
    denom: INJ_DENOM,
  };
  const quantity = parseAmount(amountObj.amount, amountObj.denom);
  const currency = denomToSymbol(amountObj.denom);
  const fee = extractFee(tx);
  const validator = (value.validator_address as string) ?? "";

  return {
    date: new Date(tx.block_timestamp),
    type: "stake",
    sentQuantity: quantity > 0 ? quantity : undefined,
    sentCurrency: quantity > 0 ? currency : undefined,
    ...fee,
    txHash: tx.hash,
    notes: `Delegate to ${validator.slice(0, 16)}…`,
    tag: "staked",
  };
}

/**
 * Map an undelegation transaction (MsgUndelegate).
 */
function mapMsgUndelegate(
  tx: ExplorerTransaction,
  msg: ExplorerMessage,
): Transaction {
  const value = msg.value;
  const amountObj = (value.amount as ExplorerCoin) ?? {
    amount: "0",
    denom: INJ_DENOM,
  };
  const quantity = parseAmount(amountObj.amount, amountObj.denom);
  const currency = denomToSymbol(amountObj.denom);
  const fee = extractFee(tx);
  const validator = (value.validator_address as string) ?? "";

  return {
    date: new Date(tx.block_timestamp),
    type: "unstake",
    receivedQuantity: quantity > 0 ? quantity : undefined,
    receivedCurrency: quantity > 0 ? currency : undefined,
    ...fee,
    txHash: tx.hash,
    notes: `Undelegate from ${validator.slice(0, 16)}…`,
    tag: "unstaked",
  };
}

/**
 * Map a withdraw delegator reward transaction (MsgWithdrawDelegatorReward).
 */
function mapMsgWithdrawRewards(
  tx: ExplorerTransaction,
  msg: ExplorerMessage,
): Transaction {
  const value = msg.value;
  const fee = extractFee(tx);
  const validator = (value.validator_address as string) ?? "";

  // Reward amounts are in events, not in the message value directly.
  // We'll look at events for the withdrawn reward.
  let rewardQuantity: number | undefined;
  let rewardCurrency: string | undefined;

  if (tx.events) {
    for (const event of tx.events) {
      if (event.type === "withdraw_rewards" || event.type === "coin_received") {
        const amountStr = event.attributes?.amount;
        if (amountStr) {
          // Parse "123456789inj" format
          const match = amountStr.match(/^(\d+)(.+)$/);
          if (match) {
            rewardQuantity = parseAmount(match[1], match[2]);
            rewardCurrency = denomToSymbol(match[2]);
          }
        }
      }
    }
  }

  return {
    date: new Date(tx.block_timestamp),
    type: "claim",
    receivedQuantity: rewardQuantity,
    receivedCurrency: rewardCurrency ?? "INJ",
    ...fee,
    txHash: tx.hash,
    notes: `Claim rewards from ${validator.slice(0, 16)}…`,
  };
}

/**
 * Map a contract execution (potential swap or DeFi interaction).
 */
function mapMsgExecuteContract(
  tx: ExplorerTransaction,
  msg: ExplorerMessage,
  address: string,
): Transaction {
  const value = msg.value;
  const fee = extractFee(tx);
  const contract = (value.contract as string) ?? "";
  const funds = (value.funds as ExplorerCoin[]) ?? [];

  // Try to identify the action from the msg field
  let action = "Contract execution";
  const msgField = value.msg;
  if (typeof msgField === "object" && msgField !== null) {
    const keys = Object.keys(msgField);
    if (keys.length > 0) {
      action = keys[0].replace(/_/g, " ");
    }
  }

  // Determine if this is a swap by looking at the action name
  const isSwap =
    action.toLowerCase().includes("swap") ||
    action.toLowerCase().includes("execute_swap");

  // If funds were sent with the contract call, record them
  let sentQuantity: number | undefined;
  let sentCurrency: string | undefined;
  if (funds.length > 0) {
    sentQuantity = parseAmount(funds[0].amount, funds[0].denom);
    sentCurrency = denomToSymbol(funds[0].denom);
  }

  // Try to find received tokens from events
  let receivedQuantity: number | undefined;
  let receivedCurrency: string | undefined;
  if (tx.events) {
    const normalizedAddress = address.trim().toLowerCase();
    for (const event of tx.events) {
      if (
        event.type === "coin_received" &&
        event.attributes?.receiver?.toLowerCase() === normalizedAddress
      ) {
        const amountStr = event.attributes?.amount;
        if (amountStr) {
          const match = amountStr.match(/^(\d+)(.+)$/);
          if (match) {
            receivedQuantity = parseAmount(match[1], match[2]);
            receivedCurrency = denomToSymbol(match[2]);
          }
        }
      }
    }
  }

  if (isSwap && sentQuantity && receivedQuantity) {
    return {
      date: new Date(tx.block_timestamp),
      type: "trade",
      sentQuantity,
      sentCurrency,
      receivedQuantity,
      receivedCurrency,
      ...fee,
      txHash: tx.hash,
      notes: `Swap on ${contract.slice(0, 10)}…`,
    };
  }

  // Generic contract interaction
  return {
    date: new Date(tx.block_timestamp),
    type: sentQuantity ? "send" : "other",
    sentQuantity,
    sentCurrency,
    receivedQuantity,
    receivedCurrency,
    ...fee,
    txHash: tx.hash,
    notes: `${action} (${contract.slice(0, 10)}…)`,
  };
}

/**
 * Map an IBC transfer transaction.
 */
function mapMsgIBCTransfer(
  tx: ExplorerTransaction,
  msg: ExplorerMessage,
  address: string,
): Transaction {
  const value = msg.value;
  const sender = (value.sender as string) ?? "";
  const receiver = (value.receiver as string) ?? "";
  const token = (value.token as ExplorerCoin) ?? {
    amount: "0",
    denom: INJ_DENOM,
  };
  const quantity = parseAmount(token.amount, token.denom);
  const currency = denomToSymbol(token.denom);
  const fee = extractFee(tx);
  const normalizedAddress = address.trim().toLowerCase();
  const isSender = sender.toLowerCase() === normalizedAddress;

  if (isSender) {
    return {
      date: new Date(tx.block_timestamp),
      type: "bridge",
      sentQuantity: quantity,
      sentCurrency: currency,
      ...fee,
      txHash: tx.hash,
      notes: `IBC transfer to ${receiver.slice(0, 10)}…`,
    };
  }

  return {
    date: new Date(tx.block_timestamp),
    type: "bridge",
    receivedQuantity: quantity,
    receivedCurrency: currency,
    txHash: tx.hash,
    notes: `IBC transfer from ${sender.slice(0, 10)}…`,
  };
}

/**
 * Map a single explorer transaction to one or more Transaction records.
 * Returns null for failed or irrelevant transactions.
 */
function mapTransaction(
  tx: ExplorerTransaction,
  address: string,
): Transaction | null {
  // Skip failed transactions
  if (tx.code !== 0) return null;

  const msgType = getPrimaryMessageType(tx);
  const msg = tx.messages[0];

  if (!msg) return null;

  switch (msgType) {
    case MSG_SEND:
      return mapMsgSend(tx, msg, address);

    case MSG_DELEGATE:
      return mapMsgDelegate(tx, msg);

    case MSG_UNDELEGATE:
      return mapMsgUndelegate(tx, msg);

    case MSG_REDELEGATE: {
      const fee = extractFee(tx);
      const validator = (msg.value.validator_dst_address as string) ?? "";
      return {
        date: new Date(tx.block_timestamp),
        type: "stake",
        ...fee,
        txHash: tx.hash,
        notes: `Redelegate to ${validator.slice(0, 16)}…`,
        tag: "staked",
      };
    }

    case MSG_WITHDRAW_REWARDS:
      return mapMsgWithdrawRewards(tx, msg);

    case MSG_EXECUTE_CONTRACT:
      return mapMsgExecuteContract(tx, msg, address);

    case MSG_IBC_TRANSFER:
      return mapMsgIBCTransfer(tx, msg, address);

    case MSG_MULTI_SEND: {
      // Simplified: treat as send/receive based on presence in inputs/outputs
      const fee = extractFee(tx);
      return {
        date: new Date(tx.block_timestamp),
        type: "other",
        ...fee,
        txHash: tx.hash,
        notes: "Multi-send transaction",
      };
    }

    case MSG_EXEC: {
      // Authz exec — wraps inner messages; treat as generic
      const fee = extractFee(tx);
      return {
        date: new Date(tx.block_timestamp),
        type: "other",
        ...fee,
        txHash: tx.hash,
        notes: "Authz exec",
      };
    }

    default: {
      // Unknown message type — record as "other"
      const fee = extractFee(tx);
      return {
        date: new Date(tx.block_timestamp),
        type: "other",
        ...fee,
        txHash: tx.hash,
        notes: `${msgType || "Unknown"} transaction`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for an address from the Injective Explorer API.
 * Uses skip/limit pagination.
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<ExplorerTransaction[]> {
  const results: ExplorerTransaction[] = [];
  let skip = 0;

  while (true) {
    const url = `${EXPLORER_API_BASE}/accountTxs/${address}?skip=${skip}&limit=${PAGE_LIMIT}`;
    const data = await fetchInjectiveWithRetry<ExplorerAccountTxsResponse>(url);

    if (!data.data || data.data.length === 0) break;

    results.push(...data.data);

    // Report progress for streaming: map this page's transactions and notify
    if (options?.onProgress && data.data.length > 0) {
      const batch = data.data
        .map((tx) => mapTransaction(tx, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    if (results.length >= data.paging.total || data.data.length < PAGE_LIMIT) {
      break;
    }

    skip += data.data.length;
  }

  // Apply date filtering if provided
  if (options?.fromDate || options?.toDate) {
    const fromMs = options.fromDate ? options.fromDate.getTime() : 0;
    const toMs = options.toDate ? options.toDate.getTime() : Infinity;

    return results.filter((tx) => {
      const txTime = new Date(tx.block_timestamp).getTime();
      return txTime >= fromMs && txTime <= toMs;
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Injective ChainAdapter
// ---------------------------------------------------------------------------

export const injectiveAdapter: ChainAdapter = {
  chainId: "injective",
  chainName: "Injective",
  perpsCapable: true,

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidInjectiveAddress(address)) {
      throw new Error(
        "Invalid Injective address. Expected format: inj1<38 lowercase alphanumeric chars> (e.g. inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz)",
      );
    }

    const rawTxs = await fetchAllTransactions(address, options);

    // Map to Transaction interface and filter nulls
    const transactions = rawTxs
      .map((tx) => mapTransaction(tx, address))
      .filter((tx): tx is Transaction => tx !== null);

    // Sort by date ascending
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return transactions;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://explorer.injective.network/transaction/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidInjectiveAddress(address);
  },
};
