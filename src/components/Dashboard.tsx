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

function ChainIcon({ chainId, chainName, size = "sm" }: { chainId: string; chainName: string; size?: "sm" | "md" }) {
  const dims = size === "md" ? "h-6 w-6" : "h-5 w-5";
  const fontSize = size === "md" ? "text-xs" : "text-[10px]";
  if (CHAIN_HAS_LOGO.has(chainId)) {
    return (
      <div className={`flex ${dims} items-center justify-center rounded-full bg-background shadow-inner`}>
        <img
          src={`/chains/${chainId}.png`}
          alt={`${chainName} logo`}
          width={size === "md" ? 22 : 18}
          height={size === "md" ? 22 : 18}
          className="h-full w-full object-contain p-0.5 rounded-full"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <span className={`flex ${dims} items-center justify-center rounded-full bg-accent/15 ${fontSize} font-bold text-accent`}>
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
      <header className="sticky top-0 z-40 flex justify-center px-4 pt-4">
        <nav className="flex items-center gap-8 rounded-full border border-border/40 bg-background/80 backdrop-blur-md px-7 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent shadow-sm">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-base font-bold tracking-tight">
              <span className="text-foreground">Awaken</span><span className="text-accent">Fetch</span>
            </h1>
          </div>
          <div className="h-5 w-px bg-border/40" />
          <div className="flex items-center gap-4">
            <a
              href="https://awaken.tax"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer text-sm text-muted hover:text-accent transition-colors flex items-center gap-1.5"
            >
              awaken.tax
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M3.5 1.5H10.5V8.5M10 2L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href="https://github.com/MakerFounder/AwakenFetch"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="cursor-pointer text-muted hover:text-accent transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </a>
          </div>
        </nav>
      </header>

      {/* Hero + Form Section */}
      <section className="relative">
        {/* Soft radial glow behind hero — no hard gradient band */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-accent/[0.03] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-6 pt-10 pb-10 sm:pt-14 sm:pb-14">
          <div className="max-w-xl mx-auto text-center mb-8">
            <div className="animate-fade-up inline-flex items-center gap-2 mb-4">
              <span className="h-px w-6 bg-accent/40" />
              <span className="text-xs font-medium tracking-widest uppercase text-accent/70">Free &amp; open source</span>
              <span className="h-px w-6 bg-accent/40" />
            </div>
            <h2 className="animate-fade-up delay-100 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
              Export your crypto
              <br />
              <span className="text-accent">transactions</span>
            </h2>
            <p className="animate-fade-up delay-200 mt-4 text-base text-muted leading-relaxed max-w-md mx-auto">
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

          <div className="animate-scale-in delay-300 max-w-2xl mx-auto relative z-10">
            <WalletForm
              chains={chains}
              onSubmit={handleFormSubmit}
              onTransactionsFetched={handleTransactionsFetched}
              onLoadingChange={handleLoadingChange}
            />
          </div>

          {/* Chain showcase */}
          <div className="animate-fade-up delay-400 mt-8 max-w-3xl mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {enabledChains.map((chain) => (
                <div
                  key={chain.chainId}
                  className="flex items-center gap-2 rounded-full border border-border/40 bg-surface/40 px-3 py-1.5 transition-all hover:border-border-hover hover:bg-surface/70"
                >
                  <ChainIcon chainId={chain.chainId} chainName={chain.chainName} size="md" />
                  <span className="text-sm font-medium text-muted">{chain.chainName}</span>
                </div>
              ))}
              <span className="text-sm font-medium text-accent/60 px-2 py-1.5">+ more coming</span>
            </div>
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

      {/* Minimal footer */}
      <footer className="mt-auto border-t border-border/40">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center rounded bg-accent/80">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span><span className="text-foreground/70 font-medium">AwakenFetch</span> — Awaken Tax-compliant CSV exports</span>
          </div>
          <a
            href="https://awaken.tax"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer hover:text-accent transition-colors flex items-center gap-1"
          >
            awaken.tax
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M3.5 1.5H10.5V8.5M10 2L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}
