"use client";

/**
 * DuplicateExportWarning — a confirmation dialog shown when the user
 * attempts to re-export the same address + date range combination.
 *
 * Warns that importing again may create duplicate entries in Awaken.
 */

export interface DuplicateExportWarningProps {
  /** Whether the dialog is currently visible. */
  open: boolean;
  /** Called when the user confirms they want to proceed with the export. */
  onConfirm: () => void;
  /** Called when the user cancels the export. */
  onCancel: () => void;
}

export function DuplicateExportWarning({
  open,
  onConfirm,
  onCancel,
}: DuplicateExportWarningProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-export-title"
    >
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-1 flex items-center gap-2">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0 text-warning"
          >
            <path
              d="M10 2L1 18h18L10 2z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M10 8v4M10 14.5v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <h2
            id="duplicate-export-title"
            className="font-display text-base text-foreground"
          >
            Duplicate Export Warning
          </h2>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          You have already exported a CSV for this address and date range.
          Importing this file again into Awaken may create duplicate
          transactions.
        </p>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:opacity-90"
          >
            Export Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
