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
        className="cursor-pointer rounded-lg border border-foreground/20 bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
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
