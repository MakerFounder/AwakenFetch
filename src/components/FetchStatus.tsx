"use client";

import type { FetchStatus as FetchStatusType } from "@/lib/useFetchTransactions";

const LARGE_WALLET_THRESHOLD = 5_000;

export interface FetchStatusProps {
  status: FetchStatusType;
  transactionCount: number;
  estimatedTotal: number | null;
  error: string | null;
  warnings: string[];
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
  onCancel: () => void;
}

export function FetchStatus({
  status,
  transactionCount,
  estimatedTotal,
  error,
  warnings,
  canRetry,
  onRetry,
  onDismiss,
  onCancel,
}: FetchStatusProps) {
  if (status === "idle") return null;

  const isActive = status === "loading" || status === "streaming";
  const progress = estimatedTotal && estimatedTotal > 0
    ? Math.min(transactionCount / estimatedTotal, 0.99)
    : null;
  const showLargeWarning = isActive && estimatedTotal !== null && estimatedTotal > LARGE_WALLET_THRESHOLD;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full flex-col gap-3"
    >
      {status === "loading" && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <Spinner />
          <span className="text-sm text-muted">
            Fetching transactions...
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer ml-auto rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {status === "streaming" && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-accent">
              {estimatedTotal ? (
                <>
                  Fetching...{" "}
                  <strong>{transactionCount.toLocaleString()}</strong>{" "}
                  of ~<strong>{estimatedTotal.toLocaleString()}</strong>{" "}
                  transactions
                </>
              ) : (
                <>
                  Streaming transactions...{" "}
                  <strong>{transactionCount.toLocaleString()}</strong>{" "}
                  fetched so far
                </>
              )}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer ml-auto rounded-lg border border-accent/30 px-3 py-1 text-xs font-medium text-accent/70 transition-colors hover:border-accent hover:text-accent"
            >
              {transactionCount > 0 ? "Stop & use fetched" : "Cancel"}
            </button>
          </div>
          {progress !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/10">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${(progress * 100).toFixed(1)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {showLargeWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-2.5">
          <WarningIcon />
          <p className="text-xs text-warning">
            This address has ~{estimatedTotal!.toLocaleString()} transactions in the selected period.
            Consider narrowing your date range for faster results, or click &ldquo;Stop &amp; use fetched&rdquo; to work with what&apos;s been loaded so far.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-2.5"
            >
              <WarningIcon />
              <p className="text-xs text-warning">
                {warning}
              </p>
            </div>
          ))}
        </div>
      )}

      {status === "error" && error && (
        <div className="flex flex-col gap-2 rounded-xl border border-error/30 bg-error/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <ErrorIcon />
            <p className="text-sm text-error">{error}</p>
          </div>
          <div className="flex gap-2">
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <SuccessIcon />
            <span className="text-sm text-success">
              Fetched{" "}
              <strong>{transactionCount.toLocaleString()}</strong>{" "}
              transaction{transactionCount !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="cursor-pointer text-success/60 transition-colors hover:text-success"
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

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-accent"
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
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
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
      className="mt-0.5 h-4 w-4 shrink-0 text-error"
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
      className="h-4 w-4 shrink-0 text-success"
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
