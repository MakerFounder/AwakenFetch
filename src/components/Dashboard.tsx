"use client";

/**
 * Dashboard — client-side orchestrator that wires together the wallet form
 * and transaction table. Lifts fetch state up so both components can access
 * the transaction data and chain context.
 */

import { useState } from "react";
import type { ChainInfo, Transaction } from "@/types";
import { WalletForm } from "@/components/WalletForm";
import { TransactionTable } from "@/components/TransactionTable";

export interface DashboardProps {
  /** Available chains to display in the selector. */
  chains: ChainInfo[];
}

export function Dashboard({ chains }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeChainId, setActiveChainId] = useState<string>("");

  const handleTransactionsFetched = (
    txs: Transaction[],
    chainId: string,
  ) => {
    setTransactions(txs);
    setActiveChainId(chainId);
  };

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
          <TransactionTable
            transactions={transactions}
            chainId={activeChainId}
          />
        </div>
      )}
    </div>
  );
}
