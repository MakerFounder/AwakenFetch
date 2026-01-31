/**
 * Tests for the Radix (XRD) chain adapter.
 *
 * Covers:
 *   - Radix address validation
 *   - Explorer URL generation
 *   - Transaction mapping (send/receive/trade/stake/unstake/fee-only)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  radixAdapter,
  isValidRadixAddress,
} from "@/lib/adapters/radix";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidRadixAddress", () => {
  it("accepts a valid Radix mainnet account address", () => {
    expect(
      isValidRadixAddress(
        "account_rdx16y76fepuvxqpv6gp6qswqymwhj5ng6sduugj4z6yysccvdg95g0dtr",
      ),
    ).toBe(true);
  });

  it("accepts another valid Radix mainnet address", () => {
    expect(
      isValidRadixAddress(
        "account_rdx12x5vk07qcez6xj0zt8ve0x2g20mrssk0vrest3vf0qljd76r6zfvsx",
      ),
    ).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidRadixAddress("")).toBe(false);
  });

  it("rejects a random string", () => {
    expect(isValidRadixAddress("random-string-123")).toBe(false);
  });

  it("rejects a Hedera address", () => {
    expect(isValidRadixAddress("0.0.12345")).toBe(false);
  });

  it("rejects a Radix resource address", () => {
    expect(
      isValidRadixAddress(
        "resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd",
      ),
    ).toBe(false);
  });

  it("rejects a Radix component address", () => {
    expect(
      isValidRadixAddress(
        "component_rdx1cq4ugccz6pg89w83ujanqlycw566kd9c9vxxuc9r45p7vues2649t4",
      ),
    ).toBe(false);
  });

  it("rejects address with uppercase characters", () => {
    expect(
      isValidRadixAddress(
        "account_rdx16Y76FEPUVXQPV6GP6QSWQYMWHJ5NG6SDUUGJ4Z6YYSCCVDG95G0DTR",
      ),
    ).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidRadixAddress(null as unknown as string)).toBe(false);
    expect(isValidRadixAddress(undefined as unknown as string)).toBe(false);
    expect(isValidRadixAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(
      isValidRadixAddress(
        "  account_rdx16y76fepuvxqpv6gp6qswqymwhj5ng6sduugj4z6yysccvdg95g0dtr  ",
      ),
    ).toBe(true);
  });

  it("rejects address that is too short", () => {
    expect(isValidRadixAddress("account_rdx1abc")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("radixAdapter.getExplorerUrl", () => {
  it("returns the correct Radix Dashboard explorer URL", () => {
    const hash = "txid_rdx1abc123def456";
    expect(radixAdapter.getExplorerUrl(hash)).toBe(
      "https://dashboard.radixdlt.com/transaction/txid_rdx1abc123def456",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("radixAdapter.validateAddress", () => {
  it("delegates to isValidRadixAddress", () => {
    expect(
      radixAdapter.validateAddress(
        "account_rdx16y76fepuvxqpv6gp6qswqymwhj5ng6sduugj4z6yysccvdg95g0dtr",
      ),
    ).toBe(true);
    expect(radixAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("radixAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(radixAdapter.chainId).toBe("radix");
  });

  it("has correct chainName", () => {
    expect(radixAdapter.chainName).toBe("Radix");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS =
  "account_rdx16y76fepuvxqpv6gp6qswqymwhj5ng6sduugj4z6yysccvdg95g0dtr";
const OTHER_ADDRESS =
  "account_rdx12x5vk07qcez6xj0zt8ve0x2g20mrssk0vrest3vf0qljd76r6zfvsx";

const XRD_RESOURCE =
  "resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd";

const LSU_RESOURCE =
  "resource_rdx1thfv4fmgcjm6uzelgku7crpevqtl3tu9a73er5a80ycl6h77fry58k";

function makeMockTx(
  overrides: Partial<{
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
    error_message: string;
    receipt: { status: string; error_message?: string };
    manifest_classes: string[];
    balance_changes: {
      fungible_fee_balance_changes: Array<{
        type: string;
        entity_address: string;
        resource_address: string;
        balance_change: string;
      }>;
      fungible_balance_changes: Array<{
        entity_address: string;
        resource_address: string;
        balance_change: string;
      }>;
      non_fungible_balance_changes: unknown[];
    };
  }> = {},
): Record<string, unknown> {
  return {
    state_version: overrides.state_version ?? 5150877,
    epoch: overrides.epoch ?? 36452,
    round: overrides.round ?? 362,
    round_timestamp: overrides.round_timestamp ?? "2025-01-15T14:30:00.417Z",
    transaction_status: overrides.transaction_status ?? "CommittedSuccess",
    payload_hash:
      overrides.payload_hash ??
      "notarizedtransaction_rdx1abc123",
    intent_hash: overrides.intent_hash ?? "txid_rdx1abc123",
    fee_paid: overrides.fee_paid ?? "0.25417642453",
    affected_global_entities: overrides.affected_global_entities ?? [
      VALID_ADDRESS,
      OTHER_ADDRESS,
    ],
    confirmed_at: overrides.confirmed_at ?? "2025-01-15T14:30:00.417Z",
    error_message: overrides.error_message,
    receipt: overrides.receipt ?? { status: "CommittedSuccess" },
    manifest_classes: overrides.manifest_classes ?? ["General"],
    balance_changes: overrides.balance_changes ?? {
      fungible_fee_balance_changes: [
        {
          type: "FeePayment",
          entity_address: VALID_ADDRESS,
          resource_address: XRD_RESOURCE,
          balance_change: "-0.25417642453",
        },
      ],
      fungible_balance_changes: [
        {
          entity_address: VALID_ADDRESS,
          resource_address: XRD_RESOURCE,
          balance_change: "-100",
        },
        {
          entity_address: OTHER_ADDRESS,
          resource_address: XRD_RESOURCE,
          balance_change: "100",
        },
      ],
      non_fungible_balance_changes: [],
    },
  };
}

function wrapResponse(
  txs: Record<string, unknown>[],
  nextCursor?: string,
) {
  return {
    ledger_state: {
      network: "mainnet",
      state_version: 50576725,
      proposer_round_timestamp: "2025-01-15T14:30:00.417Z",
      epoch: 36452,
      round: 362,
    },
    next_cursor: nextCursor,
    items: txs,
  };
}

describe("radixAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      radixAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Radix address");
  });

  it("fetches and maps a send transaction correctly", async () => {
    const mockTx = makeMockTx({
      intent_hash: "txid_rdx1send001",
      balance_changes: {
        fungible_fee_balance_changes: [
          {
            type: "FeePayment",
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-0.5",
          },
        ],
        fungible_balance_changes: [
          {
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-100",
          },
          {
            entity_address: OTHER_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "100",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(100);
    expect(txs[0].sentCurrency).toBe("XRD");
    expect(txs[0].feeAmount).toBeCloseTo(0.5, 8);
    expect(txs[0].feeCurrency).toBe("XRD");
    expect(txs[0].txHash).toBe("txid_rdx1send001");
  });

  it("fetches and maps a receive transaction correctly", async () => {
    const mockTx = makeMockTx({
      intent_hash: "txid_rdx1receive001",
      balance_changes: {
        fungible_fee_balance_changes: [
          {
            type: "FeePayment",
            entity_address: OTHER_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-0.5",
          },
        ],
        fungible_balance_changes: [
          {
            entity_address: OTHER_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-500",
          },
          {
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "500",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(500);
    expect(txs[0].receivedCurrency).toBe("XRD");
    // Fee was paid by other address, not ours
    expect(txs[0].feeAmount).toBeUndefined();
    expect(txs[0].txHash).toBe("txid_rdx1receive001");
  });

  it("fetches and maps a trade (swap) transaction correctly", async () => {
    const tokenResource =
      "resource_rdx1t5l4s99hpc6vvskktu2uy9egk86tszjnnez62zfu9t7z7tsqqtvpvp";

    const mockTx = makeMockTx({
      intent_hash: "txid_rdx1trade001",
      balance_changes: {
        fungible_fee_balance_changes: [
          {
            type: "FeePayment",
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-0.3",
          },
        ],
        fungible_balance_changes: [
          {
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-50",
          },
          {
            entity_address: VALID_ADDRESS,
            resource_address: tokenResource,
            balance_change: "1000",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].sentQuantity).toBe(50);
    expect(txs[0].sentCurrency).toBe("XRD");
    expect(txs[0].receivedQuantity).toBe(1000);
    // Non-XRD token uses shortened address form
    expect(txs[0].receivedCurrency).toBeDefined();
    expect(txs[0].feeAmount).toBeCloseTo(0.3, 8);
    expect(txs[0].txHash).toBe("txid_rdx1trade001");
  });

  it("fetches and maps a validator stake transaction", async () => {
    const mockTx = makeMockTx({
      intent_hash: "txid_rdx1stake001",
      manifest_classes: ["ValidatorStake"],
      balance_changes: {
        fungible_fee_balance_changes: [
          {
            type: "FeePayment",
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-0.2",
          },
        ],
        fungible_balance_changes: [
          {
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-1000",
          },
          {
            entity_address: VALID_ADDRESS,
            resource_address: LSU_RESOURCE,
            balance_change: "950",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("stake");
    expect(txs[0].sentQuantity).toBe(1000);
    expect(txs[0].sentCurrency).toBe("XRD");
    expect(txs[0].receivedQuantity).toBe(950);
    expect(txs[0].notes).toBe("Validator stake");
    expect(txs[0].feeAmount).toBeCloseTo(0.2, 8);
  });

  it("fetches and maps a validator unstake transaction", async () => {
    const mockTx = makeMockTx({
      intent_hash: "txid_rdx1unstake001",
      manifest_classes: ["ValidatorUnstake"],
      balance_changes: {
        fungible_fee_balance_changes: [
          {
            type: "FeePayment",
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-0.2",
          },
        ],
        fungible_balance_changes: [
          {
            entity_address: VALID_ADDRESS,
            resource_address: LSU_RESOURCE,
            balance_change: "-950",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("unstake");
    expect(txs[0].sentQuantity).toBe(950);
    expect(txs[0].notes).toBe("Validator unstake");
  });

  it("fetches and maps a validator claim transaction", async () => {
    const mockTx = makeMockTx({
      intent_hash: "txid_rdx1claim001",
      manifest_classes: ["ValidatorClaim"],
      balance_changes: {
        fungible_fee_balance_changes: [
          {
            type: "FeePayment",
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-0.15",
          },
        ],
        fungible_balance_changes: [
          {
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "1000",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("unstake");
    expect(txs[0].receivedQuantity).toBe(1000);
    expect(txs[0].receivedCurrency).toBe("XRD");
    expect(txs[0].notes).toBe("Validator claim");
  });

  it("skips failed transactions", async () => {
    const mockTx = makeMockTx({
      transaction_status: "CommittedFailure",
      receipt: { status: "CommittedFailure" },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockTx({
      intent_hash: "txid_rdx1later",
      confirmed_at: "2025-02-01T10:00:00.000Z",
      balance_changes: {
        fungible_fee_balance_changes: [],
        fungible_balance_changes: [
          {
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "200",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    const tx2 = makeMockTx({
      intent_hash: "txid_rdx1earlier",
      confirmed_at: "2025-01-15T14:30:00.000Z",
      balance_changes: {
        fungible_fee_balance_changes: [],
        fungible_balance_changes: [
          {
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "300",
          },
        ],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([tx1, tx2])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(2);
    expect(txs[0].txHash).toBe("txid_rdx1earlier");
    expect(txs[1].txHash).toBe("txid_rdx1later");
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

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("handles pagination correctly", async () => {
    // First page
    const page1 = Array.from({ length: 3 }, (_, i) =>
      makeMockTx({
        intent_hash: `txid_rdx1page1_${i}`,
        confirmed_at: `2025-01-${String(15 + i).padStart(2, "0")}T14:30:00.000Z`,
        balance_changes: {
          fungible_fee_balance_changes: [],
          fungible_balance_changes: [
            {
              entity_address: VALID_ADDRESS,
              resource_address: XRD_RESOURCE,
              balance_change: "100",
            },
          ],
          non_fungible_balance_changes: [],
        },
      }),
    );

    // Second page
    const page2 = [
      makeMockTx({
        intent_hash: "txid_rdx1page2_0",
        confirmed_at: "2025-01-20T14:30:00.000Z",
        balance_changes: {
          fungible_fee_balance_changes: [],
          fungible_balance_changes: [
            {
              entity_address: VALID_ADDRESS,
              resource_address: XRD_RESOURCE,
              balance_change: "200",
            },
          ],
          non_fungible_balance_changes: [],
        },
      }),
    ];

    let fetchCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return new Response(
          JSON.stringify(wrapResponse(page1, "eyJ2IjoxMDB9")),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(wrapResponse(page2)), {
        status: 200,
      });
    });

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(fetchCallCount).toBe(2);
    expect(txs).toHaveLength(4);
  });

  it("passes date filters in request body", async () => {
    let capturedBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.body) {
        capturedBody = init.body as string;
      }
      return new Response(JSON.stringify(wrapResponse([])), { status: 200 });
    });

    const fromDate = new Date("2024-06-01T00:00:00Z");
    const toDate = new Date("2024-12-31T23:59:59Z");

    await radixAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate,
      toDate,
    });

    const parsed = JSON.parse(capturedBody);
    expect(parsed.from_ledger_state).toBeDefined();
    expect(parsed.from_ledger_state.timestamp).toContain("2024-06-01");
    expect(parsed.at_ledger_state).toBeDefined();
    expect(parsed.at_ledger_state.timestamp).toContain("2024-12-31");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles fee-only transactions", async () => {
    const mockTx = makeMockTx({
      intent_hash: "txid_rdx1feeonly001",
      manifest_classes: ["General"],
      balance_changes: {
        fungible_fee_balance_changes: [
          {
            type: "FeePayment",
            entity_address: VALID_ADDRESS,
            resource_address: XRD_RESOURCE,
            balance_change: "-0.5",
          },
        ],
        fungible_balance_changes: [],
        non_fungible_balance_changes: [],
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(wrapResponse([mockTx])), { status: 200 }),
    );

    const txs = await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
    expect(txs[0].feeAmount).toBeCloseTo(0.5, 8);
    expect(txs[0].feeCurrency).toBe("XRD");
  });

  it("sends POST request to correct endpoint", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = url as string;
      capturedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify(wrapResponse([])), { status: 200 });
    });

    await radixAdapter.fetchTransactions(VALID_ADDRESS);

    expect(capturedUrl).toContain("/stream/transactions");
    expect(capturedMethod).toBe("POST");
  });

  it("includes balance_changes and manifest_classes opt-ins", async () => {
    let capturedBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.body) {
        capturedBody = init.body as string;
      }
      return new Response(JSON.stringify(wrapResponse([])), { status: 200 });
    });

    await radixAdapter.fetchTransactions(VALID_ADDRESS);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.opt_ins).toBeDefined();
    expect(parsed.opt_ins.balance_changes).toBe(true);
    expect(parsed.opt_ins.manifest_classes).toBe(true);
  });

  it("filters by affected_global_entities_filter", async () => {
    let capturedBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.body) {
        capturedBody = init.body as string;
      }
      return new Response(JSON.stringify(wrapResponse([])), { status: 200 });
    });

    await radixAdapter.fetchTransactions(VALID_ADDRESS);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.affected_global_entities_filter).toEqual([VALID_ADDRESS]);
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("radixAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 100,
        sentCurrency: "XRD",
        feeAmount: 0.5,
        feeCurrency: "XRD",
        txHash: "txid_rdx1abc123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "receive",
        receivedQuantity: 500,
        receivedCurrency: "XRD",
        txHash: "txid_rdx1def456",
      },
    ];

    const csv = radixAdapter.toAwakenCSV(txs);
    const lines = csv.split("\n");

    // Header
    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Received Quantity");
    expect(lines[0]).toContain("Sent Quantity");
    expect(lines[0]).toContain("Fee Amount");
    expect(lines[0]).toContain("Transaction Hash");

    // Send row
    expect(lines[1]).toContain("01/15/2025 14:30:00");
    expect(lines[1]).toContain("100");
    expect(lines[1]).toContain("XRD");
    expect(lines[1]).toContain("txid_rdx1abc123");

    // Receive row
    expect(lines[2]).toContain("02/01/2025 10:00:00");
    expect(lines[2]).toContain("500");
    expect(lines[2]).toContain("txid_rdx1def456");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("radix adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("radix");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("radix");
    expect(adapter?.chainName).toBe("Radix");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const radix = chains.find((c) => c.chainId === "radix");
    expect(radix).toBeDefined();
    expect(radix?.chainName).toBe("Radix");
    expect(radix?.enabled).toBe(true);
  });
});
