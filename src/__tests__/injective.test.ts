/**
 * Tests for the Injective (INJ) chain adapter.
 *
 * Covers:
 *   - Injective address validation
 *   - Explorer URL generation
 *   - Amount parsing (parseAmount) and denom symbol conversion (denomToSymbol)
 *   - Transaction mapping (send/receive/stake/unstake/claim/swap/bridge)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  injectiveAdapter,
  isValidInjectiveAddress,
  parseAmount,
  denomToSymbol,
} from "@/lib/adapters/injective";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidInjectiveAddress", () => {
  it("accepts a valid Injective address (42 chars, inj1 prefix)", () => {
    expect(
      isValidInjectiveAddress("inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz"),
    ).toBe(true);
  });

  it("accepts another valid address", () => {
    // 42 chars: inj1 + 38 lowercase alphanumeric
    const addr = "inj1" + "a".repeat(38);
    expect(isValidInjectiveAddress(addr)).toBe(true);
  });

  it("accepts address with digits after prefix", () => {
    const addr = "inj1" + "abc123def456abc123def456abc123def456ab";
    expect(isValidInjectiveAddress(addr)).toBe(true);
  });

  it("rejects an address without inj1 prefix", () => {
    const addr = "cosmos1" + "a".repeat(38);
    expect(isValidInjectiveAddress(addr)).toBe(false);
  });

  it("accepts an address with uppercase characters (case-insensitive bech32)", () => {
    // Injective bech32 addresses are case-insensitive; we lowercase before validation
    expect(
      isValidInjectiveAddress("inj1QY09GSFX3GXQJAHUMQ97ELWXQF4QU5AGDMQGNZ"),
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
    const addr = "inj1" + "a".repeat(38);
    expect(isValidInjectiveAddress(`  ${addr}  `)).toBe(true);
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
        "inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz",
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
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz";
const OTHER_ADDRESS = "inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5045a";

function makeMockExplorerTx(
  overrides: Partial<{
    hash: string;
    block_timestamp: string;
    code: number;
    messages: Array<{
      type: string;
      value: Record<string, unknown>;
    }>;
    events: Array<{
      type: string;
      attributes: Record<string, string>;
    }>;
    gas_fee: { denom: string; amount: string };
  }> = {},
) {
  return {
    id: overrides.hash ?? "tx-abc-123",
    block_number: 12345,
    block_timestamp:
      overrides.block_timestamp ?? "2025-01-15T14:30:00.000Z",
    hash: overrides.hash ?? "tx-abc-123",
    code: overrides.code ?? 0,
    memo: "",
    messages: overrides.messages ?? [],
    tx_type: "injective",
    gas_wanted: 200000,
    gas_used: 150000,
    gas_fee: overrides.gas_fee ?? {
      denom: "inj",
      amount: "100000000000000",
    },
    events: overrides.events,
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-receive-001",
      block_timestamp: "2025-01-15T14:30:00.000Z",
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: OTHER_ADDRESS,
            to_address: VALID_ADDRESS,
            amount: [{ denom: "inj", amount: "5000000000000000000" }],
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-send-001",
      block_timestamp: "2025-01-15T14:30:00.000Z",
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: VALID_ADDRESS,
            to_address: OTHER_ADDRESS,
            amount: [{ denom: "inj", amount: "10000000000000000000" }],
          },
        },
      ],
      gas_fee: { denom: "inj", amount: "100000000000000" },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-stake-001",
      block_timestamp: "2025-02-01T10:00:00.000Z",
      messages: [
        {
          type: "/cosmos.staking.v1beta1.MsgDelegate",
          value: {
            delegator_address: VALID_ADDRESS,
            validator_address: "injvaloper1abcdef1234567890",
            amount: { denom: "inj", amount: "2000000000000000000" },
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-unstake-001",
      block_timestamp: "2025-02-01T12:00:00.000Z",
      messages: [
        {
          type: "/cosmos.staking.v1beta1.MsgUndelegate",
          value: {
            delegator_address: VALID_ADDRESS,
            validator_address: "injvaloper1abcdef1234567890",
            amount: { denom: "inj", amount: "1000000000000000000" },
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-claim-001",
      block_timestamp: "2025-02-01T14:00:00.000Z",
      messages: [
        {
          type: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
          value: {
            delegator_address: VALID_ADDRESS,
            validator_address: "injvaloper1abcdef1234567890",
          },
        },
      ],
      events: [
        {
          type: "withdraw_rewards",
          attributes: {
            amount: "500000000000000000inj",
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-ibc-001",
      block_timestamp: "2025-02-01T16:00:00.000Z",
      messages: [
        {
          type: "/ibc.applications.transfer.v1.MsgTransfer",
          value: {
            sender: VALID_ADDRESS,
            receiver: "osmo1abcdef1234567890abcdef1234567890abcdef",
            token: { denom: "inj", amount: "3000000000000000000" },
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-swap-001",
      block_timestamp: "2025-03-01T08:00:00.000Z",
      messages: [
        {
          type: "/cosmwasm.wasm.v1.MsgExecuteContract",
          value: {
            sender: VALID_ADDRESS,
            contract: "inj1contractaddresshere123456789012345678",
            msg: { swap: { offer_asset: {} } },
            funds: [{ denom: "inj", amount: "1000000000000000000" }],
          },
        },
      ],
      events: [
        {
          type: "coin_received",
          attributes: {
            receiver: VALID_ADDRESS,
            amount: "2000000peggy0xdAC17F958D2ee523a2206206994597C13D831ec7",
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-failed-001",
      code: 1,
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: VALID_ADDRESS,
            to_address: OTHER_ADDRESS,
            amount: [{ denom: "inj", amount: "1000000000000000000" }],
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
        { status: 200 },
      ),
    );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockExplorerTx({
      hash: "tx-later",
      block_timestamp: "2025-06-15T12:00:00.000Z",
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: OTHER_ADDRESS,
            to_address: VALID_ADDRESS,
            amount: [{ denom: "inj", amount: "1000000000000000000" }],
          },
        },
      ],
    });

    const tx2 = makeMockExplorerTx({
      hash: "tx-earlier",
      block_timestamp: "2025-01-15T14:30:00.000Z",
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: OTHER_ADDRESS,
            to_address: VALID_ADDRESS,
            amount: [{ denom: "inj", amount: "2000000000000000000" }],
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 2, from: 0, to: 2 },
          data: [tx1, tx2],
        }),
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
        JSON.stringify({
          paging: { total: 0, from: 0, to: 0 },
          data: [],
        }),
        { status: 200 },
      );
    });

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("handles pagination correctly", async () => {
    // First page: 100 items (full page triggers next fetch)
    const page1Data = Array.from({ length: 100 }, (_, i) =>
      makeMockExplorerTx({
        hash: `tx-page1-${i}`,
        block_timestamp: new Date(
          Date.UTC(2025, 0, 15, 14, 30, i),
        ).toISOString(),
        messages: [
          {
            type: "/cosmos.bank.v1beta1.MsgSend",
            value: {
              from_address: OTHER_ADDRESS,
              to_address: VALID_ADDRESS,
              amount: [{ denom: "inj", amount: "1000000000000000000" }],
            },
          },
        ],
      }),
    );

    // Second page: 2 items
    const page2Data = [
      makeMockExplorerTx({
        hash: "tx-page2-0",
        block_timestamp: "2025-01-15T14:32:00.000Z",
        messages: [
          {
            type: "/cosmos.bank.v1beta1.MsgSend",
            value: {
              from_address: OTHER_ADDRESS,
              to_address: VALID_ADDRESS,
              amount: [{ denom: "inj", amount: "2000000000000000000" }],
            },
          },
        ],
      }),
      makeMockExplorerTx({
        hash: "tx-page2-1",
        block_timestamp: "2025-01-15T14:33:00.000Z",
        messages: [
          {
            type: "/cosmos.bank.v1beta1.MsgSend",
            value: {
              from_address: OTHER_ADDRESS,
              to_address: VALID_ADDRESS,
              amount: [{ denom: "inj", amount: "3000000000000000000" }],
            },
          },
        ],
      }),
    ];

    let fetchCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return new Response(
          JSON.stringify({
            paging: { total: 102, from: 0, to: 100 },
            data: page1Data,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          paging: { total: 102, from: 100, to: 102 },
          data: page2Data,
        }),
        { status: 200 },
      );
    });

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(fetchCallCount).toBe(2);
    expect(txs).toHaveLength(102);
  });

  it("filters transactions by date range", async () => {
    const tx1 = makeMockExplorerTx({
      hash: "tx-old",
      block_timestamp: "2024-01-01T00:00:00.000Z",
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: OTHER_ADDRESS,
            to_address: VALID_ADDRESS,
            amount: [{ denom: "inj", amount: "1000000000000000000" }],
          },
        },
      ],
    });

    const tx2 = makeMockExplorerTx({
      hash: "tx-in-range",
      block_timestamp: "2024-06-15T12:00:00.000Z",
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: OTHER_ADDRESS,
            to_address: VALID_ADDRESS,
            amount: [{ denom: "inj", amount: "2000000000000000000" }],
          },
        },
      ],
    });

    const tx3 = makeMockExplorerTx({
      hash: "tx-too-new",
      block_timestamp: "2025-01-01T00:00:00.000Z",
      messages: [
        {
          type: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            from_address: OTHER_ADDRESS,
            to_address: VALID_ADDRESS,
            amount: [{ denom: "inj", amount: "3000000000000000000" }],
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 3, from: 0, to: 3 },
          data: [tx1, tx2, tx3],
        }),
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
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 0, from: 0, to: 0 },
          data: [],
        }),
        { status: 200 },
      ),
    );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("maps redelegate transaction", async () => {
    const mockTx = makeMockExplorerTx({
      hash: "tx-redelegate-001",
      block_timestamp: "2025-03-01T10:00:00.000Z",
      messages: [
        {
          type: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
          value: {
            delegator_address: VALID_ADDRESS,
            validator_src_address: "injvaloper1src123456789012",
            validator_dst_address: "injvaloper1dst123456789012",
            amount: { denom: "inj", amount: "1000000000000000000" },
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
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
    const mockTx = makeMockExplorerTx({
      hash: "tx-unknown-001",
      block_timestamp: "2025-03-01T10:00:00.000Z",
      messages: [
        {
          type: "/some.unknown.v1.MsgDoSomething",
          value: {},
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paging: { total: 1, from: 0, to: 1 },
          data: [mockTx],
        }),
        { status: 200 },
      ),
    );

    const txs = await injectiveAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
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
