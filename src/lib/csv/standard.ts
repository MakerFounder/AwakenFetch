/**
 * Generate Awaken Standard CSV from an array of Transaction records.
 *
 * Header:
 * Date,Received Quantity,Received Currency,Received Fiat Amount,
 * Sent Quantity,Sent Currency,Sent Fiat Amount,
 * Fee Amount,Fee Currency,Transaction Hash,Notes,Tag
 */

import type { Transaction } from "@/types";
import { formatDate, formatQuantity, escapeCSVField } from "./utils";

const HEADER =
  "Date,Received Quantity,Received Currency,Received Fiat Amount,Sent Quantity,Sent Currency,Sent Fiat Amount,Fee Amount,Fee Currency,Transaction Hash,Notes,Tag";

function transactionToRow(tx: Transaction): string {
  const fields: string[] = [
    formatDate(tx.date),
    formatQuantity(tx.receivedQuantity),
    tx.receivedCurrency ?? "",
    formatQuantity(tx.receivedFiatAmount),
    formatQuantity(tx.sentQuantity),
    tx.sentCurrency ?? "",
    formatQuantity(tx.sentFiatAmount),
    formatQuantity(tx.feeAmount),
    tx.feeCurrency ?? "",
    tx.txHash ?? "",
    escapeCSVField(tx.notes ?? ""),
    tx.tag ?? "",
  ];
  return fields.join(",");
}

/**
 * Generate a complete Awaken-standard CSV string from transactions.
 */
export function generateStandardCSV(txs: Transaction[]): string {
  const rows = txs.map(transactionToRow);
  return [HEADER, ...rows].join("\n");
}
