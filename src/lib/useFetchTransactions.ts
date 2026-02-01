"use client";

/**
 * Custom hook for fetching transactions via the proxy API route.
 *
 * Manages the full lifecycle: idle → loading → success/error,
 * with automatic retry on failure (max 3 attempts) and progress tracking.
 *
 * For large wallets, uses NDJSON streaming to display results incrementally
 * as they are fetched from chain adapters.
 */

import { useState, useCallback, useRef } from "react";
import type { Transaction } from "@/types";
import {
  buildCacheKey,
  getCachedTransactions,
  setCachedTransactions,
} from "@/lib/transactionCache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FetchStatus = "idle" | "loading" | "streaming" | "success" | "error";

export interface FetchState {
  /** Current status of the fetch operation. */
  status: FetchStatus;
  /** Fetched transactions on success. */
  transactions: Transaction[];
  /** Number of transactions fetched so far (for progress display). */
  transactionCount: number;
  /** Estimated total number of transactions (from adapter pagination, if available). */
  estimatedTotal: number | null;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Non-blocking warnings encountered during the fetch. */
  warnings: string[];
  /** Number of retry attempts made so far. */
  retryCount: number;
}

export interface UseFetchTransactionsReturn extends FetchState {
  /** Start fetching transactions for the given address and chain. */
  fetchTransactions: (
    address: string,
    chainId: string,
    dateRange?: { fromDate: string; toDate: string },
  ) => Promise<void>;
  /** Retry the last failed fetch. */
  retry: () => Promise<void>;
  /** Reset the state back to idle. */
  reset: () => void;
  /** Cancel the current in-flight fetch. */
  cancel: () => void;
  /** Whether a retry is possible (error state and retries remaining). */
  canRetry: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of automatic + manual retry attempts. */
const MAX_RETRIES = 3;

/** Base delay (ms) for retry backoff. */
const RETRY_BASE_DELAY_MS = 1_500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deserialise a transaction from the proxy API JSON response.
 * Converts ISO date strings back to Date objects.
 */
function deserialiseTransaction(raw: Record<string, unknown>): Transaction {
  return {
    ...raw,
    date: new Date(raw.date as string),
  } as Transaction;
}

/** NDJSON message types from the streaming endpoint. */
interface StreamBatchMessage {
  type: "batch";
  transactions: Record<string, unknown>[];
}

interface StreamMetaMessage {
  type: "meta";
  estimatedTotal: number;
}

interface StreamDoneMessage {
  type: "done";
  total: number;
}

interface StreamErrorMessage {
  type: "error";
  error: string;
}

type StreamMessage = StreamBatchMessage | StreamMetaMessage | StreamDoneMessage | StreamErrorMessage;

/**
 * Build the query parameter string for proxy requests.
 */
function buildQueryParams(
  address: string,
  dateRange?: { fromDate: string; toDate: string },
): string {
  const params = new URLSearchParams({ address });
  if (dateRange?.fromDate) {
    params.set("fromDate", new Date(dateRange.fromDate).toISOString());
  }
  if (dateRange?.toDate) {
    // Set toDate to end of day (23:59:59.999 UTC)
    const endOfDay = new Date(dateRange.toDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    params.set("toDate", endOfDay.toISOString());
  }
  return params.toString();
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: FetchState = {
  status: "idle",
  transactions: [],
  transactionCount: 0,
  estimatedTotal: null,
  error: null,
  warnings: [],
  retryCount: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFetchTransactions(): UseFetchTransactionsReturn {
  const [state, setState] = useState<FetchState>(initialState);
  const lastParamsRef = useRef<{
    address: string;
    chainId: string;
    dateRange?: { fromDate: string; toDate: string };
  } | null>(null);
  /** Abort controller for cancelling in-flight requests. */
  const abortRef = useRef<AbortController | null>(null);

  const fetchTransactions = useCallback(
    async (
      address: string,
      chainId: string,
      dateRange?: { fromDate: string; toDate: string },
    ) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      lastParamsRef.current = { address, chainId, dateRange };

      // Check localStorage cache before hitting the network
      const cacheKey = buildCacheKey(
        chainId,
        address,
        dateRange?.fromDate,
        dateRange?.toDate,
      );
      const cached = getCachedTransactions(cacheKey);
      if (cached) {
        setState({
          status: "success",
          transactions: cached,
          transactionCount: cached.length,
          estimatedTotal: null,
          error: null,
          warnings: [],
          retryCount: 0,
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        status: "loading",
        transactions: [],
        transactionCount: 0,
        estimatedTotal: null,
        error: null,
        warnings: [],
        retryCount: 0,
      }));

      await executeStreamingFetch(address, chainId, dateRange, 0, controller.signal);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Execute a streaming fetch using the NDJSON streaming endpoint.
   * Falls back to the standard non-streaming endpoint on failure.
   */
  const executeStreamingFetch = useCallback(
    async (
      address: string,
      chainId: string,
      dateRange: { fromDate: string; toDate: string } | undefined,
      attempt: number,
      signal: AbortSignal,
    ) => {
      try {
        const queryString = buildQueryParams(address, dateRange);
        const res = await fetch(
          `/api/proxy/${chainId}/stream?${queryString}`,
          { signal },
        );

        if (signal.aborted) return;

        if (!res.ok) {
          // Fall back to non-streaming fetch on error
          await executeFetch(address, chainId, dateRange, attempt, signal);
          return;
        }

        // Check if we got a streaming response
        const contentType = res.headers.get("Content-Type") ?? "";
        if (!contentType.includes("ndjson")) {
          // Not a streaming response — fall back
          await executeFetch(address, chainId, dateRange, attempt, signal);
          return;
        }

        // Read the NDJSON stream
        const reader = res.body?.getReader();
        if (!reader) {
          await executeFetch(address, chainId, dateRange, attempt, signal);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        const allTransactions: Transaction[] = [];

        while (true) {
          if (signal.aborted) {
            reader.cancel();
            return;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const msg = JSON.parse(trimmed) as StreamMessage;

              if (msg.type === "meta") {
                setState((prev) => ({
                  ...prev,
                  estimatedTotal: msg.estimatedTotal,
                }));
              } else if (msg.type === "batch") {
                const batch = msg.transactions.map(deserialiseTransaction);
                allTransactions.push(...batch);

                // Update state incrementally — show results as they stream in
                setState((prev) => ({
                  ...prev,
                  status: "streaming",
                  transactions: [...allTransactions],
                  transactionCount: allTransactions.length,
                }));
              } else if (msg.type === "done") {
                // Persist to localStorage cache
                const cacheKey = buildCacheKey(
                  chainId,
                  address,
                  dateRange?.fromDate,
                  dateRange?.toDate,
                );
                setCachedTransactions(cacheKey, allTransactions);

                setState((prev) => ({
                  ...prev,
                  status: "success",
                  transactions: allTransactions,
                  transactionCount: allTransactions.length,
                  error: null,
                }));
              } else if (msg.type === "error") {
                // Handle streaming error with retry logic
                if (attempt < MAX_RETRIES) {
                  const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                  setState((prev) => ({
                    ...prev,
                    warnings: [
                      ...prev.warnings,
                      `Retry ${attempt + 1}/${MAX_RETRIES}: ${msg.error}. Retrying in ${(delay / 1000).toFixed(1)}s…`,
                    ],
                    retryCount: attempt + 1,
                  }));
                  await sleep(delay);
                  if (!signal.aborted) {
                    await executeStreamingFetch(
                      address,
                      chainId,
                      dateRange,
                      attempt + 1,
                      signal,
                    );
                  }
                  return;
                }

                setState((prev) => ({
                  ...prev,
                  status: "error",
                  error: msg.error,
                  retryCount: attempt,
                }));
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err: unknown) {
        if (signal.aborted) return;

        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";

        // Auto-retry on network errors if retries remain
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          setState((prev) => ({
            ...prev,
            warnings: [
              ...prev.warnings,
              `Retry ${attempt + 1}/${MAX_RETRIES}: ${message}. Retrying in ${(delay / 1000).toFixed(1)}s…`,
            ],
            retryCount: attempt + 1,
          }));
          await sleep(delay);
          if (!signal.aborted) {
            await executeStreamingFetch(
              address,
              chainId,
              dateRange,
              attempt + 1,
              signal,
            );
          }
          return;
        }

        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          retryCount: attempt,
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Legacy non-streaming fetch. Used as fallback when streaming is unavailable.
   */
  const executeFetch = useCallback(
    async (
      address: string,
      chainId: string,
      dateRange: { fromDate: string; toDate: string } | undefined,
      attempt: number,
      signal: AbortSignal,
    ) => {
      try {
        const queryString = buildQueryParams(address, dateRange);
        const res = await fetch(`/api/proxy/${chainId}?${queryString}`, {
          signal,
        });

        if (signal.aborted) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Unknown error" }));
          const errorMessage =
            (body as { error?: string }).error ??
            `Request failed with status ${res.status}`;

          // Auto-retry on 429 or 5xx if retries remain
          if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            setState((prev) => ({
              ...prev,
              warnings: [
                ...prev.warnings,
                `Retry ${attempt + 1}/${MAX_RETRIES}: ${errorMessage}. Retrying in ${(delay / 1000).toFixed(1)}s…`,
              ],
              retryCount: attempt + 1,
            }));
            await sleep(delay);
            if (!signal.aborted) {
              await executeFetch(address, chainId, dateRange, attempt + 1, signal);
            }
            return;
          }

          // Non-retryable or retries exhausted
          setState((prev) => ({
            ...prev,
            status: "error",
            error: errorMessage,
            retryCount: attempt,
          }));
          return;
        }

        const data = (await res.json()) as {
          transactions: Record<string, unknown>[];
        };

        if (signal.aborted) return;

        const transactions = data.transactions.map(deserialiseTransaction);

        // Persist to localStorage cache for future re-exports
        const cacheKey = buildCacheKey(
          chainId,
          address,
          dateRange?.fromDate,
          dateRange?.toDate,
        );
        setCachedTransactions(cacheKey, transactions);

        setState((prev) => ({
          ...prev,
          status: "success",
          transactions,
          transactionCount: transactions.length,
          error: null,
        }));
      } catch (err: unknown) {
        if (signal.aborted) return;

        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";

        // Auto-retry on network errors if retries remain
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          setState((prev) => ({
            ...prev,
            warnings: [
              ...prev.warnings,
              `Retry ${attempt + 1}/${MAX_RETRIES}: ${message}. Retrying in ${(delay / 1000).toFixed(1)}s…`,
            ],
            retryCount: attempt + 1,
          }));
          await sleep(delay);
          if (!signal.aborted) {
            await executeFetch(address, chainId, dateRange, attempt + 1, signal);
          }
          return;
        }

        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          retryCount: attempt,
        }));
      }
    },
    [],
  );

  const retry = useCallback(async () => {
    const params = lastParamsRef.current;
    if (!params || state.status !== "error") return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const nextAttempt = state.retryCount;
    if (nextAttempt >= MAX_RETRIES) return;

    setState((prev) => ({
      ...prev,
      status: "loading",
      error: null,
    }));

    await executeStreamingFetch(
      params.address,
      params.chainId,
      params.dateRange,
      nextAttempt,
      controller.signal,
    );
  }, [state.status, state.retryCount, executeStreamingFetch]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({
      ...prev,
      status: prev.transactions.length > 0 ? "success" : "idle",
      estimatedTotal: null,
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initialState);
    lastParamsRef.current = null;
  }, []);

  const canRetry =
    state.status === "error" && state.retryCount < MAX_RETRIES;

  return {
    ...state,
    fetchTransactions,
    retry,
    reset,
    cancel,
    canRetry,
  };
}
