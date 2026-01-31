"use client";

/**
 * DownloadPerpsCSVButton — triggers generation and download of an Awaken
 * perpetuals CSV for the currently filtered perp transactions.
 *
 * Only rendered when a perps-capable chain/protocol is selected.
 */

import { useCallback } from "react";
import type { PerpTransaction } from "@/types";
import { generatePerpCSV, buildCSVFilename, downloadCSV } from "@/lib/csv";

export interface DownloadPerpsCSVButtonProps {
  /** Perp transactions to include in the CSV. */
  perpTransactions: PerpTransaction[];
  /** Chain identifier used for the filename. */
  chainId: string;
  /** Wallet address used for the filename. */
  address: string;
  /** Whether the button should be disabled. */
  disabled?: boolean;
}

export function DownloadPerpsCSVButton({
  perpTransactions,
  chainId,
  address,
  disabled = false,
}: DownloadPerpsCSVButtonProps) {
  const handleDownload = useCallback(() => {
    if (perpTransactions.length === 0) return;

    const csvContent = generatePerpCSV(perpTransactions);
    const filename = buildCSVFilename(chainId, address, undefined, "perps");
    downloadCSV(csvContent, filename);
  }, [perpTransactions, chainId, address]);

  const isDisabled = disabled || perpTransactions.length === 0;

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isDisabled}
      className="cursor-pointer rounded-lg border border-foreground/20 bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Download Perps CSV
    </button>
  );
}
