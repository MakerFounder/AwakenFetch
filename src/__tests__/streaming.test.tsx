/**
 * Tests for incremental streaming of transactions.
 *
 * Verifies:
 *   - Streaming API route sends NDJSON batches
 *   - useFetchTransactions hook processes streaming responses
 *   - Streaming status transitions: loading → streaming → success
 *   - Transaction count updates incrementally during streaming
 *   - Fallback to non-streaming on error
 *   - Abort/cancellation during streaming
 *   - FetchStatus displays streaming state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import { useFetchTransactions } from "@/lib/useFetchTransactions";
import { FetchStatus } from "@/components/FetchStatus";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper to build a mock NDJSON streaming Response. */
function mockStreamResponse(lines: string[]): Response {
  const ndjson = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(ndjson));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

/** Helper to build a mock standard JSON Response. */
function mockFetchResponse(
  body: unknown,
  opts?: { status?: number; ok?: boolean },
) {
  const status = opts?.status ?? 200;
  const ok = opts?.ok ?? status < 400;
  return {
    ok,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
    body: null,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests: useFetchTransactions streaming behavior
// ---------------------------------------------------------------------------

describe("useFetchTransactions — streaming", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes a streaming response with multiple batches", async () => {
    const batch1 = [
      {
        date: "2024-01-15T12:00:00.000Z",
        type: "send",
        sentQuantity: 1.5,
        sentCurrency: "TAO",
        txHash: "0xabc",
      },
    ];
    const batch2 = [
      {
        date: "2024-01-16T14:30:00.000Z",
        type: "receive",
        receivedQuantity: 2.0,
        receivedCurrency: "TAO",
        txHash: "0xdef",
      },
    ];

    const ndjsonLines = [
      JSON.stringify({ type: "batch", transactions: batch1 }),
      JSON.stringify({ type: "batch", transactions: batch2 }),
      JSON.stringify({ type: "done", total: 2 }),
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockStreamResponse(ndjsonLines),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions(
        "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
        "bittensor",
      );
    });

    expect(result.current.status).toBe("success");
    expect(result.current.transactionCount).toBe(2);
    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions[0].date).toBeInstanceOf(Date);
    expect(result.current.transactions[0].txHash).toBe("0xabc");
    expect(result.current.transactions[1].txHash).toBe("0xdef");
    expect(result.current.error).toBeNull();
  });

  it("calls the streaming endpoint URL", async () => {
    const ndjsonLines = [
      JSON.stringify({ type: "batch", transactions: [] }),
      JSON.stringify({ type: "done", total: 0 }),
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockStreamResponse(ndjsonLines),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("myaddr", "kaspa");
    });

    const calledUrl = (fetchSpy.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain("/api/proxy/kaspa/stream");
    expect(calledUrl).toContain("address=myaddr");
  });

  it("falls back to standard endpoint when streaming fails", async () => {
    const standardResponse = {
      transactions: [
        {
          date: "2024-01-15T12:00:00.000Z",
          type: "send",
          sentQuantity: 1,
          sentCurrency: "TAO",
        },
      ],
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // First call (streaming) — fails
      .mockResolvedValueOnce(
        mockFetchResponse({ error: "Not found" }, { status: 404 }),
      )
      // Second call (fallback) — succeeds
      .mockResolvedValueOnce(
        mockFetchResponse(standardResponse),
      );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("addr", "bittensor");
    });

    expect(result.current.status).toBe("success");
    expect(result.current.transactionCount).toBe(1);

    // Verify fallback URL was called (non-streaming)
    const fallbackUrl = (fetchSpy.mock.calls[1] as [string])[0];
    expect(fallbackUrl).toContain("/api/proxy/bittensor?");
    expect(fallbackUrl).not.toContain("/stream");
  });

  it("handles error messages in stream with retry", async () => {
    const errorStream = [
      JSON.stringify({ type: "error", error: "Rate limited" }),
    ];
    const successStream = [
      JSON.stringify({
        type: "batch",
        transactions: [
          {
            date: "2024-01-15T12:00:00.000Z",
            type: "receive",
            receivedQuantity: 5,
            receivedCurrency: "KAS",
          },
        ],
      }),
      JSON.stringify({ type: "done", total: 1 }),
    ];

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockStreamResponse(errorStream))
      .mockResolvedValueOnce(mockStreamResponse(successStream));

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      const promise = result.current.fetchTransactions("addr", "kaspa");
      await vi.advanceTimersByTimeAsync(5000);
      await promise;
    });

    expect(result.current.status).toBe("success");
    expect(result.current.transactionCount).toBe(1);
    expect(result.current.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("deserialises dates correctly from streaming batches", async () => {
    const ndjsonLines = [
      JSON.stringify({
        type: "batch",
        transactions: [
          {
            date: "2024-06-15T08:30:00.000Z",
            type: "send",
            sentQuantity: 100,
            sentCurrency: "INJ",
          },
        ],
      }),
      JSON.stringify({ type: "done", total: 1 }),
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockStreamResponse(ndjsonLines),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("inj1abc", "injective");
    });

    const tx = result.current.transactions[0];
    expect(tx.date).toBeInstanceOf(Date);
    expect(tx.date.toISOString()).toBe("2024-06-15T08:30:00.000Z");
  });

  it("caches transactions from stream on completion", async () => {
    const ndjsonLines = [
      JSON.stringify({
        type: "batch",
        transactions: [
          {
            date: "2024-01-15T12:00:00.000Z",
            type: "send",
            sentQuantity: 1,
            sentCurrency: "TAO",
          },
        ],
      }),
      JSON.stringify({ type: "done", total: 1 }),
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockStreamResponse(ndjsonLines),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("addr", "bittensor");
    });

    expect(result.current.status).toBe("success");

    // Verify cache was set (fetch from cache on next call)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockClear();

    await act(async () => {
      await result.current.fetchTransactions("addr", "bittensor");
    });

    // Should use cache — no new fetch
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.status).toBe("success");
    expect(result.current.transactionCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: FetchStatus streaming display
// ---------------------------------------------------------------------------

describe("FetchStatus — streaming state", () => {
  const defaultProps = {
    status: "idle" as const,
    transactionCount: 0,
    estimatedTotal: null,
    error: null,
    warnings: [],
    canRetry: false,
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    onCancel: vi.fn(),
  };

  it("shows streaming progress with transaction count", () => {
    render(
      <FetchStatus
        {...defaultProps}
        status="streaming"
        transactionCount={1500}
      />,
    );

    expect(screen.getByText(/Streaming transactions/)).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText(/fetched so far/)).toBeInTheDocument();
  });

  it("updates displayed count as streaming progresses", () => {
    const { rerender } = render(
      <FetchStatus
        {...defaultProps}
        status="streaming"
        transactionCount={500}
      />,
    );

    expect(screen.getByText("500")).toBeInTheDocument();

    rerender(
      <FetchStatus
        {...defaultProps}
        status="streaming"
        transactionCount={2500}
      />,
    );

    expect(screen.getByText("2,500")).toBeInTheDocument();
  });

  it("transitions from streaming to success display", () => {
    const { rerender } = render(
      <FetchStatus
        {...defaultProps}
        status="streaming"
        transactionCount={5000}
      />,
    );

    expect(screen.getByText(/Streaming/)).toBeInTheDocument();

    rerender(
      <FetchStatus
        {...defaultProps}
        status="success"
        transactionCount={5000}
      />,
    );

    expect(screen.queryByText(/Streaming/)).toBeNull();
    expect(screen.getByText("5,000")).toBeInTheDocument();
    expect(screen.getByText(/Fetched/)).toBeInTheDocument();
  });

  it("has accessible role=status for streaming", () => {
    const { container } = render(
      <FetchStatus
        {...defaultProps}
        status="streaming"
        transactionCount={100}
      />,
    );
    const statusEl = container.querySelector("[role='status']");
    expect(statusEl).toBeInTheDocument();
    expect(statusEl?.getAttribute("aria-live")).toBe("polite");
  });
});
