/**
 * MultiversX (EGLD) chain adapter.
 *
 * Fetches transactions from the MultiversX API (https://api.multiversx.com/)
 * and maps them to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - Transfers (EGLD sends/receives)
 *   - Staking (delegate, unDelegate, claimRewards, reDelegateRewards)
 *   - ESDT token transfers (ESDTTransfer, ESDTNFTTransfer, MultiESDTNFTTransfer)
 *   - Swaps (via smart contract calls on xExchange / Ashswap etc.)
 *
 * The MultiversX API is public and requires no API key.
 * Rate limit: 2 requests / IP / second on mainnet.
 * Address format: erd1… (bech32, 62 characters total).
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 EGLD = 10^18 smallest unit (denomination). */
const EGLD_DECIMALS = 18;

/** MultiversX API base URL (mainnet). */
const API_BASE = "https://api.multiversx.com";

/** Maximum results per page from the API. */
const PAGE_SIZE = 50;

/**
 * MultiversX address regex.
 * Addresses use bech32 encoding with "erd" HRP: erd1 followed by 58 lowercase alphanumeric chars.
 * Total length: 62 characters.
 */
const EGLD_ADDRESS_REGEX = /^erd1[a-z0-9]{58}$/;

// ---------------------------------------------------------------------------
// MultiversX API response types
// ---------------------------------------------------------------------------

interface MultiversXAction {
  category: string;
  name: string;
  description?: string;
  arguments?: Record<string, unknown>;
}

interface MultiversXTransaction {
  txHash: string;
  gasLimit: number;
  gasPrice: number;
  gasUsed: number;
  miniBlockHash: string;
  nonce: number;
  receiver: string;
  receiverShard: number;
  round: number;
  sender: string;
  senderShard: number;
  signature: string;
  status: string;
  value: string;
  fee: string;
  timestamp: number;
  data?: string;
  function?: string;
  action?: MultiversXAction;
  type?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw amount string (in denomination units) to a human-readable number.
 * EGLD uses 18 decimals.
 */
export function denominationToEgld(raw: string, decimals: number = EGLD_DECIMALS): number {
  if (!raw || raw === "0") return 0;
  const num = Number(raw);
  if (Number.isNaN(num)) return 0;
  return num / Math.pow(10, decimals);
}

/**
 * Validate a MultiversX wallet address.
 *
 * MultiversX addresses use bech32 encoding with "erd" human-readable prefix.
 * Format: erd1<58 lowercase alphanumeric characters>
 * Total length: 62 characters.
 */
export function isValidMultiversXAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim().toLowerCase();
  return EGLD_ADDRESS_REGEX.test(trimmed);
}

/**
 * Fetch JSON from MultiversX API with exponential backoff retry.
 * Uses a lower base delay due to the 2 req/s rate limit.
 */
async function fetchMultiversXWithRetry<T>(url: string): Promise<T> {
  return fetchWithRetry<T>(url, {
    errorLabel: "MultiversX API",
    baseDelayMs: 1_000,
  });
}

// ---------------------------------------------------------------------------
// Transaction classification
// ---------------------------------------------------------------------------

/** Known staking contract addresses (system delegation). */
const STAKING_CONTRACT_PREFIX = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

/** Staking-related function names. */
const STAKING_FUNCTIONS = new Set([
  "delegate",
  "unDelegate",
  "claimRewards",
  "reDelegateRewards",
  "withdraw",
]);

/** Token transfer function names. */
const TOKEN_TRANSFER_FUNCTIONS = new Set([
  "ESDTTransfer",
  "ESDTNFTTransfer",
  "MultiESDTNFTTransfer",
]);

/** Swap-related function names. */
const SWAP_FUNCTIONS = new Set([
  "swapTokensFixedInput",
  "swapTokensFixedOutput",
  "swapNoFeeAndForward",
  "swap",
  "exchange",
]);

/**
 * Determine the transaction type based on the function name, action, and context.
 */
function classifyTransaction(
  tx: MultiversXTransaction,
  address: string,
): {
  type: Transaction["type"];
  notes?: string;
} {
  const fn = tx.function ?? "";
  const normalizedAddress = address.trim().toLowerCase();
  const isSender = tx.sender.toLowerCase() === normalizedAddress;
  const isReceiver = tx.receiver.toLowerCase() === normalizedAddress;

  // Staking operations
  if (STAKING_FUNCTIONS.has(fn)) {
    if (fn === "delegate") {
      return { type: "stake", notes: `Delegate to ${tx.receiver.slice(0, 16)}…` };
    }
    if (fn === "unDelegate" || fn === "withdraw") {
      return { type: "unstake", notes: `Undelegate from ${tx.receiver.slice(0, 16)}…` };
    }
    if (fn === "claimRewards" || fn === "reDelegateRewards") {
      return { type: "claim", notes: `Claim rewards from ${tx.receiver.slice(0, 16)}…` };
    }
  }

  // Staking contract interaction based on receiver address
  if (tx.receiver.toLowerCase().startsWith(STAKING_CONTRACT_PREFIX)) {
    if (isSender) {
      return { type: "stake", notes: `Staking contract interaction` };
    }
    return { type: "claim", notes: `Staking contract interaction` };
  }

  // Use action info if available
  if (tx.action) {
    const actionName = tx.action.name?.toLowerCase() ?? "";
    const actionCategory = tx.action.category?.toLowerCase() ?? "";

    if (actionCategory === "stake" || actionName.includes("delegate")) {
      if (actionName.includes("undelegate") || actionName.includes("withdraw")) {
        return { type: "unstake", notes: tx.action.description ?? `Unstake` };
      }
      if (actionName.includes("claim") || actionName.includes("redelegate")) {
        return { type: "claim", notes: tx.action.description ?? `Claim rewards` };
      }
      return { type: "stake", notes: tx.action.description ?? `Stake` };
    }

    if (SWAP_FUNCTIONS.has(fn) || actionName.includes("swap")) {
      return { type: "trade", notes: tx.action.description ?? `Swap` };
    }

    if (actionName.includes("addliquidity") || actionName.includes("addinitialliquidity")) {
      return { type: "lp_add", notes: tx.action.description ?? `Add liquidity` };
    }

    if (actionName.includes("removeliquidity")) {
      return { type: "lp_remove", notes: tx.action.description ?? `Remove liquidity` };
    }
  }

  // Swap function calls
  if (SWAP_FUNCTIONS.has(fn)) {
    return { type: "trade", notes: `Swap via ${tx.receiver.slice(0, 16)}…` };
  }

  // Token transfers via function
  if (TOKEN_TRANSFER_FUNCTIONS.has(fn)) {
    if (isSender && !isReceiver) {
      return { type: "send", notes: `Token transfer to ${tx.receiver.slice(0, 16)}…` };
    }
    if (isReceiver && !isSender) {
      return { type: "receive", notes: `Token transfer from ${tx.sender.slice(0, 16)}…` };
    }
  }

  // Smart contract calls (has function but not one we recognize)
  if (fn && !isSender && !isReceiver) {
    return { type: "other", notes: `Contract call: ${fn}` };
  }

  // Simple EGLD transfer
  if (isSender && isReceiver) {
    return { type: "send", notes: "Self-transfer" };
  }
  if (isSender) {
    return { type: "send" };
  }
  if (isReceiver) {
    return { type: "receive" };
  }

  return { type: "other" };
}

// ---------------------------------------------------------------------------
// Transaction mapping
// ---------------------------------------------------------------------------

/**
 * Map a MultiversX API transaction to an AwakenFetch Transaction record.
 * Returns null for failed or irrelevant transactions.
 */
function mapTransaction(
  tx: MultiversXTransaction,
  address: string,
): Transaction | null {
  // Skip failed/invalid transactions
  if (tx.status !== "success") return null;

  const normalizedAddress = address.trim().toLowerCase();
  const isSender = tx.sender.toLowerCase() === normalizedAddress;
  const isReceiver = tx.receiver.toLowerCase() === normalizedAddress;

  // Skip transactions that don't involve our address
  if (!isSender && !isReceiver) return null;

  const { type, notes } = classifyTransaction(tx, address);
  const date = new Date(tx.timestamp * 1000);
  const value = denominationToEgld(tx.value);
  const fee = denominationToEgld(tx.fee);

  // Build the transaction record based on type
  const result: Transaction = {
    date,
    type,
    txHash: tx.txHash,
    notes,
  };

  // Fee is only charged to the sender
  if (isSender && fee > 0) {
    result.feeAmount = fee;
    result.feeCurrency = "EGLD";
  }

  // Determine sent/received quantities
  switch (type) {
    case "send":
      if (value > 0) {
        result.sentQuantity = value;
        result.sentCurrency = "EGLD";
      }
      break;

    case "receive":
      if (value > 0) {
        result.receivedQuantity = value;
        result.receivedCurrency = "EGLD";
      }
      break;

    case "trade":
      // For swaps, the value sent is what the user paid, received comes via SC results.
      // With basic API data we can only capture the EGLD side.
      if (isSender && value > 0) {
        result.sentQuantity = value;
        result.sentCurrency = "EGLD";
      }
      if (isReceiver && value > 0) {
        result.receivedQuantity = value;
        result.receivedCurrency = "EGLD";
      }
      break;

    case "stake":
      if (value > 0) {
        result.sentQuantity = value;
        result.sentCurrency = "EGLD";
      }
      result.tag = "staked";
      break;

    case "unstake":
      if (value > 0) {
        result.receivedQuantity = value;
        result.receivedCurrency = "EGLD";
      }
      result.tag = "unstaked";
      break;

    case "claim":
      if (value > 0) {
        result.receivedQuantity = value;
        result.receivedCurrency = "EGLD";
      }
      break;

    default:
      // For other types, record value on the appropriate side
      if (isSender && value > 0) {
        result.sentQuantity = value;
        result.sentCurrency = "EGLD";
      }
      if (isReceiver && value > 0) {
        result.receivedQuantity = value;
        result.receivedCurrency = "EGLD";
      }
      break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for an address from the MultiversX API.
 * Uses offset-based pagination (from/size) and optional date filtering (after/before).
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<MultiversXTransaction[]> {
  const results: MultiversXTransaction[] = [];
  let offset = 0;

  // Build base URL with date filters
  const params = new URLSearchParams({
    size: String(PAGE_SIZE),
    order: "asc",
    status: "success",
    withOperations: "false",
    withLogs: "false",
    withScResults: "false",
  });

  if (options?.fromDate) {
    params.set("after", String(Math.floor(options.fromDate.getTime() / 1000)));
  }
  if (options?.toDate) {
    params.set("before", String(Math.floor(options.toDate.getTime() / 1000)));
  }

  while (true) {
    params.set("from", String(offset));

    const url = `${API_BASE}/accounts/${address}/transactions?${params.toString()}`;
    const data = await fetchMultiversXWithRetry<MultiversXTransaction[]>(url);

    if (!Array.isArray(data) || data.length === 0) break;

    results.push(...data);

    if (data.length < PAGE_SIZE) break;
    offset += data.length;
  }

  return results;
}

// ---------------------------------------------------------------------------
// MultiversX ChainAdapter
// ---------------------------------------------------------------------------

export const multiversxAdapter: ChainAdapter = {
  chainId: "multiversx",
  chainName: "MultiversX",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidMultiversXAddress(address)) {
      throw new Error(
        "Invalid MultiversX address. Expected format: erd1<58 lowercase alphanumeric chars> (e.g. erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th)",
      );
    }

    const normalizedAddress = address.trim().toLowerCase();
    const rawTxs = await fetchAllTransactions(normalizedAddress, options);

    // Map to Transaction interface and filter nulls
    const transactions = rawTxs
      .map((tx) => mapTransaction(tx, normalizedAddress))
      .filter((tx): tx is Transaction => tx !== null);

    // Sort by date ascending
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return transactions;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://explorer.multiversx.com/transactions/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidMultiversXAddress(address);
  },
};
