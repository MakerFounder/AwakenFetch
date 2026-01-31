"use client";

import { useState, useMemo } from "react";
import type { ChainInfo } from "@/types";

export interface WalletFormProps {
  /** Available chains to display in the selector. */
  chains: ChainInfo[];
  /** Called when the user submits the form with a valid address and chain. */
  onSubmit?: (address: string, chainId: string) => void;
}

export function WalletForm({ chains, onSubmit }: WalletFormProps) {
  const [address, setAddress] = useState("");
  const [selectedChainId, setSelectedChainId] = useState("");

  const enabledChains = useMemo(
    () => chains.filter((c) => c.enabled),
    [chains],
  );

  const isFormValid = address.trim().length > 0 && selectedChainId.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    onSubmit?.(address.trim(), selectedChainId);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xl flex-col gap-4"
    >
      {/* Chain selector */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="chain-select"
          className="text-sm font-medium text-foreground/80"
        >
          Chain
        </label>
        <select
          id="chain-select"
          value={selectedChainId}
          onChange={(e) => setSelectedChainId(e.target.value)}
          className="cursor-pointer rounded-lg border border-foreground/20 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none"
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
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter your public wallet address"
          autoComplete="off"
          spellCheck={false}
          className="rounded-lg border border-foreground/20 bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none"
        />
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={!isFormValid}
        className="cursor-pointer rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Fetch Transactions
      </button>
    </form>
  );
}
