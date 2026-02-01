/**
 * Shared CSV formatting helpers.
 */

/**
 * Format a Date as MM/DD/YYYY HH:MM:SS in UTC.
 * Awaken requires this exact format.
 */
export function formatDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}:${ss}`;
}

/**
 * Format a quantity removing trailing zeros.
 * Returns an empty string for undefined/null values.
 * Ensures no negative numbers (takes absolute value).
 * Avoids scientific notation for very small numbers (e.g. 1e-15 from 18-decimal chains).
 */
export function formatQuantity(value: number | undefined): string {
  if (value === undefined || value === null) return "";
  if (Number.isNaN(value) || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  const str = abs.toString();
  if (str.includes("e")) {
    const fixed = abs.toFixed(18);
    return fixed.replace(/\.?0+$/, "");
  }
  return str;
}

/**
 * Escape a CSV field value. Wraps in quotes if the value contains
 * commas, quotes, or newlines.
 */
export function escapeCSVField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
