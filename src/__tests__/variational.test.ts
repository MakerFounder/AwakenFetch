/**
 * Tests for the Variational perpetuals adapter (Arbitrum).
 *
 * Covers:
 *   - Address validation (0x Ethereum/Arbitrum addresses)
 *   - Instrument name → asset extraction
 *   - Explorer URL generation
 *   - Trade → PerpTransaction mapping (open, close, funding)
 *   - Funding payment mapping
 *   - fetchPerpTransactions integration (mocked API)
 *   - fetchTransactions integration (standard Transaction mapping)
 *   - CSV generation (perps format)
 *   - Date filtering and sorting
 *   - Error handling (invalid address, missing API keys)
 *   - Adapter registration
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  variationalAdapter,
  isValidVariationalAddress,
  extractAssetFromInstrument,
  fetchPerpTransactions,
  toAwakenPerpCSV,
} from "@/lib/adapters/variational";
import type { PerpTransaction } from "@/types";
import { PERP_CSV_HEADER } from "@/lib/csv/constants";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidVariationalAddress", () => {
  it("accepts a valid 0x-prefixed Arbitrum address", () => {
    expect(
      isValidVariationalAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).toBe(true);
  });

  it("accepts all-lowercase hex", () => {
    expect(
      isValidVariationalAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045"),
    ).toBe(true);
  });

  it("accepts all-uppercase hex", () => {
    expect(
      isValidVariationalAddress("0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045"),
    ).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidVariationalAddress("")).toBe(false);
  });

  it("rejects address without 0x prefix", () => {
    expect(
      isValidVariationalAddress("d8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).toBe(false);
  });

  it("rejects address that is too short", () => {
    expect(isValidVariationalAddress("0xd8dA6BF26964aF9D")).toBe(false);
  });

  it("rejects address that is too long", () => {
    expect(
      isValidVariationalAddress(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045ff",
      ),
    ).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidVariationalAddress(null as unknown as string)).toBe(false);
    expect(isValidVariationalAddress(undefined as unknown as string)).toBe(
      false,
    );
    expect(isValidVariationalAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(
      isValidVariationalAddress(
        "  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045  ",
      ),
    ).toBe(true);
  });

  it("rejects non-hex characters", () => {
    expect(
      isValidVariationalAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG"),
    ).toBe(false);
  });

  it("rejects Kaspa-style addresses", () => {
    expect(
      isValidVariationalAddress(
        "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractAssetFromInstrument
// ---------------------------------------------------------------------------

describe("extractAssetFromInstrument", () => {
  it("extracts BTC from BTC-PERP", () => {
    expect(extractAssetFromInstrument("BTC-PERP")).toBe("BTC");
  });

  it("extracts ETH from ETH-PERP", () => {
    expect(extractAssetFromInstrument("ETH-PERP")).toBe("ETH");
  });

  it("extracts FARTCOIN from FARTCOIN-PERP", () => {
    expect(extractAssetFromInstrument("FARTCOIN-PERP")).toBe("FARTCOIN");
  });

  it("handles BTC-USD suffix", () => {
    expect(extractAssetFromInstrument("BTC-USD")).toBe("BTC");
  });

  it("handles BTC-USDC suffix", () => {
    expect(extractAssetFromInstrument("BTC-USDC")).toBe("BTC");
  });

  it("handles underscore separator (BTC_PERP)", () => {
    expect(extractAssetFromInstrument("BTC_PERP")).toBe("BTC");
  });

  it("handles plain asset name", () => {
    expect(extractAssetFromInstrument("SOL")).toBe("SOL");
  });

  it("returns UNKNOWN for empty string", () => {
    expect(extractAssetFromInstrument("")).toBe("UNKNOWN");
  });

  it("uppercases the result", () => {
    expect(extractAssetFromInstrument("btc-perp")).toBe("BTC");
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("variationalAdapter.getExplorerUrl", () => {
  it("returns the correct Arbiscan URL", () => {
    const hash = "0xabcdef1234567890";
    expect(variationalAdapter.getExplorerUrl(hash)).toBe(
      "https://arbiscan.io/tx/0xabcdef1234567890",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("variationalAdapter.validateAddress", () => {
  it("delegates to isValidVariationalAddress", () => {
    expect(
      variationalAdapter.validateAddress(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      ),
    ).toBe(true);
    expect(variationalAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("variationalAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(variationalAdapter.chainId).toBe("variational");
  });

  it("has correct chainName", () => {
    expect(variationalAdapter.chainName).toBe("Variational");
  });

  it("is perps-capable", () => {
    expect(variationalAdapter.perpsCapable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

function makeMockTrade(
  overrides: Partial<{
    id: string;
    created_at: string;
    instrument_name: string;
    quantity: number;
    price: number;
    trade_type: string;
    status: string;
    fee: number;
    realized_pnl: number;
    settlement_currency: string;
    transaction_hash: string;
    side: string;
    wallet_address: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "trade-001",
    created_at: overrides.created_at ?? "2024-04-01T00:00:00Z",
    updated_at: overrides.created_at ?? "2024-04-01T00:00:00Z",
    instrument_name: overrides.instrument_name ?? "BTC-PERP",
    instrument_type: "perpetual_future",
    quantity: overrides.quantity ?? 2,
    price: overrides.price ?? 65000,
    trade_type: overrides.trade_type ?? "trade",
    status: overrides.status ?? "open",
    fee: overrides.fee ?? 0,
    realized_pnl: overrides.realized_pnl ?? 0,
    settlement_currency: overrides.settlement_currency ?? "USDC",
    transaction_hash: overrides.transaction_hash ?? "0xtxhash001",
    side: overrides.side ?? "buy",
    wallet_address: overrides.wallet_address ?? VALID_ADDRESS,
    settlement_pool_id: "pool-001",
  };
}

function makeMockFunding(
  overrides: Partial<{
    id: string;
    created_at: string;
    instrument_name: string;
    position_size: number;
    funding_rate: number;
    payment_amount: number;
    settlement_currency: string;
    transaction_hash: string;
    wallet_address: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "funding-001",
    created_at: overrides.created_at ?? "2024-04-02T00:00:00Z",
    instrument_name: overrides.instrument_name ?? "BTC-PERP",
    position_size: overrides.position_size ?? 2,
    funding_rate: overrides.funding_rate ?? 0.0001,
    payment_amount: overrides.payment_amount ?? 5.25,
    settlement_currency: overrides.settlement_currency ?? "USDC",
    transaction_hash: overrides.transaction_hash ?? "0xfundinghash001",
    wallet_address: overrides.wallet_address ?? VALID_ADDRESS,
  };
}

function makeTradeResponse(
  items: ReturnType<typeof makeMockTrade>[],
  hasNextPage = false,
) {
  return {
    data: items,
    pagination: {
      total: items.length,
      limit: 100,
      offset: 0,
      next_page: hasNextPage ? { limit: 100, offset: items.length } : undefined,
    },
  };
}

function makeFundingResponse(
  items: ReturnType<typeof makeMockFunding>[],
  hasNextPage = false,
) {
  return {
    data: items,
    pagination: {
      total: items.length,
      limit: 100,
      offset: 0,
      next_page: hasNextPage ? { limit: 100, offset: items.length } : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// fetchPerpTransactions — mocked API calls
// ---------------------------------------------------------------------------

describe("fetchPerpTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws for invalid address", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    await expect(fetchPerpTransactions("invalid-address")).rejects.toThrow(
      "Invalid Variational address",
    );
  });

  it("throws when API credentials are missing", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "");
    vi.stubEnv("VARIATIONAL_API_SECRET", "");
    delete process.env.VARIATIONAL_API_KEY;
    delete process.env.VARIATIONAL_API_SECRET;

    await expect(fetchPerpTransactions(VALID_ADDRESS)).rejects.toThrow(
      "VARIATIONAL_API_KEY",
    );
  });

  it("fetches and maps an open position trade", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const openTrade = makeMockTrade({
      id: "trade-open-001",
      created_at: "2024-04-01T00:00:00Z",
      instrument_name: "BTC-PERP",
      quantity: 2,
      side: "buy",
      fee: 1.5,
      realized_pnl: 0,
      transaction_hash: "0xopen1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([openTrade])), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].tag).toBe("open_position");
    expect(txs[0].asset).toBe("BTC");
    expect(txs[0].amount).toBe(2);
    expect(txs[0].fee).toBe(1.5);
    expect(txs[0].pnl).toBe(0);
    expect(txs[0].paymentToken).toBe("");
    expect(txs[0].txHash).toBe("0xopen1");
  });

  it("fetches and maps a close position trade", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const closeTrade = makeMockTrade({
      id: "trade-close-001",
      created_at: "2024-04-02T00:00:00Z",
      instrument_name: "BTC-PERP",
      quantity: 1,
      side: "sell",
      fee: 1.5,
      realized_pnl: 150.75,
      status: "closed",
      transaction_hash: "0xclose1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([closeTrade])), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].tag).toBe("close_position");
    expect(txs[0].asset).toBe("BTC");
    expect(txs[0].amount).toBe(1);
    expect(txs[0].pnl).toBe(150.75);
    expect(txs[0].paymentToken).toBe("USDC");
    expect(txs[0].txHash).toBe("0xclose1");
  });

  it("fetches and maps a settlement trade as funding payment", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const settlementTrade = makeMockTrade({
      id: "trade-settle-001",
      created_at: "2024-04-03T00:00:00Z",
      instrument_name: "BTC-PERP",
      quantity: 2,
      trade_type: "settlement",
      realized_pnl: 5.25,
      transaction_hash: "0xsettle1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(
          JSON.stringify(makeTradeResponse([settlementTrade])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].tag).toBe("funding_payment");
  });

  it("fetches and maps funding payments", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const funding = makeMockFunding({
      id: "funding-001",
      created_at: "2024-04-02T00:00:00Z",
      instrument_name: "BTC-PERP",
      position_size: 2,
      funding_rate: 0.0001,
      payment_amount: 5.25,
      transaction_hash: "0xfund1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([])), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(makeFundingResponse([funding])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].tag).toBe("funding_payment");
    expect(txs[0].asset).toBe("BTC");
    expect(txs[0].amount).toBe(2);
    expect(txs[0].pnl).toBe(5.25);
    expect(txs[0].paymentToken).toBe("USDC");
    expect(txs[0].txHash).toBe("0xfund1");
    expect(txs[0].notes).toContain("Funding payment");
  });

  it("combines trades and funding, sorted by date", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const openTrade = makeMockTrade({
      id: "trade-open-001",
      created_at: "2024-04-01T10:00:00Z",
      instrument_name: "BTC-PERP",
      quantity: 2,
      side: "buy",
      realized_pnl: 0,
      transaction_hash: "0xopen1",
    });

    const closeTrade = makeMockTrade({
      id: "trade-close-001",
      created_at: "2024-04-05T15:30:00Z",
      instrument_name: "BTC-PERP",
      quantity: 2,
      side: "sell",
      fee: 1.5,
      realized_pnl: 150.75,
      status: "closed",
      transaction_hash: "0xclose1",
    });

    const funding = makeMockFunding({
      id: "funding-001",
      created_at: "2024-04-03T00:00:00Z",
      instrument_name: "BTC-PERP",
      position_size: 2,
      payment_amount: -3.1,
      transaction_hash: "0xfund1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(
          JSON.stringify(makeTradeResponse([openTrade, closeTrade])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(makeFundingResponse([funding])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(3);
    // Sorted by date ascending
    expect(txs[0].tag).toBe("open_position");
    expect(txs[1].tag).toBe("funding_payment");
    expect(txs[2].tag).toBe("close_position");
    expect(txs[0].date.getTime()).toBeLessThan(txs[1].date.getTime());
    expect(txs[1].date.getTime()).toBeLessThan(txs[2].date.getTime());
  });

  it("skips cancelled trades", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const cancelledTrade = makeMockTrade({
      id: "trade-cancelled-001",
      status: "cancelled",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(
          JSON.stringify(makeTradeResponse([cancelledTrade])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("skips pending trades", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const pendingTrade = makeMockTrade({
      id: "trade-pending-001",
      status: "pending",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(
          JSON.stringify(makeTradeResponse([pendingTrade])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles empty results", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(makeTradeResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles negative P&L (loss)", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const lossTrade = makeMockTrade({
      id: "trade-loss-001",
      created_at: "2024-04-02T00:00:00Z",
      instrument_name: "ETH-PERP",
      quantity: 10,
      side: "sell",
      realized_pnl: -500.5,
      status: "closed",
      transaction_hash: "0xloss1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([lossTrade])), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].pnl).toBe(-500.5);
    expect(txs[0].tag).toBe("close_position");
  });

  it("handles negative funding payment", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const negFunding = makeMockFunding({
      payment_amount: -3.1,
      transaction_hash: "0xnegfund1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([])), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(makeFundingResponse([negFunding])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].pnl).toBe(-3.1);
    expect(txs[0].tag).toBe("funding_payment");
  });

  it("handles API error with retry", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response(JSON.stringify(makeTradeResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// variationalAdapter.fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

describe("variationalAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws for invalid address", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    await expect(
      variationalAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Variational address");
  });

  it("maps trades to standard Transaction type", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    const openTrade = makeMockTrade({
      id: "trade-open-001",
      created_at: "2024-04-01T00:00:00Z",
      instrument_name: "BTC-PERP",
      quantity: 2,
      side: "buy",
      fee: 1.5,
      realized_pnl: 0,
      transaction_hash: "0xopen1",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(makeTradeResponse([openTrade])), {
        status: 200,
      });
    });

    const txs = await variationalAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].txHash).toBe("0xopen1");
    expect(txs[0].notes).toContain("open position");
  });

  it("handles empty results", async () => {
    vi.stubEnv("VARIATIONAL_API_KEY", "test-key");
    vi.stubEnv("VARIATIONAL_API_SECRET", "test-secret");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(makeTradeResponse([])), {
        status: 200,
      });
    });

    const txs = await variationalAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toAwakenPerpCSV
// ---------------------------------------------------------------------------

describe("toAwakenPerpCSV", () => {
  it("generates valid Awaken perps CSV", () => {
    const txs: PerpTransaction[] = [
      {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        fee: 1.5,
        pnl: 0,
        paymentToken: "",
        notes: "Long BTC",
        txHash: "0xopen1",
        tag: "open_position",
      },
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 5.25,
        paymentToken: "USDC",
        txHash: "0xfund1",
        tag: "funding_payment",
      },
      {
        date: new Date("2024-04-05T15:30:00Z"),
        asset: "BTC",
        amount: 2,
        fee: 1.5,
        pnl: 150.75,
        paymentToken: "USDC",
        notes: "Close short BTC",
        txHash: "0xclose1",
        tag: "close_position",
      },
    ];

    const csv = toAwakenPerpCSV(txs);
    const lines = csv.split("\n");

    // Header
    expect(lines[0]).toBe(PERP_CSV_HEADER);

    // 3 data rows
    expect(lines).toHaveLength(4);

    // Open position
    expect(lines[1]).toContain("04/01/2024 00:00:00");
    expect(lines[1]).toContain("BTC");
    expect(lines[1]).toContain("open_position");

    // Funding
    expect(lines[2]).toContain("funding_payment");
    expect(lines[2]).toContain("5.25");

    // Close
    expect(lines[3]).toContain("close_position");
    expect(lines[3]).toContain("150.75");
    expect(lines[3]).toContain("USDC");
  });

  it("generates header-only CSV for empty input", () => {
    const csv = toAwakenPerpCSV([]);
    expect(csv).toBe(PERP_CSV_HEADER);
  });
});

// ---------------------------------------------------------------------------
// variationalAdapter.toAwakenCSV
// ---------------------------------------------------------------------------

describe("variationalAdapter.toAwakenCSV", () => {
  it("generates valid standard CSV from transactions", () => {
    const txs = [
      {
        date: new Date("2024-04-01T00:00:00Z"),
        type: "trade" as const,
        sentQuantity: 2,
        sentCurrency: "BTC",
        feeAmount: 1.5,
        feeCurrency: "USDC",
        txHash: "0xopen1",
        notes: "Variational open position",
      },
    ];

    const csv = variationalAdapter.toAwakenCSV(txs);
    const lines = csv.split("\n");

    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Sent Quantity");
    expect(lines[1]).toContain("04/01/2024 00:00:00");
    expect(lines[1]).toContain("BTC");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("variational adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("variational");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("variational");
    expect(adapter?.chainName).toBe("Variational");
    expect(adapter?.perpsCapable).toBe(true);
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const variational = chains.find((c) => c.chainId === "variational");
    expect(variational).toBeDefined();
    expect(variational?.chainName).toBe("Variational");
    expect(variational?.enabled).toBe(true);
    expect(variational?.perpsCapable).toBe(true);
  });
});
