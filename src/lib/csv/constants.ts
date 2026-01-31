/**
 * Shared constants for Awaken CSV column headers.
 * See PRD Appendix A for the full column reference.
 */

// ---------------------------------------------------------------------------
// Standard CSV
// ---------------------------------------------------------------------------

/** Column headers for the Awaken standard CSV format (single-asset). */
export const STANDARD_CSV_COLUMNS = [
  "Date",
  "Received Quantity",
  "Received Currency",
  "Received Fiat Amount",
  "Sent Quantity",
  "Sent Currency",
  "Sent Fiat Amount",
  "Fee Amount",
  "Fee Currency",
  "Transaction Hash",
  "Notes",
  "Tag",
] as const;

/** The full header row string for the Awaken standard CSV. */
export const STANDARD_CSV_HEADER = STANDARD_CSV_COLUMNS.join(",");

/**
 * Build multi-asset column headers with a numeric suffix.
 *
 * Awaken supports numbered columns for multi-asset transactions:
 *   Received Quantity 1, Received Currency 1, …, Sent Quantity 2, etc.
 *
 * @param n — the 1-based asset index
 */
export function standardMultiAssetColumns(n: number): string[] {
  return [
    `Received Quantity ${n}`,
    `Received Currency ${n}`,
    `Received Fiat Amount ${n}`,
    `Sent Quantity ${n}`,
    `Sent Currency ${n}`,
    `Sent Fiat Amount ${n}`,
  ];
}

// ---------------------------------------------------------------------------
// Perpetuals CSV
// ---------------------------------------------------------------------------

/** Column headers for the Awaken perpetuals CSV format. */
export const PERP_CSV_COLUMNS = [
  "Date",
  "Asset",
  "Amount",
  "Fee",
  "P&L",
  "Payment Token",
  "Notes",
  "Transaction Hash",
  "Tag",
] as const;

/** The full header row string for the Awaken perpetuals CSV. */
export const PERP_CSV_HEADER = PERP_CSV_COLUMNS.join(",");

/** Valid tags for perpetual transactions. */
export const PERP_TAGS = [
  "open_position",
  "close_position",
  "funding_payment",
] as const;

export type PerpTagValue = (typeof PERP_TAGS)[number];
