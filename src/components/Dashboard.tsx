"use client";

import { useState, useMemo, useCallback } from "react";
import type { ChainInfo, Transaction, TransactionType } from "@/types";
import type { DateRange } from "@/components/DateRangeFilter";
import { WalletForm } from "@/components/WalletForm";
import { TransactionTable } from "@/components/TransactionTable";
import { TransactionTableSkeleton } from "@/components/TransactionTableSkeleton";
import {
  TransactionTypeFilter,
  getAvailableTypes,
  filterByType,
} from "@/components/TransactionTypeFilter";
import { DownloadCSVButton } from "@/components/DownloadCSVButton";
import { DownloadPerpsCSVButton } from "@/components/DownloadPerpsCSVButton";

const CHAIN_HAS_LOGO = new Set([
  "bittensor", "kaspa", "injective", "polkadot", "osmosis",
  "hedera", "multiversx", "ergo", "ronin", "radix", "variational", "extended",
]);

function ChainIcon({ chainId, chainName }: { chainId: string; chainName: string }) {
  if (CHAIN_HAS_LOGO.has(chainId)) {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-inner">
        <img
          src={`/chains/${chainId}.png`}
          alt={`${chainName} logo`}
          width={18}
          height={18}
          className="h-full w-full object-contain p-0.5 rounded-full"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
      {chainName.charAt(0)}
    </span>
  );
}

export interface DashboardProps {
  chains: ChainInfo[];
}

export function Dashboard({ chains }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeChainId, setActiveChainId] = useState<string>("");
  const [activeAddress, setActiveAddress] = useState<string>("");
  const [activeDateRange, setActiveDateRange] = useState<DateRange | null>(null);
  const [typeFilter, setTypeFilter] = useState<TransactionType | "" | "needs_review">("");
  const [isFetching, setIsFetching] = useState(false);

  const handleTransactionsFetched = (
    txs: Transaction[],
    chainId: string,
    dateRange?: DateRange,
  ) => {
    setTransactions(txs);
    setActiveChainId(chainId);
    setTypeFilter("");
    if (dateRange) {
      setActiveDateRange(dateRange);
    }
  };

  const handleFormSubmit = useCallback(
    (address: string) => {
      setActiveAddress(address);
    },
    [],
  );

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

  const handleLoadingChange = useCallback((isLoading: boolean) => {
    setIsFetching(isLoading);
  }, []);

  const isPerpsCapable = useMemo(() => {
    if (!activeChainId) return false;
    const chain = chains.find((c) => c.chainId === activeChainId);
    return chain?.perpsCapable ?? false;
  }, [activeChainId, chains]);

  const enabledChains = useMemo(() => chains.filter(c => c.enabled), [chains]);
  const showResults = !isFetching && transactions.length > 0 && activeChainId;

  return (
    <div className="flex w-full flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M4 4h10v10H4V4z" fill="currentColor" />
              <path d="M18 4h10v10H18V4z" fill="currentColor" opacity="0.5" />
              <path d="M4 18h10v10H4V18z" fill="currentColor" opacity="0.5" />
              <path d="M18 18h10v10H18V18z" fill="currentColor" />
              <path d="M10 10h12v12H10V10z" fill="var(--accent)" />
              <path d="M16 13.5v5M16 18.5l-2.5-2.5M16 18.5l2.5-2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h1 className="font-display text-xl tracking-tight">
              <span className="text-foreground">Awaken</span><span className="text-accent">Fetch</span>
            </h1>
          </div>
          <a
            href="https://awaken.tax"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer text-sm text-muted hover:text-accent transition-colors flex items-center gap-1.5"
          >
            <span>awaken.tax</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M3.5 1.5H10.5V8.5M10 2L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </header>

      {/* Hero + Form Section */}
      <section className="border-b border-border relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute inset-0 bg-gradient-to-b from-surface/80 via-surface/40 to-background" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/[0.04] rounded-full blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <div className="max-w-xl mx-auto text-center mb-12">
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-medium text-accent">Free &amp; open source</span>
            </div>
            <h2 className="animate-fade-up delay-100 font-display text-4xl sm:text-5xl tracking-tight leading-[1.1]">
              Export your crypto
              <br />
              <span className="text-accent">transactions</span>
            </h2>
            <p className="animate-fade-up delay-200 mt-5 text-base text-muted leading-relaxed max-w-md mx-auto">
              Fetch on-chain transactions and generate{" "}
              <a
                href="https://awaken.tax"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-link underline decoration-link/30 underline-offset-2 hover:decoration-link transition-colors"
              >
                Awaken Tax
              </a>
              -compliant CSV files for your crypto tax reporting.
            </p>
          </div>

          <div className="animate-scale-in delay-300 max-w-xl mx-auto">
            <div className="rounded-2xl border border-border bg-background/80 backdrop-blur-sm p-6 sm:p-8 shadow-sm">
              <WalletForm
                chains={chains}
                onSubmit={handleFormSubmit}
                onTransactionsFetched={handleTransactionsFetched}
                onLoadingChange={handleLoadingChange}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Supported Chains */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="text-center mb-10">
            <h3 className="font-display text-2xl tracking-tight mb-2">Supported Chains</h3>
            <p className="text-sm text-muted">{enabledChains.length} blockchains ready for export</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            {enabledChains.map((chain) => (
              <div
                key={chain.chainId}
                className="flex items-center gap-2.5 rounded-full border border-border bg-surface/40 px-4 py-2 text-sm transition-all hover:bg-surface hover:border-border-hover hover:shadow-sm"
              >
                <ChainIcon chainId={chain.chainId} chainName={chain.chainName} />
                <span className="font-medium">{chain.chainName}</span>
                <span className="text-muted text-xs">{chain.ticker}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {isFetching && (
            <TransactionTableSkeleton />
          )}

          {showResults && (
            <div className="animate-fade-up flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <TransactionTypeFilter
                  value={typeFilter}
                  onChange={setTypeFilter}
                  availableTypes={availableTypes}
                />
                <div className="flex items-center gap-2">
                  {isPerpsCapable && (
                    <DownloadPerpsCSVButton
                      perpTransactions={[]}
                      chainId={activeChainId}
                      address={activeAddress}
                      dateRange={activeDateRange}
                    />
                  )}
                  <DownloadCSVButton
                    transactions={filteredTransactions}
                    chainId={activeChainId}
                    address={activeAddress}
                    dateRange={activeDateRange}
                  />
                </div>
              </div>
              <TransactionTable
                transactions={filteredTransactions}
                chainId={activeChainId}
                onTypeChange={handleTypeChange}
              />
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-auto bg-surface/30">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M4 4h10v10H4V4z" fill="currentColor" />
                  <path d="M18 4h10v10H18V4z" fill="currentColor" opacity="0.5" />
                  <path d="M4 18h10v10H4V18z" fill="currentColor" opacity="0.5" />
                  <path d="M18 18h10v10H18V18z" fill="currentColor" />
                  <path d="M10 10h12v12H10V10z" fill="var(--accent)" />
                  <path d="M16 13.5v5M16 18.5l-2.5-2.5M16 18.5l2.5-2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-display text-sm">
                  <span className="text-foreground">Awaken</span><span className="text-accent">Fetch</span>
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed max-w-xs">
                An open-source tool for exporting crypto transactions into{" "}
                <a
                  href="https://awaken.tax"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer text-link hover:text-accent transition-colors underline decoration-link/30 underline-offset-2"
                >
                  Awaken Tax
                </a>
                -compliant CSV format.
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <a
                href="https://awaken.tax"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-sm text-muted hover:text-accent transition-colors flex items-center gap-1.5"
              >
                <span>Visit Awaken Tax</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M3.5 1.5H10.5V8.5M10 2L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <p className="text-xs text-muted/50">
                {enabledChains.length} chains supported
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
