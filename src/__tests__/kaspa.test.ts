/**
 * Tests for the Kaspa (KAS) chain adapter.
 *
 * Covers:
 *   - Kaspa address validation
 *   - Explorer URL generation
 *   - Sompi → KAS conversion
 *   - Transaction mapping (send/receive/coinbase/change)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  kaspaAdapter,
  isValidKaspaAddress,
  sompiToKas,
} from "@/lib/adapters/kaspa";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidKaspaAddress", () => {
  it("accepts a valid Kaspa address (63 chars after prefix)", () => {
    expect(
      isValidKaspaAddress(
        "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
      ),
    ).toBe(true);
  });

  it("accepts a valid Kaspa address (61 chars after prefix)", () => {
    // 61-char payload
    const addr = "kaspa:" + "a".repeat(61);
    expect(isValidKaspaAddress(addr)).toBe(true);
  });

  it("accepts a valid Kaspa address (62 chars after prefix)", () => {
    const addr = "kaspa:" + "q".repeat(62);
    expect(isValidKaspaAddress(addr)).toBe(true);
  });

  it("rejects an address without kaspa: prefix", () => {
    expect(
      isValidKaspaAddress(
        "qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
      ),
    ).toBe(false);
  });

  it("rejects an address with uppercase characters", () => {
    expect(
      isValidKaspaAddress(
        "kaspa:QQKQKZJVR7ZWXXMJXJKMXXDWJU9KJS6E9U82UH59Z07VGAKS6GG62V8707G73",
      ),
    ).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidKaspaAddress("")).toBe(false);
  });

  it("rejects a payload that is too short (60 chars)", () => {
    const addr = "kaspa:" + "a".repeat(60);
    expect(isValidKaspaAddress(addr)).toBe(false);
  });

  it("rejects a payload that is too long (64 chars)", () => {
    const addr = "kaspa:" + "a".repeat(64);
    expect(isValidKaspaAddress(addr)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidKaspaAddress(null as unknown as string)).toBe(false);
    expect(isValidKaspaAddress(undefined as unknown as string)).toBe(false);
    expect(isValidKaspaAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    const addr = "kaspa:" + "a".repeat(62);
    expect(isValidKaspaAddress(`  ${addr}  `)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sompi → KAS conversion
// ---------------------------------------------------------------------------

describe("sompiToKas", () => {
  it("converts 1 KAS in sompi", () => {
    expect(sompiToKas(100_000_000)).toBe(1);
  });

  it("converts fractional KAS", () => {
    expect(sompiToKas(50_000_000)).toBe(0.5);
  });

  it("returns 0 for NaN input", () => {
    expect(sompiToKas(NaN)).toBe(0);
  });

  it("converts small amounts", () => {
    expect(sompiToKas(1)).toBe(0.00000001);
  });

  it("converts large amounts", () => {
    expect(sompiToKas(10_000_000_000)).toBe(100);
  });

  it("converts zero", () => {
    expect(sompiToKas(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("kaspaAdapter.getExplorerUrl", () => {
  it("returns the correct Kaspa explorer URL", () => {
    const hash = "abc123def456";
    expect(kaspaAdapter.getExplorerUrl(hash)).toBe(
      "https://explorer.kaspa.org/txs/abc123def456",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("kaspaAdapter.validateAddress", () => {
  it("delegates to isValidKaspaAddress", () => {
    expect(
      kaspaAdapter.validateAddress(
        "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
      ),
    ).toBe(true);
    expect(kaspaAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("kaspaAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(kaspaAdapter.chainId).toBe("kaspa");
  });

  it("has correct chainName", () => {
    expect(kaspaAdapter.chainName).toBe("Kaspa");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS =
  "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73";

const OTHER_ADDRESS =
  "kaspa:qz0s3e8ehxqnjq7phfd0qxnvzsnvwpc4ghsmw5806hxkfrm4c3guwe3kxrrg";

function makeMockTx(
  overrides: Partial<{
    transaction_id: string;
    block_time: number;
    accepting_block_time: number;
    is_accepted: boolean;
    inputs: unknown[];
    outputs: unknown[];
  }> = {},
) {
  return {
    subnetwork_id: "0000000000000000000000000000000000000000",
    transaction_id: overrides.transaction_id ?? "tx-abc-123",
    hash: overrides.transaction_id ?? "tx-abc-123",
    mass: "1000",
    payload: "",
    block_hash: ["block-hash-1"],
    block_time: overrides.block_time ?? 1705315800000,
    is_accepted: overrides.is_accepted ?? true,
    accepting_block_hash: "accepting-block-hash-1",
    accepting_block_blue_score: 12345,
    accepting_block_time: overrides.accepting_block_time ?? 1705315800000,
    inputs: overrides.inputs ?? [],
    outputs: overrides.outputs ?? [],
  };
}

describe("kaspaAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      kaspaAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Kaspa address");
  });

  it("fetches and maps a receive transaction correctly", async () => {
    const mockTx = makeMockTx({
      transaction_id: "tx-receive-001",
      accepting_block_time: 1705315800000, // 2024-01-15T14:30:00Z
      inputs: [
        {
          transaction_id: "tx-receive-001",
          index: 0,
          previous_outpoint_hash: "prev-hash",
          previous_outpoint_index: "0",
          previous_outpoint_address: OTHER_ADDRESS,
          previous_outpoint_amount: 1_000_000_000,
          signature_script: "sig",
          sig_op_count: "1",
        },
      ],
      outputs: [
        {
          transaction_id: "tx-receive-001",
          index: 0,
          amount: 500_000_000, // 5 KAS
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
        {
          transaction_id: "tx-receive-001",
          index: 1,
          amount: 499_900_000, // change back to sender
          script_public_key: "key2",
          script_public_key_address: OTHER_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(5);
    expect(txs[0].receivedCurrency).toBe("KAS");
    expect(txs[0].txHash).toBe("tx-receive-001");
  });

  it("fetches and maps a send transaction correctly", async () => {
    // User has 10 KAS in input, sends 7 KAS to other, 2.999 KAS change back, 0.001 fee
    const mockTx = makeMockTx({
      transaction_id: "tx-send-001",
      accepting_block_time: 1705315800000,
      inputs: [
        {
          transaction_id: "tx-send-001",
          index: 0,
          previous_outpoint_hash: "prev-hash",
          previous_outpoint_index: "0",
          previous_outpoint_address: VALID_ADDRESS,
          previous_outpoint_amount: 1_000_000_000, // 10 KAS
          signature_script: "sig",
          sig_op_count: "1",
        },
      ],
      outputs: [
        {
          transaction_id: "tx-send-001",
          index: 0,
          amount: 700_000_000, // 7 KAS to recipient
          script_public_key: "key",
          script_public_key_address: OTHER_ADDRESS,
          script_public_key_type: "pubkey",
        },
        {
          transaction_id: "tx-send-001",
          index: 1,
          amount: 299_900_000, // ~2.999 KAS change
          script_public_key: "key2",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(7); // 10 - 2.999 (change) - 0.001 (fee) = 7
    expect(txs[0].sentCurrency).toBe("KAS");
    expect(txs[0].feeAmount).toBeCloseTo(0.001, 4);
    expect(txs[0].feeCurrency).toBe("KAS");
    expect(txs[0].txHash).toBe("tx-send-001");
  });

  it("fetches and maps a send-all transaction (no change output)", async () => {
    // User sends everything: 10 KAS input, 9.999 KAS to other, 0.001 fee
    const mockTx = makeMockTx({
      transaction_id: "tx-sendall-001",
      accepting_block_time: 1705315800000,
      inputs: [
        {
          transaction_id: "tx-sendall-001",
          index: 0,
          previous_outpoint_hash: "prev-hash",
          previous_outpoint_index: "0",
          previous_outpoint_address: VALID_ADDRESS,
          previous_outpoint_amount: 1_000_000_000, // 10 KAS
          signature_script: "sig",
          sig_op_count: "1",
        },
      ],
      outputs: [
        {
          transaction_id: "tx-sendall-001",
          index: 0,
          amount: 999_900_000, // 9.999 KAS to recipient
          script_public_key: "key",
          script_public_key_address: OTHER_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBeCloseTo(9.999, 4);
    expect(txs[0].sentCurrency).toBe("KAS");
    expect(txs[0].feeAmount).toBeCloseTo(0.001, 4);
    expect(txs[0].feeCurrency).toBe("KAS");
  });

  it("maps coinbase (mining reward) transactions as receive", async () => {
    const mockTx = makeMockTx({
      transaction_id: "tx-coinbase-001",
      accepting_block_time: 1705315800000,
      inputs: [
        {
          transaction_id: "tx-coinbase-001",
          index: 0,
          previous_outpoint_hash:
            "0000000000000000000000000000000000000000000000000000000000000000",
          previous_outpoint_index: "4294967295",
          signature_script: "",
          sig_op_count: "0",
        },
      ],
      outputs: [
        {
          transaction_id: "tx-coinbase-001",
          index: 0,
          amount: 50_000_000_000, // 500 KAS
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(500);
    expect(txs[0].receivedCurrency).toBe("KAS");
    expect(txs[0].notes).toBe("Mining reward");
  });

  it("skips unaccepted transactions", async () => {
    const mockTx = makeMockTx({
      transaction_id: "tx-unaccepted-001",
      is_accepted: false,
      outputs: [
        {
          transaction_id: "tx-unaccepted-001",
          index: 0,
          amount: 500_000_000,
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([mockTx]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockTx({
      transaction_id: "tx-later",
      accepting_block_time: 1705402200000, // later
      inputs: [],
      outputs: [
        {
          transaction_id: "tx-later",
          index: 0,
          amount: 100_000_000,
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    const tx2 = makeMockTx({
      transaction_id: "tx-earlier",
      accepting_block_time: 1705315800000, // earlier
      inputs: [],
      outputs: [
        {
          transaction_id: "tx-earlier",
          index: 0,
          amount: 200_000_000,
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([tx1, tx2]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);

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

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("handles pagination correctly", async () => {
    // First page: 500 items (full page triggers next fetch)
    const page1 = Array.from({ length: 500 }, (_, i) =>
      makeMockTx({
        transaction_id: `tx-page1-${i}`,
        accepting_block_time: 1705315800000 + i * 1000,
        inputs: [],
        outputs: [
          {
            transaction_id: `tx-page1-${i}`,
            index: 0,
            amount: 100_000_000,
            script_public_key: "key",
            script_public_key_address: VALID_ADDRESS,
            script_public_key_type: "pubkey",
          },
        ],
      }),
    );

    // Second page: 2 items (less than 500, so pagination stops)
    const page2 = [
      makeMockTx({
        transaction_id: "tx-page2-0",
        accepting_block_time: 1705315800000 + 500000,
        inputs: [],
        outputs: [
          {
            transaction_id: "tx-page2-0",
            index: 0,
            amount: 200_000_000,
            script_public_key: "key",
            script_public_key_address: VALID_ADDRESS,
            script_public_key_type: "pubkey",
          },
        ],
      }),
      makeMockTx({
        transaction_id: "tx-page2-1",
        accepting_block_time: 1705315800000 + 501000,
        inputs: [],
        outputs: [
          {
            transaction_id: "tx-page2-1",
            index: 0,
            amount: 300_000_000,
            script_public_key: "key",
            script_public_key_address: VALID_ADDRESS,
            script_public_key_type: "pubkey",
          },
        ],
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

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);

    expect(fetchCallCount).toBe(2);
    expect(txs).toHaveLength(502);
  });

  it("filters transactions by date range", async () => {
    const tx1 = makeMockTx({
      transaction_id: "tx-old",
      accepting_block_time: new Date("2024-01-01T00:00:00Z").getTime(),
      inputs: [],
      outputs: [
        {
          transaction_id: "tx-old",
          index: 0,
          amount: 100_000_000,
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    const tx2 = makeMockTx({
      transaction_id: "tx-in-range",
      accepting_block_time: new Date("2024-06-15T12:00:00Z").getTime(),
      inputs: [],
      outputs: [
        {
          transaction_id: "tx-in-range",
          index: 0,
          amount: 200_000_000,
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    const tx3 = makeMockTx({
      transaction_id: "tx-too-new",
      accepting_block_time: new Date("2025-01-01T00:00:00Z").getTime(),
      inputs: [],
      outputs: [
        {
          transaction_id: "tx-too-new",
          index: 0,
          amount: 300_000_000,
          script_public_key: "key",
          script_public_key_address: VALID_ADDRESS,
          script_public_key_type: "pubkey",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([tx1, tx2, tx3]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate: new Date("2024-06-01T00:00:00Z"),
      toDate: new Date("2024-12-31T23:59:59Z"),
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe("tx-in-range");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const txs = await kaspaAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("kaspaAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "KAS",
        feeAmount: 0.001,
        feeCurrency: "KAS",
        txHash: "tx-abc-123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "KAS",
        txHash: "tx-def-456",
      },
    ];

    const csv = kaspaAdapter.toAwakenCSV(txs);
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
    expect(lines[1]).toContain("KAS");
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

describe("kaspa adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("kaspa");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("kaspa");
    expect(adapter?.chainName).toBe("Kaspa");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const kaspa = chains.find((c) => c.chainId === "kaspa");
    expect(kaspa).toBeDefined();
    expect(kaspa?.chainName).toBe("Kaspa");
    expect(kaspa?.enabled).toBe(true);
  });
});
