import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry, sleep } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper: create a mock Response object.
 */
function mockResponse(
  body: unknown,
  status = 200,
  statusText = "OK",
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// sleep()
// ---------------------------------------------------------------------------

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// fetchWithRetry()
// ---------------------------------------------------------------------------

describe("fetchWithRetry", () => {
  it("returns parsed JSON on a successful response", async () => {
    const data = { result: "ok" };
    mockFetch.mockResolvedValueOnce(mockResponse(data));

    const result = await fetchWithRetry("https://api.example.com/data");
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends accept: application/json header by default", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await fetchWithRetry("https://api.example.com/data");

    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/data", expect.objectContaining({
      headers: expect.objectContaining({ accept: "application/json" }),
    }));
  });

  it("merges custom headers with defaults", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await fetchWithRetry("https://api.example.com/data", {
      headers: { Authorization: "Bearer token123" },
    });

    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/data", expect.objectContaining({
      headers: expect.objectContaining({
        accept: "application/json",
        Authorization: "Bearer token123",
      }),
    }));
  });

  it("retries on HTTP 429 with exponential backoff", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"))
      .mockResolvedValueOnce(mockResponse({ retried: true }));

    const result = await fetchWithRetry("https://api.example.com/data", {
      baseDelayMs: 1,
    });

    expect(result).toEqual({ retried: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on network errors with exponential backoff", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(mockResponse({ recovered: true }));

    const result = await fetchWithRetry("https://api.example.com/data", {
      baseDelayMs: 1,
    });

    expect(result).toEqual({ recovered: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries exhausted on 429", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"))
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"))
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"));

    await expect(
      fetchWithRetry("https://api.example.com/data", {
        maxRetries: 3,
        baseDelayMs: 1,
      }),
    ).rejects.toThrow("API request failed after retries");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws after max retries exhausted on network errors", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Timeout 1"))
      .mockRejectedValueOnce(new Error("Timeout 2"))
      .mockRejectedValueOnce(new Error("Timeout 3"));

    await expect(
      fetchWithRetry("https://api.example.com/data", {
        maxRetries: 3,
        baseDelayMs: 1,
      }),
    ).rejects.toThrow("Timeout 3");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff delays (2^attempt * baseDelay)", async () => {
    const sleepCalls: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    // Track sleep durations by spying on setTimeout
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((fn: () => void, delay?: number) => {
        if (delay && delay > 0) sleepCalls.push(delay);
        return originalSetTimeout(fn, 0);
      }) as typeof setTimeout,
    );

    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"))
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"))
      .mockResolvedValueOnce(mockResponse({ success: true }));

    const result = await fetchWithRetry("https://api.example.com/data", {
      maxRetries: 3,
      baseDelayMs: 1000,
    });

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Backoff delays: 1000 * 2^0 = 1000, 1000 * 2^1 = 2000
    expect(sleepCalls).toEqual([1000, 2000]);
  });

  it("retries on non-429 HTTP errors", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 500, "Internal Server Error"))
      .mockResolvedValueOnce(mockResponse({}, 500, "Internal Server Error"))
      .mockResolvedValueOnce(mockResponse({}, 500, "Internal Server Error"));

    await expect(
      fetchWithRetry("https://api.example.com/data", {
        maxRetries: 3,
        baseDelayMs: 1,
      }),
    ).rejects.toThrow("API error: 500 Internal Server Error");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("uses custom errorLabel in error messages", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 500, "Internal Server Error"))
      .mockResolvedValueOnce(mockResponse({}, 500, "Internal Server Error"))
      .mockResolvedValueOnce(mockResponse({}, 500, "Internal Server Error"));

    await expect(
      fetchWithRetry("https://api.example.com/data", {
        maxRetries: 3,
        baseDelayMs: 1,
        errorLabel: "Taostats API",
      }),
    ).rejects.toThrow("Taostats API error: 500 Internal Server Error");
  });

  it("defaults to 3 retries when maxRetries is not specified", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"));

    await expect(
      fetchWithRetry("https://api.example.com/data", {
        baseDelayMs: 1,
      }),
    ).rejects.toThrow("fail 3");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("recovers on second attempt after 429 then success", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"))
      .mockResolvedValueOnce(mockResponse({ data: [1, 2, 3] }));

    const result = await fetchWithRetry("https://api.example.com/data", {
      baseDelayMs: 1,
    });

    expect(result).toEqual({ data: [1, 2, 3] });
  });

  it("handles mixed 429 and network errors across retries", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 429, "Too Many Requests"))
      .mockRejectedValueOnce(new Error("Network failure"))
      .mockResolvedValueOnce(mockResponse({ finally: "ok" }));

    const result = await fetchWithRetry("https://api.example.com/data", {
      maxRetries: 3,
      baseDelayMs: 1,
    });

    expect(result).toEqual({ finally: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
