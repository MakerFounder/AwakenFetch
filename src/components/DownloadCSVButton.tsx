"use client";

/**
 * DownloadCSVButton — triggers generation and download of an Awaken-standard
 * CSV for the currently filtered transactions.
 */

import { useCallback } from "react";
import type { Transaction } from "@/types";
import { generateStandardCSV, buildCSVFilename, downloadCSV } from "@/lib/csv";

export interface DownloadCSVButtonProps {
  /** Transactions to include in the CSV (already filtered). */
  transactions: Transaction[];
  /** Chain identifier used for the filename. */
  chainId: string;
  /** Wallet address used for the filename. */
  address: string;
  /** Whether the button should be disabled. */
  disabled?: boolean;
}

export function DownloadCSVButton({
  transactions,
  chainId,
  address,
  disabled = false,
}: DownloadCSVButtonProps) {
  const handleDownload = useCallback(() => {
    if (transactions.length === 0) return;

    const csvContent = generateStandardCSV(transactions);
    const filename = buildCSVFilename(chainId, address);
    downloadCSV(csvContent, filename);
  }, [transactions, chainId, address]);

  const isDisabled = disabled || transactions.length === 0;

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isDisabled}
      className="cursor-pointer rounded-lg border border-foreground/20 bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Download CSV
    </button>
  );
}
