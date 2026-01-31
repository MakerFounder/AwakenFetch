/**
 * Tests for the streaming chain proxy API route.
 *
 * Verifies:
 *   - Rejects missing address parameter
 *   - Rejects invalid address format
 *   - Rejects invalid date parameters
 *   - Streams NDJSON batches via onProgress
 *   - Sends done message with total count
 *   - Returns error in stream on adapter failure
 *   - Serialises transaction dates as ISO strings
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Transaction, ChainAdapter, FetchOptions } from "@/types";

// ---------------------------------------------------------------------------
// Mock adapters module
// ---------------------------------------------------------------------------

const mockFetchTransactions = vi.fn<
  (address: string, options?: FetchOptions) => Promise<Transaction[]>
>();

const mockAdapter: ChainAdapter = {
  chainId: "bittensor",
  chainName: "Bittensor",
  fetchTransactions: mockFetchTransactions,
  toAwakenCSV: () => "",
  getExplorerUrl: (hash: string) => `https://taostats.io/extrinsic/${hash}`,
  validateAddress: (addr: string) => addr.startsWith("5") && addr.length >= 46,
};

vi.mock("@/lib/adapters", () => ({
  getAdapter: (chainId: string) => {
    if (chainId === "bittensor") return mockAdapter;
    return undefined;
  },
}));

// ---------------------------------------------------------------------------
// Import handler after mocks are set up
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/proxy/[chain]/stream/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(url: string): NextRequest {
  return {
    nextUrl: new URL(url, "http://localhost:3000"),
  } as unknown as NextRequest;
}

function createParams(chain: string): { params: Promise<{ chain: string }> } {
  return { params: Promise.resolve({ chain }) };
}

/** Read all NDJSON lines from a streaming Response. */
async function readNDJSON(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/proxy/[chain]/stream", () => {
  beforeEach(() => {
    mockFetchTransactions.mockReset();
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it("returns 404 for unknown chain", async () => {
    const req = createRequest("/api/proxy/ethereum/stream");
    const res = await GET(req, createParams("ethereum"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("ethereum");
  });

  it("returns 400 for missing address", async () => {
    const req = createRequest("/api/proxy/bittensor/stream");
    const res = await GET(req, createParams("bittensor"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("address");
  });

  it("returns 400 for invalid address", async () => {
    const req = createRequest(
      "/api/proxy/bittensor/stream?address=badaddr",
    );
    const res = await GET(req, createParams("bittensor"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  it("returns 400 for invalid fromDate", async () => {
    const req = createRequest(
      "/api/proxy/bittensor/stream?address=5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX&fromDate=not-a-date",
    );
    const res = await GET(req, createParams("bittensor"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("fromDate");
  });

  it("returns 400 for invalid toDate", async () => {
    const req = createRequest(
      "/api/proxy/bittensor/stream?address=5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX&toDate=bad",
    );
    const res = await GET(req, createParams("bittensor"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("toDate");
  });

  // -------------------------------------------------------------------------
  // Streaming responses
  // -------------------------------------------------------------------------

  it("streams transactions via onProgress and sends done message", async () => {
    const mockTxs: Transaction[] = [
      {
        date: new Date("2025-01-15T12:00:00Z"),
        type: "receive",
        receivedQuantity: 100,
        receivedCurrency: "TAO",
        txHash: "abc123",
      },
      {
        date: new Date("2025-01-16T08:30:00Z"),
        type: "send",
        sentQuantity: 50,
        sentCurrency: "TAO",
        txHash: "def456",
      },
    ];

    // Simulate adapter calling onProgress with a batch, then returning all
    mockFetchTransactions.mockImplementation(
      async (_address: string, options?: FetchOptions) => {
        // Simulate onProgress being called during pagination
        if (options?.onProgress) {
          options.onProgress(mockTxs);
        }
        return mockTxs;
      },
    );

    const req = createRequest(
      "/api/proxy/bittensor/stream?address=5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
    );
    const res = await GET(req, createParams("bittensor"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");

    const messages = await readNDJSON(res);

    // Should have a batch message and a done message
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const batchMsg = messages.find(
      (m) => (m as { type: string }).type === "batch",
    ) as { type: string; transactions: Array<{ date: string }> };
    expect(batchMsg).toBeDefined();
    expect(batchMsg.transactions).toHaveLength(2);
    expect(batchMsg.transactions[0].date).toBe("2025-01-15T12:00:00.000Z");

    const doneMsg = messages.find(
      (m) => (m as { type: string }).type === "done",
    ) as { type: string; total: number };
    expect(doneMsg).toBeDefined();
    expect(doneMsg.total).toBe(2);
  });

  it("sends all transactions as single batch when adapter has no streaming", async () => {
    const mockTxs: Transaction[] = [
      {
        date: new Date("2025-01-15T12:00:00Z"),
        type: "receive",
        receivedQuantity: 100,
        receivedCurrency: "TAO",
        txHash: "abc123",
      },
    ];

    // Adapter does NOT call onProgress
    mockFetchTransactions.mockResolvedValue(mockTxs);

    const req = createRequest(
      "/api/proxy/bittensor/stream?address=5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
    );
    const res = await GET(req, createParams("bittensor"));

    expect(res.status).toBe(200);

    const messages = await readNDJSON(res);

    const batchMsg = messages.find(
      (m) => (m as { type: string }).type === "batch",
    ) as { type: string; transactions: unknown[] };
    expect(batchMsg).toBeDefined();
    expect(batchMsg.transactions).toHaveLength(1);

    const doneMsg = messages.find(
      (m) => (m as { type: string }).type === "done",
    ) as { type: string; total: number };
    expect(doneMsg).toBeDefined();
    expect(doneMsg.total).toBe(1);
  });

  it("streams error message when adapter throws", async () => {
    mockFetchTransactions.mockRejectedValue(
      new Error("Taostats API error: 503"),
    );

    const req = createRequest(
      "/api/proxy/bittensor/stream?address=5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
    );
    const res = await GET(req, createParams("bittensor"));

    // Streaming always returns 200 since we start the stream before the error
    expect(res.status).toBe(200);

    const messages = await readNDJSON(res);
    const errorMsg = messages.find(
      (m) => (m as { type: string }).type === "error",
    ) as { type: string; error: string };
    expect(errorMsg).toBeDefined();
    expect(errorMsg.error).toContain("503");
  });

  it("passes date filters to the adapter via options", async () => {
    mockFetchTransactions.mockResolvedValue([]);

    const from = "2025-01-01T00:00:00Z";
    const to = "2025-06-30T23:59:59Z";
    const req = createRequest(
      `/api/proxy/bittensor/stream?address=5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX&fromDate=${from}&toDate=${to}`,
    );
    const res = await GET(req, createParams("bittensor"));

    expect(res.status).toBe(200);

    // Check adapter was called with the right options (excluding onProgress)
    expect(mockFetchTransactions).toHaveBeenCalledWith(
      "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
      expect.objectContaining({
        fromDate: new Date(from),
        toDate: new Date(to),
      }),
    );
  });

  it("streams multiple batches from adapter with onProgress", async () => {
    const batch1: Transaction[] = [
      {
        date: new Date("2025-01-15T12:00:00Z"),
        type: "receive",
        receivedQuantity: 100,
        receivedCurrency: "TAO",
      },
    ];
    const batch2: Transaction[] = [
      {
        date: new Date("2025-01-16T12:00:00Z"),
        type: "send",
        sentQuantity: 50,
        sentCurrency: "TAO",
      },
    ];
    const allTxs = [...batch1, ...batch2];

    mockFetchTransactions.mockImplementation(
      async (_address: string, options?: FetchOptions) => {
        options?.onProgress?.(batch1);
        options?.onProgress?.(batch2);
        return allTxs;
      },
    );

    const req = createRequest(
      "/api/proxy/bittensor/stream?address=5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
    );
    const res = await GET(req, createParams("bittensor"));

    const messages = await readNDJSON(res);
    const batches = messages.filter(
      (m) => (m as { type: string }).type === "batch",
    );

    // Should have 2 batch messages (not a single fallback batch)
    expect(batches.length).toBe(2);

    const doneMsg = messages.find(
      (m) => (m as { type: string }).type === "done",
    ) as { type: string; total: number };
    expect(doneMsg.total).toBe(2);
  });
});
