/**
 * Tests for the chain proxy API route.
 *
 * Verifies:
 *   - Rejects unsupported chains
 *   - Rejects missing address parameter
 *   - Rejects invalid address format
 *   - Rejects invalid date parameters
 *   - Proxies valid requests through the chain adapter
 *   - Passes date filters to adapter
 *   - Returns 502 on adapter errors
 *   - Serialises transaction dates as ISO strings
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Transaction, ChainAdapter } from "@/types";

// ---------------------------------------------------------------------------
// Mock adapters module
// ---------------------------------------------------------------------------

const mockFetchTransactions = vi.fn<
  (address: string, options?: unknown) => Promise<Transaction[]>
>();

const mockAdapter: ChainAdapter = {
  chainId: "kaspa",
  chainName: "Kaspa",
  fetchTransactions: mockFetchTransactions,
  toAwakenCSV: () => "",
  getExplorerUrl: (hash: string) => `https://explorer.kaspa.org/txs/${hash}`,
  validateAddress: (addr: string) =>
    addr.startsWith("kaspa:") && addr.length > 10,
};

vi.mock("@/lib/adapters", () => ({
  getAdapter: (chainId: string) => {
    if (
      chainId === "kaspa" ||
      chainId === "bittensor" ||
      chainId === "injective" ||
      chainId === "osmosis" ||
      chainId === "ergo"
    ) {
      return mockAdapter;
    }
    return undefined;
  },
}));

// ---------------------------------------------------------------------------
// Import handler after mocks are set up
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/proxy/[chain]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal NextRequest-like object for testing.
 */
function createRequest(url: string): NextRequest {
  return {
    nextUrl: new URL(url, "http://localhost:3000"),
  } as unknown as NextRequest;
}

/**
 * Create params object matching Next.js 16 dynamic route signature.
 */
function createParams(chain: string): { params: Promise<{ chain: string }> } {
  return { params: Promise.resolve({ chain }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/proxy/[chain]", () => {
  beforeEach(() => {
    mockFetchTransactions.mockReset();
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it("returns 400 for unsupported chain", async () => {
    const req = createRequest("/api/proxy/ethereum");
    const res = await GET(req, createParams("ethereum"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("ethereum");
    expect(body.error).toContain("not available");
  });

  it("returns 400 for missing address parameter", async () => {
    const req = createRequest("/api/proxy/kaspa");
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("address");
  });

  it("returns 400 for invalid address format", async () => {
    const req = createRequest("/api/proxy/kaspa?address=badaddr");
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  it("returns 400 for invalid fromDate format", async () => {
    const req = createRequest(
      "/api/proxy/kaspa?address=kaspa:qr0dummyaddr123&fromDate=not-a-date",
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("fromDate");
  });

  it("returns 400 for invalid toDate format", async () => {
    const req = createRequest(
      "/api/proxy/kaspa?address=kaspa:qr0dummyaddr123&toDate=bad",
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("toDate");
  });

  // -------------------------------------------------------------------------
  // Successful proxy
  // -------------------------------------------------------------------------

  it("proxies a valid request and returns serialised transactions", async () => {
    const mockTxs: Transaction[] = [
      {
        date: new Date("2025-01-15T12:00:00Z"),
        type: "receive",
        receivedQuantity: 100,
        receivedCurrency: "KAS",
        txHash: "abc123",
      },
      {
        date: new Date("2025-01-16T08:30:00Z"),
        type: "send",
        sentQuantity: 50,
        sentCurrency: "KAS",
        feeAmount: 0.0001,
        feeCurrency: "KAS",
        txHash: "def456",
      },
    ];
    mockFetchTransactions.mockResolvedValue(mockTxs);

    const req = createRequest(
      "/api/proxy/kaspa?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactions).toHaveLength(2);

    // Dates should be ISO strings
    expect(body.transactions[0].date).toBe("2025-01-15T12:00:00.000Z");
    expect(body.transactions[1].date).toBe("2025-01-16T08:30:00.000Z");

    // Other fields should be preserved
    expect(body.transactions[0].type).toBe("receive");
    expect(body.transactions[0].receivedQuantity).toBe(100);
    expect(body.transactions[1].feeAmount).toBe(0.0001);

    // Adapter was called with correct address
    expect(mockFetchTransactions).toHaveBeenCalledWith(
      "kaspa:qr0dummyaddr123",
      {},
    );
  });

  it("passes date filters to the adapter", async () => {
    mockFetchTransactions.mockResolvedValue([]);

    const from = "2025-01-01T00:00:00Z";
    const to = "2025-06-30T23:59:59Z";
    const req = createRequest(
      `/api/proxy/kaspa?address=kaspa:qr0dummyaddr123&fromDate=${from}&toDate=${to}`,
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(200);
    expect(mockFetchTransactions).toHaveBeenCalledWith(
      "kaspa:qr0dummyaddr123",
      {
        fromDate: new Date(from),
        toDate: new Date(to),
      },
    );
  });

  it("returns empty array when adapter returns no transactions", async () => {
    mockFetchTransactions.mockResolvedValue([]);

    const req = createRequest(
      "/api/proxy/kaspa?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactions).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // All proxy-enabled chains are accepted
  // -------------------------------------------------------------------------

  it("accepts bittensor chain", async () => {
    mockFetchTransactions.mockResolvedValue([]);
    const req = createRequest(
      "/api/proxy/bittensor?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("bittensor"));
    // Should get past the chain validation (will hit address validation)
    expect(res.status).toBe(200);
  });

  it("accepts injective chain", async () => {
    mockFetchTransactions.mockResolvedValue([]);
    const req = createRequest(
      "/api/proxy/injective?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("injective"));
    expect(res.status).toBe(200);
  });

  it("accepts osmosis chain", async () => {
    mockFetchTransactions.mockResolvedValue([]);
    const req = createRequest(
      "/api/proxy/osmosis?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("osmosis"));
    expect(res.status).toBe(200);
  });

  it("accepts ergo chain", async () => {
    mockFetchTransactions.mockResolvedValue([]);
    const req = createRequest(
      "/api/proxy/ergo?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("ergo"));
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("returns 502 when adapter throws an error", async () => {
    mockFetchTransactions.mockRejectedValue(
      new Error("Kaspa API error: 503 Service Unavailable"),
    );

    const req = createRequest(
      "/api/proxy/kaspa?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("503 Service Unavailable");
  });

  it("returns 502 with generic message for non-Error throws", async () => {
    mockFetchTransactions.mockRejectedValue("some string error");

    const req = createRequest(
      "/api/proxy/kaspa?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Unknown error occurred");
  });

  // -------------------------------------------------------------------------
  // Serialisation
  // -------------------------------------------------------------------------

  it("serialises all transaction fields including optional ones", async () => {
    const mockTx: Transaction = {
      date: new Date("2025-03-10T14:25:00Z"),
      type: "trade",
      sentQuantity: 10,
      sentCurrency: "KAS",
      receivedQuantity: 0.5,
      receivedCurrency: "BTC",
      feeAmount: 0.001,
      feeCurrency: "KAS",
      txHash: "trade-hash-123",
      notes: "DEX swap",
      tag: "swap",
    };
    mockFetchTransactions.mockResolvedValue([mockTx]);

    const req = createRequest(
      "/api/proxy/kaspa?address=kaspa:qr0dummyaddr123",
    );
    const res = await GET(req, createParams("kaspa"));

    expect(res.status).toBe(200);
    const body = await res.json();
    const tx = body.transactions[0];

    expect(tx.date).toBe("2025-03-10T14:25:00.000Z");
    expect(tx.type).toBe("trade");
    expect(tx.sentQuantity).toBe(10);
    expect(tx.sentCurrency).toBe("KAS");
    expect(tx.receivedQuantity).toBe(0.5);
    expect(tx.receivedCurrency).toBe("BTC");
    expect(tx.feeAmount).toBe(0.001);
    expect(tx.feeCurrency).toBe("KAS");
    expect(tx.txHash).toBe("trade-hash-123");
    expect(tx.notes).toBe("DEX swap");
    expect(tx.tag).toBe("swap");
  });
});
