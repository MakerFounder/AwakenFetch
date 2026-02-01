"use client";

/**
 * DownloadCSVButton — triggers generation and download of an Awaken-standard
 * CSV for the currently filtered transactions.
 *
 * Shows a duplicate export warning if the same address + date range
 * has been exported before.
 */

import { useState, useCallback } from "react";
import type { Transaction } from "@/types";
import type { DateRange } from "@/components/DateRangeFilter";
import { generateStandardCSV, buildCSVFilename, downloadCSV } from "@/lib/csv";
import {
  buildExportKey,
  hasBeenExported,
  recordExport,
} from "@/lib/exportHistory";
import { DuplicateExportWarning } from "@/components/DuplicateExportWarning";

export interface DownloadCSVButtonProps {
  /** Transactions to include in the CSV (already filtered). */
  transactions: Transaction[];
  /** Chain identifier used for the filename. */
  chainId: string;
  /** Wallet address used for the filename. */
  address: string;
  /** Active date range for duplicate detection. */
  dateRange?: DateRange | null;
  /** Whether the button should be disabled. */
  disabled?: boolean;
}

export function DownloadCSVButton({
  transactions,
  chainId,
  address,
  dateRange,
  disabled = false,
}: DownloadCSVButtonProps) {
  const [showWarning, setShowWarning] = useState(false);

  const performDownload = useCallback(() => {
    if (transactions.length === 0) return;

    const csvContent = generateStandardCSV(transactions);
    const filename = buildCSVFilename(chainId, address);
    downloadCSV(csvContent, filename);

    // Record the export
    if (dateRange) {
      const key = buildExportKey(
        chainId,
        address,
        dateRange.fromDate,
        dateRange.toDate,
        "standard",
      );
      recordExport(key);
    }
  }, [transactions, chainId, address, dateRange]);

  const handleDownload = useCallback(() => {
    if (transactions.length === 0) return;

    // Check for duplicate export
    if (dateRange) {
      const key = buildExportKey(
        chainId,
        address,
        dateRange.fromDate,
        dateRange.toDate,
        "standard",
      );
      if (hasBeenExported(key)) {
        setShowWarning(true);
        return;
      }
    }

    performDownload();
  }, [transactions, chainId, address, dateRange, performDownload]);

  const handleConfirm = useCallback(() => {
    setShowWarning(false);
    performDownload();
  }, [performDownload]);

  const handleCancel = useCallback(() => {
    setShowWarning(false);
  }, []);

  const isDisabled = disabled || transactions.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDisabled}
        className="cursor-pointer rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Download CSV
      </button>
      <DuplicateExportWarning
        open={showWarning}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
