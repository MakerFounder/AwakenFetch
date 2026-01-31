/**
 * Generate Awaken Standard CSV from an array of Transaction records.
 *
 * Header:
 * Date,Received Quantity,Received Currency,Received Fiat Amount,
 * Sent Quantity,Sent Currency,Sent Fiat Amount,
 * Fee Amount,Fee Currency,Transaction Hash,Notes,Tag
 *
 * Multi-asset transactions use numbered suffixes:
 * Received Quantity 1, Received Currency 1, ..., Sent Quantity 2, etc.
 */

import type { Transaction, AssetEntry } from "@/types";
import { formatDate, formatQuantity, escapeCSVField } from "./utils";
import { STANDARD_CSV_HEADER, standardMultiAssetColumns } from "./constants";

/**
 * Determine the maximum number of asset slots needed across all transactions.
 * Returns 0 if no multi-asset transactions exist.
 */
function getMaxAssetSlots(txs: Transaction[]): number {
  let max = 0;
  for (const tx of txs) {
    const receivedCount =
      1 + (tx.additionalReceived ? tx.additionalReceived.length : 0);
    const sentCount =
      1 + (tx.additionalSent ? tx.additionalSent.length : 0);
    const hasMulti =
      (tx.additionalReceived && tx.additionalReceived.length > 0) ||
      (tx.additionalSent && tx.additionalSent.length > 0);
    if (hasMulti) {
      max = Math.max(max, receivedCount, sentCount);
    }
  }
  return max;
}

/**
 * Build the header row. If any transaction has multi-asset entries,
 * use numbered columns for all asset slots instead of the default header.
 */
function buildHeader(maxSlots: number): string {
  if (maxSlots === 0) {
    return STANDARD_CSV_HEADER;
  }

  const columns: string[] = ["Date"];
  for (let i = 1; i <= maxSlots; i++) {
    columns.push(...standardMultiAssetColumns(i));
  }
  columns.push("Fee Amount", "Fee Currency", "Transaction Hash", "Notes", "Tag");
  return columns.join(",");
}

/**
 * Convert a single transaction to a CSV row string.
 *
 * @param tx - The transaction to convert
 * @param maxSlots - Number of multi-asset slots (0 = single-asset mode)
 */
function transactionToRow(tx: Transaction, maxSlots: number): string {
  const fields: string[] = [formatDate(tx.date)];

  if (maxSlots === 0) {
    // Single-asset mode: standard columns
    fields.push(
      formatQuantity(tx.receivedQuantity),
      tx.receivedCurrency ?? "",
      formatQuantity(tx.receivedFiatAmount),
      formatQuantity(tx.sentQuantity),
      tx.sentCurrency ?? "",
      formatQuantity(tx.sentFiatAmount),
    );
  } else {
    // Multi-asset mode: numbered columns
    // Build received assets list
    const received: AssetEntry[] = [];
    if (tx.receivedQuantity !== undefined && tx.receivedCurrency) {
      received.push({
        quantity: tx.receivedQuantity,
        currency: tx.receivedCurrency,
        fiatAmount: tx.receivedFiatAmount,
      });
    }
    if (tx.additionalReceived) {
      received.push(...tx.additionalReceived);
    }

    // Build sent assets list
    const sent: AssetEntry[] = [];
    if (tx.sentQuantity !== undefined && tx.sentCurrency) {
      sent.push({
        quantity: tx.sentQuantity,
        currency: tx.sentCurrency,
        fiatAmount: tx.sentFiatAmount,
      });
    }
    if (tx.additionalSent) {
      sent.push(...tx.additionalSent);
    }

    for (let i = 0; i < maxSlots; i++) {
      const r = received[i];
      const s = sent[i];
      fields.push(
        r ? formatQuantity(r.quantity) : "",
        r ? r.currency : "",
        r ? formatQuantity(r.fiatAmount) : "",
        s ? formatQuantity(s.quantity) : "",
        s ? s.currency : "",
        s ? formatQuantity(s.fiatAmount) : "",
      );
    }
  }

  fields.push(
    formatQuantity(tx.feeAmount),
    tx.feeCurrency ?? "",
    tx.txHash ?? "",
    escapeCSVField(tx.notes ?? ""),
    tx.tag ?? "",
  );

  return fields.join(",");
}

/**
 * Generate a complete Awaken-standard CSV string from transactions.
 */
export function generateStandardCSV(txs: Transaction[]): string {
  const maxSlots = getMaxAssetSlots(txs);
  const header = buildHeader(maxSlots);
  const rows = txs.map((tx) => transactionToRow(tx, maxSlots));
  return [header, ...rows].join("\n");
}
