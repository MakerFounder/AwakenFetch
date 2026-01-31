/**
 * Generate Awaken Perpetuals CSV from an array of PerpTransaction records.
 *
 * Header:
 * Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag
 */

import type { PerpTransaction } from "@/types";
import { formatDate, formatQuantity, escapeCSVField } from "./utils";
import { PERP_CSV_HEADER } from "./constants";

/**
 * Format P&L — this is the one field that may be negative per Awaken spec.
 * Uses toFixed(8) to avoid scientific notation, then strips trailing zeros.
 */
function formatPnL(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) return "0";
  const fixed = value.toFixed(8);
  // Remove trailing zeros after the decimal point, then trailing dot
  const trimmed = fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return trimmed;
}

function perpToRow(tx: PerpTransaction): string {
  const fields: string[] = [
    formatDate(tx.date),
    tx.asset,
    formatQuantity(tx.amount),
    formatQuantity(tx.fee),
    formatPnL(tx.pnl),
    tx.paymentToken,
    escapeCSVField(tx.notes ?? ""),
    tx.txHash ?? "",
    tx.tag,
  ];
  return fields.join(",");
}

/**
 * Generate a complete Awaken-perpetuals CSV string from perp transactions.
 */
export function generatePerpCSV(txs: PerpTransaction[]): string {
  const rows = txs.map(perpToRow);
  return [PERP_CSV_HEADER, ...rows].join("\n");
}
