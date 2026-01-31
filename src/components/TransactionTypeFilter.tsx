"use client";

/**
 * TransactionTypeFilter — dropdown filter for selecting a specific
 * transaction type. Displays only types that exist in the current dataset.
 * Includes a "Needs Review" option to show ambiguous (type = "other") transactions.
 */

import { useMemo } from "react";
import type { TransactionType } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

/** Human-readable labels for each transaction type. */
const TYPE_LABELS: Record<TransactionType, string> = {
  send: "Send",
  receive: "Receive",
  trade: "Trade",
  lp_add: "LP Add",
  lp_remove: "LP Remove",
  stake: "Stake",
  unstake: "Unstake",
  claim: "Claim",
  bridge: "Bridge",
  approval: "Approval",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionTypeFilterProps {
  /** Currently selected type, or empty string for "all", or "needs_review". */
  value: TransactionType | "" | "needs_review";
  /** Called when the selected type changes. */
  onChange: (type: TransactionType | "" | "needs_review") => void;
  /** List of types present in the current dataset. */
  availableTypes: TransactionType[];
  /** Whether the filter is disabled (e.g. during fetch). */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the unique transaction types present in a list of transactions. */
export function getAvailableTypes(
  transactions: { type: TransactionType }[],
): TransactionType[] {
  const types = new Set(transactions.map((tx) => tx.type));
  return ALL_TYPES.filter((t) => types.has(t));
}

/** Filter transactions by type. Returns all if typeFilter is empty. */
export function filterByType<T extends { type: TransactionType }>(
  transactions: T[],
  typeFilter: TransactionType | "" | "needs_review",
): T[] {
  if (!typeFilter) return transactions;
  if (typeFilter === "needs_review") {
    return transactions.filter((tx) => tx.type === "other");
  }
  return transactions.filter((tx) => tx.type === typeFilter);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionTypeFilter({
  value,
  onChange,
  availableTypes,
  disabled = false,
}: TransactionTypeFilterProps) {
  const sortedTypes = useMemo(
    () => ALL_TYPES.filter((t) => availableTypes.includes(t)),
    [availableTypes],
  );

  const hasOtherType = availableTypes.includes("other");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="transaction-type-filter"
        className="text-sm font-medium text-foreground/80"
      >
        Transaction Type
      </label>
      <select
        id="transaction-type-filter"
        value={value}
        onChange={(e) => onChange(e.target.value as TransactionType | "" | "needs_review")}
        disabled={disabled || sortedTypes.length === 0}
        aria-label="Filter by transaction type"
        className="cursor-pointer rounded-lg border border-foreground/20 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">All types</option>
        {hasOtherType && (
          <option value="needs_review">⚠ Needs Review</option>
        )}
        {sortedTypes.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}
