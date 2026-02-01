"use client";

import { useState, useMemo, useCallback } from "react";
import type { Transaction, TransactionType } from "@/types";
import { getExplorerUrl } from "@/lib/explorerUrls";

export interface TransactionTableProps {
  transactions: Transaction[];
  chainId: string;
  onTypeChange?: (txHash: string, txIndex: number, newType: TransactionType) => void;
}

type SortField =
  | "date"
  | "type"
  | "sentQuantity"
  | "sentCurrency"
  | "receivedQuantity"
  | "receivedCurrency"
  | "feeAmount"
  | "feeCurrency"
  | "txHash"
  | "notes";

type SortDirection = "asc" | "desc";

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

const ROWS_PER_PAGE = 50;

const COLUMN_DEFS: { field: SortField; label: string }[] = [
  { field: "date", label: "Date (UTC)" },
  { field: "type", label: "Type" },
  { field: "sentQuantity", label: "Sent Qty" },
  { field: "sentCurrency", label: "Sent Currency" },
  { field: "receivedQuantity", label: "Received Qty" },
  { field: "receivedCurrency", label: "Received Currency" },
  { field: "feeAmount", label: "Fee" },
  { field: "feeCurrency", label: "Fee Currency" },
  { field: "txHash", label: "Tx Hash" },
  { field: "notes", label: "Notes" },
];

const RECLASSIFY_TYPES: { value: TransactionType; label: string }[] = [
  { value: "send", label: "Send" },
  { value: "receive", label: "Receive" },
  { value: "trade", label: "Trade" },
  { value: "lp_add", label: "LP Add" },
  { value: "lp_remove", label: "LP Remove" },
  { value: "stake", label: "Stake" },
  { value: "unstake", label: "Unstake" },
  { value: "claim", label: "Claim" },
  { value: "bridge", label: "Bridge" },
  { value: "approval", label: "Approval" },
  { value: "other", label: "Other" },
];

function formatDateUTC(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}:${ss}`;
}

function formatQuantity(value: number | undefined): string {
  if (value === undefined || value === null) return "";
  const abs = Math.abs(value);
  const str = abs.toString();
  if (str.includes("e")) {
    const fixed = abs.toFixed(18);
    return fixed.replace(/\.?0+$/, "");
  }
  return str;
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function getSortValue(
  tx: Transaction,
  field: SortField,
): string | number | Date {
  switch (field) {
    case "date":
      return tx.date.getTime();
    case "type":
      return tx.type;
    case "sentQuantity":
      return tx.sentQuantity ?? -Infinity;
    case "sentCurrency":
      return tx.sentCurrency ?? "";
    case "receivedQuantity":
      return tx.receivedQuantity ?? -Infinity;
    case "receivedCurrency":
      return tx.receivedCurrency ?? "";
    case "feeAmount":
      return tx.feeAmount ?? -Infinity;
    case "feeCurrency":
      return tx.feeCurrency ?? "";
    case "txHash":
      return tx.txHash ?? "";
    case "notes":
      return tx.notes ?? "";
  }
}

const TYPE_COLORS: Record<string, string> = {
  send: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  receive: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  trade: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  stake: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  unstake: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
  claim: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  bridge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  lp_add: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  lp_remove: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300",
  approval: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
  other: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export function TransactionTable({
  transactions,
  chainId,
  onTypeChange,
}: TransactionTableProps) {
  const [sort, setSort] = useState<SortConfig>({
    field: "date",
    direction: "desc",
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSort = useCallback(
    (field: SortField) => {
      setSort((prev) => ({
        field,
        direction:
          prev.field === field && prev.direction === "asc" ? "desc" : "asc",
      }));
      setCurrentPage(0);
    },
    [],
  );

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (tx) =>
          tx.sentCurrency?.toLowerCase().includes(q) ||
          tx.receivedCurrency?.toLowerCase().includes(q) ||
          tx.feeCurrency?.toLowerCase().includes(q) ||
          tx.txHash?.toLowerCase().includes(q) ||
          tx.notes?.toLowerCase().includes(q) ||
          tx.type.toLowerCase().includes(q),
      );
    }
    return result;
  }, [transactions, searchQuery]);

  const sortedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions].sort((a, b) => {
      const aVal = getSortValue(a, sort.field);
      const bVal = getSortValue(b, sort.field);
      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredTransactions, sort]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedTransactions.length / ROWS_PER_PAGE),
  );
  const pageTransactions = sortedTransactions.slice(
    currentPage * ROWS_PER_PAGE,
    (currentPage + 1) * ROWS_PER_PAGE,
  );

  const safePage = Math.min(currentPage, totalPages - 1);
  if (safePage !== currentPage) {
    setCurrentPage(safePage);
  }

  if (transactions.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Search + count */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            id="search-filter"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(0);
            }}
            placeholder="Search transactions..."
            aria-label="Search"
            className="rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted/60 transition-all hover:border-border-hover focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none w-64"
          />
        </div>
        <span className="ml-auto text-xs text-muted">
          {filteredTransactions.length} of {transactions.length} transaction
          {transactions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60">
              {COLUMN_DEFS.map((col) => (
                <th
                  key={col.field}
                  className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-xs font-semibold text-muted transition-colors hover:text-foreground"
                  onClick={() => handleSort(col.field)}
                  aria-sort={
                    sort.field === col.field
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIndicator
                      active={sort.field === col.field}
                      direction={sort.direction}
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageTransactions.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMN_DEFS.length}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  No transactions match the current filters.
                </td>
              </tr>
            ) : (
              pageTransactions.map((tx, idx) => {
                const explorerUrl = tx.txHash
                  ? getExplorerUrl(chainId, tx.txHash)
                  : undefined;
                const isAmbiguous = tx.type === "other";
                const globalIndex = currentPage * ROWS_PER_PAGE + idx;

                return (
                  <tr
                    key={tx.txHash ? `${tx.txHash}-${idx}` : idx}
                    className={`border-b border-border/50 transition-colors ${
                      isAmbiguous
                        ? "bg-warning/5 hover:bg-warning/10"
                        : "hover:bg-surface/40"
                    }`}
                    data-needs-review={isAmbiguous || undefined}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-mono text-foreground/80">
                      {formatDateUTC(tx.date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                      {isAmbiguous && onTypeChange ? (
                        <select
                          value={tx.type}
                          onChange={(e) =>
                            onTypeChange(
                              tx.txHash ?? "",
                              globalIndex,
                              e.target.value as TransactionType,
                            )
                          }
                          aria-label={`Reclassify transaction type for row ${globalIndex + 1}`}
                          className="cursor-pointer rounded-lg border border-warning bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning transition-colors hover:border-warning focus:border-warning focus:outline-none focus:ring-2 focus:ring-warning/20"
                        >
                          {RECLASSIFY_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TYPE_COLORS[tx.type] || "bg-surface text-foreground/70"}`}>
                          {tx.type}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-mono text-right">
                      {formatQuantity(tx.sentQuantity)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium">
                      {tx.sentCurrency ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-mono text-right">
                      {formatQuantity(tx.receivedQuantity)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium">
                      {tx.receivedCurrency ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-mono text-right">
                      {formatQuantity(tx.feeAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium">
                      {tx.feeCurrency ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs font-mono">
                      {tx.txHash ? (
                        explorerUrl ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer text-link underline decoration-link/30 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/30"
                            title={tx.txHash}
                          >
                            {truncateHash(tx.txHash)}
                          </a>
                        ) : (
                          <span title={tx.txHash}>
                            {truncateHash(tx.txHash)}
                          </span>
                        )
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-muted">
                      {tx.notes ?? ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <PaginationButton
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(0)}
              label="First page"
            >
              &laquo;&laquo;
            </PaginationButton>
            <PaginationButton
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              label="Previous page"
            >
              &laquo;
            </PaginationButton>
            <PaginationButton
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              label="Next page"
            >
              &raquo;
            </PaginationButton>
            <PaginationButton
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(totalPages - 1)}
              label="Last page"
            >
              &raquo;&raquo;
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-all hover:border-border-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={label}
    >
      {children}
    </button>
  );
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={active ? "opacity-100" : "opacity-30"}
    >
      <path
        d="M6 2L9 5H3L6 2Z"
        fill="currentColor"
        opacity={active && direction === "asc" ? 1 : 0.3}
      />
      <path
        d="M6 10L3 7H9L6 10Z"
        fill="currentColor"
        opacity={active && direction === "desc" ? 1 : 0.3}
      />
    </svg>
  );
}
