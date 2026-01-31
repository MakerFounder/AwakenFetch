"use client";

/**
 * FetchStatus — displays fetch progress, transaction count, warnings, and errors.
 *
 * Shows:
 *   - A spinner + message while loading
 *   - Streaming progress with live transaction count
 *   - Transaction count on success
 *   - Non-blocking warnings during retries
 *   - Error message with a manual retry button when all retries are exhausted
 */

import type { FetchStatus as FetchStatusType } from "@/lib/useFetchTransactions";

export interface FetchStatusProps {
  /** Current fetch status. */
  status: FetchStatusType;
  /** Number of transactions fetched. */
  transactionCount: number;
  /** Error message to display. */
  error: string | null;
  /** Non-blocking warning messages. */
  warnings: string[];
  /** Whether manual retry is available. */
  canRetry: boolean;
  /** Callback to retry the last fetch. */
  onRetry: () => void;
  /** Callback to dismiss / reset. */
  onDismiss: () => void;
}

export function FetchStatus({
  status,
  transactionCount,
  error,
  warnings,
  canRetry,
  onRetry,
  onDismiss,
}: FetchStatusProps) {
  if (status === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full flex-col gap-3"
    >
      {/* Loading state */}
      {status === "loading" && (
        <div className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-3">
          <Spinner />
          <span className="text-sm text-foreground/70">
            Fetching transactions…
          </span>
        </div>
      )}

      {/* Streaming state — results appearing incrementally */}
      {status === "streaming" && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
          <Spinner />
          <span className="text-sm text-blue-700 dark:text-blue-400">
            Streaming transactions…{" "}
            <strong>{transactionCount.toLocaleString()}</strong>{" "}
            fetched so far
          </span>
        </div>
      )}

      {/* Non-blocking warnings (shown during retries) */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5"
            >
              <WarningIcon />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {warning}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {status === "error" && error && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <ErrorIcon />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
          <div className="flex gap-2">
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="cursor-pointer rounded-md border border-foreground/20 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/40"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Success state */}
      {status === "success" && (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <SuccessIcon />
            <span className="text-sm text-green-700 dark:text-green-400">
              Fetched{" "}
              <strong>{transactionCount.toLocaleString()}</strong>{" "}
              transaction{transactionCount !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="cursor-pointer text-green-700/60 transition-colors hover:text-green-700 dark:text-green-400/60 dark:hover:text-green-400"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-foreground/50"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="10"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8 1L15 14H1L8 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 8L7 10.5L11 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
