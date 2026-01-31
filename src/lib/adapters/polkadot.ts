/**
 * Polkadot (DOT) chain adapter.
 *
 * Fetches transactions from the Subscan API
 * (https://polkadot.api.subscan.io/) and maps them
 * to the AwakenFetch Transaction interface.
 *
 * Supported transaction types:
 *   - DOT transfers (sends / receives)
 *   - Staking rewards (claim)
 *   - Staking slashes
 *   - Staking operations (bond, unbond, nominate, etc.)
 *   - Parachain crowdloan contributions
 *
 * The Subscan API requires an API key for higher rate limits.
 * Free tier allows basic access. Key is sent via x-api-key header.
 * Address format: SS58 (starts with "1", 46-48 chars, Base58).
 *
 * DOT has 10 decimal places (1 DOT = 10,000,000,000 plancks).
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 DOT = 10^10 plancks. */
const PLANCK_DIVISOR = 10_000_000_000;

/** Subscan API base URL for Polkadot mainnet. */
const API_BASE = "https://polkadot.api.subscan.io";

/** Maximum results per page from the API (capped at 100). */
const PAGE_SIZE = 100;

/**
 * Polkadot SS58 address regex.
 * Polkadot addresses start with "1" and are 46-48 characters using Base58.
 */
const DOT_ADDRESS_REGEX = /^1[1-9A-HJ-NP-Za-km-z]{45,47}$/;

/** Base58 character set (no 0, O, I, l). */
const BASE58_CHARS = /^[1-9A-HJ-NP-Za-km-z]+$/;

// ---------------------------------------------------------------------------
// Subscan API response types
// ---------------------------------------------------------------------------

interface SubscanTransfer {
  from: string;
  to: string;
  extrinsic_index: string;
  success: boolean;
  hash: string;
  block_num: number;
  block_timestamp: number;
  module: string;
  amount: string;
  amount_v2: string;
  fee: string;
  nonce: number;
  asset_symbol: string;
  asset_unique_id: string;
  asset_type: string;
  from_account_display: { address: string };
  to_account_display: { address: string };
  event_idx: number;
}

interface SubscanTransfersResponse {
  code: number;
  message: string;
  data: {
    count: number;
    transfers: SubscanTransfer[] | null;
  };
}

interface SubscanRewardSlash {
  account: string;
  amount: string;
  block_timestamp: number;
  era: number;
  event_id: string;
  event_index: string;
  extrinsic_index: string;
  invalid_era: boolean;
  module_id: string;
  stash: string;
  validator_stash: string;
}

interface SubscanRewardSlashResponse {
  code: number;
  message: string;
  data: {
    count: number;
    list: SubscanRewardSlash[] | null;
  };
}

interface SubscanExtrinsic {
  block_num: number;
  block_timestamp: number;
  extrinsic_index: string;
  call_module_function: string;
  call_module: string;
  extrinsic_hash: string;
  success: boolean;
  fee: string;
  fee_used: string;
  id: number;
  nonce: number;
  tip: string;
  account_display: { address: string };
}

interface SubscanExtrinsicsResponse {
  code: number;
  message: string;
  data: {
    count: number;
    extrinsics: SubscanExtrinsic[] | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert planck string to DOT number.
 */
export function plancksToDot(plancks: string): number {
  if (!plancks || plancks === "0") return 0;
  const num = parseFloat(plancks);
  if (Number.isNaN(num)) return 0;
  return num / PLANCK_DIVISOR;
}

/**
 * Validate a Polkadot SS58 address.
 *
 * Polkadot addresses start with "1" and are 46-48 characters long,
 * using only Base58 characters.
 */
export function isValidPolkadotAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 46 || trimmed.length > 48) return false;
  if (!trimmed.startsWith("1")) return false;
  if (!BASE58_CHARS.test(trimmed)) return false;
  return DOT_ADDRESS_REGEX.test(trimmed);
}

/**
 * Build common headers for Subscan API requests.
 */
function getSubscanHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // API key is optional but recommended for higher rate limits
  const apiKey = typeof process !== "undefined"
    ? process.env.SUBSCAN_API_KEY ?? process.env.NEXT_PUBLIC_SUBSCAN_API_KEY
    : undefined;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

/**
 * Fetch JSON from Subscan API via POST with exponential backoff retry.
 */
async function fetchSubscanWithRetry<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  return fetchWithRetry<T>(`${API_BASE}${endpoint}`, {
    errorLabel: "Subscan API",
    baseDelayMs: 1_000,
    method: "POST",
    headers: getSubscanHeaders(),
    body: JSON.stringify(body),
  });
}

/**
 * Classify a staking extrinsic call into a transaction type.
 */
function classifyStakingCall(
  callModule: string,
  callFunction: string,
): { type: Transaction["type"]; notes: string } {
  const mod = callModule.toLowerCase();
  const fn = callFunction.toLowerCase();

  if (mod === "staking") {
    if (fn === "bond" || fn === "bond_extra") {
      return { type: "stake", notes: `Staking: ${callFunction}` };
    }
    if (fn === "unbond") {
      return { type: "unstake", notes: "Staking: unbond" };
    }
    if (fn === "withdraw_unbonded") {
      return { type: "unstake", notes: "Staking: withdraw_unbonded" };
    }
    if (fn === "nominate") {
      return { type: "stake", notes: "Staking: nominate" };
    }
    if (fn === "chill") {
      return { type: "unstake", notes: "Staking: chill" };
    }
    if (fn === "payout_stakers") {
      return { type: "claim", notes: "Staking: payout_stakers" };
    }
    if (fn === "rebond") {
      return { type: "stake", notes: "Staking: rebond" };
    }
    if (fn === "set_payee" || fn === "set_controller") {
      return { type: "other", notes: `Staking: ${callFunction}` };
    }
    return { type: "other", notes: `Staking: ${callFunction}` };
  }

  if (mod === "nominationpools") {
    if (fn === "join" || fn === "bond_extra") {
      return { type: "stake", notes: `Nomination Pool: ${callFunction}` };
    }
    if (fn === "unbond" || fn === "withdraw_unbonded") {
      return { type: "unstake", notes: `Nomination Pool: ${callFunction}` };
    }
    if (fn === "claim_payout") {
      return { type: "claim", notes: "Nomination Pool: claim_payout" };
    }
    return { type: "other", notes: `Nomination Pool: ${callFunction}` };
  }

  if (mod === "crowdloan") {
    if (fn === "contribute") {
      return { type: "send", notes: "Crowdloan contribution" };
    }
    return { type: "other", notes: `Crowdloan: ${callFunction}` };
  }

  return { type: "other", notes: `${callModule}: ${callFunction}` };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all DOT transfers for an address from Subscan.
 * Uses page-based pagination.
 */
async function fetchAllTransfers(
  address: string,
  options?: FetchOptions,
): Promise<Transaction[]> {
  const results: Transaction[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const body: Record<string, unknown> = {
      address,
      row: PAGE_SIZE,
      page,
      order: "asc",
      direction: "all",
      success: true,
    };

    const data = await fetchSubscanWithRetry<SubscanTransfersResponse>(
      "/api/v2/scan/transfers",
      body,
    );

    if (data.code !== 0 || !data.data?.transfers || data.data.transfers.length === 0) {
      break;
    }

    const batchStart = results.length;

    for (const tx of data.data.transfers) {
      if (!tx.success) continue;

      const date = new Date(tx.block_timestamp * 1000);

      // Apply date filters
      if (options?.fromDate && date < options.fromDate) continue;
      if (options?.toDate && date > options.toDate) continue;

      const normalizedAddress = address.trim();
      const isSender = tx.from === normalizedAddress;
      const isReceiver = tx.to === normalizedAddress;
      const symbol = tx.asset_symbol || "DOT";

      // Parse amount — Subscan transfers already return human-readable amounts
      // in the `amount` field for DOT transfers
      const amount = parseFloat(tx.amount) || 0;
      if (amount === 0) continue;

      const fee = parseFloat(tx.fee) || 0;
      const feeInDot = fee > 0 ? plancksToDot(String(fee)) : 0;

      const result: Transaction = {
        date,
        type: "other",
        txHash: tx.hash,
      };

      if (isSender && !isReceiver) {
        result.type = "send";
        result.sentQuantity = amount;
        result.sentCurrency = symbol;
        if (feeInDot > 0) {
          result.feeAmount = feeInDot;
          result.feeCurrency = "DOT";
        }
      } else if (isReceiver && !isSender) {
        result.type = "receive";
        result.receivedQuantity = amount;
        result.receivedCurrency = symbol;
      } else if (isSender && isReceiver) {
        // Self-transfer (e.g. staking operations)
        result.type = "other";
        result.notes = "Self-transfer";
        if (feeInDot > 0) {
          result.feeAmount = feeInDot;
          result.feeCurrency = "DOT";
        }
      }

      results.push(result);
    }

    // Report progress for streaming
    if (options?.onProgress) {
      const batch = results.slice(batchStart);
      if (batch.length > 0) {
        options.onProgress(batch);
      }
    }

    if (data.data.transfers.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return results;
}

/**
 * Fetch all staking rewards and slashes for an address from Subscan.
 */
async function fetchAllRewardsAndSlashes(
  address: string,
  options?: FetchOptions,
): Promise<Transaction[]> {
  const results: Transaction[] = [];

  // Fetch rewards
  for (const category of ["Reward", "Slash"] as const) {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const body: Record<string, unknown> = {
        address,
        row: PAGE_SIZE,
        page,
        category,
        is_stash: true,
      };

      const data = await fetchSubscanWithRetry<SubscanRewardSlashResponse>(
        "/api/v2/scan/account/reward_slash",
        body,
      );

      if (data.code !== 0 || !data.data?.list || data.data.list.length === 0) {
        break;
      }

      for (const item of data.data.list) {
        const date = new Date(item.block_timestamp * 1000);

        // Apply date filters
        if (options?.fromDate && date < options.fromDate) continue;
        if (options?.toDate && date > options.toDate) continue;

        const amount = plancksToDot(item.amount);
        if (amount === 0) continue;

        if (category === "Reward") {
          results.push({
            date,
            type: "claim",
            receivedQuantity: amount,
            receivedCurrency: "DOT",
            txHash: item.extrinsic_index,
            notes: `Staking reward (era ${item.era})`,
          });
        } else {
          // Slash — record as a loss/send
          results.push({
            date,
            type: "send",
            sentQuantity: amount,
            sentCurrency: "DOT",
            txHash: item.extrinsic_index,
            notes: `Staking slash (era ${item.era})`,
            tag: "lost",
          });
        }
      }

      if (data.data.list.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  return results;
}

/**
 * Fetch staking-related extrinsics (bond, unbond, nominate, crowdloan, etc.)
 * that are not already covered by the transfers API.
 */
async function fetchStakingExtrinsics(
  address: string,
  options?: FetchOptions,
): Promise<Transaction[]> {
  const results: Transaction[] = [];
  const stakingModules = ["staking", "nominationpools", "crowdloan"];

  for (const mod of stakingModules) {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const body: Record<string, unknown> = {
        address,
        row: PAGE_SIZE,
        page,
        order: "asc",
        module: mod,
        success: true,
      };

      const data = await fetchSubscanWithRetry<SubscanExtrinsicsResponse>(
        "/api/v2/scan/extrinsics",
        body,
      );

      if (data.code !== 0 || !data.data?.extrinsics || data.data.extrinsics.length === 0) {
        break;
      }

      for (const ext of data.data.extrinsics) {
        if (!ext.success) continue;

        const date = new Date(ext.block_timestamp * 1000);

        // Apply date filters
        if (options?.fromDate && date < options.fromDate) continue;
        if (options?.toDate && date > options.toDate) continue;

        const { type, notes } = classifyStakingCall(
          ext.call_module,
          ext.call_module_function,
        );

        const fee = parseFloat(ext.fee) || 0;
        const feeInDot = fee > 0 ? plancksToDot(String(fee)) : 0;

        const result: Transaction = {
          date,
          type,
          txHash: ext.extrinsic_hash,
          notes,
        };

        if (feeInDot > 0) {
          result.feeAmount = feeInDot;
          result.feeCurrency = "DOT";
        }

        results.push(result);
      }

      if (data.data.extrinsics.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  return results;
}

/**
 * Deduplicate transactions by txHash + type combination.
 * When the same txHash appears as both a transfer and a staking extrinsic,
 * prefer the transfer record (it has more details like amount).
 */
function deduplicateTransactions(txs: Transaction[]): Transaction[] {
  const seen = new Map<string, Transaction>();

  for (const tx of txs) {
    const key = `${tx.txHash ?? ""}-${tx.date.getTime()}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, tx);
    } else {
      // Prefer the transaction with more information (has amounts)
      const existingHasAmount = existing.sentQuantity !== undefined || existing.receivedQuantity !== undefined;
      const newHasAmount = tx.sentQuantity !== undefined || tx.receivedQuantity !== undefined;

      if (!existingHasAmount && newHasAmount) {
        seen.set(key, tx);
      }
    }
  }

  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Polkadot ChainAdapter
// ---------------------------------------------------------------------------

export const polkadotAdapter: ChainAdapter = {
  chainId: "polkadot",
  chainName: "Polkadot",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidPolkadotAddress(address)) {
      throw new Error(
        "Invalid Polkadot address. Expected SS58 format starting with \"1\" (46-48 characters).",
      );
    }

    const normalizedAddress = address.trim();

    // Fetch transfers, rewards/slashes, and staking extrinsics in parallel
    const [transfers, rewardsSlashes, stakingExts] = await Promise.all([
      fetchAllTransfers(normalizedAddress, options),
      fetchAllRewardsAndSlashes(normalizedAddress, options),
      fetchStakingExtrinsics(normalizedAddress, options),
    ]);

    // Combine and deduplicate
    const allTxs = [...transfers, ...rewardsSlashes, ...stakingExts];
    const deduplicated = deduplicateTransactions(allTxs);

    // Sort by date ascending
    deduplicated.sort((a, b) => a.date.getTime() - b.date.getTime());

    return deduplicated;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://polkadot.subscan.io/extrinsic/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidPolkadotAddress(address);
  },
};
