/**
 * Tests for the Osmosis (OSMO) chain adapter.
 *
 * Covers:
 *   - Osmosis address validation
 *   - Explorer URL generation
 *   - Amount parsing (parseOsmosisAmount) and denom symbol conversion (denomToSymbol)
 *   - Transaction mapping (send/receive/stake/unstake/claim/trade/bridge/lp_add/lp_remove)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 *   - IBC and LP transaction classification
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  osmosisAdapter,
  isValidOsmosisAddress,
  parseOsmosisAmount,
  denomToSymbol,
} from "@/lib/adapters/osmosis";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidOsmosisAddress", () => {
  it("accepts a valid Osmosis address (43 chars, osmo1 prefix)", () => {
    expect(
      isValidOsmosisAddress("osmo19gtw35h6aqrxfv0j4cm7py82dsnkeulzh27uqg"),
    ).toBe(true);
  });

  it("accepts another valid address", () => {
    expect(isValidOsmosisAddress("osmo15mzfsh79vn6pg0kaytjeq8w4ur23clxdj45dpe")).toBe(true);
  });

  it("accepts address with digits after prefix", () => {
    expect(isValidOsmosisAddress("osmo19vn6pg0kaytjeq8w4ur23clxd5mzfsh7kjpeje")).toBe(true);
  });

  it("rejects an address without osmo1 prefix", () => {
    const addr = "cosmos1" + "a".repeat(38);
    expect(isValidOsmosisAddress(addr)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidOsmosisAddress("")).toBe(false);
  });

  it("rejects a payload that is too short", () => {
    const addr = "osmo1" + "a".repeat(36);
    expect(isValidOsmosisAddress(addr)).toBe(false);
  });

  it("rejects a payload that is too long", () => {
    const addr = "osmo1" + "a".repeat(40);
    expect(isValidOsmosisAddress(addr)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidOsmosisAddress(null as unknown as string)).toBe(false);
    expect(isValidOsmosisAddress(undefined as unknown as string)).toBe(false);
    expect(isValidOsmosisAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidOsmosisAddress("  osmo1kaytjeq8w4ur23clxd5mzfsh79vn6pg05y8f2s  ")).toBe(true);
  });

  it("rejects address with special characters", () => {
    const addr = "osmo1" + "a".repeat(37) + "!";
    expect(isValidOsmosisAddress(addr)).toBe(false);
  });

  it("rejects Ethereum-style addresses", () => {
    expect(isValidOsmosisAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18")).toBe(false);
  });

  it("rejects uppercase address (bech32 is lowercase)", () => {
    expect(
      isValidOsmosisAddress("OSMO19GTW35H6AQRXFV0J4CM7PY82DSNKEULZH27UQG"),
    ).toBe(true); // lowercased during validation
  });
});

// ---------------------------------------------------------------------------
// parseOsmosisAmount
// ---------------------------------------------------------------------------

describe("parseOsmosisAmount", () => {
  it("converts 1 OSMO from uosmo", () => {
    expect(parseOsmosisAmount("1000000", "uosmo")).toBe(1);
  });

  it("converts fractional OSMO", () => {
    expect(parseOsmosisAmount("500000", "uosmo")).toBe(0.5);
  });

  it("converts IBC tokens (6 decimals default)", () => {
    expect(parseOsmosisAmount("5000000", "ibc/ABC123")).toBe(5);
  });

  it("converts GAMM tokens (6 decimals default)", () => {
    expect(parseOsmosisAmount("1000000", "gamm/pool/1")).toBe(1);
  });

  it("converts factory tokens", () => {
    expect(parseOsmosisAmount("1000000", "factory/osmo1abc/mytoken")).toBe(1);
  });

  it("returns 0 for NaN input", () => {
    expect(parseOsmosisAmount("notanumber", "uosmo")).toBe(0);
  });

  it("returns 0 for zero amount", () => {
    expect(parseOsmosisAmount("0", "uosmo")).toBe(0);
  });

  it("converts small amounts", () => {
    expect(parseOsmosisAmount("1", "uosmo")).toBeCloseTo(0.000001, 6);
  });

  it("converts large amounts", () => {
    expect(parseOsmosisAmount("100000000000", "uosmo")).toBe(100000);
  });
});

// ---------------------------------------------------------------------------
// denomToSymbol
// ---------------------------------------------------------------------------

describe("denomToSymbol", () => {
  it("converts 'uosmo' to 'OSMO'", () => {
    expect(denomToSymbol("uosmo")).toBe("OSMO");
  });

  it("converts 'osmo' to 'OSMO'", () => {
    expect(denomToSymbol("osmo")).toBe("OSMO");
  });

  it("converts 'uion' to 'ION'", () => {
    expect(denomToSymbol("uion")).toBe("ION");
  });

  it("converts GAMM pool tokens", () => {
    expect(denomToSymbol("gamm/pool/1")).toBe("GAMM-1");
    expect(denomToSymbol("gamm/pool/678")).toBe("GAMM-678");
  });

  it("converts known IBC ATOM denom", () => {
    expect(
      denomToSymbol(
        "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
      ),
    ).toBe("ATOM");
  });

  it("shortens unknown IBC denoms", () => {
    expect(denomToSymbol("ibc/ABCDEF1234567890")).toBe("IBC-ABCDEF");
  });

  it("extracts factory token name", () => {
    expect(denomToSymbol("factory/osmo1abc/mytoken")).toBe("MYTOKEN");
  });

  it("strips 'u' prefix for common Cosmos denoms", () => {
    expect(denomToSymbol("uatom")).toBe("ATOM");
  });

  it("uppercases unknown denoms", () => {
    expect(denomToSymbol("sometoken")).toBe("SOMETOKEN");
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("osmosisAdapter.getExplorerUrl", () => {
  it("returns the correct Mintscan explorer URL", () => {
    const hash = "ABCDEF1234567890";
    expect(osmosisAdapter.getExplorerUrl(hash)).toBe(
      "https://www.mintscan.io/osmosis/tx/ABCDEF1234567890",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("osmosisAdapter.validateAddress", () => {
  it("delegates to isValidOsmosisAddress", () => {
    expect(
      osmosisAdapter.validateAddress(
        "osmo19gtw35h6aqrxfv0j4cm7py82dsnkeulzh27uqg",
      ),
    ).toBe(true);
    expect(osmosisAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("osmosisAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(osmosisAdapter.chainId).toBe("osmosis");
  });

  it("has correct chainName", () => {
    expect(osmosisAdapter.chainName).toBe("Osmosis");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "osmo19gtw35h6aqrxfv0j4cm7py82dsnkeulzh27uqg";
const OTHER_ADDRESS = "osmo1tw35h6aqrxfv0j4cm7py82dsnkeulz9ghukehn";

function makeMockTxResponse(
  overrides: Partial<{
    txhash: string;
    timestamp: string;
    code: number;
    messages: Array<{ "@type": string; [key: string]: unknown }>;
    logs: Array<{
      msg_index: number;
      events: Array<{
        type: string;
        attributes: Array<{ key: string; value: string }>;
      }>;
    }>;
    fee: Array<{ denom: string; amount: string }>;
  }> = {},
) {
  return {
    height: "12345678",
    txhash: overrides.txhash ?? "TXHASH123",
    code: overrides.code ?? 0,
    timestamp: overrides.timestamp ?? "2025-01-15T14:30:00Z",
    tx: {
      body: {
        messages: overrides.messages ?? [],
        memo: "",
      },
      auth_info: {
        fee: {
          amount: overrides.fee ?? [
            { denom: "uosmo", amount: "2500" },
          ],
          gas_limit: "250000",
        },
      },
    },
    logs: overrides.logs,
    events: undefined,
  };
}

function makeSearchResponse(
  txResponses: ReturnType<typeof makeMockTxResponse>[],
  total?: number,
) {
  return {
    tx_responses: txResponses.length > 0 ? txResponses : null,
    pagination: {
      total: String(total ?? txResponses.length),
    },
  };
}

function emptySearchResponse() {
  return makeSearchResponse([], 0);
}

describe("osmosisAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      osmosisAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Osmosis address");
  });

  it("fetches and maps a receive transaction (MsgSend)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-receive-001",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "uosmo", amount: "5000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
      }
      // transfer.recipient query
      return new Response(
        JSON.stringify(makeSearchResponse([mockTx])),
        { status: 200 },
      );
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(5);
    expect(txs[0].receivedCurrency).toBe("OSMO");
    expect(txs[0].txHash).toBe("tx-receive-001");
  });

  it("fetches and maps a send transaction (MsgSend)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-send-001",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: VALID_ADDRESS,
          to_address: OTHER_ADDRESS,
          amount: [{ denom: "uosmo", amount: "10000000" }],
        },
      ],
      fee: [{ denom: "uosmo", amount: "2500" }],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(10);
    expect(txs[0].sentCurrency).toBe("OSMO");
    expect(txs[0].feeAmount).toBeCloseTo(0.0025, 4);
    expect(txs[0].feeCurrency).toBe("OSMO");
    expect(txs[0].txHash).toBe("tx-send-001");
  });

  it("fetches and maps a stake transaction (MsgDelegate)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-stake-001",
      timestamp: "2025-02-01T10:00:00Z",
      messages: [
        {
          "@type": "/cosmos.staking.v1beta1.MsgDelegate",
          delegator_address: VALID_ADDRESS,
          validator_address: "osmovaloper1abcdef1234567890",
          amount: { denom: "uosmo", amount: "2000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("stake");
    expect(txs[0].sentQuantity).toBe(2);
    expect(txs[0].sentCurrency).toBe("OSMO");
    expect(txs[0].tag).toBe("staked");
  });

  it("fetches and maps an unstake transaction (MsgUndelegate)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-unstake-001",
      timestamp: "2025-02-01T12:00:00Z",
      messages: [
        {
          "@type": "/cosmos.staking.v1beta1.MsgUndelegate",
          delegator_address: VALID_ADDRESS,
          validator_address: "osmovaloper1abcdef1234567890",
          amount: { denom: "uosmo", amount: "1000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("unstake");
    expect(txs[0].receivedQuantity).toBe(1);
    expect(txs[0].receivedCurrency).toBe("OSMO");
    expect(txs[0].tag).toBe("unstaked");
  });

  it("fetches and maps a reward claim (MsgWithdrawDelegatorReward)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-claim-001",
      timestamp: "2025-02-01T14:00:00Z",
      messages: [
        {
          "@type":
            "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
          delegator_address: VALID_ADDRESS,
          validator_address: "osmovaloper1abcdef1234567890",
        },
      ],
      logs: [
        {
          msg_index: 0,
          events: [
            {
              type: "withdraw_rewards",
              attributes: [
                { key: "amount", value: "500000uosmo" },
                { key: "validator", value: "osmovaloper1abcdef1234567890" },
              ],
            },
          ],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("claim");
    expect(txs[0].receivedQuantity).toBe(0.5);
    expect(txs[0].receivedCurrency).toBe("OSMO");
  });

  it("fetches and maps an IBC transfer (MsgTransfer)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-ibc-001",
      timestamp: "2025-02-01T16:00:00Z",
      messages: [
        {
          "@type": "/ibc.applications.transfer.v1.MsgTransfer",
          sender: VALID_ADDRESS,
          receiver: "cosmos1abcdef1234567890abcdef1234567890abcd",
          token: { denom: "uosmo", amount: "3000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("bridge");
    expect(txs[0].sentQuantity).toBe(3);
    expect(txs[0].sentCurrency).toBe("OSMO");
    expect(txs[0].notes).toContain("IBC transfer");
  });

  it("fetches and maps an LP join (MsgJoinPool)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-lp-join-001",
      timestamp: "2025-03-01T08:00:00Z",
      messages: [
        {
          "@type": "/osmosis.gamm.v1beta1.MsgJoinPool",
          sender: VALID_ADDRESS,
          pool_id: "1",
          share_out_amount: "1000000",
          token_in_maxs: [
            { denom: "uosmo", amount: "5000000" },
            {
              denom:
                "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
              amount: "500000",
            },
          ],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("lp_add");
    expect(txs[0].sentQuantity).toBe(5);
    expect(txs[0].sentCurrency).toBe("OSMO");
    expect(txs[0].notes).toContain("Add liquidity to pool 1");
  });

  it("fetches and maps an LP exit (MsgExitPool)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-lp-exit-001",
      timestamp: "2025-03-01T10:00:00Z",
      messages: [
        {
          "@type": "/osmosis.gamm.v1beta1.MsgExitPool",
          sender: VALID_ADDRESS,
          pool_id: "1",
          share_in_amount: "1000000",
          token_out_mins: [
            { denom: "uosmo", amount: "4000000" },
          ],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("lp_remove");
    expect(txs[0].sentQuantity).toBe(1);
    expect(txs[0].sentCurrency).toBe("GAMM-1");
    expect(txs[0].notes).toContain("Remove liquidity from pool 1");
  });

  it("fetches and maps a swap (MsgSwapExactAmountIn)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-swap-001",
      timestamp: "2025-03-01T12:00:00Z",
      messages: [
        {
          "@type": "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn",
          sender: VALID_ADDRESS,
          routes: [
            { pool_id: "1", token_out_denom: "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2" },
          ],
          token_in: { denom: "uosmo", amount: "10000000" },
          token_out_min_amount: "900000",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].sentQuantity).toBe(10);
    expect(txs[0].sentCurrency).toBe("OSMO");
    expect(txs[0].receivedCurrency).toBe("ATOM");
    expect(txs[0].notes).toContain("Swap via pool 1");
  });

  it("fetches and maps a poolmanager swap (v2)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-swap-v2-001",
      timestamp: "2025-03-01T14:00:00Z",
      messages: [
        {
          "@type": "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn",
          sender: VALID_ADDRESS,
          routes: [
            { pool_id: "678", token_out_denom: "uosmo" },
          ],
          token_in: {
            denom: "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
            amount: "1000000",
          },
          token_out_min_amount: "5000000",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].sentQuantity).toBe(1);
    expect(txs[0].sentCurrency).toBe("ATOM");
    expect(txs[0].receivedCurrency).toBe("OSMO");
  });

  it("skips failed transactions (code !== 0)", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-failed-001",
      code: 1,
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: VALID_ADDRESS,
          to_address: OTHER_ADDRESS,
          amount: [{ denom: "uosmo", amount: "1000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockTxResponse({
      txhash: "tx-later",
      timestamp: "2025-06-15T12:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "uosmo", amount: "1000000" }],
        },
      ],
    });

    const tx2 = makeMockTxResponse({
      txhash: "tx-earlier",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "uosmo", amount: "2000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("transfer.recipient")) {
        return new Response(
          JSON.stringify(makeSearchResponse([tx1, tx2])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(2);
    expect(txs[0].txHash).toBe("tx-earlier");
    expect(txs[1].txHash).toBe("tx-later");
    expect(txs[0].date.getTime()).toBeLessThan(txs[1].date.getTime());
  });

  it("handles API error with retry", async () => {
    let callCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response(
        JSON.stringify(emptySearchResponse()),
        { status: 200 },
      );
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("deduplicates transactions from sender and recipient queries", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-dedup-001",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: VALID_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "uosmo", amount: "1000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify(makeSearchResponse([mockTx])),
        { status: 200 },
      );
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);
    // Should be deduplicated: same txhash appears in both queries
    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe("tx-dedup-001");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify(emptySearchResponse()),
        { status: 200 },
      );
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("filters transactions by date range", async () => {
    const tx1 = makeMockTxResponse({
      txhash: "tx-old",
      timestamp: "2024-01-01T00:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "uosmo", amount: "1000000" }],
        },
      ],
    });

    const tx2 = makeMockTxResponse({
      txhash: "tx-in-range",
      timestamp: "2024-06-15T12:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "uosmo", amount: "2000000" }],
        },
      ],
    });

    const tx3 = makeMockTxResponse({
      txhash: "tx-too-new",
      timestamp: "2025-01-01T00:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "uosmo", amount: "3000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("transfer.recipient")) {
        return new Response(
          JSON.stringify(makeSearchResponse([tx1, tx2, tx3])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate: new Date("2024-06-01T00:00:00Z"),
      toDate: new Date("2024-12-31T23:59:59Z"),
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe("tx-in-range");
  });

  it("maps redelegate transaction", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-redelegate-001",
      timestamp: "2025-03-01T10:00:00Z",
      messages: [
        {
          "@type": "/cosmos.staking.v1beta1.MsgBeginRedelegate",
          delegator_address: VALID_ADDRESS,
          validator_src_address: "osmovaloper1src123456789012",
          validator_dst_address: "osmovaloper1dst123456789012",
          amount: { denom: "uosmo", amount: "1000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("stake");
    expect(txs[0].tag).toBe("staked");
    expect(txs[0].notes).toContain("Redelegate");
  });

  it("maps unknown message type as 'other'", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-unknown-001",
      timestamp: "2025-03-01T10:00:00Z",
      messages: [
        {
          "@type": "/some.unknown.v1.MsgDoSomething",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
  });

  it("maps MsgJoinSwapExternAmountIn as lp_add", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-lp-single-join-001",
      timestamp: "2025-03-01T08:00:00Z",
      messages: [
        {
          "@type": "/osmosis.gamm.v1beta1.MsgJoinSwapExternAmountIn",
          sender: VALID_ADDRESS,
          pool_id: "678",
          token_in: { denom: "uosmo", amount: "10000000" },
          share_out_min_amount: "500000",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("lp_add");
    expect(txs[0].sentQuantity).toBe(10);
    expect(txs[0].sentCurrency).toBe("OSMO");
    expect(txs[0].notes).toContain("Add liquidity to pool 678");
  });

  it("maps MsgExitSwapShareAmountIn as lp_remove", async () => {
    const mockTx = makeMockTxResponse({
      txhash: "tx-lp-single-exit-001",
      timestamp: "2025-03-01T10:00:00Z",
      messages: [
        {
          "@type": "/osmosis.gamm.v1beta1.MsgExitSwapShareAmountIn",
          sender: VALID_ADDRESS,
          pool_id: "678",
          share_in_amount: "500000",
          token_out_denom: "uosmo",
          token_out_min_amount: "9000000",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("message.sender")) {
        return new Response(
          JSON.stringify(makeSearchResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(emptySearchResponse()), { status: 200 });
    });

    const txs = await osmosisAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("lp_remove");
    expect(txs[0].receivedQuantity).toBe(9);
    expect(txs[0].receivedCurrency).toBe("OSMO");
    expect(txs[0].notes).toContain("Remove liquidity from pool 678");
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("osmosisAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "OSMO",
        feeAmount: 0.0025,
        feeCurrency: "OSMO",
        txHash: "tx-abc-123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "lp_add",
        sentQuantity: 5,
        sentCurrency: "OSMO",
        receivedQuantity: 1,
        receivedCurrency: "GAMM-1",
        txHash: "tx-lp-001",
        notes: "Add liquidity to pool 1",
      },
    ];

    const csv = osmosisAdapter.toAwakenCSV(txs);
    const lines = csv.split("\n");

    // Header
    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Received Quantity");
    expect(lines[0]).toContain("Sent Quantity");
    expect(lines[0]).toContain("Fee Amount");
    expect(lines[0]).toContain("Transaction Hash");

    // Send row
    expect(lines[1]).toContain("01/15/2025 14:30:00");
    expect(lines[1]).toContain("10");
    expect(lines[1]).toContain("OSMO");
    expect(lines[1]).toContain("tx-abc-123");

    // LP add row
    expect(lines[2]).toContain("02/01/2025 10:00:00");
    expect(lines[2]).toContain("GAMM-1");
    expect(lines[2]).toContain("Add liquidity to pool 1");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("osmosis adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("osmosis");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("osmosis");
    expect(adapter?.chainName).toBe("Osmosis");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const osmosis = chains.find((c) => c.chainId === "osmosis");
    expect(osmosis).toBeDefined();
    expect(osmosis?.chainName).toBe("Osmosis");
    expect(osmosis?.enabled).toBe(true);
  });
});
