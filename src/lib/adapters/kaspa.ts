/**
 * Kaspa (KAS) chain adapter.
 *
 * Fetches transactions from the Kaspa Explorer REST API (https://api.kaspa.org/)
 * and maps them to the AwakenFetch Transaction interface.
 *
 * Kaspa is a UTXO-based chain, so each transaction has inputs and outputs.
 * We resolve previous outpoints (light mode) to determine the sender addresses
 * and amounts, then compute the net effect on the queried wallet address.
 *
 * Supported transaction types:
 *   - Sends (address appears in inputs but not outputs, or net outflow)
 *   - Receives (address appears in outputs but not inputs, or net inflow)
 *
 * The Kaspa REST API is public and requires no API key.
 */

import type { ChainAdapter, FetchOptions, Transaction } from "@/types";
import { generateStandardCSV } from "@/lib/csv";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 KAS = 10^8 sompi */
const SOMPI_PER_KAS = 100_000_000;

/** Kaspa REST API base URL. */
const API_BASE = "https://api.kaspa.org";

/** Maximum results per page from the API. */
const PAGE_LIMIT = 500;

/**
 * Kaspa address regex.
 * Kaspa addresses follow the pattern: kaspa:[a-z0-9]{61,63}
 */
const KASPA_ADDRESS_REGEX = /^kaspa:[a-z0-9]{61,63}$/;

// ---------------------------------------------------------------------------
// Kaspa API response types
// ---------------------------------------------------------------------------

interface KaspaTxOutput {
  transaction_id: string;
  index: number;
  amount: number;
  script_public_key: string;
  script_public_key_address: string;
  script_public_key_type: string;
  accepting_block_hash?: string;
}

interface KaspaTxInput {
  transaction_id: string;
  index: number;
  previous_outpoint_hash: string;
  previous_outpoint_index: string;
  previous_outpoint_resolved?: KaspaTxOutput;
  previous_outpoint_address?: string;
  previous_outpoint_amount?: number;
  signature_script: string;
  sig_op_count: string;
}

interface KaspaTransaction {
  subnetwork_id: string;
  transaction_id: string;
  hash: string;
  mass: string;
  payload: string;
  block_hash: string[];
  block_time: number;
  is_accepted: boolean;
  accepting_block_hash: string;
  accepting_block_blue_score: number;
  accepting_block_time: number;
  inputs: KaspaTxInput[] | null;
  outputs: KaspaTxOutput[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert sompi (number) to KAS (number). */
export function sompiToKas(sompi: number): number {
  if (Number.isNaN(sompi)) return 0;
  return sompi / SOMPI_PER_KAS;
}

/**
 * Validate a Kaspa wallet address.
 *
 * Kaspa addresses follow the pattern: kaspa:<62-char bech32-like payload>
 * The regex pattern from the API is: ^kaspa:[a-z0-9]{61,63}$
 */
export function isValidKaspaAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  return KASPA_ADDRESS_REGEX.test(trimmed);
}

/**
 * Fetch JSON from Kaspa API with exponential backoff retry.
 */
async function fetchKaspaWithRetry<T>(url: string): Promise<T> {
  return fetchWithRetry<T>(url, {
    errorLabel: "Kaspa API",
  });
}

// ---------------------------------------------------------------------------
// Transaction mapping
// ---------------------------------------------------------------------------

/**
 * Determine whether a Kaspa UTXO transaction is a coinbase (mining reward).
 * Coinbase transactions have inputs with all-zero previous_outpoint_hash.
 */
function isCoinbaseTx(tx: KaspaTransaction): boolean {
  if (!tx.inputs || tx.inputs.length === 0) return true;
  return tx.inputs.every(
    (input) =>
      input.previous_outpoint_hash ===
      "0000000000000000000000000000000000000000000000000000000000000000",
  );
}

/**
 * Map a Kaspa transaction to a Transaction record relative to the queried address.
 *
 * For UTXO transactions we sum:
 *   - Total inputs from our address  → what we sent (including change)
 *   - Total outputs to our address   → what we received (including change)
 *
 * Net effect:
 *   - If inputTotal > 0 && outputTotal > 0 && inputTotal > outputTotal → send (sent = inputTotal - outputTotal)
 *   - If inputTotal == 0 && outputTotal > 0 → receive
 *   - If inputTotal > 0 && outputTotal == 0 → send
 *
 * Fee is the difference between total inputs and total outputs of the entire tx
 * (only charged to the sender).
 */
function mapTransaction(
  tx: KaspaTransaction,
  address: string,
): Transaction | null {
  // Skip unaccepted transactions
  if (!tx.is_accepted) return null;

  const normalizedAddress = address.trim();

  // Sum inputs from our address
  let inputFromUs = 0;
  if (tx.inputs) {
    for (const input of tx.inputs) {
      const inputAddress =
        input.previous_outpoint_address ??
        input.previous_outpoint_resolved?.script_public_key_address;
      if (inputAddress === normalizedAddress) {
        const amount =
          input.previous_outpoint_amount ??
          input.previous_outpoint_resolved?.amount ??
          0;
        inputFromUs += amount;
      }
    }
  }

  // Sum outputs to our address
  let outputToUs = 0;
  for (const output of tx.outputs) {
    if (output.script_public_key_address === normalizedAddress) {
      outputToUs += output.amount;
    }
  }

  // Skip transactions that don't involve our address at all
  if (inputFromUs === 0 && outputToUs === 0) return null;

  // Calculate total tx fee (total inputs - total outputs), only for non-coinbase
  let totalInputs = 0;
  let totalOutputs = 0;
  if (tx.inputs && !isCoinbaseTx(tx)) {
    for (const input of tx.inputs) {
      const amount =
        input.previous_outpoint_amount ??
        input.previous_outpoint_resolved?.amount ??
        0;
      totalInputs += amount;
    }
    for (const output of tx.outputs) {
      totalOutputs += output.amount;
    }
  }
  const txFee = totalInputs > totalOutputs ? totalInputs - totalOutputs : 0;

  // Use accepting_block_time (milliseconds) for the date
  const timestamp = tx.accepting_block_time ?? tx.block_time;
  const date = new Date(timestamp);

  // Coinbase (mining reward) → receive
  if (isCoinbaseTx(tx)) {
    if (outputToUs === 0) return null;
    return {
      date,
      type: "receive",
      receivedQuantity: sompiToKas(outputToUs),
      receivedCurrency: "KAS",
      txHash: tx.transaction_id,
      notes: "Mining reward",
    };
  }

  // Our address only appears in outputs → receive
  if (inputFromUs === 0 && outputToUs > 0) {
    return {
      date,
      type: "receive",
      receivedQuantity: sompiToKas(outputToUs),
      receivedCurrency: "KAS",
      txHash: tx.transaction_id,
    };
  }

  // Our address only appears in inputs → send (all outputs go elsewhere)
  if (inputFromUs > 0 && outputToUs === 0) {
    // Net sent = inputFromUs - fee (fee is separate)
    const netSent = inputFromUs - txFee;
    return {
      date,
      type: "send",
      sentQuantity: sompiToKas(netSent > 0 ? netSent : inputFromUs),
      sentCurrency: "KAS",
      feeAmount: txFee > 0 ? sompiToKas(txFee) : undefined,
      feeCurrency: txFee > 0 ? "KAS" : undefined,
      txHash: tx.transaction_id,
    };
  }

  // Our address appears in both inputs and outputs → send with change back
  if (inputFromUs > 0 && outputToUs > 0) {
    const netSent = inputFromUs - outputToUs;
    if (netSent > 0) {
      // We sent more than we got back (change) → it's a send
      // The actual amount sent to others = netSent - fee
      const sentToOthers = netSent - txFee;
      return {
        date,
        type: "send",
        sentQuantity: sompiToKas(
          sentToOthers > 0 ? sentToOthers : netSent,
        ),
        sentCurrency: "KAS",
        feeAmount: txFee > 0 ? sompiToKas(txFee) : undefined,
        feeCurrency: txFee > 0 ? "KAS" : undefined,
        txHash: tx.transaction_id,
      };
    }
    // We received more than we put in (shouldn't happen in normal UTXO model
    // unless it's a consolidation with external funding)
    const netReceived = outputToUs - inputFromUs;
    return {
      date,
      type: "receive",
      receivedQuantity: sompiToKas(netReceived),
      receivedCurrency: "KAS",
      txHash: tx.transaction_id,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for an address from the Kaspa API.
 * Uses pagination (offset/limit) to retrieve all records.
 */
async function fetchAllTransactions(
  address: string,
  options?: FetchOptions,
): Promise<KaspaTransaction[]> {
  const results: KaspaTransaction[] = [];
  let offset = 0;

  while (true) {
    const url = `${API_BASE}/addresses/${address}/full-transactions?limit=${PAGE_LIMIT}&offset=${offset}&resolve_previous_outpoints=light`;
    const data = await fetchKaspaWithRetry<KaspaTransaction[]>(url);

    if (!Array.isArray(data) || data.length === 0) break;

    results.push(...data);

    if (data.length < PAGE_LIMIT) break;
    offset += data.length;
  }

  // Apply date filtering if provided
  if (options?.fromDate || options?.toDate) {
    const fromMs = options.fromDate ? options.fromDate.getTime() : 0;
    const toMs = options.toDate ? options.toDate.getTime() : Infinity;

    return results.filter((tx) => {
      const txTime = tx.accepting_block_time ?? tx.block_time;
      return txTime >= fromMs && txTime <= toMs;
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Kaspa ChainAdapter
// ---------------------------------------------------------------------------

export const kaspaAdapter: ChainAdapter = {
  chainId: "kaspa",
  chainName: "Kaspa",

  async fetchTransactions(
    address: string,
    options?: FetchOptions,
  ): Promise<Transaction[]> {
    if (!isValidKaspaAddress(address)) {
      throw new Error(
        "Invalid Kaspa address. Expected format: kaspa:<62-char bech32 payload> (e.g. kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73)",
      );
    }

    const rawTxs = await fetchAllTransactions(address, options);

    // Map to Transaction interface and filter nulls
    const transactions = rawTxs
      .map((tx) => mapTransaction(tx, address))
      .filter((tx): tx is Transaction => tx !== null);

    // Sort by date ascending
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return transactions;
  },

  toAwakenCSV(txs: Transaction[]): string {
    return generateStandardCSV(txs);
  },

  getExplorerUrl(txHash: string): string {
    return `https://explorer.kaspa.org/txs/${txHash}`;
  },

  validateAddress(address: string): boolean {
    return isValidKaspaAddress(address);
  },
};
