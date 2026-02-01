/**
 * Ronin (RON) chain adapter.
 *
 * Fetches transactions from the Ronin Skynet Explorer API
 * (https://skynet-api.roninchain.com/ronin/explorer/v2/) and maps them
 * to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - RON transfers (native sends / receives)
 *   - ERC-20 token transfers (via token transfer endpoint)
 *   - Contract interactions (approvals, other)
 *
 * Ronin is an EVM-compatible chain (Ethereum-based).
 * RON has 18 decimal places (1 RON = 10^18 wei).
 *
 * The Ronin Skynet Explorer API is public and requires no API key.
 * Requests go through the Next.js API proxy (/api/proxy/ronin) to
 * avoid CORS issues from browser-side calls.
 *
 * Address format: 0x-prefixed, 42 hex chars (standard Ethereum).
 *   Ronin also uses "ronin:" prefix (e.g. ronin:abc…) which we normalize.
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 RON = 10^18 wei. */
const WEI_DIVISOR = 1e18;

/** Ronin Skynet Explorer API base URL (replaces deprecated SkyMavis Skynet Web3 API). */
const API_BASE =
  "https://skynet-api.roninchain.com/ronin/explorer/v2";

/** Maximum results per page from the Ronin Skynet Explorer API. */
const PAGE_LIMIT = 200;

/**
 * Ronin address regex.
 * Standard 0x-prefixed Ethereum address: 0x followed by 40 hex chars.
 */
const RONIN_ADDRESS_REGEX = /^0x[0-9a-f]{40}$/i;

/** The zero address (used for mint/burn detection). */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** ERC-20 approve method selector (first 4 bytes of keccak256("approve(address,uint256)")). */
const APPROVE_METHOD_ID = "0x095ea7b3";

// ---------------------------------------------------------------------------
// SkyMavis API response types
// ---------------------------------------------------------------------------

interface SkyMavisTx {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string;
  contractAddress: string;
  status: number;
  gas: number;
  gasPrice: string;
  effectiveGasPrice: string;
  gasUsed: number;
  cumulativeGasUsed: number;
  input: string;
  nonce: number;
  value: string;
  type: number;
  blockTime: number;
}

interface SkyMavisTxResponse {
  result: {
    items: SkyMavisTx[] | null;
    paging: {
      nextCursor?: string;
    };
  };
}

interface SkyMavisTokenTransfer {
  blockNumber: number;
  logIndex: number;
  tokenId: string;
  contractAddress: string;
  tokenStandard: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  from: string;
  to: string;
  value: string;
  blockHash: string;
  transactionHash: string;
  blockTime: number;
}

interface SkyMavisTokenTransferResponse {
  result: {
    items: SkyMavisTokenTransfer[] | null;
    paging: {
      nextCursor?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw wei amount to a human-readable RON number.
 */
export function parseRoninAmount(weiStr: string): number {
  if (!weiStr || weiStr === "0" || weiStr === "0x0") return 0;

  // Handle hex-encoded values
  let raw: bigint;
  try {
    if (weiStr.startsWith("0x")) {
      raw = BigInt(weiStr);
    } else {
      raw = BigInt(weiStr);
    }
  } catch {
    return 0;
  }

  if (raw === 0n) return 0;

  // Convert to number with 18 decimal precision
  const whole = raw / BigInt(1e18);
  const remainder = raw % BigInt(1e18);
  return Number(whole) + Number(remainder) / WEI_DIVISOR;
}

/**
 * Parse a token amount with a given number of decimals.
 */
export function parseTokenAmount(valueStr: string, decimals: number): number {
  if (!valueStr || valueStr === "0") return 0;

  let raw: bigint;
  try {
    raw = BigInt(valueStr);
  } catch {
    return 0;
  }

  if (raw === 0n) return 0;

  const divisor = 10 ** decimals;
  const whole = raw / BigInt(divisor);
  const remainder = raw % BigInt(divisor);
  return Number(whole) + Number(remainder) / divisor;
}

/**
 * Normalize a Ronin address to 0x-prefixed lowercase.
 * Accepts both "0x…" and "ronin:…" formats.
 */
export function normalizeRoninAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  if (trimmed.startsWith("ronin:")) {
    return "0x" + trimmed.slice(6);
  }
  return trimmed;
}

/**
 * Validate a Ronin wallet address.
 * Accepts both "0x…" and "ronin:…" formats.
 */
export function isValidRoninAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const normalized = normalizeRoninAddress(address);
  return RONIN_ADDRESS_REGEX.test(normalized);
}

/**
 * Get the SkyMavis API key from environment variables.
 * @deprecated The new Ronin Skynet Explorer API is public and requires no API key.
 */
function getApiKey(): string {
  const key = process.env.SKYMAVIS_API_KEY;
  if (!key) {
    // The new Ronin Skynet Explorer API does not require an API key.
    // Return empty string for backwards compatibility.
    return "";
  }
  return key;
}

/**
 * Build common request headers.
 */
function getHeaders(): Record<string, string> {
  const key = getApiKey();
  if (key) {
    return { "X-API-KEY": key };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Fee extraction
// ---------------------------------------------------------------------------

/**
 * Compute fee from gas usage and gas price.
 */
function extractFee(tx: SkyMavisTx): {
  feeAmount?: number;
  feeCurrency?: string;
} {
  const gasUsed = tx.gasUsed ?? 0;
  const gasPrice = tx.effectiveGasPrice ?? tx.gasPrice ?? "0";

  if (gasUsed <= 0 || gasPrice === "0") return {};

  let gasPriceBigInt: bigint;
  try {
    gasPriceBigInt = BigInt(gasPrice);
  } catch {
    return {};
  }

  const feeWei = BigInt(gasUsed) * gasPriceBigInt;
  const feeAmount = parseRoninAmount(feeWei.toString());

  if (feeAmount <= 0) return {};

  return {
    feeAmount,
    feeCurrency: "RON",
  };
}

// ---------------------------------------------------------------------------
// Transaction mapping
// ---------------------------------------------------------------------------

/**
 * Map a native RON transaction to a Transaction record.
 */
function mapNativeTx(
  tx: SkyMavisTx,
  address: string,
): Transaction | null {
  // Skip failed transactions
  if (tx.status !== 1) return null;

  const normalizedAddress = normalizeRoninAddress(address);
  const from = tx.from?.toLowerCase() ?? "";
  const to = tx.to?.toLowerCase() ?? "";
  const value = parseRoninAmount(tx.value ?? "0");
  const fee = extractFee(tx);
  const date = new Date(tx.blockTime * 1000);
  const input = tx.input ?? "0x";

  const isSender = from === normalizedAddress;
  const isReceiver = to === normalizedAddress;

  // Approval transaction (no native value, but has approve method)
  if (input.startsWith(APPROVE_METHOD_ID) && value === 0) {
    return {
      date,
      type: "approval",
      ...fee,
      txHash: tx.transactionHash,
      notes: `Approval to ${to.slice(0, 10)}…`,
    };
  }

  // Contract interaction with no value
  if (value === 0 && input !== "0x" && input.length > 2) {
    return {
      date,
      type: "other",
      ...fee,
      txHash: tx.transactionHash,
      notes: `Contract interaction: ${to.slice(0, 10)}…`,
    };
  }

  // Native RON transfer with value
  if (value > 0) {
    if (isSender && isReceiver) {
      // Self-transfer
      return {
        date,
        type: "send",
        sentQuantity: value,
        sentCurrency: "RON",
        receivedQuantity: value,
        receivedCurrency: "RON",
        ...fee,
        txHash: tx.transactionHash,
        notes: "Self-transfer",
      };
    }

    if (isSender) {
      return {
        date,
        type: "send",
        sentQuantity: value,
        sentCurrency: "RON",
        ...fee,
        txHash: tx.transactionHash,
        notes: `Transfer to ${to.slice(0, 10)}…`,
      };
    }

    if (isReceiver) {
      return {
        date,
        type: "receive",
        receivedQuantity: value,
        receivedCurrency: "RON",
        txHash: tx.transactionHash,
        notes: `Transfer from ${from.slice(0, 10)}…`,
      };
    }
  }

  // Zero-value transaction from sender (contract call, etc.)
  if (isSender && value === 0) {
    return {
      date,
      type: "other",
      ...fee,
      txHash: tx.transactionHash,
      notes: `Transaction to ${to.slice(0, 10)}…`,
    };
  }

  return null;
}

/**
 * Map a token transfer to a Transaction record.
 */
function mapTokenTransfer(
  transfer: SkyMavisTokenTransfer,
  address: string,
): Transaction | null {
  const normalizedAddress = normalizeRoninAddress(address);
  const from = transfer.from?.toLowerCase() ?? "";
  const to = transfer.to?.toLowerCase() ?? "";
  const decimals = transfer.decimals ?? 18;
  const quantity = parseTokenAmount(transfer.value ?? "0", decimals);
  const symbol = transfer.tokenSymbol || "UNKNOWN";
  const date = new Date(transfer.blockTime * 1000);

  if (quantity === 0) return null;

  const isSender = from === normalizedAddress;
  const isReceiver = to === normalizedAddress;

  // Mint (from zero address)
  if (from === ZERO_ADDRESS && isReceiver) {
    return {
      date,
      type: "receive",
      receivedQuantity: quantity,
      receivedCurrency: symbol,
      txHash: transfer.transactionHash,
      notes: `Mint ${symbol}`,
    };
  }

  // Burn (to zero address)
  if (to === ZERO_ADDRESS && isSender) {
    return {
      date,
      type: "send",
      sentQuantity: quantity,
      sentCurrency: symbol,
      txHash: transfer.transactionHash,
      notes: `Burn ${symbol}`,
    };
  }

  // Self-transfer
  if (isSender && isReceiver) {
    return {
      date,
      type: "send",
      sentQuantity: quantity,
      sentCurrency: symbol,
      receivedQuantity: quantity,
      receivedCurrency: symbol,
      txHash: transfer.transactionHash,
      notes: `Self-transfer ${symbol}`,
    };
  }

  // Send
  if (isSender) {
    return {
      date,
      type: "send",
      sentQuantity: quantity,
      sentCurrency: symbol,
      txHash: transfer.transactionHash,
      notes: `Transfer ${symbol} to ${to.slice(0, 10)}…`,
    };
  }

  // Receive
  if (isReceiver) {
    return {
      date,
      type: "receive",
      receivedQuantity: quantity,
      receivedCurrency: symbol,
      txHash: transfer.transactionHash,
      notes: `Transfer ${symbol} from ${from.slice(0, 10)}…`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch native transactions for an address from the Ronin Skynet Explorer API.
 */
async function fetchNativeTransactions(
  address: string,
  options?: FetchOptions,
): Promise<SkyMavisTx[]> {
  const normalizedAddress = normalizeRoninAddress(address);
  const headers = getHeaders();
  const allTxs: SkyMavisTx[] = [];
  let cursor: string | undefined;
  const limit = Math.min(options?.limit ?? PAGE_LIMIT, PAGE_LIMIT);

  while (true) {
    let url = `${API_BASE}/accounts/${normalizedAddress}/txs?limit=${limit}`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const data = await fetchWithRetry<SkyMavisTxResponse>(url, {
      headers,
      errorLabel: "Ronin Skynet Explorer",
    });

    const items = data.result?.items;
    if (!items || items.length === 0) break;

    allTxs.push(...items);

    // Report progress for streaming
    if (options?.onProgress && items.length > 0) {
      const batch = items
        .map((tx) => mapNativeTx(tx, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    cursor = data.result.paging?.nextCursor;
    if (!cursor) break;
  }

  return allTxs;
}

/**
 * Fetch token transfers for an address from the Ronin Skynet Explorer API.
 */
async function fetchTokenTransfers(
  address: string,
  options?: FetchOptions,
): Promise<SkyMavisTokenTransfer[]> {
  const normalizedAddress = normalizeRoninAddress(address);
  const headers = getHeaders();
  const allTransfers: SkyMavisTokenTransfer[] = [];
  let cursor: string | undefined;
  const limit = Math.min(options?.limit ?? PAGE_LIMIT, PAGE_LIMIT);

  while (true) {
    let url = `${API_BASE}/accounts/${normalizedAddress}/tokens/transfers?limit=${limit}`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const data = await fetchWithRetry<SkyMavisTokenTransferResponse>(url, {
      headers,
      errorLabel: "Ronin Skynet Explorer",
    });

    const items = data.result?.items;
    if (!items || items.length === 0) break;

    allTransfers.push(...items);

    // Report progress for streaming
    if (options?.onProgress && items.length > 0) {
      const batch = items
        .map((tx) => mapTokenTransfer(tx, address))
        .filter((tx): tx is Transaction => tx !== null);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    cursor = data.result.paging?.nextCursor;
    if (!cursor) break;
  }

  return allTransfers;
}

// ---------------------------------------------------------------------------
// Ronin ChainAdapter
// ---------------------------------------------------------------------------

export const roninAdapter: ChainAdapter = {
  chainId: "ronin",
  chainName: "Ronin",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidRoninAddress(address)) {
      throw new Error(
        "Invalid Ronin address. Expected format: 0x<40 hex chars> or ronin:<40 hex chars> " +
          "(e.g. 0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3)",
      );
    }

    // Fetch native transactions and token transfers in parallel
    const [nativeTxs, tokenTransfers] = await Promise.all([
      fetchNativeTransactions(address, options),
      fetchTokenTransfers(address, options),
    ]);

    const transactions: Transaction[] = [];
    const seenTxHashes = new Set<string>();

    // Map native transactions
    for (const tx of nativeTxs) {
      const mapped = mapNativeTx(tx, address);
      if (mapped && mapped.txHash) {
        seenTxHashes.add(mapped.txHash);
        transactions.push(mapped);
      }
    }

    // Map token transfers (avoid duplicating txHashes already seen with value)
    for (const transfer of tokenTransfers) {
      const mapped = mapTokenTransfer(transfer, address);
      if (mapped) {
        transactions.push(mapped);
      }
    }

    // Apply date filtering
    let filtered = transactions;
    if (options?.fromDate || options?.toDate) {
      const fromMs = options.fromDate ? options.fromDate.getTime() : 0;
      const toMs = options.toDate ? options.toDate.getTime() : Infinity;

      filtered = transactions.filter((tx) => {
        const txTime = tx.date.getTime();
        return txTime >= fromMs && txTime <= toMs;
      });
    }

    // Sort by date ascending
    filtered.sort((a, b) => a.date.getTime() - b.date.getTime());

    return filtered;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://app.roninchain.com/tx/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidRoninAddress(address);
  },
};
