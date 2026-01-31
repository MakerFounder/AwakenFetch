"use client";

/**
 * Dashboard — client-side orchestrator that wires together the wallet form
 * and transaction table. Lifts fetch state up so both components can access
 * the transaction data and chain context.
 */

import { useState, useMemo, useCallback } from "react";
import type { ChainInfo, Transaction, TransactionType } from "@/types";
import { WalletForm } from "@/components/WalletForm";
import { TransactionTable } from "@/components/TransactionTable";
import {
  TransactionTypeFilter,
  getAvailableTypes,
  filterByType,
} from "@/components/TransactionTypeFilter";

export interface DashboardProps {
  /** Available chains to display in the selector. */
  chains: ChainInfo[];
}

export function Dashboard({ chains }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeChainId, setActiveChainId] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "" | "needs_review">("");

  const handleTransactionsFetched = (
    txs: Transaction[],
    chainId: string,
  ) => {
    setTransactions(txs);
    setActiveChainId(chainId);
    setTypeFilter("");
  };

  const availableTypes = useMemo(
    () => getAvailableTypes(transactions),
    [transactions],
  );

  const filteredTransactions = useMemo(
    () => filterByType(transactions, typeFilter),
    [transactions, typeFilter],
  );

  const handleTypeChange = useCallback(
    (_txHash: string, _txIndex: number, newType: TransactionType) => {
      // Find the matching transaction in the full (unfiltered) list by reference
      // since filteredTransactions contains the same object references.
      const targetTx = filteredTransactions[_txIndex];
      if (!targetTx) return;

      setTransactions((prev) => {
        const fullIndex = prev.indexOf(targetTx);
        if (fullIndex === -1) return prev;
        const updated = [...prev];
        updated[fullIndex] = { ...updated[fullIndex], type: newType };
        return updated;
      });
    },
    [filteredTransactions],
  );

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">AwakenFetch</h1>
          <p className="mt-2 text-base text-foreground/70">
            Fetch crypto transactions and export Awaken Tax-compliant CSVs
          </p>
        </div>
        <WalletForm
          chains={chains}
          onTransactionsFetched={handleTransactionsFetched}
        />
      </div>

      {transactions.length > 0 && activeChainId && (
        <div className="w-full max-w-6xl">
          <div className="mb-4">
            <TransactionTypeFilter
              value={typeFilter}
              onChange={setTypeFilter}
              availableTypes={availableTypes}
            />
          </div>
          <TransactionTable
            transactions={filteredTransactions}
            chainId={activeChainId}
            onTypeChange={handleTypeChange}
          />
        </div>
      )}
    </div>
  );
}
