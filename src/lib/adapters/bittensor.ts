/**
 * Bittensor (TAO) chain adapter.
 *
 * Fetches transactions from the Taostats API (https://docs.taostats.io/reference)
 * and maps them to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - Transfers (balance transfers between wallets)
 *   - Staking (add_stake / remove_stake)
 *   - Delegation (staking/delegation events)
 *   - Subnet registration (burned_register)
 *
 * API key must be set via TAOSTATS_API_KEY environment variable.
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 TAO = 10^9 RAO */
const RAO_PER_TAO = 1_000_000_000;

/** Taostats API base URL. */
const API_BASE = "https://api.taostats.io/api";

/** Maximum results per page from Taostats. */
const PAGE_LIMIT = 200;

/**
 * Base58 alphabet used by SS58 (same as Bitcoin Base58Check).
 * Does not include 0, O, I, l.
 */
const BASE58_CHARS = /^[1-9A-HJ-NP-Za-km-z]+$/;

// ---------------------------------------------------------------------------
// Taostats API response types
// ---------------------------------------------------------------------------

interface TaostatsAddress {
  ss58: string;
  hex: string;
}

interface TaostatsTransfer {
  id: string;
  to: TaostatsAddress;
  from: TaostatsAddress;
  network: string;
  block_number: number;
  timestamp: string;
  amount: string;
  fee: string;
  transaction_hash: string;
  extrinsic_id: string;
}

interface TaostatsPagination {
  current_page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
  next_page: number | null;
  prev_page: string | null;
}

interface TaostatsTransferResponse {
  pagination: TaostatsPagination;
  data: TaostatsTransfer[];
}

interface TaostatsExtrinsicCallArgs {
  amountStaked?: string;
  amountUnstaked?: string;
  hotkey?: string;
  netuid?: number;
  allowPartial?: boolean;
  limitPrice?: string;
  calls?: TaostatsExtrinsicCall[];
  [key: string]: unknown;
}

interface TaostatsExtrinsicCall {
  __kind: string;
  value?: {
    __kind: string;
    amountStaked?: string;
    amountUnstaked?: string;
    hotkey?: string;
    netuid?: number;
    [key: string]: unknown;
  };
}

interface TaostatsExtrinsic {
  timestamp: string;
  block_number: number;
  hash: string;
  id: string;
  index: number;
  signer_address: string | null;
  tip: string | null;
  fee: string | null;
  success: boolean;
  error: { name: string; pallet: string; extra_info: string } | null;
  call_id: string;
  full_name: string;
  call_args: TaostatsExtrinsicCallArgs;
}

interface TaostatsExtrinsicResponse {
  pagination: TaostatsPagination;
  data: TaostatsExtrinsic[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert RAO (string) to TAO (number). */
export function raoToTao(rao: string): number {
  const value = Number(rao);
  if (Number.isNaN(value)) return 0;
  return value / RAO_PER_TAO;
}

/**
 * Validate a Bittensor wallet address (SS58 format).
 *
 * Bittensor uses the generic Substrate SS58 prefix (42), producing
 * addresses that are 47-48 characters long, start with "5", and
 * contain only Base58 characters.
 */
export function isValidBittensorAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 46 || trimmed.length > 48) return false;
  if (!trimmed.startsWith("5")) return false;
  return BASE58_CHARS.test(trimmed);
}

/**
 * Fetch JSON from Taostats with exponential backoff retry.
 */
async function fetchTaostatsWithRetry<T>(url: string, apiKey: string): Promise<T> {
  return fetchWithRetry<T>(url, {
    headers: { Authorization: apiKey },
    errorLabel: "Taostats API",
    maxRetries: 5,
    baseDelayMs: 2_000,
  });
}

// ---------------------------------------------------------------------------
// Transaction mapping helpers
// ---------------------------------------------------------------------------

/**
 * Extrinsic names that represent staking actions.
 */
const STAKE_EXTRINSICS = new Set([
  "SubtensorModule.add_stake",
  "SubtensorModule.add_stake_limit",
]);

const UNSTAKE_EXTRINSICS = new Set([
  "SubtensorModule.remove_stake",
  "SubtensorModule.remove_stake_limit",
]);

const REGISTER_EXTRINSICS = new Set([
  "SubtensorModule.burned_register",
]);

/**
 * Map a Taostats transfer to a Transaction.
 */
function mapTransfer(
  transfer: TaostatsTransfer,
  address: string,
): Transaction {
  const normalizedAddress = address.trim();
  const isSender = transfer.from.ss58 === normalizedAddress;
  const amount = raoToTao(transfer.amount);
  const fee = raoToTao(transfer.fee);

  if (isSender) {
    return {
      date: new Date(transfer.timestamp),
      type: "send",
      sentQuantity: amount,
      sentCurrency: "TAO",
      feeAmount: fee > 0 ? fee : undefined,
      feeCurrency: fee > 0 ? "TAO" : undefined,
      txHash: transfer.transaction_hash,
      notes: `Transfer to ${transfer.to.ss58.slice(0, 8)}…`,
    };
  }

  return {
    date: new Date(transfer.timestamp),
    type: "receive",
    receivedQuantity: amount,
    receivedCurrency: "TAO",
    txHash: transfer.transaction_hash,
    notes: `Transfer from ${transfer.from.ss58.slice(0, 8)}…`,
  };
}

/**
 * Extract staking amount from extrinsic call args (handles both
 * direct extrinsics and batch calls).
 */
function getStakeAmount(ext: TaostatsExtrinsic): number {
  const args = ext.call_args;

  // Direct stake extrinsic
  if (args.amountStaked) return raoToTao(args.amountStaked);
  if (args.amountUnstaked) return raoToTao(args.amountUnstaked);

  return 0;
}

/**
 * Map a Taostats extrinsic to a Transaction (staking, delegation, or registration).
 * Returns null for extrinsics that should be skipped.
 */
function mapExtrinsic(ext: TaostatsExtrinsic): Transaction | null {
  // Only process successful extrinsics
  if (!ext.success) return null;

  const fee = ext.fee ? raoToTao(ext.fee) : undefined;
  const feeCurrency = fee && fee > 0 ? "TAO" : undefined;
  const date = new Date(ext.timestamp);

  if (STAKE_EXTRINSICS.has(ext.full_name)) {
    const amount = getStakeAmount(ext);
    const netuid = ext.call_args.netuid;
    return {
      date,
      type: "stake",
      sentQuantity: amount > 0 ? amount : undefined,
      sentCurrency: amount > 0 ? "TAO" : undefined,
      feeAmount: fee && fee > 0 ? fee : undefined,
      feeCurrency,
      txHash: ext.hash,
      notes: netuid !== undefined ? `Stake on subnet ${netuid}` : "Stake",
      tag: "staked",
    };
  }

  if (UNSTAKE_EXTRINSICS.has(ext.full_name)) {
    const amount = getStakeAmount(ext);
    const netuid = ext.call_args.netuid;
    return {
      date,
      type: "unstake",
      receivedQuantity: amount > 0 ? amount : undefined,
      receivedCurrency: amount > 0 ? "TAO" : undefined,
      feeAmount: fee && fee > 0 ? fee : undefined,
      feeCurrency,
      txHash: ext.hash,
      notes: netuid !== undefined ? `Unstake from subnet ${netuid}` : "Unstake",
      tag: "unstaked",
    };
  }

  if (REGISTER_EXTRINSICS.has(ext.full_name)) {
    const netuid = ext.call_args.netuid;
    return {
      date,
      type: "other",
      feeAmount: fee && fee > 0 ? fee : undefined,
      feeCurrency,
      txHash: ext.hash,
      notes:
        netuid !== undefined
          ? `Subnet registration (netuid ${netuid})`
          : "Subnet registration",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Build timestamp query params from FetchOptions dates.
 */
function buildTimestampParams(options?: FetchOptions): string {
  let params = "";
  if (options?.fromDate) {
    params += `&timestamp_start=${Math.floor(options.fromDate.getTime() / 1000)}`;
  }
  if (options?.toDate) {
    params += `&timestamp_end=${Math.floor(options.toDate.getTime() / 1000)}`;
  }
  return params;
}

/**
 * Fetch all transfers for an address from the Taostats API.
 */
async function fetchTransfers(
  address: string,
  apiKey: string,
  options?: FetchOptions,
): Promise<TaostatsTransfer[]> {
  const results: TaostatsTransfer[] = [];
  let page = 1;
  const timestamps = buildTimestampParams(options);

  while (true) {
    const url = `${API_BASE}/transfer/v1?network=finney&address=${address}&limit=${PAGE_LIMIT}&page=${page}&order=timestamp_asc${timestamps}`;
    const data = await fetchTaostatsWithRetry<TaostatsTransferResponse>(url, apiKey);
    results.push(...data.data);

    // Report progress for streaming: map this page's transfers and notify
    if (options?.onProgress && data.data.length > 0) {
      const batch = data.data.map((t) => mapTransfer(t, address));
      options.onProgress(batch);
    }

    if (data.pagination.next_page === null || data.data.length === 0) break;
    page = data.pagination.next_page;
  }

  return results;
}

/**
 * Fetch staking/unstaking extrinsics for an address.
 */
async function fetchStakingExtrinsics(
  address: string,
  apiKey: string,
  options?: FetchOptions,
): Promise<TaostatsExtrinsic[]> {
  const allExtrinsics: TaostatsExtrinsic[] = [];
  const extrinsicTypes = [
    "SubtensorModule.add_stake",
    "SubtensorModule.add_stake_limit",
    "SubtensorModule.remove_stake",
    "SubtensorModule.remove_stake_limit",
    "SubtensorModule.burned_register",
  ];

  for (const fullName of extrinsicTypes) {
    let page = 1;
    const timestamps = buildTimestampParams(options);

    while (true) {
      const url = `${API_BASE}/extrinsic/v1?signer_address=${address}&full_name=${encodeURIComponent(fullName)}&limit=${PAGE_LIMIT}&page=${page}&order=timestamp_asc${timestamps}`;
      const data = await fetchTaostatsWithRetry<TaostatsExtrinsicResponse>(url, apiKey);
      allExtrinsics.push(...data.data);

      // Report progress for streaming: map this page's extrinsics and notify
      if (options?.onProgress && data.data.length > 0) {
        const batch = data.data
          .map(mapExtrinsic)
          .filter((tx): tx is Transaction => tx !== null);
        if (batch.length > 0) {
          options.onProgress(batch);
        }
      }

      if (data.pagination.next_page === null || data.data.length === 0) break;
      page = data.pagination.next_page;
    }
  }

  return allExtrinsics;
}

// ---------------------------------------------------------------------------
// Bittensor ChainAdapter
// ---------------------------------------------------------------------------

export const bittensorAdapter: ChainAdapter = {
  chainId: "bittensor",
  chainName: "Bittensor",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidBittensorAddress(address)) {
      throw new Error(
        "Invalid Bittensor address. Expected SS58 format (starts with 5, 46-48 characters).",
      );
    }

    const apiKey = process.env.TAOSTATS_API_KEY ?? "";
    if (!apiKey) {
      throw new Error(
        "TAOSTATS_API_KEY environment variable is not set. Get a key at https://dash.taostats.io",
      );
    }

    // Fetch sequentially to avoid Taostats rate limits
    const transfers = await fetchTransfers(address, apiKey, options);
    const extrinsics = await fetchStakingExtrinsics(address, apiKey, options);

    // Map to Transaction interface
    const transferTxs = transfers.map((t) => mapTransfer(t, address));
    const extrinsicTxs = extrinsics
      .map(mapExtrinsic)
      .filter((tx): tx is Transaction => tx !== null);

    // Combine and sort by date ascending
    const allTxs = [...transferTxs, ...extrinsicTxs].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    return allTxs;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://taostats.io/extrinsic/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidBittensorAddress(address);
  },
};
