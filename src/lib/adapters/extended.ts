/**
 * Extended perpetuals adapter (StarkNet).
 *
 * Fetches open/close/funding transactions from the Extended REST API
 * (https://api.starknet.extended.exchange) and maps them to the AwakenFetch
 * PerpTransaction interface.
 *
 * Extended (formerly X10) is a hybrid CLOB perpetuals DEX on StarkNet with
 * up to 100x leverage. All contracts are linear perps settled in USDC.
 *
 * Supported transaction types:
 *   - Open position (new perp position opened via trade)
 *   - Close position (existing position reduced/closed, with P&L)
 *   - Funding payment (periodic funding rate settlement)
 *
 * Authentication:
 *   Requires EXTENDED_API_KEY environment variable.
 *   Requests are authenticated via the X-Api-Key header.
 *
 * Address format:
 *   Extended uses numeric account IDs internally. The "address" passed to
 *   this adapter is the Extended account ID (numeric string) or a
 *   StarkNet 0x-prefixed hex address (up to 66 chars).
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

/** Extended API base URL (Starknet mainnet). */
const API_BASE = "https://api.starknet.extended.exchange/api/v1";

/** Maximum results per page from the API. */
const PAGE_SIZE = 100;

/**
 * StarkNet address regex.
 * Accepts 0x-prefixed hex strings of 1–64 hex chars (StarkNet felt252).
 * Also accepts numeric account IDs (pure digits).
 */
const STARKNET_ADDRESS_REGEX = /^0x[0-9a-fA-F]{1,64}$/;
const NUMERIC_ACCOUNT_REGEX = /^\d+$/;

// ---------------------------------------------------------------------------
// Extended API response types
// ---------------------------------------------------------------------------

/** Trade type from the Extended API. */
type ExtendedTradeType = "TRADE" | "LIQUIDATION" | "DELEVERAGE";

/** A single trade record from the Extended API. */
interface ExtendedTrade {
  /** Trade ID assigned by Extended. */
  id: number;
  /** Account ID. */
  accountId: number;
  /** Market name (e.g. "BTC-USD"). */
  market: string;
  /** Order ID. */
  orderId: number;
  /** Trade side: "BUY" or "SELL". */
  side: string;
  /** Trade price in collateral asset. */
  price: string;
  /** Trade quantity in base asset. */
  qty: string;
  /** Trade value in collateral asset. */
  value: string;
  /** Fee paid in collateral asset. */
  fee: string;
  /** Trade type. */
  tradeType: ExtendedTradeType;
  /** Timestamp (epoch milliseconds) when the trade happened. */
  createdTime: number;
  /** Whether the trade was executed as taker. */
  isTaker: boolean;
}

/** A position history record from the Extended API. */
interface ExtendedPositionHistory {
  /** Position ID. */
  id: number;
  /** Account ID. */
  accountId: number;
  /** Market name (e.g. "BTC-USD"). */
  market: string;
  /** Position side: "LONG" or "SHORT". */
  side: string;
  /** Exit type: "TRADE", "LIQUIDATION", or "DELEVERAGE". */
  exitType?: string;
  /** Position leverage. */
  leverage: string;
  /** Position size in base asset. */
  size: string;
  /** Max position size during lifetime in base asset. */
  maxPositionSize: string;
  /** Weighted average open price. */
  openPrice: string;
  /** Weighted average exit price. */
  exitPrice?: string;
  /** Position realised PnL. */
  realisedPnl: string;
  /** Timestamp (epoch milliseconds) when position was created. */
  createdTime: number;
  /** Timestamp (epoch milliseconds) when position was closed. */
  closedTime?: number;
}

/** A funding payment record from the Extended API. */
interface ExtendedFundingPayment {
  /** Funding payment ID. */
  id: number;
  /** Account ID. */
  accountId: number;
  /** Market name (e.g. "BNB-USD"). */
  market: string;
  /** Position ID. */
  positionId: number;
  /** Position side: "LONG" or "SHORT". */
  side: string;
  /** Position size at funding time. */
  size: string;
  /** Position value at funding time. */
  value: string;
  /** Mark price at funding time. */
  markPrice: string;
  /** Funding fee amount. */
  fundingFee: string;
  /** Funding rate applied. */
  fundingRate: string;
  /** Timestamp (epoch milliseconds) when payment happened. */
  paidTime: number;
}

/** Paginated response wrapper from the Extended API. */
interface ExtendedPageResponse<T> {
  status: string;
  data: T[];
  pagination?: {
    cursor: number;
    count: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate a StarkNet address or Extended account ID.
 */
export function isValidExtendedAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length === 0) return false;
  return STARKNET_ADDRESS_REGEX.test(trimmed) || NUMERIC_ACCOUNT_REGEX.test(trimmed);
}

/**
 * Get authentication headers for the Extended API.
 * Requires EXTENDED_API_KEY env var.
 */
function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.EXTENDED_API_KEY;

  if (!apiKey) {
    throw new Error(
      "EXTENDED_API_KEY environment variable is required. " +
        "Obtain API credentials from https://app.extended.exchange/api-management",
    );
  }

  return {
    "X-Api-Key": apiKey,
    "User-Agent": "AwakenFetch/1.0",
    "Content-Type": "application/json",
  };
}

/**
 * Fetch JSON from the Extended API with retry and authentication.
 */
async function fetchExtendedWithRetry<T>(url: string): Promise<T> {
  const headers = getAuthHeaders();
  return fetchWithRetry<T>(url, {
    errorLabel: "Extended API",
    headers,
    baseDelayMs: 1_000,
  });
}

/**
 * Extract the underlying asset name from the market name.
 * Extended market names follow the pattern "BTC-USD", "ETH-USD", etc.
 */
export function extractAssetFromMarket(marketName: string): string {
  if (!marketName) return "UNKNOWN";
  const parts = marketName.split("-");
  return parts[0].toUpperCase() || marketName.toUpperCase();
}

// ---------------------------------------------------------------------------
// Transaction classification & mapping
// ---------------------------------------------------------------------------

/**
 * Map an Extended trade to a PerpTransaction.
 *
 * Extended trades don't directly indicate open vs close. We use position
 * history to determine this. As a heuristic when position history is not
 * available, we map all trades as open_position since trades represent
 * individual fills. The fetchPerpTransactions function enriches this with
 * position data to correctly tag close_position.
 */
function mapTradeToPerp(
  trade: ExtendedTrade,
  tag: "open_position" | "close_position",
  pnl: number,
): PerpTransaction {
  const asset = extractAssetFromMarket(trade.market);
  const fee = parseFloat(trade.fee);

  return {
    date: new Date(trade.createdTime),
    asset,
    amount: Math.abs(parseFloat(trade.qty)),
    fee: fee !== 0 ? fee : undefined,
    pnl,
    paymentToken: tag === "open_position" && pnl === 0 ? "" : "USDC",
    notes:
      tag === "open_position"
        ? `${trade.side === "BUY" ? "Long" : "Short"} ${asset}`
        : `Close ${trade.side === "BUY" ? "long" : "short"} ${asset}`,
    txHash: undefined, // Extended trades don't have on-chain tx hashes directly
    tag,
  };
}

/**
 * Map an Extended funding payment to a PerpTransaction.
 */
function mapFundingToPerp(
  funding: ExtendedFundingPayment,
): PerpTransaction {
  const asset = extractAssetFromMarket(funding.market);
  const fundingFee = parseFloat(funding.fundingFee);

  return {
    date: new Date(funding.paidTime),
    asset,
    amount: Math.abs(parseFloat(funding.size)),
    pnl: -fundingFee, // Negative fee = paid, positive fee = received; invert for P&L
    paymentToken: "USDC",
    notes: `Funding payment (rate: ${funding.fundingRate})`,
    txHash: undefined,
    tag: "funding_payment",
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all trades for the authenticated account from the Extended API.
 * Uses cursor-based pagination.
 */
async function fetchAllTrades(
  options?: FetchOptions,
): Promise<ExtendedTrade[]> {
  const results: ExtendedTrade[] = [];
  let cursor: number | undefined;

  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
    });

    if (cursor !== undefined) {
      params.set("cursor", String(cursor));
    }

    const url = `${API_BASE}/user/trades?${params.toString()}`;
    const response =
      await fetchExtendedWithRetry<ExtendedPageResponse<ExtendedTrade>>(url);

    if (!response.data || response.data.length === 0) break;

    // Filter by date range if specified
    const filtered = response.data.filter((t) => {
      const tradeDate = new Date(t.createdTime);
      if (options?.fromDate && tradeDate < options.fromDate) return false;
      if (options?.toDate && tradeDate > options.toDate) return false;
      return true;
    });

    results.push(...filtered);

    // Stop paginating if we have fewer results than the page size
    if (
      !response.pagination ||
      response.pagination.count < PAGE_SIZE
    ) {
      break;
    }

    cursor = response.pagination.cursor;
  }

  return results;
}

/**
 * Fetch all position history for the authenticated account from the Extended API.
 */
async function fetchAllPositionHistory(
  options?: FetchOptions,
): Promise<ExtendedPositionHistory[]> {
  const results: ExtendedPositionHistory[] = [];
  let cursor: number | undefined;

  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
    });

    if (cursor !== undefined) {
      params.set("cursor", String(cursor));
    }

    const url = `${API_BASE}/user/positions/history?${params.toString()}`;
    const response =
      await fetchExtendedWithRetry<ExtendedPageResponse<ExtendedPositionHistory>>(
        url,
      );

    if (!response.data || response.data.length === 0) break;

    // Filter by date range if specified
    const filtered = response.data.filter((p) => {
      const posDate = new Date(p.createdTime);
      if (options?.fromDate && posDate < options.fromDate) return false;
      if (options?.toDate && posDate > options.toDate) return false;
      return true;
    });

    results.push(...filtered);

    if (
      !response.pagination ||
      response.pagination.count < PAGE_SIZE
    ) {
      break;
    }

    cursor = response.pagination.cursor;
  }

  return results;
}

/**
 * Fetch all funding payments for the authenticated account from the Extended API.
 * The fromTime parameter is required by the API.
 */
async function fetchAllFundingPayments(
  options?: FetchOptions,
): Promise<ExtendedFundingPayment[]> {
  const results: ExtendedFundingPayment[] = [];
  let cursor: number | undefined;

  // Extended requires fromTime param; default to 1 year ago
  const fromTime = options?.fromDate
    ? options.fromDate.getTime()
    : Date.now() - 365 * 24 * 60 * 60 * 1000;

  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      fromTime: String(fromTime),
    });

    if (cursor !== undefined) {
      params.set("cursor", String(cursor));
    }

    const url = `${API_BASE}/user/funding/history?${params.toString()}`;
    const response =
      await fetchExtendedWithRetry<ExtendedPageResponse<ExtendedFundingPayment>>(
        url,
      );

    if (!response.data || response.data.length === 0) break;

    // Filter by toDate if specified
    const filtered = response.data.filter((f) => {
      const fundingDate = new Date(f.paidTime);
      if (options?.toDate && fundingDate > options.toDate) return false;
      return true;
    });

    results.push(...filtered);

    if (
      !response.pagination ||
      response.pagination.count < PAGE_SIZE
    ) {
      break;
    }

    cursor = response.pagination.cursor;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public: fetch perp transactions
// ---------------------------------------------------------------------------

/**
 * Fetch all perpetuals transactions (trades + funding) for an Extended
 * account and return them as PerpTransaction records sorted by date.
 */
export async function fetchPerpTransactions(
  address: string,
  options?: FetchOptions,
): Promise<PerpTransaction[]> {
  if (!isValidExtendedAddress(address)) {
    throw new Error(
      "Invalid Extended address. Expected format: 0x<1-64 hex chars> (StarkNet address) " +
        "or a numeric account ID (e.g. 3017)",
    );
  }

  // Fetch trades, position history, and funding payments in parallel
  const [trades, positionHistory, fundingPayments] = await Promise.all([
    fetchAllTrades(options),
    fetchAllPositionHistory(options),
    fetchAllFundingPayments(options),
  ]);

  // Build a set of closed position IDs for enrichment.
  // Positions with a closedTime have been closed, meaning associated
  // trades are close_position events.
  const closedPositionMarkets = new Set<string>();
  const positionPnlByMarket = new Map<string, number>();

  for (const pos of positionHistory) {
    if (pos.closedTime) {
      closedPositionMarkets.add(pos.market);
      const existingPnl = positionPnlByMarket.get(pos.market) ?? 0;
      positionPnlByMarket.set(
        pos.market,
        existingPnl + parseFloat(pos.realisedPnl),
      );
    }
  }

  // Map trades to PerpTransaction.
  // Heuristic: trades on markets with closed positions that have realized P&L
  // are classified as close_position; others as open_position.
  // For a more granular approach, we look at each trade's position context.
  const perpFromTrades = trades.map((trade) => {
    // Check if this trade's market has a closed position with realized PnL
    const hasRealisedPnl = positionPnlByMarket.has(trade.market);
    const pnl = hasRealisedPnl
      ? (positionPnlByMarket.get(trade.market) ?? 0)
      : 0;

    // If the trade is a liquidation or deleverage, it's always a close
    if (trade.tradeType === "LIQUIDATION" || trade.tradeType === "DELEVERAGE") {
      return mapTradeToPerp(trade, "close_position", pnl);
    }

    // Regular trades: if there's a matching closed position, tag as close
    if (hasRealisedPnl && pnl !== 0) {
      // Only use the PnL once, then remove it
      positionPnlByMarket.delete(trade.market);
      return mapTradeToPerp(trade, "close_position", pnl);
    }

    return mapTradeToPerp(trade, "open_position", 0);
  });

  const perpFromFunding = fundingPayments.map(mapFundingToPerp);

  // Combine and sort by date ascending
  const allPerps = [...perpFromTrades, ...perpFromFunding];
  allPerps.sort((a, b) => a.date.getTime() - b.date.getTime());

  return allPerps;
}

// ---------------------------------------------------------------------------
// Extended ChainAdapter
// ---------------------------------------------------------------------------

export const extendedAdapter: ChainAdapter = {
  chainId: "extended",
  chainName: "Extended",
  perpsCapable: true,

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidExtendedAddress(address)) {
      throw new Error(
        "Invalid Extended address. Expected format: 0x<1-64 hex chars> (StarkNet address) " +
          "or a numeric account ID (e.g. 3017)",
      );
    }

    // Extended is a perps-only protocol.
    // For the standard transaction view, we map perp trades to
    // generic Transaction records for display purposes.
    const trades = await fetchAllTrades(options);

    const transactions: Transaction[] = trades.map((trade) => {
      const asset = extractAssetFromMarket(trade.market);

      return {
        date: new Date(trade.createdTime),
        type: "trade" as const,
        sentQuantity:
          trade.side === "SELL" ? Math.abs(parseFloat(trade.qty)) : undefined,
        sentCurrency: trade.side === "SELL" ? asset : undefined,
        receivedQuantity:
          trade.side === "BUY" ? Math.abs(parseFloat(trade.qty)) : undefined,
        receivedCurrency: trade.side === "BUY" ? asset : undefined,
        feeAmount:
          parseFloat(trade.fee) !== 0 ? parseFloat(trade.fee) : undefined,
        feeCurrency: parseFloat(trade.fee) !== 0 ? "USDC" : undefined,
        txHash: undefined,
        notes: `Extended ${trade.tradeType.toLowerCase()} ${trade.side.toLowerCase()} ${asset}`,
        tag: trade.tradeType.toLowerCase(),
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
    // Extended operates on StarkNet; use Starkscan for tx exploration
    return `https://starkscan.co/tx/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidExtendedAddress(address);
  },
};

/**
 * Generate an Awaken perpetuals CSV from Extended perp transactions.
 */
export function toAwakenPerpCSV(txs: PerpTransaction[]): string {
  return generatePerpCSV(txs);
}
