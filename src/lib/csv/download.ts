/**
 * CSV file download utility.
 *
 * Generates a filename following the convention:
 *   awakenfetch_{chain}_{address_short}_{date}.csv
 *
 * Where:
 *   - chain: lowercase chain identifier (e.g. "bittensor")
 *   - address_short: first 8 characters of the wallet address
 *   - date: YYYYMMDD in UTC at the time of download
 */

/**
 * Build the download filename.
 *
 * @param chain     - Chain identifier (e.g. "bittensor", "kaspa")
 * @param address   - Full wallet address
 * @param timestamp - Optional Date for the filename (defaults to now)
 * @param variant   - Optional CSV variant ("standard" or "perps", defaults to "standard")
 * @returns Formatted filename string
 */
export function buildCSVFilename(
  chain: string,
  address: string,
  timestamp?: Date,
  variant: "standard" | "perps" = "standard",
): string {
  const d = timestamp ?? new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;

  const chainLower = chain.toLowerCase();
  const addressShort = address.slice(0, 8);

  const suffix = variant === "perps" ? "_perps" : "";
  return `awakenfetch_${chainLower}_${addressShort}_${dateStr}${suffix}.csv`;
}

/**
 * Trigger a browser download for a CSV string.
 *
 * Creates a temporary Blob URL, clicks a hidden anchor element, then
 * revokes the URL. This is a client-side–only function.
 *
 * @param csvContent - The full CSV string to download
 * @param filename   - The filename for the downloaded file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
