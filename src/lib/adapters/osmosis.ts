/**
 * Osmosis (OSMO) chain adapter.
 *
 * Fetches transactions from the Osmosis LCD REST API
 * (https://lcd.osmosis.zone/) using the Cosmos SDK /cosmos/tx/v1beta1/txs
 * endpoint and maps them to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - Transfers (MsgSend — bank sends/receives)
 *   - Staking (MsgDelegate, MsgUndelegate, MsgBeginRedelegate)
 *   - Rewards (MsgWithdrawDelegatorReward)
 *   - LP add (MsgJoinPool, MsgJoinSwapExternAmountIn)
 *   - LP remove (MsgExitPool, MsgExitSwapShareAmountIn)
 *   - Swaps (MsgSwapExactAmountIn, MsgSwapExactAmountOut)
 *   - IBC transfers (MsgTransfer)
 *
 * The Osmosis LCD API is public and requires no API key.
 * Address format: osmo1… (bech32 with "osmo" prefix, 43 chars).
 *
 * OSMO has 6 decimal places (1 OSMO = 1,000,000 uosmo).
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 OSMO = 10^6 uosmo. */
const UOSMO_DIVISOR = 1_000_000;

/** Osmosis LCD API base URL (mainnet). */
const API_BASE = "https://lcd.osmosis.zone";

/** Maximum results per page from the Cosmos TX search API. */
const PAGE_LIMIT = 100;

/**
 * Osmosis address regex.
 * Osmosis mainnet addresses: osmo1 followed by 38 lowercase alphanumeric chars (bech32).
 * Total length: 43 characters.
 */
const OSMO_ADDRESS_REGEX = /^osmo1[a-z0-9]{38}$/;

/** Native OSMO denom. */
const OSMO_DENOM = "uosmo";

// ---------------------------------------------------------------------------
// Cosmos LCD API response types
// ---------------------------------------------------------------------------

interface CosmosCoin {
  denom: string;
  amount: string;
}

interface CosmosEvent {
  type: string;
  attributes: Array<{ key: string; value: string }>;
}

interface CosmosMessage {
  "@type": string;
  [key: string]: unknown;
}

interface CosmosTxBody {
  messages: CosmosMessage[];
  memo?: string;
}

interface CosmosAuthInfo {
  fee?: {
    amount: CosmosCoin[];
    gas_limit: string;
  };
}

interface CosmosTx {
  body: CosmosTxBody;
  auth_info: CosmosAuthInfo;
}

interface CosmosTxResponse {
  height: string;
  txhash: string;
  code?: number;
  timestamp: string;
  tx: CosmosTx;
  logs?: Array<{
    msg_index: number;
    events: CosmosEvent[];
  }>;
  events?: CosmosEvent[];
}

interface CosmosTxSearchResponse {
  tx_responses: CosmosTxResponse[] | null;
  pagination: {
    total: string;
    next_key?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw coin amount to a human-readable number.
 * Most Cosmos tokens use 6 decimals. IBC tokens default to 6.
 */
export function parseOsmosisAmount(amount: string, denom: string): number {
  const raw = Number(amount);
  if (Number.isNaN(raw) || raw === 0) return 0;

  // uosmo and most Cosmos tokens: 6 decimals
  if (
    denom === OSMO_DENOM ||
    denom.startsWith("u") ||
    denom.startsWith("ibc/") ||
    denom.startsWith("gamm/pool/") ||
    denom.startsWith("factory/")
  ) {
    return raw / UOSMO_DIVISOR;
  }

  // Fallback: assume 6 decimals
  return raw / UOSMO_DIVISOR;
}

/**
 * Convert a denom string to a human-readable currency symbol.
 */
export function denomToSymbol(denom: string): string {
  if (denom === OSMO_DENOM || denom === "osmo") return "OSMO";
  if (denom === "uion") return "ION";

  // GAMM LP share tokens
  if (denom.startsWith("gamm/pool/")) {
    const poolId = denom.replace("gamm/pool/", "");
    return `GAMM-${poolId}`;
  }

  // IBC denoms — shorten hash
  if (denom.startsWith("ibc/")) {
    // Well-known IBC denoms
    const ibcMap: Record<string, string> = {
      "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2":
        "ATOM",
      "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858":
        "USDC",
      "ibc/4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB":
        "USDT",
      "ibc/EA1D43981D5C9A1C4AAEA9C23BB1D4FA126BA9BC7020A25E0AE4AA841EA25DC5":
        "ETH",
    };
    if (ibcMap[denom]) return ibcMap[denom];
    return `IBC-${denom.slice(4, 10).toUpperCase()}`;
  }

  // Factory tokens — use the last segment
  if (denom.startsWith("factory/")) {
    const parts = denom.split("/");
    return parts[parts.length - 1].toUpperCase();
  }

  // Strip "u" prefix for common Cosmos denoms
  if (denom.startsWith("u") && denom.length > 1) {
    return denom.slice(1).toUpperCase();
  }

  return denom.toUpperCase();
}

/**
 * Validate an Osmosis wallet address.
 */
export function isValidOsmosisAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim().toLowerCase();
  return OSMO_ADDRESS_REGEX.test(trimmed);
}

// ---------------------------------------------------------------------------
// Message type constants
// ---------------------------------------------------------------------------

const MSG_SEND = "/cosmos.bank.v1beta1.MsgSend";
const MSG_DELEGATE = "/cosmos.staking.v1beta1.MsgDelegate";
const MSG_UNDELEGATE = "/cosmos.staking.v1beta1.MsgUndelegate";
const MSG_REDELEGATE = "/cosmos.staking.v1beta1.MsgBeginRedelegate";
const MSG_WITHDRAW_REWARDS =
  "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward";
const MSG_IBC_TRANSFER = "/ibc.applications.transfer.v1.MsgTransfer";

// Osmosis LP message types
const MSG_JOIN_POOL = "/osmosis.gamm.v1beta1.MsgJoinPool";
const MSG_JOIN_SWAP_EXTERN =
  "/osmosis.gamm.v1beta1.MsgJoinSwapExternAmountIn";
const MSG_EXIT_POOL = "/osmosis.gamm.v1beta1.MsgExitPool";
const MSG_EXIT_SWAP_SHARE =
  "/osmosis.gamm.v1beta1.MsgExitSwapShareAmountIn";

// Osmosis swap message types
const MSG_SWAP_EXACT_IN =
  "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn";
const MSG_SWAP_EXACT_OUT =
  "/osmosis.gamm.v1beta1.MsgSwapExactAmountOut";
// Poolmanager swaps (newer module)
const MSG_SWAP_EXACT_IN_V2 =
  "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn";
const MSG_SWAP_EXACT_OUT_V2 =
  "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountOut";

// Set of all LP join types
const LP_JOIN_TYPES = new Set([MSG_JOIN_POOL, MSG_JOIN_SWAP_EXTERN]);

// Set of all LP exit types
const LP_EXIT_TYPES = new Set([MSG_EXIT_POOL, MSG_EXIT_SWAP_SHARE]);

// Set of all swap types
const SWAP_TYPES = new Set([
  MSG_SWAP_EXACT_IN,
  MSG_SWAP_EXACT_OUT,
  MSG_SWAP_EXACT_IN_V2,
  MSG_SWAP_EXACT_OUT_V2,
]);

// ---------------------------------------------------------------------------
// Fee extraction
// ---------------------------------------------------------------------------

/**
 * Extract fee from a Cosmos transaction.
 */
function extractFee(tx: CosmosTxResponse): {
  feeAmount?: number;
  feeCurrency?: string;
} {
  const feeCoins = tx.tx.auth_info.fee?.amount;
  if (!feeCoins || feeCoins.length === 0) return {};
  const coin = feeCoins[0];
  const amount = parseOsmosisAmount(coin.amount, coin.denom);
  if (amount <= 0) return {};
  return {
    feeAmount: amount,
    feeCurrency: denomToSymbol(coin.denom),
  };
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

/**
 * Collect all attribute values for a given event type and key from logs.
 */
function findAllEventAttributes(
  tx: CosmosTxResponse,
  eventType: string,
  attrKey: string,
): string[] {
  const results: string[] = [];

  if (tx.logs) {
    for (const log of tx.logs) {
      for (const event of log.events) {
        if (event.type === eventType) {
          for (const attr of event.attributes) {
            if (attr.key === attrKey && attr.value) {
              results.push(attr.value);
            }
          }
        }
      }
    }
  }

  if (results.length === 0 && tx.events) {
    for (const event of tx.events) {
      if (event.type === eventType) {
        for (const attr of event.attributes) {
          if (attr.key === attrKey && attr.value) {
            results.push(attr.value);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Parse a coin string like "1000000uosmo" into amount and denom.
 */
function parseCoinString(coinStr: string): CosmosCoin | null {
  // Handle complex denoms: digits followed by everything else
  const match = coinStr.match(/^(\d+)(.+)$/);
  if (!match) return null;
  return { amount: match[1], denom: match[2] };
}

// ---------------------------------------------------------------------------
// Transaction mapping
// ---------------------------------------------------------------------------

/**
 * Map a MsgSend transaction.
 */
function mapMsgSend(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
  address: string,
): Transaction | null {
  const fromAddress = (msg.from_address as string) ?? "";
  const toAddress = (msg.to_address as string) ?? "";
  const amounts = (msg.amount as CosmosCoin[]) ?? [];

  if (amounts.length === 0) return null;

  const coin = amounts[0];
  const quantity = parseOsmosisAmount(coin.amount, coin.denom);
  const currency = denomToSymbol(coin.denom);
  const fee = extractFee(tx);
  const date = new Date(tx.timestamp);

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
      txHash: tx.txhash,
      notes: `Transfer to ${toAddress.slice(0, 10)}…`,
    };
  }

  if (isReceiver && !isSender) {
    return {
      date,
      type: "receive",
      receivedQuantity: quantity,
      receivedCurrency: currency,
      txHash: tx.txhash,
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
      txHash: tx.txhash,
      notes: "Self-transfer",
    };
  }

  return null;
}

/**
 * Map a staking delegation transaction (MsgDelegate).
 */
function mapMsgDelegate(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
): Transaction {
  const amountObj = (msg.amount as CosmosCoin) ?? {
    amount: "0",
    denom: OSMO_DENOM,
  };
  const quantity = parseOsmosisAmount(amountObj.amount, amountObj.denom);
  const currency = denomToSymbol(amountObj.denom);
  const fee = extractFee(tx);
  const validator = (msg.validator_address as string) ?? "";

  return {
    date: new Date(tx.timestamp),
    type: "stake",
    sentQuantity: quantity > 0 ? quantity : undefined,
    sentCurrency: quantity > 0 ? currency : undefined,
    ...fee,
    txHash: tx.txhash,
    notes: `Delegate to ${validator.slice(0, 16)}…`,
    tag: "staked",
  };
}

/**
 * Map an undelegation transaction (MsgUndelegate).
 */
function mapMsgUndelegate(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
): Transaction {
  const amountObj = (msg.amount as CosmosCoin) ?? {
    amount: "0",
    denom: OSMO_DENOM,
  };
  const quantity = parseOsmosisAmount(amountObj.amount, amountObj.denom);
  const currency = denomToSymbol(amountObj.denom);
  const fee = extractFee(tx);
  const validator = (msg.validator_address as string) ?? "";

  return {
    date: new Date(tx.timestamp),
    type: "unstake",
    receivedQuantity: quantity > 0 ? quantity : undefined,
    receivedCurrency: quantity > 0 ? currency : undefined,
    ...fee,
    txHash: tx.txhash,
    notes: `Undelegate from ${validator.slice(0, 16)}…`,
    tag: "unstaked",
  };
}

/**
 * Map a withdraw delegator reward transaction.
 */
function mapMsgWithdrawRewards(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
): Transaction {
  const fee = extractFee(tx);
  const validator = (msg.validator_address as string) ?? "";

  // Try to extract reward amount from events
  let rewardQuantity: number | undefined;
  let rewardCurrency: string | undefined;

  const rewardAmounts = findAllEventAttributes(
    tx,
    "withdraw_rewards",
    "amount",
  );
  if (rewardAmounts.length > 0 && rewardAmounts[0]) {
    const coin = parseCoinString(rewardAmounts[0]);
    if (coin) {
      rewardQuantity = parseOsmosisAmount(coin.amount, coin.denom);
      rewardCurrency = denomToSymbol(coin.denom);
    }
  }

  return {
    date: new Date(tx.timestamp),
    type: "claim",
    receivedQuantity: rewardQuantity,
    receivedCurrency: rewardCurrency ?? "OSMO",
    ...fee,
    txHash: tx.txhash,
    notes: `Claim rewards from ${validator.slice(0, 16)}…`,
  };
}

/**
 * Map an IBC transfer transaction.
 */
function mapMsgIBCTransfer(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
  address: string,
): Transaction {
  const sender = (msg.sender as string) ?? "";
  const receiver = (msg.receiver as string) ?? "";
  const token = (msg.token as CosmosCoin) ?? {
    amount: "0",
    denom: OSMO_DENOM,
  };
  const quantity = parseOsmosisAmount(token.amount, token.denom);
  const currency = denomToSymbol(token.denom);
  const fee = extractFee(tx);
  const normalizedAddress = address.trim().toLowerCase();
  const isSender = sender.toLowerCase() === normalizedAddress;

  if (isSender) {
    return {
      date: new Date(tx.timestamp),
      type: "bridge",
      sentQuantity: quantity,
      sentCurrency: currency,
      ...fee,
      txHash: tx.txhash,
      notes: `IBC transfer to ${receiver.slice(0, 10)}…`,
    };
  }

  return {
    date: new Date(tx.timestamp),
    type: "bridge",
    receivedQuantity: quantity,
    receivedCurrency: currency,
    txHash: tx.txhash,
    notes: `IBC transfer from ${sender.slice(0, 10)}…`,
  };
}

/**
 * Map LP join pool transactions (MsgJoinPool, MsgJoinSwapExternAmountIn).
 */
function mapLPJoin(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
): Transaction {
  const fee = extractFee(tx);
  const poolId = (msg.pool_id as string) ?? "";

  // For MsgJoinPool, tokenInMaxs contains the tokens being deposited
  const tokenInMaxs = (msg.token_in_maxs as CosmosCoin[]) ?? [];

  // For MsgJoinSwapExternAmountIn, token_in contains the single token
  const tokenIn = msg.token_in as CosmosCoin | undefined;

  // The share_out_amount indicates LP shares received
  const shareOutMin = (msg.share_out_amount as string) ?? "";

  let sentQuantity: number | undefined;
  let sentCurrency: string | undefined;

  if (tokenInMaxs.length > 0) {
    sentQuantity = parseOsmosisAmount(
      tokenInMaxs[0].amount,
      tokenInMaxs[0].denom,
    );
    sentCurrency = denomToSymbol(tokenInMaxs[0].denom);
  } else if (tokenIn) {
    sentQuantity = parseOsmosisAmount(tokenIn.amount, tokenIn.denom);
    sentCurrency = denomToSymbol(tokenIn.denom);
  }

  // Try to get actual tokens spent from events
  const spentAmounts = findAllEventAttributes(tx, "coin_spent", "amount");
  if (spentAmounts.length > 0 && !sentQuantity) {
    const coin = parseCoinString(spentAmounts[0]);
    if (coin) {
      sentQuantity = parseOsmosisAmount(coin.amount, coin.denom);
      sentCurrency = denomToSymbol(coin.denom);
    }
  }

  // LP shares received
  let receivedQuantity: number | undefined;
  let receivedCurrency: string | undefined;
  if (shareOutMin) {
    receivedQuantity = parseOsmosisAmount(
      shareOutMin,
      `gamm/pool/${poolId}`,
    );
    receivedCurrency = `GAMM-${poolId}`;
  }

  // Try to get actual LP shares from events
  const receivedAmounts = findAllEventAttributes(
    tx,
    "coin_received",
    "amount",
  );
  for (const amt of receivedAmounts) {
    if (amt.includes("gamm/pool/")) {
      const coin = parseCoinString(amt);
      if (coin) {
        receivedQuantity = parseOsmosisAmount(coin.amount, coin.denom);
        receivedCurrency = denomToSymbol(coin.denom);
        break;
      }
    }
  }

  return {
    date: new Date(tx.timestamp),
    type: "lp_add",
    sentQuantity,
    sentCurrency,
    receivedQuantity,
    receivedCurrency,
    ...fee,
    txHash: tx.txhash,
    notes: `Add liquidity to pool ${poolId}`,
  };
}

/**
 * Map LP exit pool transactions (MsgExitPool, MsgExitSwapShareAmountIn).
 */
function mapLPExit(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
): Transaction {
  const fee = extractFee(tx);
  const poolId = (msg.pool_id as string) ?? "";

  // LP shares being burned
  const shareInAmount = (msg.share_in_amount as string) ?? "";

  let sentQuantity: number | undefined;
  let sentCurrency: string | undefined;
  if (shareInAmount) {
    sentQuantity = parseOsmosisAmount(
      shareInAmount,
      `gamm/pool/${poolId}`,
    );
    sentCurrency = `GAMM-${poolId}`;
  }

  // Tokens received from exiting
  let receivedQuantity: number | undefined;
  let receivedCurrency: string | undefined;

  // For MsgExitPool, tokenOutMins lists expected tokens
  const tokenOutMins = (msg.token_out_mins as CosmosCoin[]) ?? [];
  if (tokenOutMins.length > 0) {
    receivedQuantity = parseOsmosisAmount(
      tokenOutMins[0].amount,
      tokenOutMins[0].denom,
    );
    receivedCurrency = denomToSymbol(tokenOutMins[0].denom);
  }

  // For MsgExitSwapShareAmountIn, token_out_denom and token_out_min_amount
  const tokenOutDenom = msg.token_out_denom as string | undefined;
  const tokenOutMinAmount = msg.token_out_min_amount as string | undefined;
  if (tokenOutDenom && tokenOutMinAmount && !receivedQuantity) {
    receivedQuantity = parseOsmosisAmount(tokenOutMinAmount, tokenOutDenom);
    receivedCurrency = denomToSymbol(tokenOutDenom);
  }

  // Try to get actual tokens received from events
  const receivedAmounts = findAllEventAttributes(
    tx,
    "coin_received",
    "amount",
  );
  for (const amt of receivedAmounts) {
    if (!amt.includes("gamm/pool/")) {
      const coin = parseCoinString(amt);
      if (coin) {
        receivedQuantity = parseOsmosisAmount(coin.amount, coin.denom);
        receivedCurrency = denomToSymbol(coin.denom);
        break;
      }
    }
  }

  return {
    date: new Date(tx.timestamp),
    type: "lp_remove",
    sentQuantity,
    sentCurrency,
    receivedQuantity,
    receivedCurrency,
    ...fee,
    txHash: tx.txhash,
    notes: `Remove liquidity from pool ${poolId}`,
  };
}

/**
 * Map swap transactions (MsgSwapExactAmountIn, MsgSwapExactAmountOut).
 */
function mapSwap(
  tx: CosmosTxResponse,
  msg: CosmosMessage,
): Transaction {
  const fee = extractFee(tx);

  // MsgSwapExactAmountIn
  const tokenIn = msg.token_in as CosmosCoin | undefined;
  const tokenOutMinAmount = msg.token_out_min_amount as string | undefined;

  // MsgSwapExactAmountOut
  const tokenOut = msg.token_out as CosmosCoin | undefined;
  const tokenInMaxAmount = msg.token_in_max_amount as string | undefined;

  // Routes contain pool_id and token_out_denom
  const routes = (msg.routes as Array<{
    pool_id: string;
    token_out_denom?: string;
    token_in_denom?: string;
  }>) ?? [];

  let sentQuantity: number | undefined;
  let sentCurrency: string | undefined;
  let receivedQuantity: number | undefined;
  let receivedCurrency: string | undefined;

  if (tokenIn) {
    sentQuantity = parseOsmosisAmount(tokenIn.amount, tokenIn.denom);
    sentCurrency = denomToSymbol(tokenIn.denom);
  }

  if (tokenOut) {
    receivedQuantity = parseOsmosisAmount(tokenOut.amount, tokenOut.denom);
    receivedCurrency = denomToSymbol(tokenOut.denom);
  }

  // Infer from routes when direct values missing
  if (!receivedCurrency && routes.length > 0) {
    const lastRoute = routes[routes.length - 1];
    if (lastRoute.token_out_denom) {
      receivedCurrency = denomToSymbol(lastRoute.token_out_denom);
    }
  }

  if (!sentCurrency && routes.length > 0 && routes[0].token_in_denom) {
    sentCurrency = denomToSymbol(routes[0].token_in_denom);
  }

  // Fill amounts from min/max when actual amounts not available
  if (!sentQuantity && tokenInMaxAmount && sentCurrency) {
    // We don't have the denom for tokenInMaxAmount without routes
    if (routes.length > 0 && routes[0].token_in_denom) {
      sentQuantity = parseOsmosisAmount(
        tokenInMaxAmount,
        routes[0].token_in_denom,
      );
    }
  }

  if (!receivedQuantity && tokenOutMinAmount && routes.length > 0) {
    const lastRoute = routes[routes.length - 1];
    if (lastRoute.token_out_denom) {
      receivedQuantity = parseOsmosisAmount(
        tokenOutMinAmount,
        lastRoute.token_out_denom,
      );
    }
  }

  // Try to get actual amounts from events
  const tokenSwappedAmounts = findAllEventAttributes(
    tx,
    "token_swapped",
    "tokens_in",
  );
  if (tokenSwappedAmounts.length > 0 && !sentQuantity) {
    const coin = parseCoinString(tokenSwappedAmounts[0]);
    if (coin) {
      sentQuantity = parseOsmosisAmount(coin.amount, coin.denom);
      sentCurrency = denomToSymbol(coin.denom);
    }
  }

  const tokenSwappedOut = findAllEventAttributes(
    tx,
    "token_swapped",
    "tokens_out",
  );
  if (tokenSwappedOut.length > 0 && !receivedQuantity) {
    const coin = parseCoinString(tokenSwappedOut[0]);
    if (coin) {
      receivedQuantity = parseOsmosisAmount(coin.amount, coin.denom);
      receivedCurrency = denomToSymbol(coin.denom);
    }
  }

  const poolId =
    routes.length > 0 ? routes[0].pool_id : "unknown";

  return {
    date: new Date(tx.timestamp),
    type: "trade",
    sentQuantity,
    sentCurrency,
    receivedQuantity,
    receivedCurrency,
    ...fee,
    txHash: tx.txhash,
    notes: `Swap via pool ${poolId}`,
  };
}

/**
 * Map a single transaction to a Transaction record.
 * Returns null for failed or irrelevant transactions.
 */
function mapTransaction(
  tx: CosmosTxResponse,
  address: string,
): Transaction | null {
  // Skip failed transactions
  if (tx.code && tx.code !== 0) return null;

  const messages = tx.tx.body.messages;
  if (!messages || messages.length === 0) return null;

  const msg = messages[0];
  const msgType = msg["@type"] ?? "";

  // MsgSend
  if (msgType === MSG_SEND) {
    return mapMsgSend(tx, msg, address);
  }

  // Staking
  if (msgType === MSG_DELEGATE) {
    return mapMsgDelegate(tx, msg);
  }

  if (msgType === MSG_UNDELEGATE) {
    return mapMsgUndelegate(tx, msg);
  }

  if (msgType === MSG_REDELEGATE) {
    const fee = extractFee(tx);
    const validator = (msg.validator_dst_address as string) ?? "";
    return {
      date: new Date(tx.timestamp),
      type: "stake",
      ...fee,
      txHash: tx.txhash,
      notes: `Redelegate to ${validator.slice(0, 16)}…`,
      tag: "staked",
    };
  }

  // Rewards
  if (msgType === MSG_WITHDRAW_REWARDS) {
    return mapMsgWithdrawRewards(tx, msg);
  }

  // IBC
  if (msgType === MSG_IBC_TRANSFER) {
    return mapMsgIBCTransfer(tx, msg, address);
  }

  // LP join
  if (LP_JOIN_TYPES.has(msgType)) {
    return mapLPJoin(tx, msg);
  }

  // LP exit
  if (LP_EXIT_TYPES.has(msgType)) {
    return mapLPExit(tx, msg);
  }

  // Swap
  if (SWAP_TYPES.has(msgType)) {
    return mapSwap(tx, msg);
  }

  // Unknown — record as "other"
  const fee = extractFee(tx);
  return {
    date: new Date(tx.timestamp),
    type: "other",
    ...fee,
    txHash: tx.txhash,
    notes: `${msgType || "Unknown"} transaction`,
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch transactions for an address from the Osmosis LCD API.
 * Queries both sender and recipient events, deduplicates by txhash.
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<CosmosTxResponse[]> {
  const allTxs = new Map<string, CosmosTxResponse>();

  // Fetch transactions where address is sender
  await fetchTxsByEvent(
    `message.sender='${address}'`,
    allTxs,
    options,
    address,
  );

  // Fetch transactions where address is recipient
  await fetchTxsByEvent(
    `transfer.recipient='${address}'`,
    allTxs,
    options,
    address,
  );

  const results = Array.from(allTxs.values());

  // Apply date filtering
  if (options?.fromDate || options?.toDate) {
    const fromMs = options.fromDate ? options.fromDate.getTime() : 0;
    const toMs = options.toDate ? options.toDate.getTime() : Infinity;

    return results.filter((tx) => {
      const txTime = new Date(tx.timestamp).getTime();
      return txTime >= fromMs && txTime <= toMs;
    });
  }

  return results;
}

/**
 * Fetch transactions matching a specific event query with pagination.
 */
async function fetchTxsByEvent(
  eventQuery: string,
  txMap: Map<string, CosmosTxResponse>,
  options?: FetchOptions,
  address?: string,
): Promise<void> {
  let page = 1;
  const limit = options?.limit ?? PAGE_LIMIT;

  while (true) {
    const url = `${API_BASE}/cosmos/tx/v1beta1/txs?events=${encodeURIComponent(eventQuery)}&pagination.limit=${limit}&pagination.offset=${(page - 1) * limit}&order_by=ORDER_BY_DESC`;

    const data = await fetchWithRetry<CosmosTxSearchResponse>(url, {
      errorLabel: "Osmosis LCD",
    });

    if (!data.tx_responses || data.tx_responses.length === 0) break;

    const newTxs: CosmosTxResponse[] = [];
    for (const tx of data.tx_responses) {
      if (!txMap.has(tx.txhash)) {
        txMap.set(tx.txhash, tx);
        newTxs.push(tx);
      }
    }

    // Report progress for streaming
    if (options?.onProgress && address && newTxs.length > 0) {
      const batch = newTxs
        .map((tx) => mapTransaction(tx, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    const total = Number(data.pagination.total || 0);
    if (page * limit >= total || data.tx_responses.length < limit) {
      break;
    }

    page++;
  }
}

// ---------------------------------------------------------------------------
// Osmosis ChainAdapter
// ---------------------------------------------------------------------------

export const osmosisAdapter: ChainAdapter = {
  chainId: "osmosis",
  chainName: "Osmosis",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidOsmosisAddress(address)) {
      throw new Error(
        "Invalid Osmosis address. Expected format: osmo1<38 lowercase alphanumeric chars> (e.g. osmo1clpqr4nrk4khgkxj78fcwwh6dl3uw4ep88n0y4)",
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
    return `https://www.mintscan.io/osmosis/tx/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidOsmosisAddress(address);
  },
};
