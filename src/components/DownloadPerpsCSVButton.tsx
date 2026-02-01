"use client";

/**
 * DownloadPerpsCSVButton — triggers generation and download of an Awaken
 * perpetuals CSV for the currently filtered perp transactions.
 *
 * Only rendered when a perps-capable chain/protocol is selected.
 * Shows a duplicate export warning if the same address + date range
 * has been exported before.
 */

import { useState, useCallback } from "react";
import type { PerpTransaction } from "@/types";
import type { DateRange } from "@/components/DateRangeFilter";
import { generatePerpCSV, buildCSVFilename, downloadCSV } from "@/lib/csv";
import {
  buildExportKey,
  hasBeenExported,
  recordExport,
} from "@/lib/exportHistory";
import { DuplicateExportWarning } from "@/components/DuplicateExportWarning";

export interface DownloadPerpsCSVButtonProps {
  /** Perp transactions to include in the CSV. */
  perpTransactions: PerpTransaction[];
  /** Chain identifier used for the filename. */
  chainId: string;
  /** Wallet address used for the filename. */
  address: string;
  /** Active date range for duplicate detection. */
  dateRange?: DateRange | null;
  /** Whether the button should be disabled. */
  disabled?: boolean;
}

export function DownloadPerpsCSVButton({
  perpTransactions,
  chainId,
  address,
  dateRange,
  disabled = false,
}: DownloadPerpsCSVButtonProps) {
  const [showWarning, setShowWarning] = useState(false);

  const performDownload = useCallback(() => {
    if (perpTransactions.length === 0) return;

    const csvContent = generatePerpCSV(perpTransactions);
    const filename = buildCSVFilename(chainId, address, undefined, "perps");
    downloadCSV(csvContent, filename);

    // Record the export
    if (dateRange) {
      const key = buildExportKey(
        chainId,
        address,
        dateRange.fromDate,
        dateRange.toDate,
        "perps",
      );
      recordExport(key);
    }
  }, [perpTransactions, chainId, address, dateRange]);

  const handleDownload = useCallback(() => {
    if (perpTransactions.length === 0) return;

    // Check for duplicate export
    if (dateRange) {
      const key = buildExportKey(
        chainId,
        address,
        dateRange.fromDate,
        dateRange.toDate,
        "perps",
      );
      if (hasBeenExported(key)) {
        setShowWarning(true);
        return;
      }
    }

    performDownload();
  }, [perpTransactions, chainId, address, dateRange, performDownload]);

  const handleConfirm = useCallback(() => {
    setShowWarning(false);
    performDownload();
  }, [performDownload]);

  const handleCancel = useCallback(() => {
    setShowWarning(false);
  }, []);

  const isDisabled = disabled || perpTransactions.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDisabled}
        className="cursor-pointer rounded-xl border border-border bg-transparent px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-border-hover hover:bg-surface active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Download Perps CSV
      </button>
      <DuplicateExportWarning
        open={showWarning}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
