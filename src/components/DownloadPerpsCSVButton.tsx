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
        className="cursor-pointer rounded-lg border border-foreground/20 bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
      >
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
