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
}

export function ChainSelector({ chains, selectedChainId, onChainChange, disabled }: ChainSelectorProps) {
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

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled}
                className="cursor-pointer rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-all hover:border-border-hover focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 w-full flex items-center justify-between"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                {selectedChain ? (
                    <div className="flex items-center gap-2.5">
                        <ChainIcon chainId={selectedChain.chainId} chainName={selectedChain.chainName} />
                        <span>{selectedChain.chainName}</span>
                        <span className="text-muted text-xs">({selectedChain.ticker})</span>
                    </div>
                ) : (
                    <span>Select a chain...</span>
                )}
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {isOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-background shadow-lg max-h-60 overflow-auto">
                    <ul role="listbox">
                        {chains.map(chain => (
                            <li
                                key={chain.chainId}
                                onClick={() => {
                                    onChainChange(chain.chainId);
                                    setIsOpen(false);
                                }}
                                className="cursor-pointer p-3 hover:bg-surface flex items-center gap-2.5"
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
