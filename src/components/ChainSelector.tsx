"use client";

import { useState, useRef, useEffect } from "react";
import type { ChainInfo } from "@/types";

function ChainIcon({ chainId, chainName }: { chainId: string; chainName: string }) {
    const CHAIN_HAS_LOGO = new Set([
        "bittensor", "kaspa", "injective", "polkadot", "osmosis",
        "hedera", "multiversx", "ergo", "ronin", "radix", "variational", "extended",
    ]);

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

export interface ChainSelectorProps {
    chains: ChainInfo[];
    selectedChainId: string;
    onChainChange: (chainId: string) => void;
    disabled?: boolean;
    variant?: "default" | "inline";
}

export function ChainSelector({ chains, selectedChainId, onChainChange, disabled, variant = "default" }: ChainSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedChain = chains.find(c => c.chainId === selectedChainId);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [containerRef]);

    const isInline = variant === "inline";

    return (
        <div className="relative" ref={containerRef}>
            {/* Hidden native select for accessibility / test compat */}
            <select
                id="chain-select"
                aria-label="Chain"
                value={selectedChainId}
                onChange={(e) => onChainChange(e.target.value)}
                disabled={disabled}
                className="sr-only"
                tabIndex={-1}
            >
                <option value="">Select a chain...</option>
                {chains.map(chain => (
                    <option key={chain.chainId} value={chain.chainId}>
                        {chain.chainName}
                    </option>
                ))}
            </select>

            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={
                    isInline
                        ? "cursor-pointer flex items-center gap-2 px-4 py-3 text-sm text-foreground transition-colors hover:bg-surface/60 rounded-t-2xl sm:rounded-t-none sm:rounded-l-2xl disabled:cursor-not-allowed disabled:opacity-50"
                        : "cursor-pointer rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-all hover:border-border-hover focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 w-full flex items-center justify-between"
                }
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                {selectedChain ? (
                    <div className="flex items-center gap-2">
                        <ChainIcon chainId={selectedChain.chainId} chainName={selectedChain.chainName} />
                        <span className="font-medium whitespace-nowrap">{selectedChain.chainName}</span>
                    </div>
                ) : (
                    <span className="text-muted/60 whitespace-nowrap">Select chain</span>
                )}
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={`ml-1 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {isOpen && (
                <div className={`absolute z-50 mt-1 rounded-xl border border-border bg-background shadow-lg max-h-60 overflow-auto ${isInline ? "left-0 min-w-[220px]" : "w-full"}`}>
                    <ul role="listbox">
                        {chains.map(chain => (
                            <li
                                key={chain.chainId}
                                onClick={() => {
                                    onChainChange(chain.chainId);
                                    setIsOpen(false);
                                }}
                                className="cursor-pointer p-3 hover:bg-surface flex items-center gap-2.5 transition-colors"
                                role="option"
                                aria-selected={selectedChainId === chain.chainId}
                            >
                                <ChainIcon chainId={chain.chainId} chainName={chain.chainName} />
                                <span>{chain.chainName}</span>
                                <span className="text-muted text-xs">({chain.ticker})</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
