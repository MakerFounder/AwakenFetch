/**
 * Shared HTTP fetch utility with exponential backoff retry and rate-limit handling.
 *
 * All chain adapters use this to make API requests with:
 *   - Automatic retry on 429 (Too Many Requests) responses
 *   - Exponential backoff with configurable base delay
 *   - Configurable max retries (default: 3)
 *   - Custom headers support (e.g. for API keys)
 *   - Configurable error label for descriptive error messages
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for configuring fetchWithRetry behavior. */
export interface FetchWithRetryOptions {
  /** Custom headers to include in the request. */
  headers?: Record<string, string>;
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000). */
  baseDelayMs?: number;
  /** Label used in error messages (e.g. "Taostats API"). */
  errorLabel?: string;
  /** HTTP method (default: "GET"). */
  method?: string;
  /** Request body (for POST/PUT requests). */
  body?: string;
  /**
   * Optional throttle key (typically the API host). When set, requests sharing
   * the same key are spaced at least `throttleMs` apart to proactively avoid
   * rate limits — much faster than hitting 429 and waiting for a cooldown.
   */
  throttleKey?: string;
  /** Minimum interval (ms) between requests sharing the same throttleKey. */
  throttleMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum retry attempts for rate-limited requests. */
const DEFAULT_MAX_RETRIES = 3;

/** Default base delay (ms) for exponential backoff. */
const DEFAULT_BASE_DELAY_MS = 1_000;

/** Maximum number of 429 rate-limit retries (separate from error retries). */
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 10;

/** Base delay (ms) for rate-limit backoff — a safety net when proactive throttling misses. */
const RATE_LIMIT_BASE_DELAY_MS = 500;

/** Maximum rate-limit backoff delay (ms). */
const RATE_LIMIT_MAX_DELAY_MS = 8_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

/** Tracks the last request timestamp per throttle key. */
const throttleTimestamps = new Map<string, number>();

/**
 * Fetch JSON from a URL with exponential backoff retry on rate limits and errors.
 *
 * - On HTTP 429 responses, waits with exponential backoff and retries.
 * - On network errors, waits with exponential backoff and retries.
 * - On other HTTP errors, throws immediately.
 *
 * @param url - The URL to fetch.
 * @param options - Configuration options for retry behavior.
 * @returns The parsed JSON response.
 * @throws Error after all retries are exhausted or on non-retryable HTTP errors.
 */
export async function fetchWithRetry<T>(
  url: string,
  options?: FetchWithRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const errorLabel = options?.errorLabel ?? "API";
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    accept: "application/json",
    ...options?.headers,
  };

  // Proactive throttle: wait if we're calling this host too fast
  if (options?.throttleKey && options.throttleMs) {
    const lastCall = throttleTimestamps.get(options.throttleKey) ?? 0;
    const elapsed = Date.now() - lastCall;
    if (elapsed < options.throttleMs) {
      await sleep(options.throttleMs - elapsed);
    }
  }

  let lastError: Error | null = null;
  let rateLimitRetries = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const fetchInit: RequestInit = { method, headers };
      if (options?.body) {
        fetchInit.body = options.body;
      }

      if (options?.throttleKey) {
        throttleTimestamps.set(options.throttleKey, Date.now());
      }

      const response = await fetch(url, fetchInit);

      if (response.status === 429) {
        rateLimitRetries++;
        if (rateLimitRetries > DEFAULT_MAX_RATE_LIMIT_RETRIES) {
          throw new RateLimitExceededError(
            `${errorLabel} rate limit exceeded after ${rateLimitRetries} retries`,
          );
        }
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter && !Number.isNaN(Number(retryAfter))
          ? Math.min(Number(retryAfter) * 1_000, RATE_LIMIT_MAX_DELAY_MS)
          : Math.min(
              RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, rateLimitRetries - 1),
              RATE_LIMIT_MAX_DELAY_MS,
            );
        await sleep(delay);
        attempt--;
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `${errorLabel} error: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`${errorLabel} request failed after retries`);
}

class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}
