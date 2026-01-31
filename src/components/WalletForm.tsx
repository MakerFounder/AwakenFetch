"use client";

import { useState, useMemo, useCallback } from "react";
import type { ChainInfo } from "@/types";
import {
  validateAddress,
  getAddressPlaceholder,
} from "@/lib/validateAddress";
import { ChainHelpModal } from "@/components/ChainHelpModal";
import { FetchStatus } from "@/components/FetchStatus";
import { useFetchTransactions } from "@/lib/useFetchTransactions";

export interface WalletFormProps {
  /** Available chains to display in the selector. */
  chains: ChainInfo[];
  /** Called when the user submits the form with a valid address and chain. */
  onSubmit?: (address: string, chainId: string) => void;
}

export function WalletForm({ chains, onSubmit }: WalletFormProps) {
  const [address, setAddress] = useState("");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [addressError, setAddressError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const fetchState = useFetchTransactions();

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

  const isLoading = fetchState.status === "loading";

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

  function handleChainChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const chainId = e.target.value;
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
    fetchState.fetchTransactions(address.trim(), selectedChainId);
  }

  const placeholder = getAddressPlaceholder(selectedChainId);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xl flex-col gap-4"
    >
      {/* Chain selector */}
      <div className="flex flex-col gap-1.5">
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
            className="cursor-pointer rounded-full text-foreground/40 transition-colors hover:text-foreground/70"
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
        <select
          id="chain-select"
          value={selectedChainId}
          onChange={handleChainChange}
          disabled={isLoading}
          className="cursor-pointer rounded-lg border border-foreground/20 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Select a chain…</option>
          {enabledChains.map((chain) => (
            <option key={chain.chainId} value={chain.chainId}>
              {chain.chainName} ({chain.ticker})
            </option>
          ))}
        </select>
      </div>

      {/* Wallet address input */}
      <div className="flex flex-col gap-1.5">
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
          className={`rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 transition-colors hover:border-foreground/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            addressError
              ? "border-red-500 focus:border-red-500"
              : "border-foreground/20 focus:border-foreground/60"
          }`}
        />
        {addressError && (
          <p
            id="address-error"
            role="alert"
            className="text-xs text-red-500"
          >
            {addressError}
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={!isFormValid || isLoading}
        className="cursor-pointer rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isLoading ? "Fetching…" : "Fetch Transactions"}
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
