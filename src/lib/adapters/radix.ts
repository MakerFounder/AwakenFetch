/**
 * Radix (XRD) chain adapter.
 *
 * Fetches transactions from the Radix Gateway API
 * (https://mainnet.radixdlt.com/) using the `/stream/transactions` endpoint
 * and maps them to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - XRD transfers (sends / receives via balance changes)
 *   - Token transfers (fungible balance changes)
 *   - Staking (validator stake/unstake via manifest classes)
 *   - General transactions classified as "other"
 *
 * The Radix Gateway API is public and requires no API key.
 * Rate limit: Best-effort public endpoint.
 * Address format: Bech32m with "account_rdx1" prefix on mainnet.
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Radix Gateway API base URL (mainnet). */
const API_BASE = "https://mainnet.radixdlt.com";

/** Maximum results per page from the API. */
const PAGE_SIZE = 100;

/**
 * The native XRD resource address on Radix mainnet.
 */
const XRD_RESOURCE_ADDRESS =
  "resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd";

/**
 * Radix mainnet account address regex.
 * Bech32m format: "account_rdx1" followed by 26-59 valid bech32 characters.
 */
const RADIX_ADDRESS_REGEX =
  /^account_rdx1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{26,59}$/;

// ---------------------------------------------------------------------------
// Radix Gateway API response types
// ---------------------------------------------------------------------------

interface RadixLedgerState {
  network: string;
  state_version: number;
  proposer_round_timestamp: string;
  epoch: number;
  round: number;
}

interface RadixFungibleFeeBalanceChange {
  type: string;
  entity_address: string;
  resource_address: string;
  balance_change: string;
}

interface RadixFungibleBalanceChange {
  entity_address: string;
  resource_address: string;
  balance_change: string;
}

interface RadixBalanceChanges {
  fungible_fee_balance_changes: RadixFungibleFeeBalanceChange[];
  fungible_balance_changes: RadixFungibleBalanceChange[];
  non_fungible_balance_changes: unknown[];
}

interface RadixStreamTransaction {
  state_version: number;
  epoch: number;
  round: number;
  round_timestamp: string;
  transaction_status: string;
  payload_hash: string;
  intent_hash: string;
  fee_paid: string;
  affected_global_entities: string[];
  confirmed_at: string;
  error_message?: string;
  receipt?: {
    status: string;
    error_message?: string;
  };
  manifest_classes?: string[];
  balance_changes?: RadixBalanceChanges;
}

interface RadixStreamTransactionsResponse {
  ledger_state: RadixLedgerState;
  next_cursor?: string;
  items: RadixStreamTransaction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate a Radix mainnet account address.
 *
 * Radix account addresses are Bech32m-encoded with the prefix "account_rdx1".
 */
export function isValidRadixAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  return RADIX_ADDRESS_REGEX.test(trimmed);
}

/**
 * Fetch JSON from Radix Gateway API with exponential backoff retry.
 * The Gateway API uses POST requests for all endpoints.
 */
async function fetchRadixWithRetry<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  return fetchWithRetry<T>(url, {
    errorLabel: "Radix Gateway API",
    baseDelayMs: 1_000,
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Resolve a resource address to a human-readable ticker.
 * Returns "XRD" for the native resource, otherwise the shortened address.
 */
function resolveResourceTicker(resourceAddress: string): string {
  if (resourceAddress === XRD_RESOURCE_ADDRESS) {
    return "XRD";
  }
  // For non-XRD tokens, use a shortened form of the resource address
  // Format: first meaningful part after "resource_rdx1"
  const prefix = "resource_rdx1";
  if (resourceAddress.startsWith(prefix)) {
    const suffix = resourceAddress.slice(prefix.length);
    return suffix.slice(0, 8).toUpperCase();
  }
  return resourceAddress.slice(0, 12).toUpperCase();
}

/**
 * Parse the confirmed_at ISO timestamp into a Date.
 */
function parseTimestamp(ts: string): Date {
  return new Date(ts);
}

// ---------------------------------------------------------------------------
// Transaction classification & mapping
// ---------------------------------------------------------------------------

/**
 * Map a Radix Gateway transaction to AwakenFetch Transaction record(s).
 * Uses balance_changes to determine sends/receives for the given address.
 * Returns null for transactions that don't affect the address or are failed.
 */
function mapTransaction(
  tx: RadixStreamTransaction,
  address: string,
): Transaction | null {
  // Skip failed transactions
  if (
    tx.transaction_status !== "CommittedSuccess" &&
    tx.receipt?.status !== "CommittedSuccess"
  ) {
    return null;
  }

  const normalizedAddress = address.trim();
  const date = parseTimestamp(tx.confirmed_at);

  // Extract balance changes for this address (non-fee related)
  const balanceChanges = tx.balance_changes;
  if (!balanceChanges) return null;

  // Get non-fee fungible balance changes for our address
  const userChanges = balanceChanges.fungible_balance_changes.filter(
    (c) => c.entity_address === normalizedAddress,
  );

  // Get fee balance changes for our address
  const feeChanges = balanceChanges.fungible_fee_balance_changes.filter(
    (c) =>
      c.entity_address === normalizedAddress && c.type === "FeePayment",
  );

  // Calculate total fee paid by this address
  let totalFee = 0;
  for (const fc of feeChanges) {
    const feeAmount = Math.abs(parseFloat(fc.balance_change));
    if (!Number.isNaN(feeAmount) && feeAmount > 0) {
      totalFee += feeAmount;
    }
  }

  // If no balance changes and no fees for our address, skip
  if (userChanges.length === 0 && totalFee === 0) return null;

  // Separate sent and received changes
  const sentChanges = userChanges.filter(
    (c) => parseFloat(c.balance_change) < 0,
  );
  const receivedChanges = userChanges.filter(
    (c) => parseFloat(c.balance_change) > 0,
  );

  // Determine transaction type based on manifest classes and balance changes
  const manifestClasses = tx.manifest_classes ?? [];

  const result: Transaction = {
    date,
    type: "other",
    txHash: tx.intent_hash,
  };

  // Add fee if our address paid it
  if (totalFee > 0) {
    result.feeAmount = totalFee;
    result.feeCurrency = "XRD";
  }

  // Classify based on manifest classes
  if (
    manifestClasses.includes("ValidatorStake") ||
    manifestClasses.includes("ValidatorClaim")
  ) {
    if (manifestClasses.includes("ValidatorStake")) {
      result.type = "stake";
      // Staking: we send XRD to a validator
      if (sentChanges.length > 0) {
        const change = sentChanges[0];
        result.sentQuantity = Math.abs(parseFloat(change.balance_change));
        result.sentCurrency = resolveResourceTicker(change.resource_address);
      }
      // We may receive a liquid stake unit (LSU) token
      if (receivedChanges.length > 0) {
        const change = receivedChanges[0];
        result.receivedQuantity = parseFloat(change.balance_change);
        result.receivedCurrency = resolveResourceTicker(
          change.resource_address,
        );
      }
      result.notes = "Validator stake";
    } else {
      result.type = "unstake";
      // Claiming: we may send back LSU tokens
      if (sentChanges.length > 0) {
        const change = sentChanges[0];
        result.sentQuantity = Math.abs(parseFloat(change.balance_change));
        result.sentCurrency = resolveResourceTicker(change.resource_address);
      }
      // We receive XRD back
      if (receivedChanges.length > 0) {
        const change = receivedChanges[0];
        result.receivedQuantity = parseFloat(change.balance_change);
        result.receivedCurrency = resolveResourceTicker(
          change.resource_address,
        );
      }
      result.notes = "Validator claim";
    }
    return result;
  }

  if (manifestClasses.includes("ValidatorUnstake")) {
    result.type = "unstake";
    if (sentChanges.length > 0) {
      const change = sentChanges[0];
      result.sentQuantity = Math.abs(parseFloat(change.balance_change));
      result.sentCurrency = resolveResourceTicker(change.resource_address);
    }
    if (receivedChanges.length > 0) {
      const change = receivedChanges[0];
      result.receivedQuantity = parseFloat(change.balance_change);
      result.receivedCurrency = resolveResourceTicker(
        change.resource_address,
      );
    }
    result.notes = "Validator unstake";
    return result;
  }

  // Trade: both sent and received non-fee balance changes with different resources
  if (sentChanges.length > 0 && receivedChanges.length > 0) {
    result.type = "trade";
    const sent = sentChanges[0];
    const received = receivedChanges[0];
    result.sentQuantity = Math.abs(parseFloat(sent.balance_change));
    result.sentCurrency = resolveResourceTicker(sent.resource_address);
    result.receivedQuantity = parseFloat(received.balance_change);
    result.receivedCurrency = resolveResourceTicker(
      received.resource_address,
    );
    return result;
  }

  // Simple send
  if (sentChanges.length > 0 && receivedChanges.length === 0) {
    result.type = "send";
    const change = sentChanges[0];
    result.sentQuantity = Math.abs(parseFloat(change.balance_change));
    result.sentCurrency = resolveResourceTicker(change.resource_address);
    return result;
  }

  // Simple receive
  if (receivedChanges.length > 0 && sentChanges.length === 0) {
    result.type = "receive";
    const change = receivedChanges[0];
    result.receivedQuantity = parseFloat(change.balance_change);
    result.receivedCurrency = resolveResourceTicker(change.resource_address);
    return result;
  }

  // Fee-only transaction (no balance changes but fee was paid)
  if (totalFee > 0) {
    result.type = "other";
    result.notes = manifestClasses.length > 0
      ? manifestClasses.join(", ")
      : "Fee-only transaction";
    return result;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for an address from the Radix Gateway API.
 * Uses cursor-based pagination via the next_cursor field.
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<RadixStreamTransaction[]> {
  const results: RadixStreamTransaction[] = [];

  // Build request body
  const body: Record<string, unknown> = {
    affected_global_entities_filter: [address],
    limit_per_page: PAGE_SIZE,
    order: "Asc",
    opt_ins: {
      balance_changes: true,
      manifest_classes: true,
    },
  };

  // Apply date filters using ledger state timestamps
  if (options?.fromDate) {
    body.from_ledger_state = {
      timestamp: options.fromDate.toISOString(),
    };
  }

  if (options?.toDate) {
    body.at_ledger_state = {
      timestamp: options.toDate.toISOString(),
    };
  }

  // Use cursor from options if provided
  if (options?.cursor) {
    body.cursor = options.cursor;
  }

  let cursor: string | undefined;

  do {
    if (cursor) {
      body.cursor = cursor;
    }

    const data =
      await fetchRadixWithRetry<RadixStreamTransactionsResponse>(
        "/stream/transactions",
        body,
      );

    if (!data.items || data.items.length === 0) break;

    results.push(...data.items);

    // Report progress for streaming
    if (options?.onProgress && data.items.length > 0) {
      const batch = data.items
        .map((item) => mapTransaction(item, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    cursor = data.next_cursor;
  } while (cursor);

  return results;
}

// ---------------------------------------------------------------------------
// Radix ChainAdapter
// ---------------------------------------------------------------------------

export const radixAdapter: ChainAdapter = {
  chainId: "radix",
  chainName: "Radix",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidRadixAddress(address)) {
      throw new Error(
        "Invalid Radix address. Expected format: account_rdx1... (Bech32m encoded)",
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
    return `https://dashboard.radixdlt.com/transaction/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidRadixAddress(address);
  },
};
