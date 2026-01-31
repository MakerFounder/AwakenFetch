/**
 * Tests for the MultiversX (EGLD) chain adapter.
 *
 * Covers:
 *   - MultiversX address validation
 *   - Explorer URL generation
 *   - Denomination → EGLD conversion
 *   - Transaction mapping (send/receive/stake/unstake/claim/trade)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  multiversxAdapter,
  isValidMultiversXAddress,
  denominationToEgld,
} from "@/lib/adapters/multiversx";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidMultiversXAddress", () => {
  it("accepts a valid MultiversX address", () => {
    expect(
      isValidMultiversXAddress(
        "erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th",
      ),
    ).toBe(true);
  });

  it("accepts another valid address", () => {
    // 62 chars total: erd1 + 58 lowercase alnum
    const addr = "erd1" + "a".repeat(58);
    expect(isValidMultiversXAddress(addr)).toBe(true);
  });

  it("rejects an address without erd1 prefix", () => {
    expect(
      isValidMultiversXAddress(
        "qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th",
      ),
    ).toBe(false);
  });

  it("accepts an address with uppercase characters (normalizes to lowercase)", () => {
    expect(
      isValidMultiversXAddress(
        "erd1QYU5WTHLDZR8WX5C9UCG8KJAGG0JFS53S8NR3ZPZ3HYPEFSDD8SSYCR6TH",
      ),
    ).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidMultiversXAddress("")).toBe(false);
  });

  it("rejects an address that is too short", () => {
    const addr = "erd1" + "a".repeat(57);
    expect(isValidMultiversXAddress(addr)).toBe(false);
  });

  it("rejects an address that is too long", () => {
    const addr = "erd1" + "a".repeat(59);
    expect(isValidMultiversXAddress(addr)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidMultiversXAddress(null as unknown as string)).toBe(false);
    expect(isValidMultiversXAddress(undefined as unknown as string)).toBe(false);
    expect(isValidMultiversXAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    const addr = "erd1" + "a".repeat(58);
    expect(isValidMultiversXAddress(`  ${addr}  `)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Denomination → EGLD conversion
// ---------------------------------------------------------------------------

describe("denominationToEgld", () => {
  it("converts 1 EGLD in denomination units", () => {
    expect(denominationToEgld("1000000000000000000")).toBe(1);
  });

  it("converts fractional EGLD", () => {
    expect(denominationToEgld("500000000000000000")).toBe(0.5);
  });

  it("returns 0 for empty string", () => {
    expect(denominationToEgld("")).toBe(0);
  });

  it("returns 0 for zero string", () => {
    expect(denominationToEgld("0")).toBe(0);
  });

  it("returns 0 for NaN input", () => {
    expect(denominationToEgld("not-a-number")).toBe(0);
  });

  it("converts small amounts", () => {
    expect(denominationToEgld("1000000000000")).toBeCloseTo(0.000001, 8);
  });

  it("converts large amounts", () => {
    expect(denominationToEgld("100000000000000000000")).toBe(100);
  });

  it("supports custom decimals", () => {
    expect(denominationToEgld("1000000", 6)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("multiversxAdapter.getExplorerUrl", () => {
  it("returns the correct MultiversX explorer URL", () => {
    const hash = "abc123def456";
    expect(multiversxAdapter.getExplorerUrl(hash)).toBe(
      "https://explorer.multiversx.com/transactions/abc123def456",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("multiversxAdapter.validateAddress", () => {
  it("delegates to isValidMultiversXAddress", () => {
    expect(
      multiversxAdapter.validateAddress(
        "erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th",
      ),
    ).toBe(true);
    expect(multiversxAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("multiversxAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(multiversxAdapter.chainId).toBe("multiversx");
  });

  it("has correct chainName", () => {
    expect(multiversxAdapter.chainName).toBe("MultiversX");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS =
  "erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th";

const OTHER_ADDRESS =
  "erd1spyavw0956vq68xj8y4tenjpq2wd5a9p2c6j8gsz7ztyrnpxrruqzu66jx";

function makeMockTx(
  overrides: Partial<{
    txHash: string;
    sender: string;
    receiver: string;
    value: string;
    fee: string;
    timestamp: number;
    status: string;
    function: string;
    action: { category: string; name: string; description?: string };
    data: string;
    type: string;
  }> = {},
): Record<string, unknown> {
  return {
    txHash: overrides.txHash ?? "tx-abc-123",
    gasLimit: 50000,
    gasPrice: 1000000000,
    gasUsed: 50000,
    miniBlockHash: "mini-block-hash",
    nonce: 1,
    receiver: overrides.receiver ?? OTHER_ADDRESS,
    receiverShard: 1,
    round: 12345,
    sender: overrides.sender ?? VALID_ADDRESS,
    senderShard: 0,
    signature: "sig",
    status: overrides.status ?? "success",
    value: overrides.value ?? "1000000000000000000",
    fee: overrides.fee ?? "50000000000000",
    timestamp: overrides.timestamp ?? 1705315800,
    data: overrides.data,
    function: overrides.function,
    action: overrides.action,
    type: overrides.type ?? "Transaction",
  };
}

describe("multiversxAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      multiversxAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid MultiversX address");
  });

  it("fetches and maps a send transaction correctly", async () => {
    const mockTx = makeMockTx({
      txHash: "tx-send-001",
      sender: VALID_ADDRESS,
      receiver: OTHER_ADDRESS,
      value: "1000000000000000000", // 1 EGLD
      fee: "50000000000000", // 0.00005 EGLD
      timestamp: 1705315800, // 2024-01-15T14:30:00Z
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(1);
    expect(txs[0].sentCurrency).toBe("EGLD");
    expect(txs[0].feeAmount).toBeCloseTo(0.00005, 8);
    expect(txs[0].feeCurrency).toBe("EGLD");
    expect(txs[0].txHash).toBe("tx-send-001");
  });

  it("fetches and maps a receive transaction correctly", async () => {
    const mockTx = makeMockTx({
      txHash: "tx-receive-001",
      sender: OTHER_ADDRESS,
      receiver: VALID_ADDRESS,
      value: "5000000000000000000", // 5 EGLD
      fee: "50000000000000",
      timestamp: 1705315800,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(5);
    expect(txs[0].receivedCurrency).toBe("EGLD");
    // Receiver should not have fee
    expect(txs[0].feeAmount).toBeUndefined();
    expect(txs[0].txHash).toBe("tx-receive-001");
  });

  it("fetches and maps a staking delegate transaction", async () => {
    const stakingContract =
      "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqylllslmq4y6";
    const mockTx = makeMockTx({
      txHash: "tx-stake-001",
      sender: VALID_ADDRESS,
      receiver: stakingContract,
      value: "10000000000000000000", // 10 EGLD
      fee: "100000000000000",
      timestamp: 1705315800,
      function: "delegate",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("stake");
    expect(txs[0].sentQuantity).toBe(10);
    expect(txs[0].sentCurrency).toBe("EGLD");
    expect(txs[0].tag).toBe("staked");
  });

  it("fetches and maps an unstake (unDelegate) transaction", async () => {
    const stakingContract =
      "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqylllslmq4y6";
    const mockTx = makeMockTx({
      txHash: "tx-unstake-001",
      sender: VALID_ADDRESS,
      receiver: stakingContract,
      value: "5000000000000000000", // 5 EGLD
      fee: "100000000000000",
      timestamp: 1705315800,
      function: "unDelegate",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("unstake");
    expect(txs[0].receivedQuantity).toBe(5);
    expect(txs[0].receivedCurrency).toBe("EGLD");
    expect(txs[0].tag).toBe("unstaked");
  });

  it("fetches and maps a claimRewards transaction", async () => {
    const stakingContract =
      "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqylllslmq4y6";
    const mockTx = makeMockTx({
      txHash: "tx-claim-001",
      sender: VALID_ADDRESS,
      receiver: stakingContract,
      value: "500000000000000000", // 0.5 EGLD
      fee: "100000000000000",
      timestamp: 1705315800,
      function: "claimRewards",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("claim");
    expect(txs[0].receivedQuantity).toBe(0.5);
    expect(txs[0].receivedCurrency).toBe("EGLD");
  });

  it("fetches and maps a swap transaction via action", async () => {
    const mockTx = makeMockTx({
      txHash: "tx-swap-001",
      sender: VALID_ADDRESS,
      receiver: "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq",
      value: "1000000000000000000", // 1 EGLD
      fee: "200000000000000",
      timestamp: 1705315800,
      function: "swapTokensFixedInput",
      action: {
        category: "mex",
        name: "swap",
        description: "Swap 1 EGLD for 100 MEX",
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].sentQuantity).toBe(1);
    expect(txs[0].sentCurrency).toBe("EGLD");
  });

  it("skips failed transactions", async () => {
    const mockTx = makeMockTx({
      txHash: "tx-failed-001",
      status: "fail",
      sender: VALID_ADDRESS,
      receiver: OTHER_ADDRESS,
      value: "1000000000000000000",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockTx({
      txHash: "tx-later",
      timestamp: 1705402200, // later
      sender: OTHER_ADDRESS,
      receiver: VALID_ADDRESS,
      value: "1000000000000000000",
    });

    const tx2 = makeMockTx({
      txHash: "tx-earlier",
      timestamp: 1705315800, // earlier
      sender: OTHER_ADDRESS,
      receiver: VALID_ADDRESS,
      value: "2000000000000000000",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([tx1, tx2]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(2);
    expect(txs[0].txHash).toBe("tx-earlier");
    expect(txs[1].txHash).toBe("tx-later");
    expect(txs[0].date.getTime()).toBeLessThan(txs[1].date.getTime());
  });

  it("handles API error with retry", async () => {
    let callCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("handles pagination correctly", async () => {
    // First page: 50 items (full page triggers next fetch)
    const page1 = Array.from({ length: 50 }, (_, i) =>
      makeMockTx({
        txHash: `tx-page1-${i}`,
        timestamp: 1705315800 + i,
        sender: OTHER_ADDRESS,
        receiver: VALID_ADDRESS,
        value: "1000000000000000000",
      }),
    );

    // Second page: 2 items (less than 50, so pagination stops)
    const page2 = [
      makeMockTx({
        txHash: "tx-page2-0",
        timestamp: 1705315850,
        sender: OTHER_ADDRESS,
        receiver: VALID_ADDRESS,
        value: "2000000000000000000",
      }),
      makeMockTx({
        txHash: "tx-page2-1",
        timestamp: 1705315851,
        sender: OTHER_ADDRESS,
        receiver: VALID_ADDRESS,
        value: "3000000000000000000",
      }),
    ];

    let fetchCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return new Response(JSON.stringify(page1), { status: 200 });
      }
      return new Response(JSON.stringify(page2), { status: 200 });
    });

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(fetchCallCount).toBe(2);
    expect(txs).toHaveLength(52);
  });

  it("passes date filters as after/before query params", async () => {
    let capturedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const fromDate = new Date("2024-06-01T00:00:00Z");
    const toDate = new Date("2024-12-31T23:59:59Z");

    await multiversxAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate,
      toDate,
    });

    expect(capturedUrl).toContain("after=");
    expect(capturedUrl).toContain("before=");
    expect(capturedUrl).toContain(
      `after=${Math.floor(fromDate.getTime() / 1000)}`,
    );
    expect(capturedUrl).toContain(
      `before=${Math.floor(toDate.getTime() / 1000)}`,
    );
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("maps zero-value transactions correctly", async () => {
    const mockTx = makeMockTx({
      txHash: "tx-zero-001",
      sender: VALID_ADDRESS,
      receiver: OTHER_ADDRESS,
      value: "0",
      fee: "50000000000000",
      timestamp: 1705315800,
      function: "claimRewards",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await multiversxAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("claim");
    // Zero value should not produce received quantity
    expect(txs[0].receivedQuantity).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("multiversxAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "EGLD",
        feeAmount: 0.00005,
        feeCurrency: "EGLD",
        txHash: "tx-abc-123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "EGLD",
        txHash: "tx-def-456",
      },
    ];

    const csv = multiversxAdapter.toAwakenCSV(txs);
    const lines = csv.split("\n");

    // Header
    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Received Quantity");
    expect(lines[0]).toContain("Sent Quantity");
    expect(lines[0]).toContain("Fee Amount");
    expect(lines[0]).toContain("Transaction Hash");

    // Send row
    expect(lines[1]).toContain("01/15/2025 14:30:00");
    expect(lines[1]).toContain("10");
    expect(lines[1]).toContain("EGLD");
    expect(lines[1]).toContain("tx-abc-123");

    // Receive row
    expect(lines[2]).toContain("02/01/2025 10:00:00");
    expect(lines[2]).toContain("5");
    expect(lines[2]).toContain("tx-def-456");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("multiversx adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("multiversx");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("multiversx");
    expect(adapter?.chainName).toBe("MultiversX");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const multiversx = chains.find((c) => c.chainId === "multiversx");
    expect(multiversx).toBeDefined();
    expect(multiversx?.chainName).toBe("MultiversX");
    expect(multiversx?.enabled).toBe(true);
  });
});
