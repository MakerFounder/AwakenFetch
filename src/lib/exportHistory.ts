/**
 * Export history tracking via localStorage.
 *
 * Records when a CSV export has been performed for a given
 * (chainId, address, dateRange, variant) combination so the UI can
 * warn users about potential duplicate imports into Awaken.
 */

const STORAGE_KEY = "awakenfetch_export_history";

export interface ExportRecord {
  /** ISO timestamp of the export. */
  exportedAt: string;
}

/**
 * Build a deterministic key for an export combination.
 */
export function buildExportKey(
  chainId: string,
  address: string,
  fromDate: string,
  toDate: string,
  variant: "standard" | "perps" = "standard",
): string {
  return `${chainId}:${address.toLowerCase()}:${fromDate}:${toDate}:${variant}`;
}

/**
 * Read the full export history map from localStorage.
 */
function readHistory(): Record<string, ExportRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ExportRecord>;
  } catch {
    return {};
  }
}

/**
 * Persist the export history map to localStorage.
 */
function writeHistory(history: Record<string, ExportRecord>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Check whether a given export combination has been exported before.
 */
export function hasBeenExported(key: string): boolean {
  const history = readHistory();
  return key in history;
}

/**
 * Get the export record for a given key, or undefined if not found.
 */
export function getExportRecord(key: string): ExportRecord | undefined {
  const history = readHistory();
  return history[key];
}

/**
 * Record that an export was performed.
 */
export function recordExport(key: string): void {
  const history = readHistory();
  history[key] = { exportedAt: new Date().toISOString() };
  writeHistory(history);
}
