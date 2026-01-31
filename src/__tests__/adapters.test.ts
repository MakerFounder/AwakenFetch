import { describe, it, expect, beforeEach } from "vitest";
import {
  ChainAdapterRegistry,
  registry,
  registerAdapter,
  getAdapter,
  getAvailableChains,
} from "@/lib/adapters";
import type { ChainAdapter, Transaction } from "@/types";

/** Minimal mock adapter for testing the registry. */
function createMockAdapter(
  chainId: string,
  chainName?: string,
): ChainAdapter {
  return {
    chainId,
    chainName: chainName ?? chainId.charAt(0).toUpperCase() + chainId.slice(1),
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

// ---------------------------------------------------------------------------
// ChainAdapterRegistry class tests
// ---------------------------------------------------------------------------

describe("ChainAdapterRegistry (class)", () => {
  let reg: ChainAdapterRegistry;

  beforeEach(() => {
    reg = new ChainAdapterRegistry();
  });

  it("starts empty", () => {
    expect(reg.size).toBe(0);
    expect(reg.getChainIds()).toEqual([]);
    expect(reg.getAvailableChains()).toEqual([]);
  });

  it("registers and retrieves an adapter", () => {
    const adapter = createMockAdapter("kaspa");
    reg.register(adapter);
    expect(reg.get("kaspa")).toBe(adapter);
  });

  it("returns undefined for unregistered chain", () => {
    expect(reg.get("unknown")).toBeUndefined();
  });

  it("reports has() correctly", () => {
    reg.register(createMockAdapter("injective"));
    expect(reg.has("injective")).toBe(true);
    expect(reg.has("missing")).toBe(false);
  });

  it("overwrites an existing adapter on re-register", () => {
    const first = createMockAdapter("bittensor", "Bittensor v1");
    const second = createMockAdapter("bittensor", "Bittensor v2");
    reg.register(first);
    reg.register(second);
    expect(reg.get("bittensor")).toBe(second);
    expect(reg.size).toBe(1);
  });

  it("unregisters an adapter", () => {
    reg.register(createMockAdapter("ergo"));
    expect(reg.unregister("ergo")).toBe(true);
    expect(reg.has("ergo")).toBe(false);
    expect(reg.size).toBe(0);
  });

  it("unregister returns false for missing chain", () => {
    expect(reg.unregister("nope")).toBe(false);
  });

  it("tracks size correctly", () => {
    reg.register(createMockAdapter("a"));
    reg.register(createMockAdapter("b"));
    reg.register(createMockAdapter("c"));
    expect(reg.size).toBe(3);
  });

  it("returns all chain IDs", () => {
    reg.register(createMockAdapter("kaspa"));
    reg.register(createMockAdapter("hedera"));
    const ids = reg.getChainIds();
    expect(ids).toContain("kaspa");
    expect(ids).toContain("hedera");
    expect(ids).toHaveLength(2);
  });

  it("returns chain info with correct metadata", () => {
    reg.register(createMockAdapter("radix", "Radix"));
    const chains = reg.getAvailableChains();
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual({
      chainId: "radix",
      chainName: "Radix",
      ticker: "RADIX",
      enabled: true,
    });
  });

  it("clears all adapters", () => {
    reg.register(createMockAdapter("a"));
    reg.register(createMockAdapter("b"));
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.getAvailableChains()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Module-level convenience function tests (backward compatibility)
// ---------------------------------------------------------------------------

describe("Adapter Registry (module helpers)", () => {
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

  it("module helpers use the shared default registry instance", () => {
    const adapter = createMockAdapter("shared");
    registerAdapter(adapter);
    expect(registry.get("shared")).toBe(adapter);
  });
});
