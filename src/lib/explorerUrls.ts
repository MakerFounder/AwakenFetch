/**
 * Client-safe mapping of chain IDs to block explorer URL patterns.
 * Used by the TransactionTable to create hyperlinks for tx hashes.
 */

const EXPLORER_URL_PATTERNS: Record<string, (txHash: string) => string> = {
  bittensor: (hash) => `https://taostats.io/extrinsic/${hash}`,
  kaspa: (hash) => `https://explorer.kaspa.org/txs/${hash}`,
  injective: (hash) =>
    `https://explorer.injective.network/transaction/${hash}`,
};

/**
 * Get the block explorer URL for a transaction hash on the given chain.
 * Returns undefined if the chain is not mapped.
 */
export function getExplorerUrl(
  chainId: string,
  txHash: string,
): string | undefined {
  const builder = EXPLORER_URL_PATTERNS[chainId];
  return builder ? builder(txHash) : undefined;
}
