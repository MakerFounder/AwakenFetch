/**
 * ChainAdapterRegistry — maps chain IDs to their adapter implementations.
 *
 * Provides a singleton-friendly class that stores, retrieves, and lists
 * ChainAdapter instances keyed by their `chainId`.
 */

import type { ChainAdapter, ChainInfo } from "@/types";

export class ChainAdapterRegistry {
  /** Internal map of chainId → ChainAdapter. */
  private readonly adapters = new Map<string, ChainAdapter>();

  /** Register a chain adapter. Overwrites any existing adapter with the same chainId. */
  register(adapter: ChainAdapter): void {
    this.adapters.set(adapter.chainId, adapter);
  }

  /** Retrieve an adapter by chainId, or undefined if not registered. */
  get(chainId: string): ChainAdapter | undefined {
    return this.adapters.get(chainId);
  }

  /** Check whether an adapter is registered for the given chainId. */
  has(chainId: string): boolean {
    return this.adapters.has(chainId);
  }

  /** Remove an adapter by chainId. Returns true if it was present. */
  unregister(chainId: string): boolean {
    return this.adapters.delete(chainId);
  }

  /** Return the number of registered adapters. */
  get size(): number {
    return this.adapters.size;
  }

  /** Return all registered chain IDs. */
  getChainIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Return metadata for all registered (enabled) chains. */
  getAvailableChains(): ChainInfo[] {
    return Array.from(this.adapters.values()).map((a) => ({
      chainId: a.chainId,
      chainName: a.chainName,
      ticker: a.chainId.toUpperCase(),
      enabled: true,
      perpsCapable: a.perpsCapable ?? false,
    }));
  }

  /** Remove all registered adapters. */
  clear(): void {
    this.adapters.clear();
  }
}
