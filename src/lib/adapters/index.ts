/**
 * Chain adapter registry.
 *
 * Each supported chain will export a ChainAdapter implementation from its own
 * module (e.g. ./bittensor.ts) and register it here.
 */

import type { ChainAdapter, ChainInfo } from "@/types";
import { ChainAdapterRegistry } from "./registry";
import { bittensorAdapter } from "./bittensor";
import { kaspaAdapter } from "./kaspa";
import { injectiveAdapter } from "./injective";
import { multiversxAdapter } from "./multiversx";
import { hederaAdapter } from "./hedera";
import { radixAdapter } from "./radix";
import { ergoAdapter } from "./ergo";
import { polkadotAdapter } from "./polkadot";
import { osmosisAdapter } from "./osmosis";
import { roninAdapter } from "./ronin";
import { variationalAdapter } from "./variational";
import { extendedAdapter } from "./extended";

export { ChainAdapterRegistry } from "./registry";

/** Default (global) registry instance used by convenience helpers. */
export const registry = new ChainAdapterRegistry();

// Register built-in adapters
registry.register(bittensorAdapter);
registry.register(kaspaAdapter);
registry.register(injectiveAdapter);
registry.register(multiversxAdapter);
registry.register(hederaAdapter);
registry.register(radixAdapter);
registry.register(ergoAdapter);
registry.register(polkadotAdapter);
registry.register(osmosisAdapter);
registry.register(roninAdapter);
registry.register(variationalAdapter);
registry.register(extendedAdapter);

/** Register a chain adapter on the default registry. */
export function registerAdapter(adapter: ChainAdapter): void {
  registry.register(adapter);
}

/** Retrieve an adapter by chainId from the default registry, or undefined if not registered. */
export function getAdapter(chainId: string): ChainAdapter | undefined {
  return registry.get(chainId);
}

/** Return metadata for all registered (enabled) chains on the default registry. */
export function getAvailableChains(): ChainInfo[] {
  return registry.getAvailableChains();
}
