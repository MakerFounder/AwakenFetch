/**
 * Tests for the Ergo (ERG) chain adapter.
 *
 * Covers:
 *   - Ergo address validation
 *   - Explorer URL generation
 *   - nanoERG → ERG conversion
 *   - Transaction mapping (send/receive/trade/fee-only/self-send)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ergoAdapter,
  isValidErgoAddress,
  nanoErgToErg,
} from "@/lib/adapters/ergo";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidErgoAddress", () => {
  it("accepts a valid Ergo P2PK address (starts with 9)", () => {
    expect(isValidErgoAddress("9f4QF8jQU4Sy1xBt3y2Kv7LZo1T1M9h6Q8X8K5y3Z6d7e8w9A1b")).toBe(true);
  });

  it("accepts a valid Ergo address with different length", () => {
    expect(isValidErgoAddress("9hY16vzHmmfyVBwKeFGHvb2bMFsaA6dqGFQM9XnEPddRWQUPNsz")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidErgoAddress("")).toBe(false);
  });

  it("rejects a string that is too short", () => {
    expect(isValidErgoAddress("9f4QF8")).toBe(false);
  });

  it("rejects an address with invalid characters", () => {
    expect(isValidErgoAddress("9f4QF8jQU4Sy1xBt3y2Kv7LZo1T1M9h6Q8X8K5y3Z6d7e8w0OIl")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidErgoAddress(null as unknown as string)).toBe(false);
    expect(isValidErgoAddress(undefined as unknown as string)).toBe(false);
    expect(isValidErgoAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidErgoAddress("  9hY16vzHmmfyVBwKeFGHvb2bMFsaA6dqGFQM9XnEPddRWQUPNsz  ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// nanoERG → ERG conversion
// ---------------------------------------------------------------------------

describe("nanoErgToErg", () => {
  it("converts 1 ERG in nanoERG", () => {
    expect(nanoErgToErg(1_000_000_000)).toBe(1);
  });

  it("converts fractional ERG", () => {
    expect(nanoErgToErg(500_000_000)).toBe(0.5);
  });

  it("returns 0 for zero", () => {
    expect(nanoErgToErg(0)).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(nanoErgToErg(NaN)).toBe(0);
  });

  it("converts small amounts", () => {
    expect(nanoErgToErg(1)).toBeCloseTo(0.000000001, 9);
  });

  it("converts large amounts", () => {
    expect(nanoErgToErg(100_000_000_000)).toBe(100);
  });

  it("converts fee amounts", () => {
    expect(nanoErgToErg(1_100_000)).toBeCloseTo(0.0011, 4);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("ergoAdapter.getExplorerUrl", () => {
  it("returns the correct Ergo Explorer URL", () => {
    const hash = "abc123def456";
    expect(ergoAdapter.getExplorerUrl(hash)).toBe(
      "https://explorer.ergoplatform.com/en/transactions/abc123def456",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("ergoAdapter.validateAddress", () => {
  it("delegates to isValidErgoAddress", () => {
    expect(ergoAdapter.validateAddress("9hY16vzHmmfyVBwKeFGHvb2bMFsaA6dqGFQM9XnEPddRWQUPNsz")).toBe(true);
    expect(ergoAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("ergoAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(ergoAdapter.chainId).toBe("ergo");
  });

  it("has correct chainName", () => {
    expect(ergoAdapter.chainName).toBe("Ergo");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "9hY16vzHmmfyVBwKeFGHvb2bMFsaA6dqGFQM9XnEPddRWQUPNsz";
const OTHER_ADDRESS = "9f4QF8jQU4Sy1xBt3y2Kv7LZo1T1M9h6Q8X8K5y3Z6d7e8w9A1b";

function makeInput(
  address: string,
  value: number,
  assets: Array<{ tokenId: string; amount: number; name: string | null; decimals: number }> = [],
): Record<string, unknown> {
  return {
    boxId: `box-${Math.random().toString(36).slice(2, 10)}`,
    value,
    index: 0,
    spendingProof: "proof",
    outputBlockId: "block-001",
    outputTransactionId: "tx-prev",
    outputIndex: 0,
    outputGlobalIndex: 0,
    outputCreatedAt: 100,
    outputSettledAt: 100,
    ergoTree: "tree",
    address,
    assets: assets.map((a, i) => ({ ...a, index: i, type: null })),
    additionalRegisters: {},
  };
}

function makeOutput(
  address: string,
  value: number,
  txId: string = "tx-001",
  assets: Array<{ tokenId: string; amount: number; name: string | null; decimals: number }> = [],
): Record<string, unknown> {
  return {
    boxId: `box-${Math.random().toString(36).slice(2, 10)}`,
    transactionId: txId,
    blockId: "block-001",
    value,
    index: 0,
    globalIndex: 0,
    creationHeight: 100,
    settlementHeight: 101,
    ergoTree: "tree",
    address,
    assets: assets.map((a, i) => ({ ...a, index: i, type: null })),
    additionalRegisters: {},
    spentTransactionId: null,
    mainChain: true,
  };
}

function makeMockTx(
  overrides: Partial<{
    id: string;
    timestamp: number;
    inputs: Record<string, unknown>[];
    outputs: Record<string, unknown>[];
  }> = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? "tx-001",
    blockId: "block-001",
    inclusionHeight: 100,
    timestamp: overrides.timestamp ?? 1705315800000,
    index: 0,
    globalIndex: 0,
    numConfirmations: 10,
    inputs: overrides.inputs ?? [],
    dataInputs: [],
    outputs: overrides.outputs ?? [],
    size: 300,
  };
}

function wrapResponse(txs: Record<string, unknown>[], total?: number) {
  return {
    items: txs,
    total: total ?? txs.length,
  };
}

describe("ergoAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      ergoAdapter.fetchTransactions("invalid"),
    ).rejects.toThrow("Invalid Ergo address");
  });

  it("fetches and maps a send transaction correctly", async () => {
    // Address spends 5 ERG, sends 3 ERG to other, gets 1.999 ERG change, 0.001 fee
    const mockTx = makeMockTx({
      id: "tx-send-001",
      inputs: [
        makeInput(VALID_ADDRESS, 5_000_000_000), // 5 ERG input from our address
      ],
      outputs: [
        makeOutput(OTHER_ADDRESS, 2_999_000_000, "tx-send-001"), // 2.999 ERG to other
        makeOutput(VALID_ADDRESS, 1_999_000_000, "tx-send-001"), // 1.999 ERG change back
        // Fee: 5 - 2.999 - 1.999 = 0.002 ERG
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    // Net ERG sent = 5 - 1.999 = 3.001 ERG. Fee = 0.002. Sent ex fee = 3.001 - 0.002 = 2.999
    expect(txs[0].sentQuantity).toBeCloseTo(2.999, 3);
    expect(txs[0].sentCurrency).toBe("ERG");
    expect(txs[0].feeAmount).toBeCloseTo(0.002, 3);
    expect(txs[0].feeCurrency).toBe("ERG");
    expect(txs[0].txHash).toBe("tx-send-001");
  });

  it("fetches and maps a receive transaction correctly", async () => {
    // Other address sends 3 ERG to us
    const mockTx = makeMockTx({
      id: "tx-receive-001",
      inputs: [
        makeInput(OTHER_ADDRESS, 5_000_000_000), // 5 ERG input from other
      ],
      outputs: [
        makeOutput(VALID_ADDRESS, 3_000_000_000, "tx-receive-001"), // 3 ERG to us
        makeOutput(OTHER_ADDRESS, 1_999_000_000, "tx-receive-001"), // change back
        // Fee: 5 - 3 - 1.999 = 0.001 ERG
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(3);
    expect(txs[0].receivedCurrency).toBe("ERG");
    // Receiver should not have fee (not the spender)
    expect(txs[0].feeAmount).toBeUndefined();
    expect(txs[0].txHash).toBe("tx-receive-001");
  });

  it("fetches and maps a trade (ERG -> token) correctly", async () => {
    const TOKEN_ID = "token-abc-123";
    // User sends 2 ERG, receives 100 tokens
    const mockTx = makeMockTx({
      id: "tx-trade-001",
      inputs: [
        makeInput(VALID_ADDRESS, 3_000_000_000), // 3 ERG from our address
        makeInput(OTHER_ADDRESS, 0, [
          { tokenId: TOKEN_ID, amount: 1000, name: "SigUSD", decimals: 2 },
        ]),
      ],
      outputs: [
        makeOutput(VALID_ADDRESS, 999_000_000, "tx-trade-001", [
          { tokenId: TOKEN_ID, amount: 1000, name: "SigUSD", decimals: 2 },
        ]), // change + received tokens
        makeOutput(OTHER_ADDRESS, 1_000_000_000, "tx-trade-001"), // other gets ERG
        // Fee: 3 - 0.999 - 1 = 1.001 ERG total, but that's total inputs - total outputs
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].sentCurrency).toBe("ERG");
    expect(txs[0].receivedQuantity).toBe(10); // 1000 / 10^2
    expect(txs[0].receivedCurrency).toBe("SigUSD");
  });

  it("handles fee-only transaction", async () => {
    // User sends to themselves, only fee deducted
    const mockTx = makeMockTx({
      id: "tx-fee-001",
      inputs: [
        makeInput(VALID_ADDRESS, 2_000_000_000),
      ],
      outputs: [
        makeOutput(VALID_ADDRESS, 1_999_000_000, "tx-fee-001"),
        // Fee: 2 - 1.999 = 0.001 ERG
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
    expect(txs[0].feeAmount).toBeCloseTo(0.001, 3);
    expect(txs[0].feeCurrency).toBe("ERG");
    expect(txs[0].notes).toBe("Fee-only transaction");
  });

  it("handles self-transfer (net zero ERG)", async () => {
    // Self-transfer: UTXO consolidation, but fee = 0 for test purposes
    const mockTx = makeMockTx({
      id: "tx-self-001",
      inputs: [
        makeInput(VALID_ADDRESS, 2_000_000_000),
      ],
      outputs: [
        makeOutput(VALID_ADDRESS, 2_000_000_000, "tx-self-001"),
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
    expect(txs[0].notes).toBe("Self-transfer or contract interaction");
  });

  it("skips transactions not involving our address", async () => {
    const mockTx = makeMockTx({
      id: "tx-other-001",
      inputs: [
        makeInput(OTHER_ADDRESS, 5_000_000_000),
      ],
      outputs: [
        makeOutput(OTHER_ADDRESS, 4_999_000_000, "tx-other-001"),
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockTx({
      id: "tx-later",
      timestamp: 1705402200000,
      inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
      outputs: [
        makeOutput(VALID_ADDRESS, 2_000_000_000, "tx-later"),
        makeOutput(OTHER_ADDRESS, 2_999_000_000, "tx-later"),
      ],
    });

    const tx2 = makeMockTx({
      id: "tx-earlier",
      timestamp: 1705315800000,
      inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
      outputs: [
        makeOutput(VALID_ADDRESS, 3_000_000_000, "tx-earlier"),
        makeOutput(OTHER_ADDRESS, 1_999_000_000, "tx-earlier"),
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([tx1, tx2])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

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

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("handles pagination correctly", async () => {
    // First page: 500 items (full page triggers next fetch)
    const page1 = Array.from({ length: 500 }, (_, i) =>
      makeMockTx({
        id: `tx-page1-${i}`,
        timestamp: 1705315800000 + i * 1000,
        inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
        outputs: [
          makeOutput(VALID_ADDRESS, 2_000_000_000, `tx-page1-${i}`),
          makeOutput(OTHER_ADDRESS, 2_999_000_000, `tx-page1-${i}`),
        ],
      }),
    );

    // Second page: 2 items
    const page2 = [
      makeMockTx({
        id: "tx-page2-0",
        timestamp: 1705815800000,
        inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
        outputs: [
          makeOutput(VALID_ADDRESS, 2_000_000_000, "tx-page2-0"),
          makeOutput(OTHER_ADDRESS, 2_999_000_000, "tx-page2-0"),
        ],
      }),
      makeMockTx({
        id: "tx-page2-1",
        timestamp: 1705815801000,
        inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
        outputs: [
          makeOutput(VALID_ADDRESS, 3_000_000_000, "tx-page2-1"),
          makeOutput(OTHER_ADDRESS, 1_999_000_000, "tx-page2-1"),
        ],
      }),
    ];

    let fetchCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return new Response(
          JSON.stringify(wrapResponse(page1, 502)),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(wrapResponse(page2, 502)), { status: 200 });
    });

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

    expect(fetchCallCount).toBe(2);
    expect(txs).toHaveLength(502);
  });

  it("applies date filters correctly", async () => {
    const tx1 = makeMockTx({
      id: "tx-jan",
      timestamp: new Date("2024-01-15T10:00:00Z").getTime(),
      inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
      outputs: [
        makeOutput(VALID_ADDRESS, 2_000_000_000, "tx-jan"),
        makeOutput(OTHER_ADDRESS, 2_999_000_000, "tx-jan"),
      ],
    });

    const tx2 = makeMockTx({
      id: "tx-jul",
      timestamp: new Date("2024-07-15T10:00:00Z").getTime(),
      inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
      outputs: [
        makeOutput(VALID_ADDRESS, 3_000_000_000, "tx-jul"),
        makeOutput(OTHER_ADDRESS, 1_999_000_000, "tx-jul"),
      ],
    });

    const tx3 = makeMockTx({
      id: "tx-dec",
      timestamp: new Date("2024-12-15T10:00:00Z").getTime(),
      inputs: [makeInput(OTHER_ADDRESS, 5_000_000_000)],
      outputs: [
        makeOutput(VALID_ADDRESS, 1_000_000_000, "tx-dec"),
        makeOutput(OTHER_ADDRESS, 3_999_000_000, "tx-dec"),
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([tx1, tx2, tx3])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate: new Date("2024-06-01T00:00:00Z"),
      toDate: new Date("2024-09-01T00:00:00Z"),
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe("tx-jul");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles token-only receive", async () => {
    const TOKEN_ID = "token-xyz-789";
    const mockTx = makeMockTx({
      id: "tx-token-recv",
      inputs: [
        makeInput(OTHER_ADDRESS, 2_000_000_000, [
          { tokenId: TOKEN_ID, amount: 500, name: "NETA", decimals: 0 },
        ]),
      ],
      outputs: [
        makeOutput(VALID_ADDRESS, 1_000_000, "tx-token-recv", [
          { tokenId: TOKEN_ID, amount: 500, name: "NETA", decimals: 0 },
        ]),
        makeOutput(OTHER_ADDRESS, 1_998_000_000, "tx-token-recv"),
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await ergoAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    // We received tokens AND some ERG (for box minimum), which is a trade
    // Actually: our address has 0 input, 1_000_000 output = receive, plus 500 tokens = receive
    // Since we receive both ERG and tokens but send nothing, this should still be "receive"
    // But since tokens are received AND ERG is received, let me check the logic...
    // hasErgReceived = true (net = 1_000_000 > 0)
    // hasTokensReceived = true
    // No sends, so it goes to the tokensReceived branch
    expect(txs[0].receivedQuantity).toBe(500);
    expect(txs[0].receivedCurrency).toBe("NETA");
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("ergoAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "ERG",
        feeAmount: 0.001,
        feeCurrency: "ERG",
        txHash: "tx-abc-123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "ERG",
        txHash: "tx-def-456",
      },
    ];

    const csv = ergoAdapter.toAwakenCSV(txs);
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
    expect(lines[1]).toContain("ERG");
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

describe("ergo adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("ergo");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("ergo");
    expect(adapter?.chainName).toBe("Ergo");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const ergo = chains.find((c) => c.chainId === "ergo");
    expect(ergo).toBeDefined();
    expect(ergo?.chainName).toBe("Ergo");
    expect(ergo?.enabled).toBe(true);
  });
});
