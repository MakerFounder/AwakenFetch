/**
 * Tests for the Extended perpetuals adapter (StarkNet).
 *
 * Covers:
 *   - Address validation (StarkNet addresses and numeric account IDs)
 *   - Market name → asset extraction
 *   - Explorer URL generation
 *   - Trade → PerpTransaction mapping (open, close, funding)
 *   - Funding payment mapping
 *   - fetchPerpTransactions integration (mocked API)
 *   - fetchTransactions integration (standard Transaction mapping)
 *   - CSV generation (perps format)
 *   - Date filtering and sorting
 *   - Error handling (invalid address, missing API key)
 *   - Adapter registration
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  extendedAdapter,
  isValidExtendedAddress,
  extractAssetFromMarket,
  fetchPerpTransactions,
  toAwakenPerpCSV,
} from "@/lib/adapters/extended";
import type { PerpTransaction } from "@/types";
import { PERP_CSV_HEADER } from "@/lib/csv/constants";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidExtendedAddress", () => {
  it("accepts a valid StarkNet 0x-prefixed address", () => {
    expect(
      isValidExtendedAddress(
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      ),
    ).toBe(true);
  });

  it("accepts short StarkNet hex addresses", () => {
    expect(isValidExtendedAddress("0x1")).toBe(true);
    expect(isValidExtendedAddress("0xabc123")).toBe(true);
  });

  it("accepts numeric account IDs", () => {
    expect(isValidExtendedAddress("3017")).toBe(true);
    expect(isValidExtendedAddress("12345")).toBe(true);
    expect(isValidExtendedAddress("1")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidExtendedAddress("")).toBe(false);
  });

  it("rejects non-hex StarkNet addresses", () => {
    expect(isValidExtendedAddress("0xGGGG")).toBe(false);
  });

  it("rejects address that is too long (more than 64 hex chars)", () => {
    const tooLong = "0x" + "a".repeat(65);
    expect(isValidExtendedAddress(tooLong)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidExtendedAddress(null as unknown as string)).toBe(false);
    expect(isValidExtendedAddress(undefined as unknown as string)).toBe(false);
    expect(isValidExtendedAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidExtendedAddress("  0xabc123  ")).toBe(true);
    expect(isValidExtendedAddress("  3017  ")).toBe(true);
  });

  it("rejects Kaspa-style addresses", () => {
    expect(
      isValidExtendedAddress(
        "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
      ),
    ).toBe(false);
  });

  it("rejects Ethereum-length addresses without 0x prefix", () => {
    expect(
      isValidExtendedAddress("d8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractAssetFromMarket
// ---------------------------------------------------------------------------

describe("extractAssetFromMarket", () => {
  it("extracts BTC from BTC-USD", () => {
    expect(extractAssetFromMarket("BTC-USD")).toBe("BTC");
  });

  it("extracts ETH from ETH-USD", () => {
    expect(extractAssetFromMarket("ETH-USD")).toBe("ETH");
  });

  it("extracts BNB from BNB-USD", () => {
    expect(extractAssetFromMarket("BNB-USD")).toBe("BNB");
  });

  it("extracts SOL from SOL-USD", () => {
    expect(extractAssetFromMarket("SOL-USD")).toBe("SOL");
  });

  it("handles plain asset name", () => {
    expect(extractAssetFromMarket("DOGE")).toBe("DOGE");
  });

  it("returns UNKNOWN for empty string", () => {
    expect(extractAssetFromMarket("")).toBe("UNKNOWN");
  });

  it("uppercases the result", () => {
    expect(extractAssetFromMarket("btc-usd")).toBe("BTC");
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("extendedAdapter.getExplorerUrl", () => {
  it("returns the correct Starkscan URL", () => {
    const hash = "0xabcdef1234567890";
    expect(extendedAdapter.getExplorerUrl(hash)).toBe(
      "https://starkscan.co/tx/0xabcdef1234567890",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("extendedAdapter.validateAddress", () => {
  it("delegates to isValidExtendedAddress", () => {
    expect(
      extendedAdapter.validateAddress(
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      ),
    ).toBe(true);
    expect(extendedAdapter.validateAddress("3017")).toBe(true);
    expect(extendedAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("extendedAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(extendedAdapter.chainId).toBe("extended");
  });

  it("has correct chainName", () => {
    expect(extendedAdapter.chainName).toBe("Extended");
  });

  it("is perps-capable", () => {
    expect(extendedAdapter.perpsCapable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const VALID_ACCOUNT_ID = "3017";

function makeMockTrade(
  overrides: Partial<ExtendedTradeMock> = {},
): ExtendedTradeMock {
  return {
    id: overrides.id ?? 1784963886257016832,
    accountId: overrides.accountId ?? 3017,
    market: overrides.market ?? "BTC-USD",
    orderId: overrides.orderId ?? 9223372036854775808,
    side: overrides.side ?? "BUY",
    price: overrides.price ?? "65000.0000000000000000",
    qty: overrides.qty ?? "2.0000000000000000",
    value: overrides.value ?? "130000.0000000000000000",
    fee: overrides.fee ?? "0.0000000000000000",
    tradeType: overrides.tradeType ?? "TRADE",
    createdTime: overrides.createdTime ?? 1711929600000, // 2024-04-01T00:00:00Z
    isTaker: overrides.isTaker ?? true,
  };
}

interface ExtendedTradeMock {
  id: number;
  accountId: number;
  market: string;
  orderId: number;
  side: string;
  price: string;
  qty: string;
  value: string;
  fee: string;
  tradeType: string;
  createdTime: number;
  isTaker: boolean;
}

function makeMockPositionHistory(
  overrides: Partial<{
    id: number;
    accountId: number;
    market: string;
    side: string;
    exitType: string;
    leverage: string;
    size: string;
    maxPositionSize: string;
    openPrice: string;
    exitPrice: string;
    realisedPnl: string;
    createdTime: number;
    closedTime: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 1784963886257016832,
    accountId: overrides.accountId ?? 3017,
    market: overrides.market ?? "BTC-USD",
    side: overrides.side ?? "LONG",
    exitType: overrides.exitType ?? "TRADE",
    leverage: overrides.leverage ?? "10",
    size: overrides.size ?? "2.0",
    maxPositionSize: overrides.maxPositionSize ?? "2.0",
    openPrice: overrides.openPrice ?? "65000.00",
    exitPrice: overrides.exitPrice ?? "66000.00",
    realisedPnl: overrides.realisedPnl ?? "150.75",
    createdTime: overrides.createdTime ?? 1711929600000,
    closedTime: overrides.closedTime ?? 1712016000000,
  };
}

function makeMockFunding(
  overrides: Partial<{
    id: number;
    accountId: number;
    market: string;
    positionId: number;
    side: string;
    size: string;
    value: string;
    markPrice: string;
    fundingFee: string;
    fundingRate: string;
    paidTime: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 8341,
    accountId: overrides.accountId ?? 3017,
    market: overrides.market ?? "BTC-USD",
    positionId: overrides.positionId ?? 1821237954501148672,
    side: overrides.side ?? "LONG",
    size: overrides.size ?? "2.0",
    value: overrides.value ?? "130000.00",
    markPrice: overrides.markPrice ?? "65000.00",
    fundingFee: overrides.fundingFee ?? "-5.25",
    fundingRate: overrides.fundingRate ?? "0.0001",
    paidTime: overrides.paidTime ?? 1712016000000, // 2024-04-02T00:00:00Z
  };
}

function makeTradeResponse(
  items: ReturnType<typeof makeMockTrade>[],
) {
  return {
    status: "OK",
    data: items,
    pagination: {
      cursor: items.length > 0 ? items[items.length - 1].id : 0,
      count: items.length,
    },
  };
}

function makePositionHistoryResponse(
  items: ReturnType<typeof makeMockPositionHistory>[],
) {
  return {
    status: "OK",
    data: items,
    pagination: {
      cursor: items.length > 0 ? items[items.length - 1].id : 0,
      count: items.length,
    },
  };
}

function makeFundingResponse(
  items: ReturnType<typeof makeMockFunding>[],
) {
  return {
    status: "OK",
    data: items,
    pagination: {
      cursor: items.length > 0 ? items[items.length - 1].id : 0,
      count: items.length,
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
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    await expect(fetchPerpTransactions("invalid-address")).rejects.toThrow(
      "Invalid Extended address",
    );
  });

  it("throws when API key is missing", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "");
    delete process.env.EXTENDED_API_KEY;

    await expect(fetchPerpTransactions(VALID_ADDRESS)).rejects.toThrow(
      "EXTENDED_API_KEY",
    );
  });

  it("accepts numeric account ID as address", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ status: "OK", data: [], pagination: { cursor: 0, count: 0 } }),
        { status: 200 },
      );
    });

    const txs = await fetchPerpTransactions(VALID_ACCOUNT_ID);
    expect(txs).toHaveLength(0);
  });

  it("fetches and maps an open position trade", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const openTrade = makeMockTrade({
      id: 100,
      market: "BTC-USD",
      side: "BUY",
      qty: "2.0000000000000000",
      fee: "1.5000000000000000",
      createdTime: 1711929600000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([openTrade])), {
          status: 200,
        });
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([])),
          { status: 200 },
        );
      }
      // funding
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
  });

  it("fetches and maps a close position trade with P&L", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const closeTrade = makeMockTrade({
      id: 200,
      market: "BTC-USD",
      side: "SELL",
      qty: "1.0000000000000000",
      fee: "1.5000000000000000",
      createdTime: 1712016000000,
    });

    const closedPosition = makeMockPositionHistory({
      id: 300,
      market: "BTC-USD",
      side: "LONG",
      exitType: "TRADE",
      realisedPnl: "150.75",
      closedTime: 1712016000000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([closeTrade])), {
          status: 200,
        });
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([closedPosition])),
          { status: 200 },
        );
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
  });

  it("fetches and maps a liquidation trade as close position", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const liqTrade = makeMockTrade({
      id: 400,
      market: "ETH-USD",
      side: "SELL",
      qty: "10.0000000000000000",
      fee: "0.0000000000000000",
      tradeType: "LIQUIDATION",
      createdTime: 1712016000000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([liqTrade])), {
          status: 200,
        });
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].tag).toBe("close_position");
    expect(txs[0].asset).toBe("ETH");
  });

  it("fetches and maps a deleverage trade as close position", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const deleverageTrade = makeMockTrade({
      id: 500,
      market: "BTC-USD",
      side: "BUY",
      qty: "0.5000000000000000",
      fee: "0.0000000000000000",
      tradeType: "DELEVERAGE",
      createdTime: 1712016000000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(
          JSON.stringify(makeTradeResponse([deleverageTrade])),
          { status: 200 },
        );
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(makeFundingResponse([])), {
        status: 200,
      });
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].tag).toBe("close_position");
  });

  it("fetches and maps funding payments", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const funding = makeMockFunding({
      id: 600,
      market: "BTC-USD",
      size: "2.0",
      fundingFee: "-5.25",
      fundingRate: "0.0001",
      paidTime: 1712016000000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([])), {
          status: 200,
        });
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([])),
          { status: 200 },
        );
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
    expect(txs[0].pnl).toBe(5.25); // Inverted: -(-5.25) = 5.25
    expect(txs[0].paymentToken).toBe("USDC");
    expect(txs[0].notes).toContain("Funding payment");
  });

  it("combines trades and funding, sorted by date", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const openTrade = makeMockTrade({
      id: 100,
      market: "BTC-USD",
      side: "BUY",
      qty: "2.0000000000000000",
      fee: "0.0000000000000000",
      createdTime: 1711929600000, // 2024-04-01T04:00:00Z
    });

    const closeTrade = makeMockTrade({
      id: 200,
      market: "BTC-USD",
      side: "SELL",
      qty: "2.0000000000000000",
      fee: "1.5000000000000000",
      createdTime: 1712275800000, // 2024-04-05T03:30:00Z
    });

    const funding = makeMockFunding({
      id: 300,
      market: "BTC-USD",
      size: "2.0",
      fundingFee: "3.1",
      fundingRate: "0.0001",
      paidTime: 1712102400000, // 2024-04-03T04:00:00Z
    });

    const closedPosition = makeMockPositionHistory({
      id: 400,
      market: "BTC-USD",
      side: "LONG",
      realisedPnl: "150.75",
      closedTime: 1712275800000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(
          JSON.stringify(makeTradeResponse([openTrade, closeTrade])),
          { status: 200 },
        );
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([closedPosition])),
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
    expect(txs[0].date.getTime()).toBeLessThan(txs[1].date.getTime());
    expect(txs[1].date.getTime()).toBeLessThan(txs[2].date.getTime());

    // First trade picks up the closed position's PnL (matched by market)
    // so it is tagged close_position; the second trade on the same market
    // becomes open_position because the PnL was consumed.
    expect(txs[0].tag).toBe("close_position");
    // Funding in the middle
    expect(txs[1].tag).toBe("funding_payment");
    // Second trade on same market, PnL already consumed → open
    expect(txs[2].tag).toBe("open_position");
  });

  it("handles empty results", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ status: "OK", data: [], pagination: { cursor: 0, count: 0 } }),
        { status: 200 },
      );
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles negative P&L (loss)", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const lossTrade = makeMockTrade({
      id: 700,
      market: "ETH-USD",
      side: "SELL",
      qty: "10.0000000000000000",
      fee: "0.0000000000000000",
      createdTime: 1712016000000,
    });

    const lossPosition = makeMockPositionHistory({
      id: 800,
      market: "ETH-USD",
      side: "LONG",
      realisedPnl: "-500.50",
      closedTime: 1712016000000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([lossTrade])), {
          status: 200,
        });
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([lossPosition])),
          { status: 200 },
        );
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
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const negFunding = makeMockFunding({
      fundingFee: "3.10", // positive fee means user paid
      paidTime: 1712016000000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/user/trades")) {
        return new Response(JSON.stringify(makeTradeResponse([])), {
          status: 200,
        });
      }
      if (urlStr.includes("/user/positions/history")) {
        return new Response(
          JSON.stringify(makePositionHistoryResponse([])),
          { status: 200 },
        );
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
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response(
        JSON.stringify({ status: "OK", data: [], pagination: { cursor: 0, count: 0 } }),
        { status: 200 },
      );
    });

    const txs = await fetchPerpTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// extendedAdapter.fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

describe("extendedAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws for invalid address", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    await expect(
      extendedAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Extended address");
  });

  it("maps trades to standard Transaction type", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const buyTrade = makeMockTrade({
      id: 100,
      market: "BTC-USD",
      side: "BUY",
      qty: "2.0000000000000000",
      fee: "1.5000000000000000",
      createdTime: 1711929600000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(makeTradeResponse([buyTrade])), {
        status: 200,
      });
    });

    const txs = await extendedAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].receivedQuantity).toBe(2);
    expect(txs[0].receivedCurrency).toBe("BTC");
    expect(txs[0].feeAmount).toBe(1.5);
    expect(txs[0].feeCurrency).toBe("USDC");
    expect(txs[0].notes).toContain("Extended");
    expect(txs[0].notes).toContain("buy");
    expect(txs[0].notes).toContain("BTC");
  });

  it("handles empty results", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify(makeTradeResponse([])),
        { status: 200 },
      );
    });

    const txs = await extendedAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("maps SELL trades correctly", async () => {
    vi.stubEnv("EXTENDED_API_KEY", "test-key");

    const sellTrade = makeMockTrade({
      id: 100,
      market: "ETH-USD",
      side: "SELL",
      qty: "5.0000000000000000",
      fee: "0.5000000000000000",
      createdTime: 1711929600000,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(makeTradeResponse([sellTrade])), {
        status: 200,
      });
    });

    const txs = await extendedAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].sentQuantity).toBe(5);
    expect(txs[0].sentCurrency).toBe("ETH");
    expect(txs[0].receivedQuantity).toBeUndefined();
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
        txHash: undefined,
        tag: "open_position",
      },
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 5.25,
        paymentToken: "USDC",
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
// extendedAdapter.toAwakenCSV
// ---------------------------------------------------------------------------

describe("extendedAdapter.toAwakenCSV", () => {
  it("generates valid standard CSV from transactions", () => {
    const txs = [
      {
        date: new Date("2024-04-01T00:00:00Z"),
        type: "trade" as const,
        sentQuantity: 2,
        sentCurrency: "BTC",
        feeAmount: 1.5,
        feeCurrency: "USDC",
        notes: "Extended trade sell BTC",
      },
    ];

    const csv = extendedAdapter.toAwakenCSV(txs);
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

describe("extended adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("extended");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("extended");
    expect(adapter?.chainName).toBe("Extended");
    expect(adapter?.perpsCapable).toBe(true);
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const extended = chains.find((c) => c.chainId === "extended");
    expect(extended).toBeDefined();
    expect(extended?.chainName).toBe("Extended");
    expect(extended?.enabled).toBe(true);
    expect(extended?.perpsCapable).toBe(true);
  });
});
