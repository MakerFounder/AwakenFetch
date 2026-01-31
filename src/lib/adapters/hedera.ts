/**
 * Hedera (HBAR) chain adapter.
 *
 * Fetches transactions from the Hedera Mirror Node REST API
 * (https://mainnet-public.mirrornode.hedera.com/api/v1/) and maps them
 * to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - HBAR transfers (sends / receives via CRYPTOTRANSFER)
 *   - Staking reward payouts (staking_reward_transfers)
 *   - Token associations (TOKENASSOCIATE)
 *   - Approvals (CRYPTOAPPROVEALLOWANCE)
 *
 * The Hedera Mirror Node API is public and requires no API key.
 * Rate limit: ~100 requests / second on mainnet public mirror.
 * Address format: 0.0.<number> (shard.realm.num).
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 HBAR = 100,000,000 tinybars. */
const TINYBAR_DIVISOR = 100_000_000;

/** Hedera Mirror Node API base URL (mainnet). */
const API_BASE = "https://mainnet-public.mirrornode.hedera.com/api/v1";

/** Maximum results per page from the API (capped at 100). */
const PAGE_SIZE = 100;

/**
 * Hedera account address regex.
 * Format: <shard>.<realm>.<num> where shard and realm are typically 0
 * and num is a positive integer.
 * e.g. 0.0.12345
 */
const HBAR_ADDRESS_REGEX = /^\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------------
// Hedera Mirror Node API response types
// ---------------------------------------------------------------------------

interface HederaTransfer {
  account: string;
  amount: number;
  is_approval: boolean;
}

interface HederaTokenTransfer {
  token_id: string;
  account: string;
  amount: number;
  is_approval: boolean;
}

interface HederaTransaction {
  consensus_timestamp: string;
  transaction_hash: string;
  transaction_id: string;
  name: string;
  result: string;
  charged_tx_fee: number;
  transfers: HederaTransfer[];
  token_transfers: HederaTokenTransfer[];
  staking_reward_transfers: HederaTransfer[];
  node: string;
  memo_base64: string;
  nft_transfers: unknown[];
}

interface HederaTransactionsResponse {
  transactions: HederaTransaction[];
  links: {
    next: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert tinybars to HBAR.
 */
export function tinybarsToHbar(tinybars: number): number {
  if (!tinybars || Number.isNaN(tinybars)) return 0;
  return tinybars / TINYBAR_DIVISOR;
}

/**
 * Validate a Hedera account address.
 *
 * Hedera addresses follow the format <shard>.<realm>.<num>,
 * e.g. 0.0.12345. All three components must be non-negative integers.
 */
export function isValidHederaAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!HBAR_ADDRESS_REGEX.test(trimmed)) return false;

  const parts = trimmed.split(".");
  // All three components must be valid non-negative integers
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0;
  });
}

/**
 * Fetch JSON from Hedera Mirror Node API with exponential backoff retry.
 */
async function fetchHederaWithRetry<T>(url: string): Promise<T> {
  return fetchWithRetry<T>(url, {
    errorLabel: "Hedera Mirror Node API",
    baseDelayMs: 1_000,
  });
}

/**
 * Parse the consensus_timestamp string (e.g. "1705315800.123456789") into a Date.
 */
function parseConsensusTimestamp(ts: string): Date {
  const seconds = parseFloat(ts);
  return new Date(seconds * 1000);
}

/**
 * Extract the payer account from a transaction_id.
 * Format: "0.0.12345-1705315800-123456789" → "0.0.12345"
 */
function getPayerFromTxId(txId: string): string {
  const dashIndex = txId.indexOf("-");
  if (dashIndex === -1) return txId;
  return txId.substring(0, dashIndex);
}

// ---------------------------------------------------------------------------
// Transaction classification & mapping
// ---------------------------------------------------------------------------

/**
 * Map a Hedera Mirror Node transaction to an AwakenFetch Transaction record.
 * Returns null for failed or irrelevant transactions.
 */
function mapTransaction(
  tx: HederaTransaction,
  address: string,
): Transaction | null {
  // Skip failed transactions
  if (tx.result !== "SUCCESS") return null;

  const normalizedAddress = address.trim();
  const date = parseConsensusTimestamp(tx.consensus_timestamp);
  const payer = getPayerFromTxId(tx.transaction_id);
  const isPayer = payer === normalizedAddress;

  // Check for staking rewards
  if (tx.staking_reward_transfers && tx.staking_reward_transfers.length > 0) {
    const rewardEntry = tx.staking_reward_transfers.find(
      (t) => t.account === normalizedAddress && t.amount > 0,
    );
    if (rewardEntry) {
      const reward = tinybarsToHbar(rewardEntry.amount);
      if (reward > 0) {
        return {
          date,
          type: "claim",
          receivedQuantity: reward,
          receivedCurrency: "HBAR",
          txHash: tx.transaction_hash,
          notes: "Staking reward",
        };
      }
    }
  }

  // Handle based on transaction type
  switch (tx.name) {
    case "CRYPTOAPPROVEALLOWANCE":
    case "CRYPTODELETEALLOWANCE": {
      const result: Transaction = {
        date,
        type: "approval",
        txHash: tx.transaction_hash,
        notes: tx.name === "CRYPTOAPPROVEALLOWANCE"
          ? "Approve allowance"
          : "Delete allowance",
      };
      if (isPayer) {
        const fee = tinybarsToHbar(tx.charged_tx_fee);
        if (fee > 0) {
          result.feeAmount = fee;
          result.feeCurrency = "HBAR";
        }
      }
      return result;
    }

    case "TOKENASSOCIATE":
    case "TOKENDISSOCIATE": {
      const result: Transaction = {
        date,
        type: "other",
        txHash: tx.transaction_hash,
        notes: tx.name === "TOKENASSOCIATE"
          ? "Token associate"
          : "Token dissociate",
      };
      if (isPayer) {
        const fee = tinybarsToHbar(tx.charged_tx_fee);
        if (fee > 0) {
          result.feeAmount = fee;
          result.feeCurrency = "HBAR";
        }
      }
      return result;
    }

    default:
      break;
  }

  // For CRYPTOTRANSFER and other types, look at the transfers array
  // to determine send/receive amounts for our address
  const userTransfer = tx.transfers.find(
    (t) => t.account === normalizedAddress,
  );

  if (!userTransfer) return null;

  // The net amount for our address (positive = received, negative = sent)
  // This includes fees if we are the payer
  let netAmount = userTransfer.amount;

  // If we are the payer, the transfer amount already includes the fee deduction.
  // We need to separate the fee from the actual sent amount.
  const fee = isPayer ? tinybarsToHbar(tx.charged_tx_fee) : 0;

  // For the payer, add back the fee to get the actual transfer amount
  // because netAmount already has fee subtracted
  if (isPayer && netAmount < 0) {
    netAmount = netAmount + tx.charged_tx_fee;
  }

  const hbarAmount = tinybarsToHbar(Math.abs(netAmount));

  const result: Transaction = {
    date,
    type: "other",
    txHash: tx.transaction_hash,
  };

  if (fee > 0) {
    result.feeAmount = fee;
    result.feeCurrency = "HBAR";
  }

  if (netAmount < 0 && hbarAmount > 0) {
    // We sent HBAR
    result.type = "send";
    result.sentQuantity = hbarAmount;
    result.sentCurrency = "HBAR";
  } else if (netAmount > 0 && hbarAmount > 0) {
    // We received HBAR
    result.type = "receive";
    result.receivedQuantity = hbarAmount;
    result.receivedCurrency = "HBAR";
  } else if (netAmount === 0 && isPayer) {
    // Fee-only transaction (e.g. contract call with no transfer)
    result.type = "other";
    result.notes = `${tx.name}`;
  } else {
    // Zero-value, not payer — skip
    return null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for an address from the Hedera Mirror Node API.
 * Uses cursor-based pagination via the links.next field.
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<HederaTransaction[]> {
  const results: HederaTransaction[] = [];

  // Build initial URL with query params
  const params = new URLSearchParams({
    "account.id": address,
    limit: String(PAGE_SIZE),
    order: "asc",
    result: "success",
  });

  if (options?.fromDate) {
    const fromTs = (options.fromDate.getTime() / 1000).toFixed(9);
    params.set("timestamp", `gte:${fromTs}`);
  }

  let url = `${API_BASE}/transactions?${params.toString()}`;

  // If toDate is also specified, append an additional timestamp filter
  if (options?.toDate) {
    const toTs = (options.toDate.getTime() / 1000).toFixed(9);
    url += `&timestamp=lte:${toTs}`;
  }

  while (url) {
    const data = await fetchHederaWithRetry<HederaTransactionsResponse>(url);

    if (!data.transactions || data.transactions.length === 0) break;

    results.push(...data.transactions);

    // Follow pagination link
    if (data.links?.next) {
      // The next link is a relative path, so prepend the base
      const nextPath = data.links.next;
      if (nextPath.startsWith("/")) {
        url = `https://mainnet-public.mirrornode.hedera.com${nextPath}`;
      } else {
        url = nextPath;
      }
    } else {
      break;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Hedera ChainAdapter
// ---------------------------------------------------------------------------

export const hederaAdapter: ChainAdapter = {
  chainId: "hedera",
  chainName: "Hedera",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidHederaAddress(address)) {
      throw new Error(
        "Invalid Hedera address. Expected format: <shard>.<realm>.<num> (e.g. 0.0.12345)",
      );
    }

    const normalizedAddress = address.trim();
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
    return `https://hashscan.io/mainnet/transaction/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidHederaAddress(address);
  },
};
