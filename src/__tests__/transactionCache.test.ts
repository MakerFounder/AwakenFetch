import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Transaction } from "@/types";
import {
  buildCacheKey,
  getCachedTransactions,
  setCachedTransactions,
  removeCachedTransactions,
  clearTransactionCache,
} from "@/lib/transactionCache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    date: new Date("2024-06-15T12:00:00.000Z"),
    type: "send",
    sentQuantity: 1.5,
    sentCurrency: "TAO",
    txHash: "0xabc123",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// buildCacheKey
// ---------------------------------------------------------------------------

describe("buildCacheKey", () => {
  it("builds a key from chain, address, and date range", () => {
    const key = buildCacheKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");
    expect(key).toBe("bittensor:5fhnew46:2024-01-01:2024-12-31");
  });

  it("lowercases the address", () => {
    const key1 = buildCacheKey("kaspa", "KASPA:ABC123");
    const key2 = buildCacheKey("kaspa", "kaspa:abc123");
    expect(key1).toBe(key2);
  });

  it("omits date parts when not provided", () => {
    const key = buildCacheKey("bittensor", "5FHneW46");
    expect(key).toBe("bittensor:5fhnew46");
  });

  it("includes fromDate only when toDate is missing", () => {
    const key = buildCacheKey("bittensor", "5FHneW46", "2024-01-01");
    expect(key).toBe("bittensor:5fhnew46:2024-01-01");
  });
});

// ---------------------------------------------------------------------------
// getCachedTransactions / setCachedTransactions
// ---------------------------------------------------------------------------

describe("getCachedTransactions / setCachedTransactions", () => {
  it("returns null when cache is empty", () => {
    expect(getCachedTransactions("nonexistent")).toBeNull();
  });

  it("stores and retrieves transactions", () => {
    const txs = [makeTx(), makeTx({ type: "receive", receivedQuantity: 2 })];
    const key = buildCacheKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");

    setCachedTransactions(key, txs);
    const cached = getCachedTransactions(key);

    expect(cached).not.toBeNull();
    expect(cached).toHaveLength(2);
    expect(cached![0].date).toBeInstanceOf(Date);
    expect(cached![0].date.toISOString()).toBe("2024-06-15T12:00:00.000Z");
    expect(cached![0].sentQuantity).toBe(1.5);
    expect(cached![0].sentCurrency).toBe("TAO");
    expect(cached![1].type).toBe("receive");
  });

  it("returns null for expired entries", () => {
    vi.useFakeTimers();
    const key = "test:expired";
    const txs = [makeTx()];

    // Cache with a 1-second TTL
    setCachedTransactions(key, txs, 1_000);
    expect(getCachedTransactions(key)).not.toBeNull();

    // Advance time past the TTL
    vi.advanceTimersByTime(2_000);
    expect(getCachedTransactions(key)).toBeNull();
  });

  it("removes expired entry from storage on read", () => {
    vi.useFakeTimers();
    const key = "test:prune";
    setCachedTransactions(key, [makeTx()], 1_000);

    vi.advanceTimersByTime(2_000);
    getCachedTransactions(key);

    // Verify it was actually removed from storage
    const raw = JSON.parse(localStorage.getItem("awakenfetch_tx_cache") ?? "{}");
    expect(raw[key]).toBeUndefined();
  });

  it("does not cross-match different keys", () => {
    const key1 = buildCacheKey("bittensor", "addr1", "2024-01-01", "2024-12-31");
    const key2 = buildCacheKey("kaspa", "addr2", "2024-01-01", "2024-12-31");

    setCachedTransactions(key1, [makeTx({ sentCurrency: "TAO" })]);

    expect(getCachedTransactions(key1)).not.toBeNull();
    expect(getCachedTransactions(key2)).toBeNull();
  });

  it("evicts oldest entry when cache exceeds max entries", () => {
    vi.useFakeTimers({ now: 1000 });

    // Fill cache to the limit (50 entries)
    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(1);
      setCachedTransactions(`key:${i}`, [makeTx()]);
    }

    // Adding one more should evict the oldest (key:0)
    vi.advanceTimersByTime(1);
    setCachedTransactions("key:new", [makeTx()]);

    expect(getCachedTransactions("key:0")).toBeNull();
    expect(getCachedTransactions("key:new")).not.toBeNull();
    // key:1 should still be there
    expect(getCachedTransactions("key:1")).not.toBeNull();
  });

  it("preserves all transaction fields through serialization round-trip", () => {
    const tx: Transaction = {
      date: new Date("2024-03-15T08:30:00.000Z"),
      type: "trade",
      sentQuantity: 10,
      sentCurrency: "ETH",
      sentFiatAmount: 35000,
      receivedQuantity: 500000,
      receivedCurrency: "INJ",
      receivedFiatAmount: 35000,
      feeAmount: 0.001,
      feeCurrency: "ETH",
      txHash: "0xdeadbeef",
      notes: "Test trade",
      tag: "swap",
      additionalSent: [{ quantity: 5, currency: "USDC" }],
      additionalReceived: [{ quantity: 100, currency: "ATOM", fiatAmount: 800 }],
    };

    const key = "test:roundtrip";
    setCachedTransactions(key, [tx]);
    const cached = getCachedTransactions(key)!;

    expect(cached).toHaveLength(1);
    const result = cached[0];
    expect(result.date.toISOString()).toBe("2024-03-15T08:30:00.000Z");
    expect(result.type).toBe("trade");
    expect(result.sentQuantity).toBe(10);
    expect(result.sentCurrency).toBe("ETH");
    expect(result.sentFiatAmount).toBe(35000);
    expect(result.receivedQuantity).toBe(500000);
    expect(result.receivedCurrency).toBe("INJ");
    expect(result.feeAmount).toBe(0.001);
    expect(result.feeCurrency).toBe("ETH");
    expect(result.txHash).toBe("0xdeadbeef");
    expect(result.notes).toBe("Test trade");
    expect(result.tag).toBe("swap");
    expect(result.additionalSent).toEqual([{ quantity: 5, currency: "USDC" }]);
    expect(result.additionalReceived).toEqual([
      { quantity: 100, currency: "ATOM", fiatAmount: 800 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// removeCachedTransactions
// ---------------------------------------------------------------------------

describe("removeCachedTransactions", () => {
  it("removes a specific entry", () => {
    const key1 = "test:remove1";
    const key2 = "test:remove2";
    setCachedTransactions(key1, [makeTx()]);
    setCachedTransactions(key2, [makeTx()]);

    removeCachedTransactions(key1);

    expect(getCachedTransactions(key1)).toBeNull();
    expect(getCachedTransactions(key2)).not.toBeNull();
  });

  it("does nothing when key does not exist", () => {
    setCachedTransactions("test:keep", [makeTx()]);
    removeCachedTransactions("test:nonexistent");
    expect(getCachedTransactions("test:keep")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearTransactionCache
// ---------------------------------------------------------------------------

describe("clearTransactionCache", () => {
  it("removes the entire cache from localStorage", () => {
    setCachedTransactions("a", [makeTx()]);
    setCachedTransactions("b", [makeTx()]);

    clearTransactionCache();

    expect(getCachedTransactions("a")).toBeNull();
    expect(getCachedTransactions("b")).toBeNull();
    expect(localStorage.getItem("awakenfetch_tx_cache")).toBeNull();
  });
});
