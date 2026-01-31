/**
 * Tests for the Hedera (HBAR) chain adapter.
 *
 * Covers:
 *   - Hedera address validation
 *   - Explorer URL generation
 *   - Tinybar → HBAR conversion
 *   - Transaction mapping (send/receive/claim/approval/other)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  hederaAdapter,
  isValidHederaAddress,
  tinybarsToHbar,
} from "@/lib/adapters/hedera";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidHederaAddress", () => {
  it("accepts a valid Hedera address", () => {
    expect(isValidHederaAddress("0.0.12345")).toBe(true);
  });

  it("accepts address with large account number", () => {
    expect(isValidHederaAddress("0.0.9203875")).toBe(true);
  });

  it("accepts address with non-zero shard/realm", () => {
    expect(isValidHederaAddress("1.2.12345")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidHederaAddress("")).toBe(false);
  });

  it("rejects a single number", () => {
    expect(isValidHederaAddress("12345")).toBe(false);
  });

  it("rejects address with only two parts", () => {
    expect(isValidHederaAddress("0.12345")).toBe(false);
  });

  it("rejects address with four parts", () => {
    expect(isValidHederaAddress("0.0.0.12345")).toBe(false);
  });

  it("rejects address with letters", () => {
    expect(isValidHederaAddress("0.0.abc")).toBe(false);
  });

  it("rejects address with negative numbers", () => {
    expect(isValidHederaAddress("0.0.-1")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidHederaAddress(null as unknown as string)).toBe(false);
    expect(isValidHederaAddress(undefined as unknown as string)).toBe(false);
    expect(isValidHederaAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidHederaAddress("  0.0.12345  ")).toBe(true);
  });

  it("rejects address with decimal account number", () => {
    expect(isValidHederaAddress("0.0.123.45")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tinybar → HBAR conversion
// ---------------------------------------------------------------------------

describe("tinybarsToHbar", () => {
  it("converts 1 HBAR in tinybars", () => {
    expect(tinybarsToHbar(100_000_000)).toBe(1);
  });

  it("converts fractional HBAR", () => {
    expect(tinybarsToHbar(50_000_000)).toBe(0.5);
  });

  it("returns 0 for zero", () => {
    expect(tinybarsToHbar(0)).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(tinybarsToHbar(NaN)).toBe(0);
  });

  it("converts small amounts", () => {
    expect(tinybarsToHbar(1)).toBeCloseTo(0.00000001, 8);
  });

  it("converts large amounts", () => {
    expect(tinybarsToHbar(10_000_000_000)).toBe(100);
  });

  it("converts fee amounts", () => {
    expect(tinybarsToHbar(113618)).toBeCloseTo(0.00113618, 8);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("hederaAdapter.getExplorerUrl", () => {
  it("returns the correct HashScan explorer URL", () => {
    const hash = "abc123def456";
    expect(hederaAdapter.getExplorerUrl(hash)).toBe(
      "https://hashscan.io/mainnet/transaction/abc123def456",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("hederaAdapter.validateAddress", () => {
  it("delegates to isValidHederaAddress", () => {
    expect(hederaAdapter.validateAddress("0.0.12345")).toBe(true);
    expect(hederaAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("hederaAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(hederaAdapter.chainId).toBe("hedera");
  });

  it("has correct chainName", () => {
    expect(hederaAdapter.chainName).toBe("Hedera");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "0.0.12345";
const OTHER_ADDRESS = "0.0.67890";

function makeMockTx(
  overrides: Partial<{
    consensus_timestamp: string;
    transaction_hash: string;
    transaction_id: string;
    name: string;
    result: string;
    charged_tx_fee: number;
    transfers: Array<{ account: string; amount: number; is_approval: boolean }>;
    token_transfers: Array<{ token_id: string; account: string; amount: number; is_approval: boolean }>;
    staking_reward_transfers: Array<{ account: string; amount: number; is_approval: boolean }>;
    node: string;
    memo_base64: string;
    nft_transfers: unknown[];
  }> = {},
): Record<string, unknown> {
  return {
    consensus_timestamp: overrides.consensus_timestamp ?? "1705315800.000000000",
    transaction_hash: overrides.transaction_hash ?? "tx-abc-123",
    transaction_id: overrides.transaction_id ?? `${VALID_ADDRESS}-1705315790-000000000`,
    name: overrides.name ?? "CRYPTOTRANSFER",
    result: overrides.result ?? "SUCCESS",
    charged_tx_fee: overrides.charged_tx_fee ?? 113618,
    transfers: overrides.transfers ?? [
      { account: "0.0.10", amount: 4616, is_approval: false },
      { account: "0.0.98", amount: 87202, is_approval: false },
      { account: VALID_ADDRESS, amount: -200_000_000, is_approval: false },
      { account: OTHER_ADDRESS, amount: 200_000_000 - 113618 + 21800, is_approval: false },
    ],
    token_transfers: overrides.token_transfers ?? [],
    staking_reward_transfers: overrides.staking_reward_transfers ?? [],
    node: overrides.node ?? "0.0.10",
    memo_base64: overrides.memo_base64 ?? "",
    nft_transfers: overrides.nft_transfers ?? [],
  };
}

function wrapResponse(txs: Record<string, unknown>[], next: string | null = null) {
  return {
    transactions: txs,
    links: { next },
  };
}

describe("hederaAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      hederaAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Hedera address");
  });

  it("fetches and maps a send transaction correctly", async () => {
    const mockTx = makeMockTx({
      transaction_hash: "tx-send-001",
      transaction_id: `${VALID_ADDRESS}-1705315790-000000000`,
      charged_tx_fee: 100_000, // 0.001 HBAR
      transfers: [
        { account: "0.0.10", amount: 4000, is_approval: false },
        { account: "0.0.98", amount: 80000, is_approval: false },
        { account: VALID_ADDRESS, amount: -200_100_000, is_approval: false }, // sent 2 HBAR + 0.001 fee
        { account: OTHER_ADDRESS, amount: 200_016_000, is_approval: false },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(2);
    expect(txs[0].sentCurrency).toBe("HBAR");
    expect(txs[0].feeAmount).toBeCloseTo(0.001, 8);
    expect(txs[0].feeCurrency).toBe("HBAR");
    expect(txs[0].txHash).toBe("tx-send-001");
  });

  it("fetches and maps a receive transaction correctly", async () => {
    const mockTx = makeMockTx({
      transaction_hash: "tx-receive-001",
      transaction_id: `${OTHER_ADDRESS}-1705315790-000000000`, // other is payer
      charged_tx_fee: 100_000,
      transfers: [
        { account: "0.0.10", amount: 4000, is_approval: false },
        { account: "0.0.98", amount: 80000, is_approval: false },
        { account: OTHER_ADDRESS, amount: -500_100_000, is_approval: false },
        { account: VALID_ADDRESS, amount: 500_016_000, is_approval: false },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBeCloseTo(5.00016, 5);
    expect(txs[0].receivedCurrency).toBe("HBAR");
    // Receiver should not have fee
    expect(txs[0].feeAmount).toBeUndefined();
    expect(txs[0].txHash).toBe("tx-receive-001");
  });

  it("fetches and maps a staking reward transaction", async () => {
    const mockTx = makeMockTx({
      transaction_hash: "tx-reward-001",
      transaction_id: `${OTHER_ADDRESS}-1705315790-000000000`,
      charged_tx_fee: 100_000,
      staking_reward_transfers: [
        { account: VALID_ADDRESS, amount: 50_000_000, is_approval: false },
      ],
      transfers: [
        { account: "0.0.10", amount: 4000, is_approval: false },
        { account: "0.0.98", amount: 80000, is_approval: false },
        { account: "0.0.800", amount: -50_000_000, is_approval: false },
        { account: VALID_ADDRESS, amount: 50_000_000, is_approval: false },
        { account: OTHER_ADDRESS, amount: -100_000, is_approval: false },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("claim");
    expect(txs[0].receivedQuantity).toBe(0.5);
    expect(txs[0].receivedCurrency).toBe("HBAR");
    expect(txs[0].notes).toBe("Staking reward");
  });

  it("fetches and maps an approval transaction", async () => {
    const mockTx = makeMockTx({
      transaction_hash: "tx-approval-001",
      transaction_id: `${VALID_ADDRESS}-1705315790-000000000`,
      name: "CRYPTOAPPROVEALLOWANCE",
      charged_tx_fee: 50_000,
      transfers: [
        { account: "0.0.10", amount: 2000, is_approval: false },
        { account: "0.0.98", amount: 40000, is_approval: false },
        { account: VALID_ADDRESS, amount: -50_000, is_approval: false },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("approval");
    expect(txs[0].feeAmount).toBeCloseTo(0.0005, 8);
    expect(txs[0].feeCurrency).toBe("HBAR");
    expect(txs[0].notes).toBe("Approve allowance");
  });

  it("fetches and maps a token associate transaction", async () => {
    const mockTx = makeMockTx({
      transaction_hash: "tx-assoc-001",
      transaction_id: `${VALID_ADDRESS}-1705315790-000000000`,
      name: "TOKENASSOCIATE",
      charged_tx_fee: 100_000,
      transfers: [
        { account: "0.0.10", amount: 4000, is_approval: false },
        { account: "0.0.98", amount: 80000, is_approval: false },
        { account: VALID_ADDRESS, amount: -100_000, is_approval: false },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
    expect(txs[0].notes).toBe("Token associate");
    expect(txs[0].feeAmount).toBeCloseTo(0.001, 8);
  });

  it("skips failed transactions", async () => {
    const mockTx = makeMockTx({
      result: "FAIL",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockTx({
      transaction_hash: "tx-later",
      consensus_timestamp: "1705402200.000000000",
      transaction_id: `${OTHER_ADDRESS}-1705402190-000000000`,
      transfers: [
        { account: OTHER_ADDRESS, amount: -200_100_000, is_approval: false },
        { account: VALID_ADDRESS, amount: 200_000_000, is_approval: false },
      ],
    });

    const tx2 = makeMockTx({
      transaction_hash: "tx-earlier",
      consensus_timestamp: "1705315800.000000000",
      transaction_id: `${OTHER_ADDRESS}-1705315790-000000000`,
      transfers: [
        { account: OTHER_ADDRESS, amount: -300_100_000, is_approval: false },
        { account: VALID_ADDRESS, amount: 300_000_000, is_approval: false },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([tx1, tx2])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

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
      return new Response(JSON.stringify(wrapResponse([])), { status: 200 });
    });

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("handles pagination correctly", async () => {
    // First page: 100 items (full page triggers next fetch)
    const page1 = Array.from({ length: 100 }, (_, i) =>
      makeMockTx({
        transaction_hash: `tx-page1-${i}`,
        consensus_timestamp: `${1705315800 + i}.000000000`,
        transaction_id: `${OTHER_ADDRESS}-${1705315790 + i}-000000000`,
        transfers: [
          { account: OTHER_ADDRESS, amount: -200_100_000, is_approval: false },
          { account: VALID_ADDRESS, amount: 200_000_000, is_approval: false },
        ],
      }),
    );

    // Second page: 2 items (less than 100, so pagination stops)
    const page2 = [
      makeMockTx({
        transaction_hash: "tx-page2-0",
        consensus_timestamp: "1705315900.000000000",
        transaction_id: `${OTHER_ADDRESS}-1705315890-000000000`,
        transfers: [
          { account: OTHER_ADDRESS, amount: -200_100_000, is_approval: false },
          { account: VALID_ADDRESS, amount: 200_000_000, is_approval: false },
        ],
      }),
      makeMockTx({
        transaction_hash: "tx-page2-1",
        consensus_timestamp: "1705315901.000000000",
        transaction_id: `${OTHER_ADDRESS}-1705315891-000000000`,
        transfers: [
          { account: OTHER_ADDRESS, amount: -300_100_000, is_approval: false },
          { account: VALID_ADDRESS, amount: 300_000_000, is_approval: false },
        ],
      }),
    ];

    let fetchCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return new Response(
          JSON.stringify(wrapResponse(page1, "/api/v1/transactions?account.id=0.0.12345&limit=100&order=asc&timestamp=lt:1705315900.000000000")),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(wrapResponse(page2)), { status: 200 });
    });

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(fetchCallCount).toBe(2);
    expect(txs).toHaveLength(102);
  });

  it("passes date filters as timestamp query params", async () => {
    let capturedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify(wrapResponse([])), { status: 200 });
    });

    const fromDate = new Date("2024-06-01T00:00:00Z");
    const toDate = new Date("2024-12-31T23:59:59Z");

    await hederaAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate,
      toDate,
    });

    expect(capturedUrl).toContain("timestamp=gte%3A");
    expect(capturedUrl).toContain("timestamp=lte:");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles zero-value fee-only transactions for payer", async () => {
    const mockTx = makeMockTx({
      transaction_hash: "tx-fee-only-001",
      transaction_id: `${VALID_ADDRESS}-1705315790-000000000`,
      charged_tx_fee: 100_000,
      transfers: [
        { account: "0.0.10", amount: 4000, is_approval: false },
        { account: "0.0.98", amount: 80000, is_approval: false },
        { account: VALID_ADDRESS, amount: -100_000, is_approval: false },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await hederaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
    expect(txs[0].feeAmount).toBeCloseTo(0.001, 8);
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("hederaAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "HBAR",
        feeAmount: 0.001,
        feeCurrency: "HBAR",
        txHash: "tx-abc-123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "HBAR",
        txHash: "tx-def-456",
      },
    ];

    const csv = hederaAdapter.toAwakenCSV(txs);
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
    expect(lines[1]).toContain("HBAR");
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

describe("hedera adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("hedera");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("hedera");
    expect(adapter?.chainName).toBe("Hedera");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const hedera = chains.find((c) => c.chainId === "hedera");
    expect(hedera).toBeDefined();
    expect(hedera?.chainName).toBe("Hedera");
    expect(hedera?.enabled).toBe(true);
  });
});
