/**
 * Core type definitions for AwakenFetch.
 * Based on PRD Section 6 — Technical Specifications.
 */

/** Supported transaction types for standard CSV export. */
export type TransactionType =
  | "send"
  | "receive"
  | "trade"
  | "lp_add"
  | "lp_remove"
  | "stake"
  | "unstake"
  | "claim"
  | "bridge"
  | "approval"
  | "other";

/** Supported perpetual transaction tags. */
export type PerpTag = "open_position" | "close_position" | "funding_payment";

/** Options for fetching transactions from a chain adapter. */
export interface FetchOptions {
  fromDate?: Date;
  toDate?: Date;
  cursor?: string;
  limit?: number;
  /** Optional callback invoked with each batch of transactions as they are fetched (for streaming). */
  onProgress?: (batch: Transaction[]) => void;
  /** Optional callback invoked when the adapter knows the estimated total transaction count. */
  onEstimatedTotal?: (total: number) => void;
}

/** A multi-asset entry (used for LP add/remove). */
export interface AssetEntry {
  quantity: number;
  currency: string;
  fiatAmount?: number;
}

/** A standard transaction record. */
export interface Transaction {
  date: Date;
  type: TransactionType;
  sentQuantity?: number;
  sentCurrency?: string;
  sentFiatAmount?: number;
  receivedQuantity?: number;
  receivedCurrency?: string;
  receivedFiatAmount?: number;
  feeAmount?: number;
  feeCurrency?: string;
  txHash?: string;
  notes?: string;
  tag?: string;
  /** Additional sent assets for multi-asset transactions. */
  additionalSent?: AssetEntry[];
  /** Additional received assets for multi-asset transactions. */
  additionalReceived?: AssetEntry[];
}

/** A perpetual/futures transaction record. */
export interface PerpTransaction {
  date: Date;
  asset: string;
  amount: number;
  fee?: number;
  pnl: number;
  paymentToken: string;
  notes?: string;
  txHash?: string;
  tag: PerpTag;
}

/** Interface that every chain adapter must implement. */
export interface ChainAdapter {
  /** Unique identifier for this chain (e.g. "bittensor", "kaspa"). */
  chainId: string;
  /** Human-readable chain name. */
  chainName: string;
  /** Whether this chain/protocol supports perpetuals trading. */
  perpsCapable?: boolean;
  /** Fetch transactions for the given wallet address. */
  fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]>;
  /** Convert transactions to Awaken standard CSV string. */
  toAwakenCSV(txs: Transaction[]): string;
  /** Return the block explorer URL for a given transaction hash. */
  getExplorerUrl(txHash: string): string;
  /** Validate a wallet address format for this chain. */
  validateAddress(address: string): boolean;
}

/** Registry entry used by the chain selector UI. */
export interface ChainInfo {
  chainId: string;
  chainName: string;
  ticker: string;
  /** Whether the adapter is currently operational. */
  enabled: boolean;
  /** Whether this chain/protocol supports perpetuals trading. */
  perpsCapable: boolean;
}
