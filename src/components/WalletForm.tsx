"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { ChainInfo } from "@/types";
import {
  validateAddress,
  getAddressPlaceholder,
} from "@/lib/validateAddress";
import { ChainHelpModal } from "@/components/ChainHelpModal";
import { FetchStatus } from "@/components/FetchStatus";
import { useFetchTransactions } from "@/lib/useFetchTransactions";
import {
  DateRangeFilter,
  getPreviousYearRange,
  type DateRange,
} from "@/components/DateRangeFilter";
import { ChainSelector } from "@/components/ChainSelector";

export interface WalletFormProps {
  chains: ChainInfo[];
  onSubmit?: (address: string, chainId: string) => void;
  onTransactionsFetched?: (
    transactions: import("@/types").Transaction[],
    chainId: string,
    dateRange: DateRange,
  ) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

export function WalletForm({ chains, onSubmit, onTransactionsFetched, onLoadingChange }: WalletFormProps) {
  const [address, setAddress] = useState("");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [addressError, setAddressError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getPreviousYearRange);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  const fetchState = useFetchTransactions();

  useEffect(() => {
    onLoadingChange?.(fetchState.status === "loading" || fetchState.status === "streaming");
  }, [fetchState.status, onLoadingChange]);

  useEffect(() => {
    if (
      fetchState.status === "success" &&
      fetchState.transactions.length > 0 &&
      selectedChainId
    ) {
      onTransactionsFetched?.(fetchState.transactions, selectedChainId, dateRange);
    }
  }, [fetchState.status, fetchState.transactions, selectedChainId, onTransactionsFetched, dateRange]);

  const enabledChains = useMemo(
    () => chains.filter((c) => c.enabled),
    [chains],
  );

  const displayChains = useMemo(
    () => chains,
    [chains],
  );

  const runValidation = useCallback(
    (addr: string, chainId: string): boolean => {
      if (!addr.trim() || !chainId) {
        setAddressError(undefined);
        return false;
      }
      const result = validateAddress(addr, chainId);
      setAddressError(result.error);
      return result.valid;
    },
    [],
  );

  const isFormValid =
    address.trim().length > 0 &&
    selectedChainId.length > 0 &&
    !addressError;

  const isLoading = fetchState.status === "loading" || fetchState.status === "streaming";

  function handleAddressChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setAddress(value);
    if (touched && selectedChainId) {
      runValidation(value, selectedChainId);
    }
  }

  function handleAddressBlur() {
    setTouched(true);
    if (address.trim() && selectedChainId) {
      runValidation(address, selectedChainId);
    }
  }

  function handleChainChange(chainId: string) {
    setSelectedChainId(chainId);
    if (touched && address.trim()) {
      runValidation(address, chainId);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    const valid = runValidation(address, selectedChainId);
    if (!valid) return;
    onSubmit?.(address.trim(), selectedChainId);
    fetchState.fetchTransactions(address.trim(), selectedChainId, dateRange);
  }

  const placeholder = getAddressPlaceholder(selectedChainId);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4"
    >
      {/* Inline form bar */}
      <div className="flex flex-col sm:flex-row sm:items-stretch rounded-2xl border border-border bg-background shadow-sm transition-all hover:border-border-hover hover:shadow-md">
        {/* Chain selector segment */}
        <div className="border-b sm:border-b-0 sm:border-r border-border flex items-center max-sm:justify-center overflow-visible">
          <ChainSelector
            chains={displayChains}
            selectedChainId={selectedChainId}
            onChainChange={handleChainChange}
            disabled={isLoading}
            variant="inline"
          />
        </div>

        {/* Address input segment */}
        <div className="flex-1 flex items-center min-w-0">
          <input
            id="wallet-address"
            aria-label="Wallet Address"
            type="text"
            value={address}
            onChange={handleAddressChange}
            onBlur={handleAddressBlur}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading}
            aria-invalid={!!addressError}
            aria-describedby={addressError ? "address-error" : undefined}
            className="w-full bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 max-sm:text-center max-sm:placeholder:text-center"
          />
        </div>

        {/* Fetch button segment */}
        <div className="p-1.5 sm:p-2 flex items-center">
          <button
            type="submit"
            disabled={!isFormValid || isLoading}
            className="cursor-pointer rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 whitespace-nowrap w-full sm:w-auto flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" strokeDashoffset="10" />
                </svg>
                Fetching...
              </>
            ) : (
              <>
                Fetch
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Address error */}
      {addressError && (
        <p
          id="address-error"
          role="alert"
          className="text-xs text-error flex items-center gap-1 -mt-2 ml-1"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 3.5v3M6 8v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          {addressError}
        </p>
      )}

      {/* Filters toggle + help */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="cursor-pointer flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Filters</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className="text-border">|</span>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="How to find your wallet address"
          title="How to find your wallet address"
          className="cursor-pointer flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <text x="8" y="11.5" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">?</text>
          </svg>
          <span>Help</span>
        </button>
      </div>

      {/* Collapsible filter panel */}
      <div
        ref={filtersRef}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="rounded-xl border border-border bg-surface/30 p-4">
          <DateRangeFilter
            value={dateRange}
            onChange={setDateRange}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Fetch progress / status */}
      <FetchStatus
        status={fetchState.status}
        transactionCount={fetchState.transactionCount}
        estimatedTotal={fetchState.estimatedTotal}
        error={fetchState.error}
        warnings={fetchState.warnings}
        canRetry={fetchState.canRetry}
        onRetry={fetchState.retry}
        onDismiss={fetchState.reset}
        onCancel={fetchState.cancel}
      />

      <ChainHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </form>
  );
}
