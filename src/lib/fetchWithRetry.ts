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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum retry attempts for rate-limited requests. */
const DEFAULT_MAX_RETRIES = 3;

/** Default base delay (ms) for exponential backoff. */
const DEFAULT_BASE_DELAY_MS = 1_000;

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

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const fetchInit: RequestInit = { method, headers };
      if (options?.body) {
        fetchInit.body = options.body;
      }
      const response = await fetch(url, fetchInit);

      if (response.status === 429) {
        // Rate limited — back off and retry
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `${errorLabel} error: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`${errorLabel} request failed after retries`);
}
