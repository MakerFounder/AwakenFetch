/**
 * Chain adapter registry.
 *
 * Each supported chain will export a ChainAdapter implementation from its own
 * module (e.g. ./bittensor.ts) and register it here.
 */

import type { ChainAdapter, ChainInfo } from "@/types";

/** Map of chainId → ChainAdapter instance. */
const adapters = new Map<string, ChainAdapter>();

/** Register a chain adapter. */
export function registerAdapter(adapter: ChainAdapter): void {
  adapters.set(adapter.chainId, adapter);
}

/** Retrieve an adapter by chainId, or undefined if not registered. */
export function getAdapter(chainId: string): ChainAdapter | undefined {
  return adapters.get(chainId);
}

/** Return metadata for all registered (enabled) chains. */
export function getAvailableChains(): ChainInfo[] {
  return Array.from(adapters.values()).map((a) => ({
    chainId: a.chainId,
    chainName: a.chainName,
    ticker: a.chainId.toUpperCase(),
    enabled: true,
  }));
}
