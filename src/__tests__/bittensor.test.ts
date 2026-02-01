/**
 * Tests for the Bittensor (TAO) chain adapter.
 *
 * Covers:
 *   - SS58 address validation
 *   - Explorer URL generation
 *   - RAO → TAO conversion
 *   - Transfer mapping (send/receive)
 *   - Staking extrinsic mapping (stake/unstake)
 *   - Subnet registration mapping
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bittensorAdapter,
  isValidBittensorAddress,
  raoToTao,
} from "@/lib/adapters/bittensor";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidBittensorAddress", () => {
  it("accepts a valid SS58 address (48 chars, starts with 5)", () => {
    // Real Bittensor coldkey-style address
    expect(
      isValidBittensorAddress(
        "5GGe5VYiBBNYL2rHA77wviRkWDCrV2FubZr81QqxA27qn4Ch",
      ),
    ).toBe(true);
  });

  it("accepts a valid 47-character SS58 address", () => {
    expect(
      isValidBittensorAddress(
        "5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSneWj6VLPY",
      ),
    ).toBe(true);
  });

  it("accepts a valid 46-character SS58 address", () => {
    expect(
      isValidBittensorAddress(
        "5DfhGyQdFobKM8NsWvEeAKk5EhQhro3FPDmALVMWpKMh6wH",
      ),
    ).toBe(true);
  });

  it("rejects an address that does not start with 5", () => {
    expect(
      isValidBittensorAddress(
        "1GGe5VYiBBNYL2rHA77wviRkWDCrV2FubZr81QqxA27qn4Ch",
      ),
    ).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidBittensorAddress("")).toBe(false);
  });

  it("rejects too short addresses", () => {
    expect(isValidBittensorAddress("5GGe5VYiBBNYL2rHA77")).toBe(false);
  });

  it("rejects addresses with invalid Base58 characters (0, O, I, l)", () => {
    expect(
      isValidBittensorAddress(
        "5GGe5VYiBBNYL2rHA77wviRkWDCrV2FubZr81QqxA27qn0OI",
      ),
    ).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidBittensorAddress(null as unknown as string)).toBe(false);
    expect(isValidBittensorAddress(undefined as unknown as string)).toBe(false);
    expect(isValidBittensorAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(
      isValidBittensorAddress(
        "  5GGe5VYiBBNYL2rHA77wviRkWDCrV2FubZr81QqxA27qn4Ch  ",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RAO → TAO conversion
// ---------------------------------------------------------------------------

describe("raoToTao", () => {
  it("converts 1 TAO in RAO", () => {
    expect(raoToTao("1000000000")).toBe(1);
  });

  it("converts fractional TAO", () => {
    expect(raoToTao("500000000")).toBe(0.5);
  });

  it("returns 0 for invalid input", () => {
    expect(raoToTao("not-a-number")).toBe(0);
  });

  it("converts small amounts", () => {
    expect(raoToTao("1")).toBe(0.000000001);
  });

  it("converts large amounts", () => {
    expect(raoToTao("100000000000")).toBe(100);
  });

  it("converts zero", () => {
    expect(raoToTao("0")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("bittensorAdapter.getExplorerUrl", () => {
  it("returns the correct Taostats explorer URL", () => {
    const hash = "0xabc123def456";
    expect(bittensorAdapter.getExplorerUrl(hash)).toBe(
      "https://taostats.io/extrinsic/0xabc123def456",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("bittensorAdapter.validateAddress", () => {
  it("delegates to isValidBittensorAddress", () => {
    expect(
      bittensorAdapter.validateAddress(
        "5GGe5VYiBBNYL2rHA77wviRkWDCrV2FubZr81QqxA27qn4Ch",
      ),
    ).toBe(true);
    expect(bittensorAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("bittensorAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(bittensorAdapter.chainId).toBe("bittensor");
  });

  it("has correct chainName", () => {
    expect(bittensorAdapter.chainName).toBe("Bittensor");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

describe("bittensorAdapter.fetchTransactions", () => {
  const VALID_ADDRESS = "5GGe5VYiBBNYL2rHA77wviRkWDCrV2FubZr81QqxA27qn4Ch";

  beforeEach(() => {
    vi.stubEnv("TAOSTATS_API_KEY", "test-api-key-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws for invalid address", async () => {
    await expect(
      bittensorAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Bittensor address");
  });

  it("throws when TAOSTATS_API_KEY is not set", async () => {
    vi.stubEnv("TAOSTATS_API_KEY", "");
    await expect(
      bittensorAdapter.fetchTransactions(VALID_ADDRESS),
    ).rejects.toThrow("TAOSTATS_API_KEY");
  });

  it("fetches and maps transfers correctly", async () => {
    const mockTransferResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          id: "finney-1000-0001",
          to: {
            ss58: "5HPBCFfLr9MLg7YxRdq7hZgzVuyDHAPLeGDHUwHyhiqptjtS",
            hex: "0xeb439c80",
          },
          from: {
            ss58: VALID_ADDRESS,
            hex: "0xba0b2864",
          },
          network: "finney",
          block_number: 1000,
          timestamp: "2025-01-15T14:30:00Z",
          amount: "10000000000",
          fee: "135263",
          transaction_hash: "0xabc123",
          extrinsic_id: "1000-0001",
        },
      ],
    };

    const emptyExtrinsicResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/transfer/")) {
          return new Response(JSON.stringify(mockTransferResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(emptyExtrinsicResponse), {
          status: 200,
        });
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(10);
    expect(txs[0].sentCurrency).toBe("TAO");
    expect(txs[0].feeAmount).toBeCloseTo(0.000135263, 8);
    expect(txs[0].feeCurrency).toBe("TAO");
    expect(txs[0].txHash).toBe("0xabc123");

    fetchSpy.mockRestore();
  });

  it("maps receive transfers correctly", async () => {
    const mockTransferResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          id: "finney-2000-0001",
          to: {
            ss58: VALID_ADDRESS,
            hex: "0xba0b2864",
          },
          from: {
            ss58: "5HPBCFfLr9MLg7YxRdq7hZgzVuyDHAPLeGDHUwHyhiqptjtS",
            hex: "0xeb439c80",
          },
          network: "finney",
          block_number: 2000,
          timestamp: "2025-02-01T10:00:00Z",
          amount: "5000000000",
          fee: "0",
          transaction_hash: "0xdef456",
          extrinsic_id: "2000-0001",
        },
      ],
    };

    const emptyExtrinsicResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/transfer/")) {
          return new Response(JSON.stringify(mockTransferResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(emptyExtrinsicResponse), {
          status: 200,
        });
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(5);
    expect(txs[0].receivedCurrency).toBe("TAO");
    expect(txs[0].sentQuantity).toBeUndefined();
    expect(txs[0].txHash).toBe("0xdef456");

    fetchSpy.mockRestore();
  });

  it("maps staking extrinsics correctly", async () => {
    const emptyTransferResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const mockExtrinsicResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          timestamp: "2025-03-01T12:00:00Z",
          block_number: 3000,
          hash: "0xstake123",
          id: "3000-0005",
          index: 5,
          signer_address: VALID_ADDRESS,
          tip: "0",
          fee: "0",
          success: true,
          error: null,
          call_id: "3000-0005",
          full_name: "SubtensorModule.add_stake",
          call_args: {
            amountStaked: "2000000000",
            hotkey: "5SomeHotkey",
            netuid: 18,
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/transfer/")) {
          return new Response(JSON.stringify(emptyTransferResponse), {
            status: 200,
          });
        }
        if (url.includes("add_stake") && !url.includes("add_stake_limit")) {
          return new Response(JSON.stringify(mockExtrinsicResponse), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            ...emptyTransferResponse,
          }),
          { status: 200 },
        );
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("stake");
    expect(txs[0].sentQuantity).toBe(2);
    expect(txs[0].sentCurrency).toBe("TAO");
    expect(txs[0].notes).toContain("subnet 18");
    expect(txs[0].tag).toBe("staked");

    fetchSpy.mockRestore();
  });

  it("maps unstaking extrinsics correctly", async () => {
    const emptyResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const mockUnstakeResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          timestamp: "2025-04-01T08:00:00Z",
          block_number: 4000,
          hash: "0xunstake456",
          id: "4000-0010",
          index: 10,
          signer_address: VALID_ADDRESS,
          tip: "0",
          fee: "135000",
          success: true,
          error: null,
          call_id: "4000-0010",
          full_name: "SubtensorModule.remove_stake",
          call_args: {
            amountUnstaked: "3000000000",
            hotkey: "5SomeHotkey",
            netuid: 7,
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("remove_stake") && !url.includes("remove_stake_limit")) {
          return new Response(JSON.stringify(mockUnstakeResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(emptyResponse), { status: 200 });
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("unstake");
    expect(txs[0].receivedQuantity).toBe(3);
    expect(txs[0].receivedCurrency).toBe("TAO");
    expect(txs[0].feeAmount).toBeCloseTo(0.000135, 6);
    expect(txs[0].notes).toContain("subnet 7");
    expect(txs[0].tag).toBe("unstaked");

    fetchSpy.mockRestore();
  });

  it("maps subnet registration extrinsics correctly", async () => {
    const emptyResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const mockRegisterResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          timestamp: "2025-05-01T16:00:00Z",
          block_number: 5000,
          hash: "0xreg789",
          id: "5000-0003",
          index: 3,
          signer_address: VALID_ADDRESS,
          tip: "0",
          fee: "1157890",
          success: true,
          error: null,
          call_id: "5000-0003",
          full_name: "SubtensorModule.burned_register",
          call_args: {
            hotkey: "5SomeHotkey",
            netuid: 5,
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("burned_register")) {
          return new Response(JSON.stringify(mockRegisterResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(emptyResponse), { status: 200 });
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
    expect(txs[0].notes).toContain("Subnet registration");
    expect(txs[0].notes).toContain("netuid 5");
    expect(txs[0].feeAmount).toBeCloseTo(0.00115789, 6);
    expect(txs[0].txHash).toBe("0xreg789");

    fetchSpy.mockRestore();
  });

  it("skips failed extrinsics", async () => {
    const emptyResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const mockExtrinsicResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          timestamp: "2025-03-01T12:00:00Z",
          block_number: 3000,
          hash: "0xfailed",
          id: "3000-0005",
          index: 5,
          signer_address: VALID_ADDRESS,
          tip: "0",
          fee: "0",
          success: false,
          error: {
            name: "NotEnoughBalanceToStake",
            pallet: "subtensorModule",
            extra_info: "Not enough balance",
          },
          call_id: "3000-0005",
          full_name: "SubtensorModule.burned_register",
          call_args: { hotkey: "5SomeHotkey", netuid: 5 },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("burned_register")) {
          return new Response(JSON.stringify(mockExtrinsicResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(emptyResponse), { status: 200 });
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it("sorts all transactions by date ascending", async () => {
    const transferResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          id: "finney-2000-0001",
          to: {
            ss58: "5HPBCFfLr9MLg7YxRdq7hZgzVuyDHAPLeGDHUwHyhiqptjtS",
            hex: "0xeb439c80",
          },
          from: { ss58: VALID_ADDRESS, hex: "0xba0b2864" },
          network: "finney",
          block_number: 2000,
          timestamp: "2025-06-01T12:00:00Z",
          amount: "1000000000",
          fee: "0",
          transaction_hash: "0xtransfer_later",
          extrinsic_id: "2000-0001",
        },
      ],
    };

    const stakeResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 1,
        total_pages: 1,
        next_page: null,
        prev_page: null,
      },
      data: [
        {
          timestamp: "2025-01-01T06:00:00Z",
          block_number: 1000,
          hash: "0xstake_earlier",
          id: "1000-0003",
          index: 3,
          signer_address: VALID_ADDRESS,
          tip: "0",
          fee: "0",
          success: true,
          error: null,
          call_id: "1000-0003",
          full_name: "SubtensorModule.add_stake",
          call_args: { amountStaked: "500000000", hotkey: "5Hotkey", netuid: 1 },
        },
      ],
    };

    const emptyResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/transfer/")) {
          return new Response(JSON.stringify(transferResponse), { status: 200 });
        }
        if (url.includes("add_stake") && !url.includes("add_stake_limit")) {
          return new Response(JSON.stringify(stakeResponse), { status: 200 });
        }
        return new Response(JSON.stringify(emptyResponse), { status: 200 });
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(2);
    // Stake (Jan) should come before transfer (Jun)
    expect(txs[0].type).toBe("stake");
    expect(txs[1].type).toBe("send");
    expect(txs[0].date.getTime()).toBeLessThan(txs[1].date.getTime());

    fetchSpy.mockRestore();
  });

  it("handles API error with retry", { timeout: 30000 }, async () => {
    let callCount = 0;
    const emptyResponse = {
      pagination: {
        current_page: 1,
        per_page: 200,
        total_items: 0,
        total_pages: 0,
        next_page: null,
        prev_page: null,
      },
      data: [],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        callCount++;
        if (callCount <= 2) {
          return new Response("Too Many Requests", { status: 429 });
        }
        return new Response(JSON.stringify(emptyResponse), { status: 200 });
      },
    );

    const txs = await bittensorAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    // Should have retried after 429 responses
    expect(callCount).toBeGreaterThan(2);

    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("bittensorAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "TAO",
        feeAmount: 0.000135263,
        feeCurrency: "TAO",
        txHash: "0xabc123",
        notes: "Transfer to 5HPBCFfL…",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "TAO",
        txHash: "0xdef456",
        notes: "Transfer from 5HPBCFfL…",
      },
    ];

    const csv = bittensorAdapter.toAwakenCSV(txs);
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
    expect(lines[1]).toContain("TAO");
    expect(lines[1]).toContain("0xabc123");

    // Receive row
    expect(lines[2]).toContain("02/01/2025 10:00:00");
    expect(lines[2]).toContain("5");
    expect(lines[2]).toContain("0xdef456");
  });

  it("produces valid CSV for staking transaction", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-03-01T12:00:00Z"),
        type: "stake",
        sentQuantity: 2,
        sentCurrency: "TAO",
        txHash: "0xstake123",
        notes: "Stake on subnet 18",
        tag: "staked",
      },
    ];

    const csv = bittensorAdapter.toAwakenCSV(txs);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toContain("03/01/2025 12:00:00");
    expect(lines[1]).toContain("2");
    expect(lines[1]).toContain("TAO");
    expect(lines[1]).toContain("staked");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("bittensor adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("bittensor");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("bittensor");
    expect(adapter?.chainName).toBe("Bittensor");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const bittensor = chains.find((c) => c.chainId === "bittensor");
    expect(bittensor).toBeDefined();
    expect(bittensor?.chainName).toBe("Bittensor");
    expect(bittensor?.enabled).toBe(true);
  });
});
