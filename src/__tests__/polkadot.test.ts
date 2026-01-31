/**
 * Tests for the Polkadot (DOT) chain adapter.
 *
 * Covers:
 *   - Polkadot address validation
 *   - Explorer URL generation
 *   - Planck → DOT conversion
 *   - Transaction mapping (send/receive/claim/stake/unstake/other)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Pagination and date filtering
 *   - Staking rewards and slashes
 *   - Staking extrinsics classification
 *   - Deduplication logic
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  polkadotAdapter,
  isValidPolkadotAddress,
  plancksToDot,
} from "@/lib/adapters/polkadot";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidPolkadotAddress", () => {
  it("accepts a valid Polkadot address", () => {
    // Example valid Polkadot address (SS58 format, starts with "1")
    expect(isValidPolkadotAddress("15oF4uVJwmo4TdGW7VfQxNLavjCXviqWrztPu6BsCZHeMSQg")).toBe(true);
  });

  it("accepts another valid address", () => {
    expect(isValidPolkadotAddress("14ShUZUYUR35RBZW6uVVt1zXDqmvNcPePeTMsRS68BXtYTSK")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidPolkadotAddress("")).toBe(false);
  });

  it("rejects address not starting with 1", () => {
    expect(isValidPolkadotAddress("25oF4uVJwmo4TdGW7VfQxNLavjCXviqWrztPu6BsCZHeMSQg")).toBe(false);
  });

  it("rejects address that is too short", () => {
    expect(isValidPolkadotAddress("1abc")).toBe(false);
  });

  it("rejects address that is too long", () => {
    expect(isValidPolkadotAddress("1" + "a".repeat(50))).toBe(false);
  });

  it("rejects address with invalid characters (0, O, I, l)", () => {
    expect(isValidPolkadotAddress("10oF4uVJwmo4TdGW7VfQxNLavjCXviqWrztPu6BsCZHeMSQg")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidPolkadotAddress(null as unknown as string)).toBe(false);
    expect(isValidPolkadotAddress(undefined as unknown as string)).toBe(false);
    expect(isValidPolkadotAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidPolkadotAddress("  15oF4uVJwmo4TdGW7VfQxNLavjCXviqWrztPu6BsCZHeMSQg  ")).toBe(true);
  });

  it("rejects Ethereum-style addresses", () => {
    expect(isValidPolkadotAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18")).toBe(false);
  });

  it("rejects Kusama addresses (starting with uppercase letters)", () => {
    expect(isValidPolkadotAddress("CpjsLDC1JFyrhm3ftC9Gs4QoyrkHKhZKtK7YqGTRFtTafgp")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Planck → DOT conversion
// ---------------------------------------------------------------------------

describe("plancksToDot", () => {
  it("converts 1 DOT in plancks", () => {
    expect(plancksToDot("10000000000")).toBe(1);
  });

  it("converts fractional DOT", () => {
    expect(plancksToDot("5000000000")).toBe(0.5);
  });

  it("returns 0 for zero", () => {
    expect(plancksToDot("0")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(plancksToDot("")).toBe(0);
  });

  it("returns 0 for NaN input", () => {
    expect(plancksToDot("not-a-number")).toBe(0);
  });

  it("converts small amounts", () => {
    expect(plancksToDot("1")).toBeCloseTo(0.0000000001, 10);
  });

  it("converts large amounts", () => {
    expect(plancksToDot("1000000000000")).toBe(100);
  });

  it("converts typical staking reward amounts", () => {
    // 0.5 DOT reward
    expect(plancksToDot("5000000000")).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("polkadotAdapter.getExplorerUrl", () => {
  it("returns the correct Subscan explorer URL", () => {
    const hash = "0xabc123def456";
    expect(polkadotAdapter.getExplorerUrl(hash)).toBe(
      "https://polkadot.subscan.io/extrinsic/0xabc123def456",
    );
  });

  it("returns correct URL for extrinsic index format", () => {
    expect(polkadotAdapter.getExplorerUrl("12345-2")).toBe(
      "https://polkadot.subscan.io/extrinsic/12345-2",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("polkadotAdapter.validateAddress", () => {
  it("delegates to isValidPolkadotAddress", () => {
    expect(polkadotAdapter.validateAddress("15oF4uVJwmo4TdGW7VfQxNLavjCXviqWrztPu6BsCZHeMSQg")).toBe(true);
    expect(polkadotAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("polkadotAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(polkadotAdapter.chainId).toBe("polkadot");
  });

  it("has correct chainName", () => {
    expect(polkadotAdapter.chainName).toBe("Polkadot");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "15oF4uVJwmo4TdGW7VfQxNLavjCXviqWrztPu6BsCZHeMSQg";
const OTHER_ADDRESS = "14ShUZUYUR35RBZW6uVVt1zXDqmvNcPePeTMsRS68BXtYTSK";

function makeTransferResponse(
  transfers: Partial<SubscanTransferMock>[],
  count?: number,
) {
  return {
    code: 0,
    message: "Success",
    data: {
      count: count ?? transfers.length,
      transfers: transfers.map((t) => ({
        from: t.from ?? OTHER_ADDRESS,
        to: t.to ?? VALID_ADDRESS,
        extrinsic_index: t.extrinsic_index ?? "12345-2",
        success: t.success ?? true,
        hash: t.hash ?? "0xabc123",
        block_num: t.block_num ?? 12345,
        block_timestamp: t.block_timestamp ?? 1705315800,
        module: t.module ?? "balances",
        amount: t.amount ?? "10",
        amount_v2: t.amount_v2 ?? "100000000000",
        fee: t.fee ?? "1560000000",
        nonce: t.nonce ?? 0,
        asset_symbol: t.asset_symbol ?? "DOT",
        asset_unique_id: t.asset_unique_id ?? "",
        asset_type: t.asset_type ?? "",
        from_account_display: { address: t.from ?? OTHER_ADDRESS },
        to_account_display: { address: t.to ?? VALID_ADDRESS },
        event_idx: t.event_idx ?? 0,
      })),
    },
  };
}

interface SubscanTransferMock {
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
  event_idx: number;
}

function makeRewardSlashResponse(
  list: Partial<{
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
  }>[],
  count?: number,
) {
  return {
    code: 0,
    message: "Success",
    data: {
      count: count ?? list.length,
      list: list.map((item) => ({
        account: item.account ?? VALID_ADDRESS,
        amount: item.amount ?? "5000000000",
        block_timestamp: item.block_timestamp ?? 1705315800,
        era: item.era ?? 1234,
        event_id: item.event_id ?? "Rewarded",
        event_index: item.event_index ?? "12345-5",
        extrinsic_index: item.extrinsic_index ?? "12345-2",
        invalid_era: item.invalid_era ?? false,
        module_id: item.module_id ?? "staking",
        stash: item.stash ?? VALID_ADDRESS,
        validator_stash: item.validator_stash ?? OTHER_ADDRESS,
      })),
    },
  };
}

function makeExtrinsicsResponse(
  extrinsics: Partial<{
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
  }>[],
  count?: number,
) {
  return {
    code: 0,
    message: "Success",
    data: {
      count: count ?? extrinsics.length,
      extrinsics: extrinsics.map((ext) => ({
        block_num: ext.block_num ?? 12345,
        block_timestamp: ext.block_timestamp ?? 1705315800,
        extrinsic_index: ext.extrinsic_index ?? "12345-2",
        call_module_function: ext.call_module_function ?? "bond",
        call_module: ext.call_module ?? "staking",
        extrinsic_hash: ext.extrinsic_hash ?? "0xstaking123",
        success: ext.success ?? true,
        fee: ext.fee ?? "1560000000",
        fee_used: ext.fee_used ?? "1560000000",
        id: ext.id ?? 1,
        nonce: ext.nonce ?? 0,
        tip: ext.tip ?? "0",
        account_display: { address: VALID_ADDRESS },
      })),
    },
  };
}

function emptyTransfersResponse() {
  return { code: 0, message: "Success", data: { count: 0, transfers: null } };
}

function emptyRewardSlashResponse() {
  return { code: 0, message: "Success", data: { count: 0, list: null } };
}

function emptyExtrinsicsResponse() {
  return { code: 0, message: "Success", data: { count: 0, extrinsics: null } };
}

describe("polkadotAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for invalid address", async () => {
    await expect(
      polkadotAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Polkadot address");
  });

  it("fetches and maps a receive transfer correctly", async () => {
    const transferData = makeTransferResponse([
      {
        from: OTHER_ADDRESS,
        to: VALID_ADDRESS,
        hash: "0xreceive001",
        amount: "10",
        fee: "1560000000",
        block_timestamp: 1705315800,
        asset_symbol: "DOT",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);

      // Transfers endpoint
      if (typeof _url === "string" && _url.includes("/transfers")) {
        if (body.page === 0) {
          return new Response(JSON.stringify(transferData), { status: 200 });
        }
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }

      // Rewards/slashes endpoint
      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }

      // Extrinsics endpoint
      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }

      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs.length).toBeGreaterThanOrEqual(1);
    const receiveTx = txs.find((t) => t.type === "receive");
    expect(receiveTx).toBeDefined();
    expect(receiveTx?.receivedQuantity).toBe(10);
    expect(receiveTx?.receivedCurrency).toBe("DOT");
    expect(receiveTx?.txHash).toBe("0xreceive001");
  });

  it("fetches and maps a send transfer correctly", async () => {
    const transferData = makeTransferResponse([
      {
        from: VALID_ADDRESS,
        to: OTHER_ADDRESS,
        hash: "0xsend001",
        amount: "5",
        fee: "1560000000",
        block_timestamp: 1705315800,
        asset_symbol: "DOT",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);

      if (typeof _url === "string" && _url.includes("/transfers")) {
        if (body.page === 0) {
          return new Response(JSON.stringify(transferData), { status: 200 });
        }
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }

      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    const sendTx = txs.find((t) => t.type === "send");
    expect(sendTx).toBeDefined();
    expect(sendTx?.sentQuantity).toBe(5);
    expect(sendTx?.sentCurrency).toBe("DOT");
    expect(sendTx?.feeAmount).toBeCloseTo(0.156, 3);
    expect(sendTx?.feeCurrency).toBe("DOT");
    expect(sendTx?.txHash).toBe("0xsend001");
  });

  it("fetches and maps staking rewards correctly", async () => {
    const rewardData = makeRewardSlashResponse([
      {
        amount: "5000000000",
        block_timestamp: 1705315800,
        era: 1234,
        extrinsic_index: "12345-2",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);

      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        if (body.category === "Reward" && body.page === 0) {
          return new Response(JSON.stringify(rewardData), { status: 200 });
        }
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }

      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    const rewardTx = txs.find((t) => t.type === "claim");
    expect(rewardTx).toBeDefined();
    expect(rewardTx?.receivedQuantity).toBe(0.5);
    expect(rewardTx?.receivedCurrency).toBe("DOT");
    expect(rewardTx?.notes).toContain("Staking reward");
    expect(rewardTx?.notes).toContain("era 1234");
  });

  it("fetches and maps staking slashes correctly", async () => {
    const slashData = makeRewardSlashResponse([
      {
        amount: "10000000000",
        block_timestamp: 1705315800,
        era: 1234,
        extrinsic_index: "12345-2",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);

      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        if (body.category === "Slash" && body.page === 0) {
          return new Response(JSON.stringify(slashData), { status: 200 });
        }
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }

      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    const slashTx = txs.find((t) => t.notes?.includes("slash"));
    expect(slashTx).toBeDefined();
    expect(slashTx?.type).toBe("send");
    expect(slashTx?.sentQuantity).toBe(1);
    expect(slashTx?.sentCurrency).toBe("DOT");
    expect(slashTx?.tag).toBe("lost");
  });

  it("fetches and maps staking extrinsics correctly", async () => {
    const extData = makeExtrinsicsResponse([
      {
        call_module: "staking",
        call_module_function: "bond",
        extrinsic_hash: "0xstake001",
        block_timestamp: 1705315800,
        fee: "1560000000",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);

      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        if (body.module === "staking" && body.page === 0) {
          return new Response(JSON.stringify(extData), { status: 200 });
        }
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }

      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    const stakeTx = txs.find((t) => t.type === "stake");
    expect(stakeTx).toBeDefined();
    expect(stakeTx?.notes).toContain("Staking: bond");
    expect(stakeTx?.feeAmount).toBeCloseTo(0.156, 3);
    expect(stakeTx?.feeCurrency).toBe("DOT");
    expect(stakeTx?.txHash).toBe("0xstake001");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url) => {
      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }
      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("sorts transactions by date ascending", async () => {
    const transferData = makeTransferResponse([
      {
        from: OTHER_ADDRESS,
        to: VALID_ADDRESS,
        hash: "0xlater",
        amount: "5",
        block_timestamp: 1705402200,
        asset_symbol: "DOT",
      },
      {
        from: OTHER_ADDRESS,
        to: VALID_ADDRESS,
        hash: "0xearlier",
        amount: "3",
        block_timestamp: 1705315800,
        asset_symbol: "DOT",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url) => {
      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(transferData), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }
      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs.length).toBeGreaterThanOrEqual(2);
    const receiveTxs = txs.filter((t) => t.type === "receive");
    expect(receiveTxs.length).toBe(2);
    expect(receiveTxs[0].date.getTime()).toBeLessThan(receiveTxs[1].date.getTime());
  });

  it("handles API error with retry", async () => {
    let callCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url) => {
      callCount++;
      // First calls get rate limited, eventually succeed
      if (callCount <= 2) {
        return new Response("Too Many Requests", { status: 429 });
      }
      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }
      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("applies date filters correctly", async () => {
    const transferData = makeTransferResponse([
      {
        from: OTHER_ADDRESS,
        to: VALID_ADDRESS,
        hash: "0xin-range",
        amount: "10",
        block_timestamp: 1705315800, // Jan 15, 2024
        asset_symbol: "DOT",
      },
      {
        from: OTHER_ADDRESS,
        to: VALID_ADDRESS,
        hash: "0xout-of-range",
        amount: "5",
        block_timestamp: 1700000000, // Nov 14, 2023
        asset_symbol: "DOT",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url) => {
      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(transferData), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }
      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }
      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate: new Date("2024-01-01T00:00:00Z"),
      toDate: new Date("2024-12-31T23:59:59Z"),
    });

    expect(txs.length).toBe(1);
    expect(txs[0].txHash).toBe("0xin-range");
  });

  it("classifies crowdloan contributions correctly", async () => {
    const extData = makeExtrinsicsResponse([
      {
        call_module: "crowdloan",
        call_module_function: "contribute",
        extrinsic_hash: "0xcrowdloan001",
        block_timestamp: 1705315800,
        fee: "1560000000",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);

      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        if (body.module === "crowdloan" && body.page === 0) {
          return new Response(JSON.stringify(extData), { status: 200 });
        }
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }

      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    const crowdloanTx = txs.find((t) => t.notes?.includes("Crowdloan"));
    expect(crowdloanTx).toBeDefined();
    expect(crowdloanTx?.type).toBe("send");
    expect(crowdloanTx?.notes).toBe("Crowdloan contribution");
  });

  it("classifies unbond extrinsics as unstake", async () => {
    const extData = makeExtrinsicsResponse([
      {
        call_module: "staking",
        call_module_function: "unbond",
        extrinsic_hash: "0xunbond001",
        block_timestamp: 1705315800,
        fee: "1560000000",
      },
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);

      if (typeof _url === "string" && _url.includes("/transfers")) {
        return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/reward_slash")) {
        return new Response(JSON.stringify(emptyRewardSlashResponse()), { status: 200 });
      }

      if (typeof _url === "string" && _url.includes("/extrinsics")) {
        if (body.module === "staking" && body.page === 0) {
          return new Response(JSON.stringify(extData), { status: 200 });
        }
        return new Response(JSON.stringify(emptyExtrinsicsResponse()), { status: 200 });
      }

      return new Response(JSON.stringify(emptyTransfersResponse()), { status: 200 });
    });

    const txs = await polkadotAdapter.fetchTransactions(VALID_ADDRESS);

    const unstakeTx = txs.find((t) => t.type === "unstake");
    expect(unstakeTx).toBeDefined();
    expect(unstakeTx?.notes).toBe("Staking: unbond");
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("polkadotAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "DOT",
        feeAmount: 0.001,
        feeCurrency: "DOT",
        txHash: "0xabc123",
      },
      {
        date: new Date("2025-02-01T10:00:00Z"),
        type: "claim",
        receivedQuantity: 0.5,
        receivedCurrency: "DOT",
        txHash: "12345-2",
        notes: "Staking reward (era 1234)",
      },
    ];

    const csv = polkadotAdapter.toAwakenCSV(txs);
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
    expect(lines[1]).toContain("DOT");
    expect(lines[1]).toContain("0xabc123");

    // Reward row
    expect(lines[2]).toContain("02/01/2025 10:00:00");
    expect(lines[2]).toContain("0.5");
    expect(lines[2]).toContain("Staking reward");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("polkadot adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("polkadot");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("polkadot");
    expect(adapter?.chainName).toBe("Polkadot");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const polkadot = chains.find((c) => c.chainId === "polkadot");
    expect(polkadot).toBeDefined();
    expect(polkadot?.chainName).toBe("Polkadot");
    expect(polkadot?.enabled).toBe(true);
  });
});
