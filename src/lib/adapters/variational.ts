/**
 * Variational perpetuals adapter (Arbitrum).
 *
 * Fetches open/close/funding transactions from the Variational REST API
 * (https://omni-client-api.prod.ap-northeast-1.variational.io) and maps
 * them to the AwakenFetch PerpTransaction interface.
 *
 * Variational is a P2P perpetuals DEX on Arbitrum using an RFQ model.
 * All contracts are linear perps settled in USDC. Funding payments
 * occur hourly.
 *
 * Supported transaction types:
 *   - Open position (new perp position opened)
 *   - Close position (existing position reduced/closed, with P&L)
 *   - Funding payment (hourly funding rate settlement)
 *
 * Authentication:
 *   Requires VARIATIONAL_API_KEY and VARIATIONAL_API_SECRET environment
 *   variables. Requests are authenticated via HMAC-SHA256 signature headers.
 *
 * Address format: Standard Ethereum/Arbitrum 0x address (42 chars).
 */

import type {
  ChainAdapter,
  FetchOptions,
  PerpTransaction,
  Transaction,
} from "@/types";
import { generateStandardCSV } from "@/lib/csv/standard";
import { generatePerpCSV } from "@/lib/csv/perp";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Variational API base URL (production). */
const API_BASE =
  "https://omni-client-api.prod.ap-northeast-1.variational.io";

/** Maximum results per page from the API. */
const PAGE_SIZE = 100;

/**
 * Ethereum/Arbitrum address regex.
 * Standard 0x-prefixed, 40 hex chars.
 */
const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

// ---------------------------------------------------------------------------
// Variational API response types
// ---------------------------------------------------------------------------

/** Trade status from the API. */
type VariationalTradeStatus =
  | "pending"
  | "open"
  | "closed"
  | "liquidated"
  | "settled"
  | "cancelled";

/** Trade type from the API. */
type VariationalTradeType = "trade" | "settlement";

/** A single trade record from the Variational API. */
interface VariationalTrade {
  id: string;
  /** ISO 8601 datetime string. */
  created_at: string;
  /** ISO 8601 datetime string. */
  updated_at: string;
  /** The underlying asset symbol, e.g. "BTC", "ETH", "FARTCOIN". */
  instrument_name: string;
  /** Instrument type (e.g. "perpetual_future"). */
  instrument_type: string;
  /** The quantity traded (positive = buy/long, can be negative for short). */
  quantity: number;
  /** The trade price per unit. */
  price: number;
  /** Trade type: "trade" for open/close, "settlement" for funding. */
  trade_type: VariationalTradeType;
  /** Status of the trade. */
  status: VariationalTradeStatus;
  /** Fee in USDC charged for this trade. */
  fee: number;
  /** Realized P&L in USDC (populated on close/settlement). */
  realized_pnl: number;
  /** The settlement/payment token (typically "USDC"). */
  settlement_currency: string;
  /** The Arbitrum transaction hash, if settled on-chain. */
  transaction_hash?: string;
  /** Side: "buy" or "sell". */
  side: string;
  /** The trader's wallet address. */
  wallet_address: string;
  /** Settlement pool ID. */
  settlement_pool_id?: string;
}

/** A funding payment record from the Variational API. */
interface VariationalFundingPayment {
  id: string;
  /** ISO 8601 datetime string. */
  created_at: string;
  /** The underlying asset. */
  instrument_name: string;
  /** Size of the position at funding time. */
  position_size: number;
  /** Funding rate applied. */
  funding_rate: number;
  /** Funding payment amount in USDC (positive = received, negative = paid). */
  payment_amount: number;
  /** Settlement currency (typically "USDC"). */
  settlement_currency: string;
  /** The Arbitrum transaction hash, if any. */
  transaction_hash?: string;
  /** The trader's wallet address. */
  wallet_address: string;
}

/** Paginated response wrapper. */
interface VariationalPageResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    next_page?: {
      limit: number;
      offset: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate an Ethereum / Arbitrum wallet address.
 */
export function isValidVariationalAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  return ETH_ADDRESS_REGEX.test(trimmed);
}

/**
 * Get the HMAC-SHA256 authentication headers for the Variational API.
 * Requires VARIATIONAL_API_KEY and VARIATIONAL_API_SECRET env vars.
 */
function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.VARIATIONAL_API_KEY;
  const apiSecret = process.env.VARIATIONAL_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "VARIATIONAL_API_KEY and VARIATIONAL_API_SECRET environment variables are required. " +
        "Obtain API credentials from https://docs.variational.io/",
    );
  }

  // The timestamp in milliseconds used for request signing.
  // Full HMAC-SHA256 signing is handled by the server-side proxy route;
  // here we pass the key and timestamp so the proxy can compute the signature.
  const timestampMs = Date.now().toString();

  return {
    "X-Variational-Key": apiKey,
    "X-Request-Timestamp-Ms": timestampMs,
    "Content-Type": "application/json",
  };
}

/**
 * Fetch JSON from the Variational API with retry and authentication.
 */
async function fetchVariationalWithRetry<T>(url: string): Promise<T> {
  const headers = getAuthHeaders();
  return fetchWithRetry<T>(url, {
    errorLabel: "Variational API",
    headers,
    baseDelayMs: 1_000,
  });
}

/**
 * Extract the underlying asset name from the instrument name.
 * Variational instrument names follow patterns like "BTC-PERP", "ETH-PERP",
 * or just the asset symbol.
 */
export function extractAssetFromInstrument(instrumentName: string): string {
  if (!instrumentName) return "UNKNOWN";
  // Remove common suffixes like "-PERP", "-USD", "-USDC"
  const cleaned = instrumentName
    .replace(/-PERP$/i, "")
    .replace(/-USD[CT]?$/i, "")
    .replace(/_PERP$/i, "")
    .replace(/_USD[CT]?$/i, "")
    .trim();
  return cleaned.toUpperCase() || instrumentName.toUpperCase();
}

// ---------------------------------------------------------------------------
// Transaction classification & mapping
// ---------------------------------------------------------------------------

/**
 * Determine if a trade represents an open or close position.
 *
 * Heuristic: If the realized P&L is zero and the trade type is "trade",
 * it's an open. If there's nonzero realized P&L, it's a close.
 * "settlement" type trades are funding payments.
 */
function classifyTrade(
  trade: VariationalTrade,
): "open_position" | "close_position" | "funding_payment" {
  if (trade.trade_type === "settlement") {
    return "funding_payment";
  }

  // A trade with realized P&L (nonzero) indicates closing a position
  if (trade.realized_pnl !== 0) {
    return "close_position";
  }

  return "open_position";
}

/**
 * Map a Variational trade to a PerpTransaction.
 */
function mapTradeToPerp(trade: VariationalTrade): PerpTransaction {
  const tag = classifyTrade(trade);
  const asset = extractAssetFromInstrument(trade.instrument_name);
  const paymentToken =
    trade.settlement_currency?.toUpperCase() || "USDC";

  return {
    date: new Date(trade.created_at),
    asset,
    amount: Math.abs(trade.quantity),
    fee: trade.fee !== 0 ? trade.fee : undefined,
    pnl: trade.realized_pnl,
    paymentToken: tag === "open_position" && trade.realized_pnl === 0
      ? ""
      : paymentToken,
    notes: tag === "open_position"
      ? `${trade.side === "buy" ? "Long" : "Short"} ${asset}`
      : tag === "close_position"
        ? `Close ${trade.side === "buy" ? "long" : "short"} ${asset}`
        : undefined,
    txHash: trade.transaction_hash,
    tag,
  };
}

/**
 * Map a Variational funding payment to a PerpTransaction.
 */
function mapFundingToPerp(
  funding: VariationalFundingPayment,
): PerpTransaction {
  const asset = extractAssetFromInstrument(funding.instrument_name);
  const paymentToken =
    funding.settlement_currency?.toUpperCase() || "USDC";

  return {
    date: new Date(funding.created_at),
    asset,
    amount: Math.abs(funding.position_size),
    pnl: funding.payment_amount,
    paymentToken,
    notes: `Funding payment (rate: ${funding.funding_rate})`,
    txHash: funding.transaction_hash,
    tag: "funding_payment",
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all trades for a wallet address from the Variational API.
 * Uses offset-based pagination.
 */
async function fetchAllTrades(
  address: string,
  options?: FetchOptions,
): Promise<VariationalTrade[]> {
  const results: VariationalTrade[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      wallet_address: address.toLowerCase(),
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });

    if (options?.fromDate) {
      params.set("from_date", options.fromDate.toISOString());
    }
    if (options?.toDate) {
      params.set("to_date", options.toDate.toISOString());
    }

    const url = `${API_BASE}/v1/trades?${params.toString()}`;
    const response =
      await fetchVariationalWithRetry<VariationalPageResponse<VariationalTrade>>(
        url,
      );

    if (!response.data || response.data.length === 0) break;

    results.push(...response.data);

    if (!response.pagination.next_page) break;
    offset = response.pagination.next_page.offset;
  }

  return results;
}

/**
 * Fetch all funding payments for a wallet address from the Variational API.
 */
async function fetchAllFundingPayments(
  address: string,
  options?: FetchOptions,
): Promise<VariationalFundingPayment[]> {
  const results: VariationalFundingPayment[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      wallet_address: address.toLowerCase(),
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });

    if (options?.fromDate) {
      params.set("from_date", options.fromDate.toISOString());
    }
    if (options?.toDate) {
      params.set("to_date", options.toDate.toISOString());
    }

    const url = `${API_BASE}/v1/funding-payments?${params.toString()}`;
    const response =
      await fetchVariationalWithRetry<VariationalPageResponse<VariationalFundingPayment>>(
        url,
      );

    if (!response.data || response.data.length === 0) break;

    results.push(...response.data);

    if (!response.pagination.next_page) break;
    offset = response.pagination.next_page.offset;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public: fetch perp transactions
// ---------------------------------------------------------------------------

/**
 * Fetch all perpetuals transactions (trades + funding) for a Variational
 * address and return them as PerpTransaction records sorted by date.
 */
export async function fetchPerpTransactions(
  address: string,
  options?: FetchOptions,
): Promise<PerpTransaction[]> {
  if (!isValidVariationalAddress(address)) {
    throw new Error(
      "Invalid Variational address. Expected format: 0x<40 hex chars> " +
        "(e.g. 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)",
    );
  }

  const normalizedAddress = address.trim().toLowerCase();

  // Fetch trades and funding payments in parallel
  const [trades, fundingPayments] = await Promise.all([
    fetchAllTrades(normalizedAddress, options),
    fetchAllFundingPayments(normalizedAddress, options),
  ]);

  // Map to PerpTransaction
  const perpFromTrades = trades
    .filter((t) => t.status !== "cancelled" && t.status !== "pending")
    .map(mapTradeToPerp);

  const perpFromFunding = fundingPayments.map(mapFundingToPerp);

  // Combine and sort by date ascending
  const allPerps = [...perpFromTrades, ...perpFromFunding];
  allPerps.sort((a, b) => a.date.getTime() - b.date.getTime());

  return allPerps;
}

// ---------------------------------------------------------------------------
// Variational ChainAdapter
// ---------------------------------------------------------------------------

export const variationalAdapter: ChainAdapter = {
  chainId: "variational",
  chainName: "Variational",
  perpsCapable: true,

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidVariationalAddress(address)) {
      throw new Error(
        "Invalid Variational address. Expected format: 0x<40 hex chars> " +
          "(e.g. 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)",
      );
    }

    // Variational is a perps-only protocol.
    // For the standard transaction view, we map perp trades to
    // generic Transaction records for display purposes.
    const normalizedAddress = address.trim().toLowerCase();
    const trades = await fetchAllTrades(normalizedAddress, options);

    const transactions: Transaction[] = trades
      .filter((t) => t.status !== "cancelled" && t.status !== "pending")
      .map((trade) => {
        const asset = extractAssetFromInstrument(trade.instrument_name);
        const tag = classifyTrade(trade);

        return {
          date: new Date(trade.created_at),
          type: "trade" as const,
          sentQuantity:
            tag === "open_position" ? Math.abs(trade.quantity) : undefined,
          sentCurrency: tag === "open_position" ? asset : undefined,
          receivedQuantity:
            tag === "close_position" ? Math.abs(trade.quantity) : undefined,
          receivedCurrency: tag === "close_position" ? asset : undefined,
          feeAmount: trade.fee !== 0 ? trade.fee : undefined,
          feeCurrency: trade.fee !== 0
            ? (trade.settlement_currency?.toUpperCase() || "USDC")
            : undefined,
          txHash: trade.transaction_hash,
          notes: `Variational ${tag.replace(/_/g, " ")}`,
          tag: tag.replace(/_/g, " "),
        };
      });

    // Sort by date ascending
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return transactions;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://arbiscan.io/tx/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidVariationalAddress(address);
  },
};

/**
 * Generate an Awaken perpetuals CSV from Variational perp transactions.
 */
export function toAwakenPerpCSV(txs: PerpTransaction[]): string {
  return generatePerpCSV(txs);
}
