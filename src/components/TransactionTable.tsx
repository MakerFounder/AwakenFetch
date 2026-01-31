"use client";

/**
 * TransactionTable — sortable, filterable, paginated table for displaying
 * fetched transactions with explorer-linked tx hashes.
 */

import { useState, useMemo, useCallback } from "react";
import type { Transaction, TransactionType } from "@/types";
import { getExplorerUrl } from "@/lib/explorerUrls";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionTableProps {
  /** The transactions to display. */
  transactions: Transaction[];
  /** Current chain ID (used to build explorer URLs). */
  chainId: string;
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROWS_PER_PAGE = 50;

const ALL_TYPES: TransactionType[] = [
  "send",
  "receive",
  "trade",
  "lp_add",
  "lp_remove",
  "stake",
  "unstake",
  "claim",
  "bridge",
  "approval",
  "other",
];

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as MM/DD/YYYY HH:MM:SS in UTC. */
function formatDateUTC(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}:${ss}`;
}

/** Format a number to max 8 decimal places, removing trailing zeros. */
function formatQuantity(value: number | undefined): string {
  if (value === undefined || value === null) return "";
  return parseFloat(value.toFixed(8)).toString();
}

/** Truncate a tx hash for display (first 8 + last 6 chars). */
function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/** Get a sortable value from a transaction for a given field. */
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionTable({
  transactions,
  chainId,
}: TransactionTableProps) {
  // Sorting state
  const [sort, setSort] = useState<SortConfig>({
    field: "date",
    direction: "desc",
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TransactionType | "">("");
  const [searchQuery, setSearchQuery] = useState("");

  // Toggle sort direction or switch to new field
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

  // Available types in the current dataset
  const availableTypes = useMemo(() => {
    const types = new Set(transactions.map((tx) => tx.type));
    return ALL_TYPES.filter((t) => types.has(t));
  }, [transactions]);

  // Filter → Sort → Paginate
  const filteredTransactions = useMemo(() => {
    let result = transactions;

    // Type filter
    if (typeFilter) {
      result = result.filter((tx) => tx.type === typeFilter);
    }

    // Search filter (searches across currency, hash, notes)
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
  }, [transactions, typeFilter, searchQuery]);

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

  // Reset page if filter changes cause out-of-range
  const safePage = Math.min(currentPage, totalPages - 1);
  if (safePage !== currentPage) {
    setCurrentPage(safePage);
  }

  if (transactions.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="type-filter"
            className="text-xs font-medium text-foreground/60"
          >
            Type
          </label>
          <select
            id="type-filter"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as TransactionType | "");
              setCurrentPage(0);
            }}
            className="cursor-pointer rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none"
          >
            <option value="">All types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Search filter */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="search-filter"
            className="text-xs font-medium text-foreground/60"
          >
            Search
          </label>
          <input
            id="search-filter"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(0);
            }}
            placeholder="Filter by currency, hash, notes…"
            className="rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-foreground/40 transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none"
          />
        </div>

        {/* Result count */}
        <span className="ml-auto text-xs text-foreground/50">
          {filteredTransactions.length} of {transactions.length} transaction
          {transactions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-foreground/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-foreground/[0.03]">
              {COLUMN_DEFS.map((col) => (
                <th
                  key={col.field}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-foreground/70 transition-colors hover:text-foreground"
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
                  className="px-3 py-8 text-center text-sm text-foreground/40"
                >
                  No transactions match the current filters.
                </td>
              </tr>
            ) : (
              pageTransactions.map((tx, idx) => {
                const explorerUrl = tx.txHash
                  ? getExplorerUrl(chainId, tx.txHash)
                  : undefined;

                return (
                  <tr
                    key={tx.txHash ? `${tx.txHash}-${idx}` : idx}
                    className="border-b border-foreground/5 transition-colors hover:bg-foreground/[0.02]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-mono">
                      {formatDateUTC(tx.date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      <span className="inline-block rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium">
                        {tx.type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-mono text-right">
                      {formatQuantity(tx.sentQuantity)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {tx.sentCurrency ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-mono text-right">
                      {formatQuantity(tx.receivedQuantity)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {tx.receivedCurrency ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-mono text-right">
                      {formatQuantity(tx.feeAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {tx.feeCurrency ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-mono">
                      {tx.txHash ? (
                        explorerUrl ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer text-blue-600 underline decoration-blue-600/30 transition-colors hover:text-blue-500 dark:text-blue-400 dark:decoration-blue-400/30 dark:hover:text-blue-300"
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
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-foreground/60">
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
          <span className="text-xs text-foreground/50">
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(0)}
              className="cursor-pointer rounded-md border border-foreground/20 px-2 py-1 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="First page"
            >
              ««
            </button>
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              className="cursor-pointer rounded-md border border-foreground/20 px-2 py-1 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              «
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              className="cursor-pointer rounded-md border border-foreground/20 px-2 py-1 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              »
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(totalPages - 1)}
              className="cursor-pointer rounded-md border border-foreground/20 px-2 py-1 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Last page"
            >
              »»
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
