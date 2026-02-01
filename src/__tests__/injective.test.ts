/**
 * Tests for the Injective (INJ) chain adapter.
 *
 * Covers:
 *   - Injective address validation
 *   - Explorer URL generation
 *   - Amount parsing (parseAmount) and denom symbol conversion (denomToSymbol)
 *   - LCD URL building with proper URL encoding (buildLcdTxsUrl)
 *   - Transaction mapping (send/receive/stake/unstake/claim/swap/bridge)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 *   - LCD to internal format transformation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  injectiveAdapter,
  isValidInjectiveAddress,
  parseAmount,
  denomToSymbol,
  buildLcdTxsUrl,
} from "@/lib/adapters/injective";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidInjectiveAddress", () => {
  it("accepts a valid Injective address (42 chars, inj1 prefix)", () => {
    expect(
      isValidInjectiveAddress("inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej"),
    ).toBe(true);
  });

  it("accepts another valid address", () => {
    expect(isValidInjectiveAddress("inj15mzfsh79vn6pg0kaytjeq8w4ur23clxds8se9n")).toBe(true);
  });

  it("accepts address with digits after prefix", () => {
    expect(isValidInjectiveAddress("inj19vn6pg0kaytjeq8w4ur23clxd5mzfsh75q9dkn")).toBe(true);
  });

  it("rejects an address without inj1 prefix", () => {
    const addr = "cosmos1" + "a".repeat(38);
    expect(isValidInjectiveAddress(addr)).toBe(false);
  });

  it("accepts an address with uppercase characters (case-insensitive bech32)", () => {
    // Injective bech32 addresses are case-insensitive; we lowercase before validation
    expect(
      isValidInjectiveAddress("INJ182DSNKEULZ9GTW35H6AQRXFV0J4CM7PYAHU0EJ"),
    ).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidInjectiveAddress("")).toBe(false);
  });

  it("rejects a payload that is too short (40 chars total)", () => {
    const addr = "inj1" + "a".repeat(36);
    expect(isValidInjectiveAddress(addr)).toBe(false);
  });

  it("rejects a payload that is too long (44 chars total)", () => {
    const addr = "inj1" + "a".repeat(40);
    expect(isValidInjectiveAddress(addr)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidInjectiveAddress(null as unknown as string)).toBe(false);
    expect(isValidInjectiveAddress(undefined as unknown as string)).toBe(false);
    expect(isValidInjectiveAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidInjectiveAddress("  inj1kaytjeq8w4ur23clxd5mzfsh79vn6pg0kkraw6  ")).toBe(true);
  });

  it("rejects address with special characters", () => {
    const addr = "inj1" + "a".repeat(37) + "!";
    expect(isValidInjectiveAddress(addr)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------

describe("parseAmount", () => {
  it("converts INJ from base units (18 decimals)", () => {
    expect(parseAmount("1000000000000000000", "inj")).toBe(1);
  });

  it("converts fractional INJ", () => {
    expect(parseAmount("500000000000000000", "inj")).toBe(0.5);
  });

  it("converts peggy USDT (6 decimals)", () => {
    expect(
      parseAmount(
        "1000000",
        "peggy0xdAC17F958D2ee523a2206206994597C13D831ec7",
      ),
    ).toBe(1);
  });

  it("converts IBC token (6 decimals default)", () => {
    expect(parseAmount("5000000", "ibc/ABC123")).toBe(5);
  });

  it("converts factory token (18 decimals)", () => {
    expect(
      parseAmount(
        "1000000000000000000",
        "factory/inj1abc/mytoken",
      ),
    ).toBe(1);
  });

  it("returns 0 for NaN input", () => {
    expect(parseAmount("notanumber", "inj")).toBe(0);
  });

  it("returns 0 for zero amount", () => {
    expect(parseAmount("0", "inj")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// denomToSymbol
// ---------------------------------------------------------------------------

describe("denomToSymbol", () => {
  it("converts 'inj' to 'INJ'", () => {
    expect(denomToSymbol("inj")).toBe("INJ");
  });

  it("converts known peggy USDT address", () => {
    expect(
      denomToSymbol(
        "peggy0xdAC17F958D2ee523a2206206994597C13D831ec7",
      ),
    ).toBe("USDT");
  });

  it("converts known peggy USDC address", () => {
    expect(
      denomToSymbol(
        "peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      ),
    ).toBe("USDC");
  });

  it("shortens unknown peggy addresses", () => {
    expect(denomToSymbol("peggy0x1234567890abcdef")).toBe("PEGGY-123456");
  });

  it("shortens IBC denoms", () => {
    expect(denomToSymbol("ibc/ABCDEF1234567890")).toBe("IBC-ABCDEF");
  });

  it("extracts factory token name", () => {
    expect(denomToSymbol("factory/inj1abc/mytoken")).toBe("MYTOKEN");
  });

  it("uppercases unknown denoms", () => {
    expect(denomToSymbol("atom")).toBe("ATOM");
  });
});

// ---------------------------------------------------------------------------
// buildLcdTxsUrl — URL encoding
// ---------------------------------------------------------------------------

describe("buildLcdTxsUrl", () => {
  it("builds a sender query URL with properly encoded events", () => {
    const url = buildLcdTxsUrl(
      "inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej",
      "sender",
    );

    // The events parameter should contain the properly encoded query
    expect(url).toContain(
      "sentry.lcd.injective.network/cosmos/tx/v1beta1/txs",
    );
    expect(url).toContain("pagination.limit=50");
    expect(url).toContain("order_by=ORDER_BY_DESC");
    // URLSearchParams encodes = as %3D and ' as %27
    expect(url).toContain("query=");
    // Verify the query value contains the address with message.sender
    const parsed = new URL(url);
    const queryParam = parsed.searchParams.get("query");
    expect(queryParam).toBe(
      "message.sender='inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej'",
    );
  });

  it("builds a recipient query URL with transfer.recipient filter", () => {
    const url = buildLcdTxsUrl(
      "inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej",
      "recipient",
    );

    const parsed = new URL(url);
    const queryParam = parsed.searchParams.get("query");
    expect(queryParam).toBe(
      "transfer.recipient='inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej'",
    );
  });

  it("includes pagination key when provided", () => {
    const url = buildLcdTxsUrl(
      "inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej",
      "sender",
      "abc123paginationkey",
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.get("pagination.key")).toBe(
      "abc123paginationkey",
    );
  });

  it("does not include pagination key when not provided", () => {
    const url = buildLcdTxsUrl(
      "inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej",
      "sender",
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.has("pagination.key")).toBe(false);
  });

  it("URL-encodes special characters so LCD API accepts the query", () => {
    const url = buildLcdTxsUrl(
      "inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej",
      "sender",
    );

    // The raw URL string should contain encoded = (%3D) and ' (%27)
    // URLSearchParams handles this automatically
    expect(url).toMatch(/query=message\.sender/);
    // Should not produce an empty query error
    const parsed = new URL(url);
    expect(parsed.searchParams.get("query")).toBeTruthy();
    expect(parsed.searchParams.get("query")).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("injectiveAdapter.getExplorerUrl", () => {
  it("returns the correct Injective explorer URL", () => {
    const hash = "ABCDEF1234567890";
    expect(injectiveAdapter.getExplorerUrl(hash)).toBe(
      "https://explorer.injective.network/transaction/ABCDEF1234567890",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("injectiveAdapter.validateAddress", () => {
  it("delegates to isValidInjectiveAddress", () => {
    expect(
      injectiveAdapter.validateAddress(
        "inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej",
      ),
    ).toBe(true);
    expect(injectiveAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("injectiveAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(injectiveAdapter.chainId).toBe("injective");
  });

  it("has correct chainName", () => {
    expect(injectiveAdapter.chainName).toBe("Injective");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked LCD API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "inj182dsnkeulz9gtw35h6aqrxfv0j4cm7pyahu0ej";
const OTHER_ADDRESS = "inj1dsnkeulz9gtw35h6aqrxfv0j4cm7py82gs6pxt";

/**
 * Create a mock LCD tx_response object.
 */
function makeMockLcdTxResponse(
  overrides: Partial<{
    txhash: string;
    timestamp: string;
    code: number;
    height: string;
    messages: Array<Record<string, unknown>>;
    logs: Array<{
      msg_index: number;
      events: Array<{
        type: string;
        attributes: Array<{ key: string; value: string }>;
      }>;
    }>;
    fee: Array<{ denom: string; amount: string }>;
    gas_limit: string;
  }> = {},
) {
  return {
    height: overrides.height ?? "12345",
    txhash: overrides.txhash ?? "tx-abc-123",
    code: overrides.code ?? 0,
    raw_log: "",
    logs: overrides.logs ?? [],
    tx: {
      body: {
        messages: overrides.messages ?? [],
        memo: "",
      },
      auth_info: {
        fee: {
          amount: overrides.fee ?? [
            { denom: "inj", amount: "100000000000000" },
          ],
          gas_limit: overrides.gas_limit ?? "200000",
        },
      },
    },
    timestamp: overrides.timestamp ?? "2025-01-15T14:30:00Z",
  };
}

/**
 * Wrap LCD tx_responses in the standard search response format.
 */
function makeLcdSearchResponse(
  txResponses: ReturnType<typeof makeMockLcdTxResponse>[],
  nextKey: string | null = null,
) {
  return {
    tx_responses: txResponses,
    pagination: {
      next_key: nextKey,
      total: String(txResponses.length),
    },
  };
}

describe("injectiveAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      injectiveAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Injective address");
  });

  it("fetches and maps a receive transaction (MsgSend)", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-receive-001",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "inj", amount: "5000000000000000000" }],
        },
      ],
    });

    // First call: sender query (no results for this address as recipient in sender query)
    // Second call: recipient query (finds the receive tx)
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(5);
    expect(txs[0].receivedCurrency).toBe("INJ");
    expect(txs[0].txHash).toBe("tx-receive-001");
  });

  it("fetches and maps a send transaction (MsgSend)", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-send-001",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: VALID_ADDRESS,
          to_address: OTHER_ADDRESS,
          amount: [{ denom: "inj", amount: "10000000000000000000" }],
        },
      ],
      fee: [{ denom: "inj", amount: "100000000000000" }],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(10);
    expect(txs[0].sentCurrency).toBe("INJ");
    expect(txs[0].feeAmount).toBeCloseTo(0.0001, 6);
    expect(txs[0].feeCurrency).toBe("INJ");
    expect(txs[0].txHash).toBe("tx-send-001");
  });

  it("fetches and maps a stake transaction (MsgDelegate)", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-stake-001",
      timestamp: "2025-02-01T10:00:00Z",
      messages: [
        {
          "@type": "/cosmos.staking.v1beta1.MsgDelegate",
          delegator_address: VALID_ADDRESS,
          validator_address: "injvaloper1abcdef1234567890",
          amount: { denom: "inj", amount: "2000000000000000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("stake");
    expect(txs[0].sentQuantity).toBe(2);
    expect(txs[0].sentCurrency).toBe("INJ");
    expect(txs[0].tag).toBe("staked");
  });

  it("fetches and maps an unstake transaction (MsgUndelegate)", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-unstake-001",
      timestamp: "2025-02-01T12:00:00Z",
      messages: [
        {
          "@type": "/cosmos.staking.v1beta1.MsgUndelegate",
          delegator_address: VALID_ADDRESS,
          validator_address: "injvaloper1abcdef1234567890",
          amount: { denom: "inj", amount: "1000000000000000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("unstake");
    expect(txs[0].receivedQuantity).toBe(1);
    expect(txs[0].receivedCurrency).toBe("INJ");
    expect(txs[0].tag).toBe("unstaked");
  });

  it("fetches and maps a reward claim (MsgWithdrawDelegatorReward)", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-claim-001",
      timestamp: "2025-02-01T14:00:00Z",
      messages: [
        {
          "@type":
            "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
          delegator_address: VALID_ADDRESS,
          validator_address: "injvaloper1abcdef1234567890",
        },
      ],
      logs: [
        {
          msg_index: 0,
          events: [
            {
              type: "withdraw_rewards",
              attributes: [
                { key: "amount", value: "500000000000000000inj" },
                {
                  key: "validator",
                  value: "injvaloper1abcdef1234567890",
                },
              ],
            },
          ],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("claim");
    expect(txs[0].receivedQuantity).toBe(0.5);
    expect(txs[0].receivedCurrency).toBe("INJ");
  });

  it("fetches and maps an IBC transfer (MsgTransfer)", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-ibc-001",
      timestamp: "2025-02-01T16:00:00Z",
      messages: [
        {
          "@type": "/ibc.applications.transfer.v1.MsgTransfer",
          sender: VALID_ADDRESS,
          receiver: "osmo1abcdef1234567890abcdef1234567890abcdef",
          token: { denom: "inj", amount: "3000000000000000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("bridge");
    expect(txs[0].sentQuantity).toBe(3);
    expect(txs[0].sentCurrency).toBe("INJ");
  });

  it("fetches and maps a contract execution as swap", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-swap-001",
      timestamp: "2025-03-01T08:00:00Z",
      messages: [
        {
          "@type": "/cosmwasm.wasm.v1.MsgExecuteContract",
          sender: VALID_ADDRESS,
          contract: "inj1contractaddresshere123456789012345678",
          msg: { swap: { offer_asset: {} } },
          funds: [{ denom: "inj", amount: "1000000000000000000" }],
        },
      ],
      logs: [
        {
          msg_index: 0,
          events: [
            {
              type: "coin_received",
              attributes: [
                { key: "receiver", value: VALID_ADDRESS },
                {
                  key: "amount",
                  value:
                    "2000000peggy0xdAC17F958D2ee523a2206206994597C13D831ec7",
                },
              ],
            },
          ],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("trade");
    expect(txs[0].sentQuantity).toBe(1);
    expect(txs[0].sentCurrency).toBe("INJ");
    expect(txs[0].receivedQuantity).toBe(2);
    expect(txs[0].receivedCurrency).toBe("USDT");
  });

  it("skips failed transactions (code !== 0)", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-failed-001",
      code: 1,
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: VALID_ADDRESS,
          to_address: OTHER_ADDRESS,
          amount: [{ denom: "inj", amount: "1000000000000000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("deduplicates transactions returned by both sender and recipient queries", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-dedup-001",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: VALID_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "inj", amount: "1000000000000000000" }],
        },
      ],
    });

    // Same tx appears in both sender and recipient queries
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    // Should only appear once despite being in both queries
    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe("tx-dedup-001");
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockLcdTxResponse({
      txhash: "tx-later",
      timestamp: "2025-06-15T12:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "inj", amount: "1000000000000000000" }],
        },
      ],
    });

    const tx2 = makeMockLcdTxResponse({
      txhash: "tx-earlier",
      timestamp: "2025-01-15T14:30:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "inj", amount: "2000000000000000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([tx1, tx2])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

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
        JSON.stringify(makeLcdSearchResponse([])),
        { status: 200 },
      );
    });

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("handles pagination correctly with next_key", async () => {
    // First page: full page with next_key
    const page1Data = Array.from({ length: 50 }, (_, i) =>
      makeMockLcdTxResponse({
        txhash: `tx-page1-${i}`,
        timestamp: new Date(
          Date.UTC(2025, 0, 15, 14, 30, i),
        ).toISOString(),
        messages: [
          {
            "@type": "/cosmos.bank.v1beta1.MsgSend",
            from_address: VALID_ADDRESS,
            to_address: OTHER_ADDRESS,
            amount: [{ denom: "inj", amount: "1000000000000000000" }],
          },
        ],
      }),
    );

    // Second page: 2 items, no next_key
    const page2Data = [
      makeMockLcdTxResponse({
        txhash: "tx-page2-0",
        timestamp: "2025-01-15T14:32:00Z",
        messages: [
          {
            "@type": "/cosmos.bank.v1beta1.MsgSend",
            from_address: VALID_ADDRESS,
            to_address: OTHER_ADDRESS,
            amount: [{ denom: "inj", amount: "2000000000000000000" }],
          },
        ],
      }),
      makeMockLcdTxResponse({
        txhash: "tx-page2-1",
        timestamp: "2025-01-15T14:33:00Z",
        messages: [
          {
            "@type": "/cosmos.bank.v1beta1.MsgSend",
            from_address: VALID_ADDRESS,
            to_address: OTHER_ADDRESS,
            amount: [{ denom: "inj", amount: "3000000000000000000" }],
          },
        ],
      }),
    ];

    let fetchCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // Sender query page 1 — full page with next_key
        return new Response(
          JSON.stringify({
            tx_responses: page1Data,
            pagination: { next_key: "page2key", total: "52" },
          }),
          { status: 200 },
        );
      }
      if (fetchCallCount === 2) {
        // Sender query page 2 — partial page, no next_key
        return new Response(
          JSON.stringify({
            tx_responses: page2Data,
            pagination: { next_key: null, total: "52" },
          }),
          { status: 200 },
        );
      }
      // Recipient query — no results
      return new Response(
        JSON.stringify(makeLcdSearchResponse([])),
        { status: 200 },
      );
    });

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    // 2 sender pages + 1 recipient page = 3 fetch calls
    expect(fetchCallCount).toBe(3);
    expect(txs).toHaveLength(52);
  });

  it("filters transactions by date range", async () => {
    const tx1 = makeMockLcdTxResponse({
      txhash: "tx-old",
      timestamp: "2024-01-01T00:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "inj", amount: "1000000000000000000" }],
        },
      ],
    });

    const tx2 = makeMockLcdTxResponse({
      txhash: "tx-in-range",
      timestamp: "2024-06-15T12:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "inj", amount: "2000000000000000000" }],
        },
      ],
    });

    const tx3 = makeMockLcdTxResponse({
      txhash: "tx-too-new",
      timestamp: "2025-01-01T00:00:00Z",
      messages: [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          from_address: OTHER_ADDRESS,
          to_address: VALID_ADDRESS,
          amount: [{ denom: "inj", amount: "3000000000000000000" }],
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([tx1, tx2, tx3])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate: new Date("2024-06-01T00:00:00Z"),
      toDate: new Date("2024-12-31T23:59:59Z"),
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe("tx-in-range");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles null tx_responses from LCD API", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tx_responses: null,
            pagination: { next_key: null, total: "0" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tx_responses: null,
            pagination: { next_key: null, total: "0" },
          }),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("maps redelegate transaction", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-redelegate-001",
      timestamp: "2025-03-01T10:00:00Z",
      messages: [
        {
          "@type": "/cosmos.staking.v1beta1.MsgBeginRedelegate",
          delegator_address: VALID_ADDRESS,
          validator_src_address: "injvaloper1src123456789012",
          validator_dst_address: "injvaloper1dst123456789012",
          amount: { denom: "inj", amount: "1000000000000000000" },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("stake");
    expect(txs[0].tag).toBe("staked");
    expect(txs[0].notes).toContain("Redelegate");
  });

  it("maps unknown message type as 'other'", async () => {
    const mockTx = makeMockLcdTxResponse({
      txhash: "tx-unknown-001",
      timestamp: "2025-03-01T10:00:00Z",
      messages: [
        {
          "@type": "/some.unknown.v1.MsgDoSomething",
        },
      ],
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([mockTx])),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeLcdSearchResponse([])),
          { status: 200 },
        ),
      );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
  });

  it("uses LCD endpoint URL with correct events encoding", async () => {
    const emptyResponse = JSON.stringify(makeLcdSearchResponse([]));
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(emptyResponse, { status: 200 }),
      );

    await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    // Should make 2 calls: one for sender, one for recipient
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify the first call uses the LCD endpoint with sender events
    const firstCallUrl = fetchSpy.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("sentry.lcd.injective.network");
    expect(firstCallUrl).toContain("/cosmos/tx/v1beta1/txs");
    expect(firstCallUrl).toContain("query=");
    expect(firstCallUrl).toContain("message.sender");

    // Verify the second call uses recipient events
    const secondCallUrl = fetchSpy.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain("transfer.recipient");
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("injectiveAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "INJ",
        feeAmount: 0.0001,
        feeCurrency: "INJ",
        txHash: "tx-abc-123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "INJ",
        txHash: "tx-def-456",
      },
    ];

    const csv = injectiveAdapter.toAwakenCSV(txs);
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
    expect(lines[1]).toContain("INJ");
    expect(lines[1]).toContain("tx-abc-123");

    // Receive row
    expect(lines[2]).toContain("02/01/2025 10:00:00");
    expect(lines[2]).toContain("5");
    expect(lines[2]).toContain("tx-def-456");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("injective adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("injective");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("injective");
    expect(adapter?.chainName).toBe("Injective");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const injective = chains.find((c) => c.chainId === "injective");
    expect(injective).toBeDefined();
    expect(injective?.chainName).toBe("Injective");
    expect(injective?.enabled).toBe(true);
  });
});
