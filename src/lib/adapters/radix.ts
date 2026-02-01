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
 * Radix mainnet account address regex (quick pre-check).
 * Bech32m format: "account_rdx1" followed by exactly 54 valid bech32 characters.
 * (30-byte payload → 48 data chars + 6 checksum chars = 54 bech32 chars.)
 */
const RADIX_ADDRESS_REGEX =
  /^account_rdx1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{54}$/;

// ---------------------------------------------------------------------------
// Bech32m checksum validation (pure implementation, no external deps)
// ---------------------------------------------------------------------------

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONST = 0x2bc830a3;
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let j = 0; j < 5; j++) {
      chk ^= (top >> j) & 1 ? BECH32_GENERATORS[j] : 0;
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < hrp.length; i++) {
    result.push(hrp.charCodeAt(i) >> 5);
  }
  result.push(0);
  for (let i = 0; i < hrp.length; i++) {
    result.push(hrp.charCodeAt(i) & 31);
  }
  return result;
}

/**
 * Verify a bech32m-encoded string has a valid checksum.
 * Returns true only for valid bech32m (not bech32).
 */
function verifyBech32mChecksum(bech: string): boolean {
  const lower = bech.toLowerCase();
  const lastOne = lower.lastIndexOf("1");
  if (lastOne < 1 || lastOne + 7 > lower.length) return false;

  const hrp = lower.substring(0, lastOne);
  const data: number[] = [];
  for (let i = lastOne + 1; i < lower.length; i++) {
    const d = BECH32_CHARSET.indexOf(lower[i]);
    if (d < 0) return false;
    data.push(d);
  }

  return bech32Polymod(bech32HrpExpand(hrp).concat(data)) === BECH32M_CONST;
}

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

/**
 * Radix Gateway API error response shape.
 */
interface RadixGatewayError {
  message?: string;
  code?: number;
  details?: {
    validation_errors?: Array<{
      path?: string;
      errors?: string[];
    }>;
    type?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate a Radix mainnet account address.
 *
 * Radix account addresses are Bech32m-encoded with the prefix "account_rdx1".
 * We validate both the format (regex) and the bech32m checksum to avoid
 * sending invalid addresses to the Gateway API.
 */
export function isValidRadixAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!RADIX_ADDRESS_REGEX.test(trimmed)) return false;
  return verifyBech32mChecksum(trimmed);
}

/**
 * Error subclass for Radix Gateway client errors (4xx).
 * Used to distinguish non-retryable client errors from transient failures.
 */
class RadixClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadixClientError";
  }
}

/**
 * Fetch JSON from Radix Gateway API with exponential backoff retry.
 * The Gateway API uses POST requests for all endpoints.
 *
 * Unlike the generic `fetchWithRetry`, this handles Radix-specific API error
 * responses: 400-level client errors are NOT retried and their detailed
 * validation messages are surfaced in the thrown Error.
 */
async function fetchRadixWithRetry<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const maxRetries = 3;
  const baseDelayMs = 1_000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      // Rate limited — back off and retry
      if (response.status === 429) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Client errors (4xx, except 429) should NOT be retried —
      // parse the response body and surface the real validation message.
      if (response.status >= 400 && response.status < 500) {
        let detail = `${response.status} ${response.statusText}`;
        try {
          const errBody = (await response.json()) as RadixGatewayError;
          const messages: string[] = [];
          if (errBody.message) messages.push(errBody.message);
          if (errBody.details?.validation_errors) {
            for (const ve of errBody.details.validation_errors) {
              if (ve.errors) messages.push(...ve.errors);
            }
          }
          if (messages.length > 0) detail = messages.join(" — ");
        } catch {
          // If we can't parse the body, use the status text
        }
        throw new RadixClientError(`Radix Gateway API error: ${detail}`);
      }

      if (!response.ok) {
        // 5xx — transient, retry
        throw new Error(
          `Radix Gateway API error: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      // Re-throw client errors immediately (they won't resolve with retries)
      if (error instanceof RadixClientError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error("Radix Gateway API request failed after retries");
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
    // The Radix Gateway API rejects timestamps in the future. When the upper
    // bound is "now" or later, omit at_ledger_state so the API defaults to
    // the current ledger state (equivalent behaviour, no validation error).
    if (options.toDate.getTime() < Date.now()) {
      body.at_ledger_state = {
        timestamp: options.toDate.toISOString(),
      };
    }
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
