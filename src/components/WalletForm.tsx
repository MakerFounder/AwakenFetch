"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
  /** Available chains to display in the selector. */
  chains: ChainInfo[];
  /** Called when the user submits the form with a valid address and chain. */
  onSubmit?: (address: string, chainId: string) => void;
  /** Called when transactions are successfully fetched. */
  onTransactionsFetched?: (
    transactions: import("@/types").Transaction[],
    chainId: string,
    dateRange: DateRange,
  ) => void;
  /** Called when the fetch loading state changes. */
  onLoadingChange?: (isLoading: boolean) => void;
}

export function WalletForm({ chains, onSubmit, onTransactionsFetched, onLoadingChange }: WalletFormProps) {
  const [address, setAddress] = useState("");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [addressError, setAddressError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getPreviousYearRange);

  const fetchState = useFetchTransactions();

  // Notify parent when loading state changes
  useEffect(() => {
    onLoadingChange?.(fetchState.status === "loading" || fetchState.status === "streaming");
  }, [fetchState.status, onLoadingChange]);

  // Notify parent when transactions are fetched successfully
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
      className="flex w-full flex-col gap-5"
    >
      {/* Chain selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="chain-select"
            className="text-sm font-medium text-foreground/80"
          >
            Chain
          </label>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="How to find your wallet address"
            title="How to find your wallet address"
            className="cursor-pointer rounded-full text-muted transition-colors hover:text-accent"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <text
                x="8"
                y="11.5"
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
              >
                ?
              </text>
            </svg>
          </button>
        </div>
        <ChainSelector
          chains={enabledChains}
          selectedChainId={selectedChainId}
          onChainChange={handleChainChange}
          disabled={isLoading}
        />
      </div>

      {/* Wallet address input */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="wallet-address"
          className="text-sm font-medium text-foreground/80"
        >
          Wallet Address
        </label>
        <input
          id="wallet-address"
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
          className={`rounded-xl border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted/60 transition-all hover:border-border-hover focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            addressError
              ? "border-error focus:border-error focus:ring-error/20"
              : "border-border focus:border-accent focus:ring-accent/20"
          }`}
        />
        {addressError && (
          <p
            id="address-error"
            role="alert"
            className="text-xs text-error flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 3.5v3M6 8v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {addressError}
          </p>
        )}
      </div>

      {/* Date range filter */}
      <DateRangeFilter
        value={dateRange}
        onChange={setDateRange}
        disabled={isLoading}
      />

      {/* Submit button */}
      <button
        type="submit"
        disabled={!isFormValid || isLoading}
        className="cursor-pointer rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" strokeDashoffset="10" />
            </svg>
            Fetching...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Fetch Transactions
          </span>
        )}
      </button>

      {/* Fetch progress / status */}
      <FetchStatus
        status={fetchState.status}
        transactionCount={fetchState.transactionCount}
        error={fetchState.error}
        warnings={fetchState.warnings}
        canRetry={fetchState.canRetry}
        onRetry={fetchState.retry}
        onDismiss={fetchState.reset}
      />

      <ChainHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </form>
  );
}
