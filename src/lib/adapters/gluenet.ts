/**
 * Gluenet (GLUE) chain adapter.
 *
 * Fetches transactions from the Glue Blockscout API
 * (https://backend.explorer.mainnet.prod.gke.glue.net/api)
 * and maps them to the AwakenFetch Transaction interface.
 *
 * Gluenet is an EVM-compatible blockchain using the Blockscout explorer.
 * The API follows the Etherscan-compatible format.
 *
 * Supported transaction types:
 *   - Sends (native GLUE transfers from the address)
 *   - Receives (native GLUE transfers to the address)
 *   - Contract interactions (classified as "other")
 *
 * The Blockscout API is public and requires no API key.
 * Rate limit: Standard Blockscout limits apply.
 * Address format: EVM 0x-prefixed hex addresses (42 characters).
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 GLUE = 10^18 wei (same as ETH) */
const WEI_PER_GLUE = 1_000_000_000_000_000_000;

/** Blockscout API base URL for Gluenet mainnet. */
const API_BASE = "https://backend.explorer.mainnet.prod.gke.glue.net/api";

/** Maximum results per page from the API. */
const PAGE_LIMIT = 100;

/**
 * EVM address regex.
 * 0x-prefixed hex string of exactly 40 hex characters (42 total).
 */
const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

// ---------------------------------------------------------------------------
// Blockscout API response types
// ---------------------------------------------------------------------------

interface BlockscoutTransaction {
  blockHash: string;
  blockNumber: string;
  confirmations: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  hash: string;
  input: string;
  isError: string;
  nonce: string;
  timeStamp: string;
  to: string;
  transactionIndex: string;
  txreceipt_status: string;
  value: string;
}

interface BlockscoutResponse {
  message: string;
  status: string;
  result: BlockscoutTransaction[] | string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert wei (string) to GLUE (number). */
export function weiToGlue(wei: string): number {
  const value = Number(wei);
  if (Number.isNaN(value)) return 0;
  return value / WEI_PER_GLUE;
}

/**
 * Validate a Gluenet/EVM wallet address.
 *
 * EVM addresses are 0x-prefixed hex strings of exactly 40 hex characters
 * (42 characters total, case-insensitive).
 */
export function isValidGluenetAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  return EVM_ADDRESS_REGEX.test(trimmed);
}

/**
 * Fetch JSON from Blockscout API with exponential backoff retry.
 */
async function fetchBlockscoutWithRetry<T>(url: string): Promise<T> {
  return fetchWithRetry<T>(url, {
    errorLabel: "Gluenet Blockscout API",
    baseDelayMs: 1_000,
  });
}

/**
 * Normalize address to lowercase for comparison.
 */
function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Transaction mapping
// ---------------------------------------------------------------------------

/**
 * Map a Blockscout transaction to a Transaction record relative to the queried address.
 *
 * Classification:
 *   - Send: address appears in 'from' and not in 'to' (or value flows out)
 *   - Receive: address appears in 'to' and not in 'from' (or value flows in)
 *   - Other: contract interactions with 0 value
 *
 * Failed transactions (isError === "1") are skipped.
 */
function mapTransaction(
  tx: BlockscoutTransaction,
  address: string,
): Transaction | null {
  // Skip failed transactions
  if (tx.isError === "1") return null;

  const normalizedAddress = normalizeAddress(address);
  const from = normalizeAddress(tx.from);
  const to = tx.to ? normalizeAddress(tx.to) : null;
  const value = weiToGlue(tx.value);
  const date = new Date(Number(tx.timeStamp) * 1000);

  // Calculate fee
  const gasUsed = Number(tx.gasUsed);
  const gasPrice = Number(tx.gasPrice);
  const feeWei = gasUsed * gasPrice;
  const fee = feeWei > 0 ? feeWei / WEI_PER_GLUE : 0;

  const isSender = from === normalizedAddress;
  const isReceiver = to === normalizedAddress;

  // Contract interaction (no value, has input data)
  const isContractInteraction = value === 0 && tx.input && tx.input !== "0x";

  // Pure send (outgoing transfer)
  if (isSender && !isReceiver) {
    return {
      date,
      type: "send",
      sentQuantity: value,
      sentCurrency: "GLUE",
      feeAmount: fee > 0 ? fee : undefined,
      feeCurrency: fee > 0 ? "GLUE" : undefined,
      txHash: tx.hash,
      notes: to ? `Transfer to ${to.slice(0, 10)}…` : "Contract interaction",
    };
  }

  // Pure receive (incoming transfer)
  if (!isSender && isReceiver && value > 0) {
    return {
      date,
      type: "receive",
      receivedQuantity: value,
      receivedCurrency: "GLUE",
      txHash: tx.hash,
      notes: `Transfer from ${from.slice(0, 10)}…`,
    };
  }

  // Self-transfer (send to self)
  if (isSender && isReceiver) {
    if (value > 0) {
      return {
        date,
        type: "send",
        sentQuantity: value,
        sentCurrency: "GLUE",
        feeAmount: fee > 0 ? fee : undefined,
        feeCurrency: fee > 0 ? "GLUE" : undefined,
        txHash: tx.hash,
        notes: "Self-transfer",
      };
    }
    // Self contract interaction (just fee)
    if (isContractInteraction) {
      return {
        date,
        type: "other",
        feeAmount: fee > 0 ? fee : undefined,
        feeCurrency: fee > 0 ? "GLUE" : undefined,
        txHash: tx.hash,
        notes: "Contract interaction",
      };
    }
  }

  // Contract interaction with no value transfer to/from our address
  if (isContractInteraction) {
    return {
      date,
      type: "other",
      feeAmount: fee > 0 ? fee : undefined,
      feeCurrency: fee > 0 ? "GLUE" : undefined,
      txHash: tx.hash,
      notes: to ? `Contract: ${to.slice(0, 10)}…` : "Contract interaction",
    };
  }

  // Fallback: classify based on value flow
  if (value > 0) {
    // Default to receive if value exists and we couldn't classify
    return {
      date,
      type: "receive",
      receivedQuantity: value,
      receivedCurrency: "GLUE",
      txHash: tx.hash,
      notes: `From ${from.slice(0, 10)}…`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Build query parameters for date filtering.
 */
function buildTimestampParams(options?: FetchOptions): string {
  let params = "";
  if (options?.fromDate) {
    params += `&start_timestamp=${Math.floor(options.fromDate.getTime() / 1000)}`;
  }
  if (options?.toDate) {
    params += `&end_timestamp=${Math.floor(options.toDate.getTime() / 1000)}`;
  }
  return params;
}

/**
 * Fetch all transactions for an address from the Blockscout API.
 * Uses pagination (page/offset) to retrieve all records.
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<BlockscoutTransaction[]> {
  const results: BlockscoutTransaction[] = [];
  let page = 1;
  const timestamps = buildTimestampParams(options);

  while (true) {
    const url = `${API_BASE}?module=account&action=txlist&address=${address}&page=${page}&offset=${PAGE_LIMIT}&sort=asc${timestamps}`;
    const data = await fetchBlockscoutWithRetry<BlockscoutResponse>(url);

    // Handle API error response
    if (data.status !== "1" || !Array.isArray(data.result)) {
      // If no transactions found, that's not an error
      if (data.message === "No transactions found") {
        break;
      }
      throw new Error(
        `Gluenet API error: ${data.message || "Unknown error"}`,
      );
    }

    const txs = data.result;
    if (txs.length === 0) break;

    results.push(...txs);

    // Report progress for streaming
    if (options?.onProgress && txs.length > 0) {
      const batch = txs
        .map((tx) => mapTransaction(tx, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    // NOTE: Blockscout Etherscan-compatible API doesn't provide total transaction count.
    // We don't call onEstimatedTotal to avoid showing misleading estimates.
    // The UI will show "Fetching X transactions..." instead of "Fetching X of ~Y transactions".

    if (txs.length < PAGE_LIMIT) break;
    page++;

    // Safety limit to prevent infinite loops
    if (page > 1000) break;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Gluenet ChainAdapter
// ---------------------------------------------------------------------------

export const gluenetAdapter: ChainAdapter = {
  chainId: "gluenet",
  chainName: "Gluenet",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidGluenetAddress(address)) {
      throw new Error(
        "Invalid Gluenet address. Expected EVM format: 0x<40 hex chars> (e.g. 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbD)",
      );
    }

    const rawTxs = await fetchAllTransactions(address, options);

    // Map to Transaction interface and filter nulls
    const transactions = rawTxs
      .map((tx) => mapTransaction(tx, address))
      .filter((tx): tx is Transaction => tx !== null);

    return transactions;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://explorer.glue.net/tx/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidGluenetAddress(address);
  },
};
