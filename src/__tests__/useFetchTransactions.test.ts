import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useFetchTransactions } from "@/lib/useFetchTransactions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Helper to build a mock fetch Response (non-streaming). */
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

describe("useFetchTransactions", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useFetchTransactions());

    expect(result.current.status).toBe("idle");
    expect(result.current.transactions).toEqual([]);
    expect(result.current.transactionCount).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.warnings).toEqual([]);
    expect(result.current.canRetry).toBe(false);
  });

  it("transitions to loading then success on successful fetch", async () => {
    const mockTxs = [
      {
        date: "2024-01-15T12:00:00.000Z",
        type: "send",
        sentQuantity: 1.5,
        sentCurrency: "TAO",
        txHash: "0xabc",
      },
      {
        date: "2024-01-16T14:30:00.000Z",
        type: "receive",
        receivedQuantity: 2.0,
        receivedCurrency: "TAO",
        txHash: "0xdef",
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse({ transactions: mockTxs }),
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
    expect(result.current.error).toBeNull();

    // Verify the correct proxy URL was called
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/proxy/bittensor"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("transitions to error on non-retryable failure (400)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse(
        { error: "Invalid address format." },
        { status: 400 },
      ),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("bad-addr", "bittensor");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Invalid address format.");
    expect(result.current.transactions).toEqual([]);
  });

  it("auto-retries on 429 and eventually succeeds", async () => {
    const mockTxs = [
      {
        date: "2024-01-15T12:00:00.000Z",
        type: "send",
        sentQuantity: 1,
        sentCurrency: "TAO",
      },
    ];

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // 1st call: streaming endpoint → 429 (triggers fallback)
      .mockResolvedValueOnce(
        mockFetchResponse(
          { error: "Rate limited" },
          { status: 429 },
        ),
      )
      // 2nd call: fallback non-streaming → 429 (triggers retry)
      .mockResolvedValueOnce(
        mockFetchResponse(
          { error: "Rate limited" },
          { status: 429 },
        ),
      )
      // 3rd call: retry non-streaming → success
      .mockResolvedValueOnce(
        mockFetchResponse({ transactions: mockTxs }),
      );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      const promise = result.current.fetchTransactions(
        "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
        "bittensor",
      );
      // Advance past the retry delay
      await vi.advanceTimersByTimeAsync(5000);
      await promise;
    });

    expect(result.current.status).toBe("success");
    expect(result.current.transactionCount).toBe(1);
    expect(result.current.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.current.warnings[0]).toContain("Retry 1/3");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("auto-retries on network errors and eventually fails after max retries", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      const promise = result.current.fetchTransactions(
        "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
        "bittensor",
      );
      // Advance past all retry delays (1.5s, 3s, 6s, 12s)
      await vi.advanceTimersByTimeAsync(30000);
      await promise;
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Failed to fetch");
    expect(result.current.warnings.length).toBe(3);
    expect(result.current.retryCount).toBe(3);
    // No more retries after max
    expect(result.current.canRetry).toBe(false);
  });

  it("auto-retries on 502 server errors", async () => {
    const mockTxs = [
      {
        date: "2024-01-15T12:00:00.000Z",
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "KAS",
      },
    ];

    vi.spyOn(globalThis, "fetch")
      // 1st call: streaming endpoint → 502 (triggers fallback)
      .mockResolvedValueOnce(
        mockFetchResponse(
          { error: "Bad gateway" },
          { status: 502 },
        ),
      )
      // 2nd call: fallback non-streaming → 502 (triggers retry)
      .mockResolvedValueOnce(
        mockFetchResponse(
          { error: "Bad gateway" },
          { status: 502 },
        ),
      )
      // 3rd call: retry non-streaming → success
      .mockResolvedValueOnce(
        mockFetchResponse({ transactions: mockTxs }),
      );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      const promise = result.current.fetchTransactions(
        "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
        "kaspa",
      );
      await vi.advanceTimersByTimeAsync(5000);
      await promise;
    });

    expect(result.current.status).toBe("success");
    expect(result.current.transactionCount).toBe(1);
  });

  it("reset() returns to idle state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse({ transactions: [] }),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("addr", "bittensor");
    });

    expect(result.current.status).toBe("success");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.transactions).toEqual([]);
    expect(result.current.transactionCount).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.warnings).toEqual([]);
  });

  it("passes address as query param to the proxy route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse({ transactions: [] }),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("myaddr123", "kaspa");
    });

    // First call goes to streaming endpoint, still has the address param
    const calledUrl = (fetchSpy.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain("/api/proxy/kaspa");
    expect(calledUrl).toContain("address=myaddr123");
  });

  it("deserialises date strings into Date objects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse({
        transactions: [
          {
            date: "2024-06-15T08:30:00.000Z",
            type: "send",
            sentQuantity: 100,
            sentCurrency: "INJ",
          },
        ],
      }),
    );

    const { result } = renderHook(() => useFetchTransactions());

    await act(async () => {
      await result.current.fetchTransactions("inj1abc", "injective");
    });

    const tx = result.current.transactions[0];
    expect(tx.date).toBeInstanceOf(Date);
    expect(tx.date.toISOString()).toBe("2024-06-15T08:30:00.000Z");
  });
});
