/**
 * Ergo (ERG) chain adapter.
 *
 * Fetches transactions from the Ergo Explorer API
 * (https://api.ergoplatform.com/api/v1/) and maps them
 * to the AwakenFetch Transaction interface.
 *
 * Ergo is a UTXO-based smart contract platform. Transactions consume
 * input boxes and produce output boxes. To determine sends/receives for
 * a given address we compare the sum of ERG (and tokens) in inputs owned
 * by the address vs outputs owned by the address.
 *
 * Supported transaction types:
 *   - ERG transfers (sends / receives)
 *   - Token transfers (via assets on boxes)
 *   - Generic UTXO transactions classified as "other"
 *
 * The Ergo Explorer API is public and requires no API key.
 * Rate limit: Best-effort public endpoint.
 * Address format: Base58-encoded, starting with "9" on mainnet (P2PK),
 *   typically 51 characters.
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 ERG = 1,000,000,000 nanoERG. */
const NANOERG_DIVISOR = 1_000_000_000;

/** Ergo Explorer API base URL (used for individual transaction lookups). */
const API_BASE = "https://api.ergoplatform.com/api/v1";

/** Ergo GraphQL API URL (used for address-based transaction listing). */
const GRAPHQL_URL = "https://gql.ergoplatform.com/v1/graphql";

/** Maximum results per page from the REST API (capped at 500). */
const PAGE_SIZE = 500;

/** Maximum results per GraphQL query. */
const GQL_PAGE_SIZE = 50;

/**
 * Ergo mainnet P2PK address regex.
 * Addresses start with "9" and are 51 characters of base58.
 * Other valid prefixes exist (e.g. "2" for P2SH, "4" for P2S, "8" for P2S),
 * but P2PK ("9") addresses are the most common wallet addresses.
 * We also accept other valid Ergo address prefixes.
 */
const ERGO_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{40,120}$/;

// ---------------------------------------------------------------------------
// Ergo Explorer API response types
// ---------------------------------------------------------------------------

interface ErgoAssetInfo {
  tokenId: string;
  index: number;
  amount: number;
  name: string | null;
  decimals: number;
  type: string | null;
}

interface ErgoInputInfo {
  boxId: string;
  value: number;
  index: number;
  spendingProof: string;
  outputBlockId: string;
  outputTransactionId: string;
  outputIndex: number;
  outputGlobalIndex: number;
  outputCreatedAt: number;
  outputSettledAt: number;
  ergoTree: string;
  address: string;
  assets: ErgoAssetInfo[];
  additionalRegisters: Record<string, string>;
}

interface ErgoOutputInfo {
  boxId: string;
  transactionId: string;
  blockId: string;
  value: number;
  index: number;
  globalIndex: number;
  creationHeight: number;
  settlementHeight: number;
  ergoTree: string;
  address: string;
  assets: ErgoAssetInfo[];
  additionalRegisters: Record<string, string>;
  spentTransactionId: string | null;
  mainChain: boolean;
}

interface ErgoTransactionInfo {
  id: string;
  blockId: string;
  inclusionHeight: number;
  timestamp: number;
  index: number;
  globalIndex: number;
  numConfirmations: number;
  inputs: ErgoInputInfo[];
  dataInputs: unknown[];
  outputs: ErgoOutputInfo[];
  size: number;
}

interface ErgoTransactionsResponse {
  items: ErgoTransactionInfo[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert nanoERG to ERG.
 */
export function nanoErgToErg(nanoErg: number): number {
  if (!nanoErg || Number.isNaN(nanoErg)) return 0;
  return nanoErg / NANOERG_DIVISOR;
}

/**
 * Validate an Ergo address.
 *
 * Ergo mainnet addresses are base58-encoded strings. The most common
 * wallet addresses start with "9" (P2PK) and are 51 characters long.
 * We accept a broad range of valid Ergo address formats.
 */
export function isValidErgoAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length === 0) return false;
  return ERGO_ADDRESS_REGEX.test(trimmed);
}

/**
 * Fetch JSON from Ergo Explorer API with exponential backoff retry.
 */
async function fetchErgoWithRetry<T>(url: string): Promise<T> {
  return fetchWithRetry<T>(url, {
    errorLabel: "Ergo Explorer API",
    baseDelayMs: 1_000,
  });
}

// ---------------------------------------------------------------------------
// GraphQL-based transaction listing
// ---------------------------------------------------------------------------

/** GraphQL response shape for transaction listing. */
interface GqlTransactionRef {
  transactionId: string;
  timestamp: string;
  inclusionHeight: number;
}

interface GqlResponse {
  data?: { transactions: GqlTransactionRef[] };
  errors?: Array<{ message: string }>;
}

/**
 * Fetch transaction IDs for an address using the Ergo GraphQL API.
 * Returns lightweight transaction references (id + timestamp + height).
 *
 * The GraphQL endpoint is more reliable than the REST `/addresses/{addr}/transactions`
 * endpoint which frequently times out or returns 503.
 */
async function fetchTxRefsViaGraphQL(
  address: string,
  take: number,
  skip: number,
): Promise<GqlTransactionRef[]> {
  const query = `{ transactions(addresses: ["${address}"], take: ${take}, skip: ${skip}) { transactionId timestamp inclusionHeight } }`;

  const maxRetries = 3;
  const baseDelayMs = 1_000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query }),
      });

      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Ergo GraphQL API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as GqlResponse;
      if (result.errors?.length) {
        throw new Error(`Ergo GraphQL error: ${result.errors[0].message}`);
      }

      return result.data?.transactions ?? [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error("Ergo GraphQL API request failed after retries");
}

/**
 * Fetch a single transaction by ID from the REST API.
 * Individual tx lookups are fast and reliable.
 */
async function fetchTxById(txId: string): Promise<ErgoTransactionInfo> {
  return fetchErgoWithRetry<ErgoTransactionInfo>(
    `${API_BASE}/transactions/${txId}`,
  );
}

/**
 * Parse a timestamp (milliseconds since epoch) into a Date.
 */
function parseTimestamp(ts: number): Date {
  return new Date(ts);
}

/**
 * Resolve a token name from asset info.
 * Falls back to a shortened tokenId if no name is available.
 */
function resolveTokenName(asset: ErgoAssetInfo): string {
  if (asset.name && asset.name.trim().length > 0) {
    return asset.name.trim();
  }
  return asset.tokenId.slice(0, 8).toUpperCase();
}

/**
 * Convert a token amount given its decimals.
 */
function convertTokenAmount(amount: number, decimals: number): number {
  if (decimals === 0) return amount;
  return amount / Math.pow(10, decimals);
}

// ---------------------------------------------------------------------------
// Transaction classification & mapping
// ---------------------------------------------------------------------------

/**
 * Map an Ergo Explorer transaction to an AwakenFetch Transaction record.
 * Analyzes UTXO inputs/outputs to determine sends/receives for the address.
 * Returns null for transactions that don't meaningfully affect the address.
 */
function mapTransaction(
  tx: ErgoTransactionInfo,
  address: string,
): Transaction | null {
  const normalizedAddress = address.trim();
  const date = parseTimestamp(tx.timestamp);

  // Sum ERG from inputs owned by our address
  let inputErg = 0;
  const inputTokens = new Map<string, { amount: number; name: string; decimals: number }>();

  for (const input of tx.inputs) {
    if (input.address === normalizedAddress) {
      inputErg += input.value;
      for (const asset of input.assets) {
        const existing = inputTokens.get(asset.tokenId);
        if (existing) {
          existing.amount += asset.amount;
        } else {
          inputTokens.set(asset.tokenId, {
            amount: asset.amount,
            name: resolveTokenName(asset),
            decimals: asset.decimals,
          });
        }
      }
    }
  }

  // Sum ERG from outputs owned by our address
  let outputErg = 0;
  const outputTokens = new Map<string, { amount: number; name: string; decimals: number }>();

  for (const output of tx.outputs) {
    if (output.address === normalizedAddress) {
      outputErg += output.value;
      for (const asset of output.assets) {
        const existing = outputTokens.get(asset.tokenId);
        if (existing) {
          existing.amount += asset.amount;
        } else {
          outputTokens.set(asset.tokenId, {
            amount: asset.amount,
            name: resolveTokenName(asset),
            decimals: asset.decimals,
          });
        }
      }
    }
  }

  // If address doesn't appear in inputs or outputs, skip
  if (inputErg === 0 && outputErg === 0 && inputTokens.size === 0 && outputTokens.size === 0) {
    return null;
  }

  // Calculate total tx fee: sum(all input values) - sum(all output values)
  const totalInputErg = tx.inputs.reduce((sum, inp) => sum + inp.value, 0);
  const totalOutputErg = tx.outputs.reduce((sum, out) => sum + out.value, 0);
  const txFeeNano = totalInputErg - totalOutputErg;

  // Determine if our address is the primary spender (has inputs)
  const isSpender = inputErg > 0;

  // Net ERG change for our address (not counting fee separately)
  const netErgNano = outputErg - inputErg;

  // Check for token changes
  const tokensSent: Array<{ tokenId: string; amount: number; name: string; decimals: number }> = [];
  const tokensReceived: Array<{ tokenId: string; amount: number; name: string; decimals: number }> = [];

  // Combine all token IDs from both inputs and outputs
  const allTokenIds = new Set([...inputTokens.keys(), ...outputTokens.keys()]);

  for (const tokenId of allTokenIds) {
    const inAmt = inputTokens.get(tokenId)?.amount ?? 0;
    const outAmt = outputTokens.get(tokenId)?.amount ?? 0;
    const info = inputTokens.get(tokenId) ?? outputTokens.get(tokenId)!;
    const diff = outAmt - inAmt;

    if (diff > 0) {
      tokensReceived.push({ tokenId, amount: diff, name: info.name, decimals: info.decimals });
    } else if (diff < 0) {
      tokensSent.push({ tokenId, amount: Math.abs(diff), name: info.name, decimals: info.decimals });
    }
  }

  const result: Transaction = {
    date,
    type: "other",
    txHash: tx.id,
  };

  // Add fee if our address is the spender
  if (isSpender && txFeeNano > 0) {
    result.feeAmount = nanoErgToErg(txFeeNano);
    result.feeCurrency = "ERG";
  }

  // Determine transaction type based on flows
  const hasErgSent = netErgNano < 0;
  const hasErgReceived = netErgNano > 0;
  const hasTokensSent = tokensSent.length > 0;
  const hasTokensReceived = tokensReceived.length > 0;

  // Fee-only transaction: spender with net ERG loss equal to (or less than) fee, no token changes
  if (isSpender && hasErgSent && !hasTokensSent && !hasTokensReceived) {
    const ergSent = Math.abs(netErgNano);
    const ergSentExFee = ergSent - txFeeNano;
    if (ergSentExFee <= 0) {
      result.type = "other";
      result.notes = "Fee-only transaction";
      return result;
    }
  }

  // Self-send or fee-only (spender, net zero ERG, no token changes)
  if (isSpender && netErgNano === 0 && !hasTokensSent && !hasTokensReceived) {
    result.type = "other";
    result.notes = "Self-transfer or contract interaction";
    return result;
  }

  // Trade: ERG sent + tokens received, or tokens sent + ERG received, or tokens swapped
  if (
    (hasErgSent && hasTokensReceived) ||
    (hasTokensSent && hasErgReceived) ||
    (hasTokensSent && hasTokensReceived)
  ) {
    result.type = "trade";

    // Populate sent side
    if (hasErgSent) {
      // The net ERG sent (absolute), excluding fee
      // For the spender, netErgNano already reflects the fee deducted from their balance.
      // We need: actual ERG sent to others = |netErgNano| - fee (if spender)
      const ergSent = Math.abs(netErgNano);
      const ergSentExFee = isSpender ? ergSent - txFeeNano : ergSent;
      if (ergSentExFee > 0) {
        result.sentQuantity = nanoErgToErg(ergSentExFee);
        result.sentCurrency = "ERG";
      }
    } else if (hasTokensSent) {
      const first = tokensSent[0];
      result.sentQuantity = convertTokenAmount(first.amount, first.decimals);
      result.sentCurrency = first.name;
    }

    // Populate received side
    if (hasTokensReceived) {
      const first = tokensReceived[0];
      result.receivedQuantity = convertTokenAmount(first.amount, first.decimals);
      result.receivedCurrency = first.name;
    } else if (hasErgReceived) {
      result.receivedQuantity = nanoErgToErg(netErgNano);
      result.receivedCurrency = "ERG";
    }

    return result;
  }

  // Pure ERG send
  if (hasErgSent && !hasTokensSent && !hasTokensReceived) {
    result.type = "send";
    const ergSent = Math.abs(netErgNano);
    const ergSentExFee = isSpender ? ergSent - txFeeNano : ergSent;
    if (ergSentExFee > 0) {
      result.sentQuantity = nanoErgToErg(ergSentExFee);
      result.sentCurrency = "ERG";
    }
    return result;
  }

  // Pure ERG receive
  if (hasErgReceived && !hasTokensSent && !hasTokensReceived) {
    result.type = "receive";
    result.receivedQuantity = nanoErgToErg(netErgNano);
    result.receivedCurrency = "ERG";
    return result;
  }

  // Pure token send
  if (hasTokensSent && !hasTokensReceived && !hasErgReceived) {
    result.type = "send";
    const first = tokensSent[0];
    result.sentQuantity = convertTokenAmount(first.amount, first.decimals);
    result.sentCurrency = first.name;
    return result;
  }

  // Pure token receive
  if (hasTokensReceived && !hasTokensSent && !hasErgSent) {
    result.type = "receive";
    const first = tokensReceived[0];
    result.receivedQuantity = convertTokenAmount(first.amount, first.decimals);
    result.receivedCurrency = first.name;
    return result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for an address from the Ergo Explorer API.
 *
 * Tries the REST endpoint first, and if it fails (e.g. 503 timeout which
 * is common on the address/transactions endpoint), falls back to a two-step
 * approach using the GraphQL API (list tx IDs) + REST (individual tx details).
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<ErgoTransactionInfo[]> {
  try {
    return await fetchAllTransactionsViaREST(address, options);
  } catch {
    // REST address/transactions endpoint often times out (503).
    // Fall back to GraphQL listing + REST individual lookups.
    return await fetchAllTransactionsViaGraphQL(address, options);
  }
}

/**
 * Primary path: GraphQL for listing tx IDs, REST for full tx details.
 */
async function fetchAllTransactionsViaGraphQL(
  address: string,
  options?: FetchOptions,
): Promise<ErgoTransactionInfo[]> {
  const results: ErgoTransactionInfo[] = [];
  let skip = 0;

  while (true) {
    const refs = await fetchTxRefsViaGraphQL(address, GQL_PAGE_SIZE, skip);
    if (refs.length === 0) break;

    // Apply date filtering early if possible (timestamps from GraphQL are ms)
    let filteredRefs = refs;
    if (options?.fromDate || options?.toDate) {
      const fromMs = options.fromDate ? options.fromDate.getTime() : 0;
      const toMs = options.toDate ? options.toDate.getTime() : Infinity;
      filteredRefs = refs.filter((ref) => {
        const ts = Number(ref.timestamp);
        return ts >= fromMs && ts <= toMs;
      });
    }

    // Fetch full details for each transaction
    const txDetails = await Promise.all(
      filteredRefs.map((ref) => fetchTxById(ref.transactionId)),
    );

    results.push(...txDetails);

    // Report progress for streaming
    if (options?.onProgress && txDetails.length > 0) {
      const batch = txDetails
        .map((tx) => mapTransaction(tx, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    if (refs.length < GQL_PAGE_SIZE) break;
    skip += refs.length;
  }

  return results;
}

/**
 * Fallback: direct REST endpoint (may time out for heavy addresses).
 */
async function fetchAllTransactionsViaREST(
  address: string,
  options?: FetchOptions,
): Promise<ErgoTransactionInfo[]> {
  const results: ErgoTransactionInfo[] = [];
  let offset = 0;

  while (true) {
    const url = `${API_BASE}/addresses/${address}/transactions?offset=${offset}&limit=${PAGE_SIZE}`;
    const data = await fetchErgoWithRetry<ErgoTransactionsResponse>(url);

    if (!data.items || data.items.length === 0) break;

    results.push(...data.items);

    // Report progress for streaming
    if (options?.onProgress && data.items.length > 0) {
      const batch = data.items
        .map((tx) => mapTransaction(tx, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    if (results.length >= data.total || data.items.length < PAGE_SIZE) {
      break;
    }

    offset += data.items.length;
  }

  // Apply date filtering if provided
  if (options?.fromDate || options?.toDate) {
    const fromMs = options.fromDate ? options.fromDate.getTime() : 0;
    const toMs = options.toDate ? options.toDate.getTime() : Infinity;

    return results.filter((tx) => {
      const txTime = tx.timestamp;
      return txTime >= fromMs && txTime <= toMs;
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Ergo ChainAdapter
// ---------------------------------------------------------------------------

export const ergoAdapter: ChainAdapter = {
  chainId: "ergo",
  chainName: "Ergo",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidErgoAddress(address)) {
      throw new Error(
        "Invalid Ergo address. Expected a base58-encoded address (e.g. 9f4QF8jQU4Sy1xBt3y2Kv7LZo1T1M9h6Q8X8K5y3Z6d7e8w9A1b)",
      );
    }

    const normalizedAddress = address.trim();
    const rawTxs = await fetchAllTransactions(normalizedAddress, options);

    // Map to Transaction interface and filter nulls
    const transactions = rawTxs
      .map((tx) => mapTransaction(tx, normalizedAddress))
      .filter((tx): tx is Transaction => tx !== null);

    // Sort by date ascending
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return transactions;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://explorer.ergoplatform.com/en/transactions/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidErgoAddress(address);
  },
};
