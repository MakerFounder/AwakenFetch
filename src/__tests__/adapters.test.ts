import { describe, it, expect } from "vitest";
import {
  registerAdapter,
  getAdapter,
  getAvailableChains,
} from "@/lib/adapters";
import type { ChainAdapter, Transaction } from "@/types";

/** Minimal mock adapter for testing the registry. */
function createMockAdapter(chainId: string): ChainAdapter {
  return {
    chainId,
    chainName: chainId.charAt(0).toUpperCase() + chainId.slice(1),
    async fetchTransactions(): Promise<Transaction[]> {
      return [];
    },
    toAwakenCSV(): string {
      return "";
    },
    getExplorerUrl(txHash: string): string {
      return `https://explorer.example.com/tx/${txHash}`;
    },
    validateAddress(): boolean {
      return true;
    },
  };
}

describe("Adapter Registry", () => {
  it("registers and retrieves an adapter", () => {
    const adapter = createMockAdapter("testchain");
    registerAdapter(adapter);
    expect(getAdapter("testchain")).toBe(adapter);
  });

  it("returns undefined for unregistered chain", () => {
    expect(getAdapter("nonexistent")).toBeUndefined();
  });

  it("lists available chains after registration", () => {
    registerAdapter(createMockAdapter("alpha"));
    const chains = getAvailableChains();
    const ids = chains.map((c) => c.chainId);
    expect(ids).toContain("alpha");
  });

  it("chain info includes expected metadata", () => {
    registerAdapter(createMockAdapter("beta"));
    const chains = getAvailableChains();
    const beta = chains.find((c) => c.chainId === "beta");
    expect(beta).toBeDefined();
    expect(beta!.chainName).toBe("Beta");
    expect(beta!.enabled).toBe(true);
  });
});
