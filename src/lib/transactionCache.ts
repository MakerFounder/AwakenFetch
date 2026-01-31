/**
 * Transaction cache backed by localStorage.
 *
 * Stores fetched transaction data keyed by (chainId, address, dateRange) so
 * subsequent exports or page refreshes don't need to re-fetch from the API.
 *
 * Each entry has a TTL (default 30 minutes). Stale entries are lazily pruned
 * on read. The total cache is capped to prevent filling localStorage.
 */

import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "awakenfetch_tx_cache";

/** Default time-to-live in milliseconds (30 minutes). */
const DEFAULT_TTL_MS = 30 * 60 * 1_000;

/** Maximum number of cached entries to prevent localStorage bloat. */
const MAX_ENTRIES = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single cached entry. Transactions are stored in serialisable form. */
export interface CacheEntry {
  /** Transactions with dates stored as ISO strings. */
  transactions: SerializedTransaction[];
  /** Unix timestamp (ms) when this entry was cached. */
  cachedAt: number;
  /** TTL in ms for this entry. */
  ttl: number;
}

/** Transaction with `date` serialised as an ISO string for JSON storage. */
type SerializedTransaction = Omit<Transaction, "date"> & { date: string };

/** The full cache map persisted in localStorage. */
type CacheMap = Record<string, CacheEntry>;

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Build a deterministic cache key from fetch parameters.
 */
export function buildCacheKey(
  chainId: string,
  address: string,
  fromDate?: string,
  toDate?: string,
): string {
  const parts = [chainId, address.toLowerCase()];
  if (fromDate) parts.push(fromDate);
  if (toDate) parts.push(toDate);
  return parts.join(":");
}

// ---------------------------------------------------------------------------
// Internal read / write
// ---------------------------------------------------------------------------

function readCache(): CacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheMap;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve cached transactions for the given key.
 * Returns `null` if there is no valid (non-expired) entry.
 */
export function getCachedTransactions(key: string): Transaction[] | null {
  const cache = readCache();
  const entry = cache[key];
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.cachedAt > entry.ttl) {
    // Entry expired — remove it lazily
    delete cache[key];
    writeCache(cache);
    return null;
  }

  // Deserialise dates back to Date objects
  return entry.transactions.map((tx) => ({
    ...tx,
    date: new Date(tx.date),
  })) as Transaction[];
}

/**
 * Store transactions in the cache under the given key.
 */
export function setCachedTransactions(
  key: string,
  transactions: Transaction[],
  ttl: number = DEFAULT_TTL_MS,
): void {
  const cache = readCache();

  // Prune expired entries first
  const now = Date.now();
  for (const k of Object.keys(cache)) {
    if (now - cache[k].cachedAt > cache[k].ttl) {
      delete cache[k];
    }
  }

  // If still at the cap, evict oldest entry
  const keys = Object.keys(cache);
  if (keys.length >= MAX_ENTRIES) {
    let oldestKey = keys[0];
    let oldestTime = cache[keys[0]].cachedAt;
    for (const k of keys) {
      if (cache[k].cachedAt < oldestTime) {
        oldestKey = k;
        oldestTime = cache[k].cachedAt;
      }
    }
    delete cache[oldestKey];
  }

  // Serialise dates to ISO strings for JSON storage
  const serialized: SerializedTransaction[] = transactions.map((tx) => ({
    ...tx,
    date: tx.date.toISOString(),
  }));

  cache[key] = { transactions: serialized, cachedAt: now, ttl };
  writeCache(cache);
}

/**
 * Remove a specific cache entry.
 */
export function removeCachedTransactions(key: string): void {
  const cache = readCache();
  delete cache[key];
  writeCache(cache);
}

/**
 * Clear the entire transaction cache.
 */
export function clearTransactionCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently ignore
  }
}
