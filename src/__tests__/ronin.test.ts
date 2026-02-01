/**
 * Tests for the Ronin (RON) chain adapter.
 *
 * Covers:
 *   - Ronin address validation (0x and ronin: prefixes)
 *   - Address normalization
 *   - Explorer URL generation
 *   - Amount parsing (parseRoninAmount, parseTokenAmount)
 *   - Transaction mapping (send/receive/approval/contract interaction/token transfers)
 *   - CSV generation via toAwakenCSV
 *   - fetchTransactions error handling
 *   - Date filtering and sorting
 *   - Token transfer mapping (ERC-20, mint, burn)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  roninAdapter,
  isValidRoninAddress,
  normalizeRoninAddress,
  parseRoninAmount,
  parseTokenAmount,
} from "@/lib/adapters/ronin";
import type { Transaction } from "@/types";

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("isValidRoninAddress", () => {
  it("accepts a valid 0x-prefixed address", () => {
    expect(
      isValidRoninAddress("0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3"),
    ).toBe(true);
  });

  it("accepts a valid ronin:-prefixed address", () => {
    expect(
      isValidRoninAddress("ronin:f6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3"),
    ).toBe(true);
  });

  it("accepts uppercase hex characters", () => {
    expect(
      isValidRoninAddress("0xF6FD5FCA4BD769BA495B29B98DBA5F2ECF4CEED3"),
    ).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidRoninAddress("")).toBe(false);
  });

  it("rejects a string that is too short", () => {
    expect(isValidRoninAddress("0xf6fd5fca4bd769ba")).toBe(false);
  });

  it("rejects a string that is too long", () => {
    expect(
      isValidRoninAddress("0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3ff"),
    ).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidRoninAddress(null as unknown as string)).toBe(false);
    expect(isValidRoninAddress(undefined as unknown as string)).toBe(false);
    expect(isValidRoninAddress(42 as unknown as string)).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(
      isValidRoninAddress("  0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3  "),
    ).toBe(true);
  });

  it("rejects Osmosis-style bech32 addresses", () => {
    expect(
      isValidRoninAddress("osmo1clpqr4nrk4khgkxj78fcwwh6dl3uw4ep88n0y4"),
    ).toBe(false);
  });

  it("rejects address without prefix", () => {
    expect(
      isValidRoninAddress("f6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeRoninAddress
// ---------------------------------------------------------------------------

describe("normalizeRoninAddress", () => {
  it("normalizes ronin: prefix to 0x", () => {
    expect(
      normalizeRoninAddress("ronin:f6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3"),
    ).toBe("0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3");
  });

  it("lowercases 0x-prefixed address", () => {
    expect(
      normalizeRoninAddress("0xF6FD5FCA4BD769BA495B29B98DBA5F2ECF4CEED3"),
    ).toBe("0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3");
  });

  it("trims whitespace", () => {
    expect(
      normalizeRoninAddress("  0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3  "),
    ).toBe("0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3");
  });
});

// ---------------------------------------------------------------------------
// parseRoninAmount
// ---------------------------------------------------------------------------

describe("parseRoninAmount", () => {
  it("converts 1 RON from wei", () => {
    expect(parseRoninAmount("1000000000000000000")).toBe(1);
  });

  it("converts 0.5 RON from wei", () => {
    expect(parseRoninAmount("500000000000000000")).toBe(0.5);
  });

  it("converts a large amount", () => {
    expect(parseRoninAmount("100000000000000000000")).toBe(100);
  });

  it("returns 0 for zero value", () => {
    expect(parseRoninAmount("0")).toBe(0);
  });

  it("returns 0 for 0x0", () => {
    expect(parseRoninAmount("0x0")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseRoninAmount("")).toBe(0);
  });

  it("returns 0 for invalid input", () => {
    expect(parseRoninAmount("notanumber")).toBe(0);
  });

  it("handles hex-encoded values", () => {
    // 0xde0b6b3a7640000 = 1e18
    expect(parseRoninAmount("0xde0b6b3a7640000")).toBe(1);
  });

  it("converts small amounts", () => {
    const result = parseRoninAmount("1000000000000");
    expect(result).toBeCloseTo(0.000001, 6);
  });
});

// ---------------------------------------------------------------------------
// parseTokenAmount
// ---------------------------------------------------------------------------

describe("parseTokenAmount", () => {
  it("converts with 18 decimals", () => {
    expect(parseTokenAmount("1000000000000000000", 18)).toBe(1);
  });

  it("converts with 6 decimals (USDC-style)", () => {
    expect(parseTokenAmount("1000000", 6)).toBe(1);
  });

  it("converts with 0 decimals", () => {
    expect(parseTokenAmount("42", 0)).toBe(42);
  });

  it("returns 0 for zero value", () => {
    expect(parseTokenAmount("0", 18)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseTokenAmount("", 18)).toBe(0);
  });

  it("returns 0 for invalid input", () => {
    expect(parseTokenAmount("abc", 18)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

describe("roninAdapter.getExplorerUrl", () => {
  it("returns the correct Ronin explorer URL", () => {
    const hash = "0xabcdef1234567890";
    expect(roninAdapter.getExplorerUrl(hash)).toBe(
      "https://app.roninchain.com/tx/0xabcdef1234567890",
    );
  });
});

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

describe("roninAdapter.validateAddress", () => {
  it("delegates to isValidRoninAddress", () => {
    expect(
      roninAdapter.validateAddress(
        "0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3",
      ),
    ).toBe(true);
    expect(roninAdapter.validateAddress("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("roninAdapter metadata", () => {
  it("has correct chainId", () => {
    expect(roninAdapter.chainId).toBe("ronin");
  });

  it("has correct chainName", () => {
    expect(roninAdapter.chainName).toBe("Ronin");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions — mocked API calls
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "0xf6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3";
const OTHER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function makeMockNativeTx(
  overrides: Partial<SkyMavisTxFields> = {},
): SkyMavisTxFields {
  return {
    transactionHash: overrides.transactionHash ?? "0xtxhash001",
    transactionIndex: 0,
    blockHash: "0xblockhash",
    blockNumber: 12345678,
    from: overrides.from ?? VALID_ADDRESS,
    to: overrides.to ?? OTHER_ADDRESS,
    contractAddress: overrides.contractAddress ?? "",
    status: overrides.status ?? 1,
    gas: 21000,
    gasPrice: overrides.gasPrice ?? "20000000000",
    effectiveGasPrice: overrides.effectiveGasPrice ?? "20000000000",
    gasUsed: overrides.gasUsed ?? 21000,
    cumulativeGasUsed: 21000,
    input: overrides.input ?? "0x",
    nonce: 0,
    value: overrides.value ?? "1000000000000000000", // 1 RON
    type: 0,
    blockTime: overrides.blockTime ?? 1705312200, // 2024-01-15T10:30:00Z
  };
}

interface SkyMavisTxFields {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string;
  contractAddress: string;
  status: number;
  gas: number;
  gasPrice: string;
  effectiveGasPrice: string;
  gasUsed: number;
  cumulativeGasUsed: number;
  input: string;
  nonce: number;
  value: string;
  type: number;
  blockTime: number;
}

function makeMockTokenTransfer(
  overrides: Partial<{
    transactionHash: string;
    from: string;
    to: string;
    value: string;
    tokenSymbol: string;
    tokenName: string;
    decimals: number;
    contractAddress: string;
    blockTime: number;
    tokenStandard: string;
  }> = {},
) {
  return {
    blockNumber: 12345678,
    logIndex: 0,
    tokenId: "",
    contractAddress:
      overrides.contractAddress ??
      "0xc99a6a985ed2cac1ef41640596c5a5f9f4e19ef5",
    tokenStandard: overrides.tokenStandard ?? "ERC20",
    tokenName: overrides.tokenName ?? "Wrapped RON",
    tokenSymbol: overrides.tokenSymbol ?? "WRON",
    decimals: overrides.decimals ?? 18,
    from: overrides.from ?? OTHER_ADDRESS,
    to: overrides.to ?? VALID_ADDRESS,
    value: overrides.value ?? "5000000000000000000", // 5 tokens
    blockHash: "0xblockhash",
    transactionHash: overrides.transactionHash ?? "0xtxhash-token-001",
    blockTime: overrides.blockTime ?? 1705312200,
  };
}

function makeNativeTxResponse(
  items: SkyMavisTxFields[],
  nextCursor?: string,
) {
  return {
    result: {
      items: items.length > 0 ? items : null,
      paging: {
        nextCursor,
      },
    },
  };
}

function makeTokenTransferResponse(
  items: ReturnType<typeof makeMockTokenTransfer>[],
  nextCursor?: string,
) {
  return {
    result: {
      items: items.length > 0 ? items : null,
      paging: {
        nextCursor,
      },
    },
  };
}

describe("roninAdapter.fetchTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws for invalid address", async () => {
    await expect(
      roninAdapter.fetchTransactions("invalid-address"),
    ).rejects.toThrow("Invalid Ronin address");
  });

  it("works without SKYMAVIS_API_KEY (public API)", async () => {
    // The new Ronin Skynet Explorer API is public and does not require an API key.
    delete process.env.SKYMAVIS_API_KEY;

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(makeNativeTxResponse([])), {
        status: 200,
      });
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("fetches and maps a send transaction (native RON)", async () => {
    const mockTx = makeMockNativeTx({
      transactionHash: "0xtx-send-001",
      from: VALID_ADDRESS,
      to: OTHER_ADDRESS,
      value: "2000000000000000000", // 2 RON
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([mockTx])),
          { status: 200 },
        );
      }
      // Token transfers: empty
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(2);
    expect(txs[0].sentCurrency).toBe("RON");
    expect(txs[0].txHash).toBe("0xtx-send-001");
    expect(txs[0].feeAmount).toBeGreaterThan(0);
    expect(txs[0].feeCurrency).toBe("RON");
  });

  it("fetches and maps a receive transaction (native RON)", async () => {
    const mockTx = makeMockNativeTx({
      transactionHash: "0xtx-recv-001",
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "3000000000000000000", // 3 RON
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(3);
    expect(txs[0].receivedCurrency).toBe("RON");
  });

  it("fetches and maps an ERC-20 token transfer (receive)", async () => {
    const mockTransfer = makeMockTokenTransfer({
      transactionHash: "0xtx-token-recv-001",
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "5000000000000000000",
      tokenSymbol: "AXS",
      decimals: 18,
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([mockTransfer])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(5);
    expect(txs[0].receivedCurrency).toBe("AXS");
  });

  it("fetches and maps an ERC-20 token transfer (send)", async () => {
    const mockTransfer = makeMockTokenTransfer({
      transactionHash: "0xtx-token-send-001",
      from: VALID_ADDRESS,
      to: OTHER_ADDRESS,
      value: "1000000", // 1 USDC (6 decimals)
      tokenSymbol: "USDC",
      decimals: 6,
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([mockTransfer])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(1);
    expect(txs[0].sentCurrency).toBe("USDC");
  });

  it("maps approval transactions", async () => {
    const mockTx = makeMockNativeTx({
      transactionHash: "0xtx-approve-001",
      from: VALID_ADDRESS,
      to: "0xcontractaddress0000000000000000000000000",
      value: "0",
      input:
        "0x095ea7b3000000000000000000000000abcdef1234567890abcdef1234567890abcdef12ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("approval");
    expect(txs[0].notes).toContain("Approval");
  });

  it("maps contract interactions (non-approval, zero value)", async () => {
    const mockTx = makeMockNativeTx({
      transactionHash: "0xtx-contract-001",
      from: VALID_ADDRESS,
      to: "0xcontractaddress0000000000000000000000000",
      value: "0",
      input: "0xa9059cbb0000000000000000000000001234", // some method call
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("other");
    expect(txs[0].notes).toContain("Contract interaction");
  });

  it("skips failed transactions (status !== 1)", async () => {
    const mockTx = makeMockNativeTx({
      transactionHash: "0xtx-failed-001",
      status: 0, // failed
      value: "1000000000000000000",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("maps self-transfer (native RON)", async () => {
    const mockTx = makeMockNativeTx({
      transactionHash: "0xtx-self-001",
      from: VALID_ADDRESS,
      to: VALID_ADDRESS,
      value: "1000000000000000000",
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(1);
    expect(txs[0].receivedQuantity).toBe(1);
    expect(txs[0].notes).toBe("Self-transfer");
  });

  it("maps token mint (from zero address)", async () => {
    const mockTransfer = makeMockTokenTransfer({
      transactionHash: "0xtx-mint-001",
      from: "0x0000000000000000000000000000000000000000",
      to: VALID_ADDRESS,
      value: "10000000000000000000",
      tokenSymbol: "SLP",
      decimals: 18,
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([mockTransfer])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
    expect(txs[0].receivedQuantity).toBe(10);
    expect(txs[0].receivedCurrency).toBe("SLP");
    expect(txs[0].notes).toContain("Mint");
  });

  it("maps token burn (to zero address)", async () => {
    const mockTransfer = makeMockTokenTransfer({
      transactionHash: "0xtx-burn-001",
      from: VALID_ADDRESS,
      to: "0x0000000000000000000000000000000000000000",
      value: "5000000000000000000",
      tokenSymbol: "SLP",
      decimals: 18,
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([mockTransfer])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("send");
    expect(txs[0].sentQuantity).toBe(5);
    expect(txs[0].sentCurrency).toBe("SLP");
    expect(txs[0].notes).toContain("Burn");
  });

  it("sorts transactions by date ascending", async () => {
    const tx1 = makeMockNativeTx({
      transactionHash: "0xtx-later",
      blockTime: 1705400000, // later
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "1000000000000000000",
    });

    const tx2 = makeMockNativeTx({
      transactionHash: "0xtx-earlier",
      blockTime: 1705300000, // earlier
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "2000000000000000000",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([tx1, tx2])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(2);
    expect(txs[0].txHash).toBe("0xtx-earlier");
    expect(txs[1].txHash).toBe("0xtx-later");
    expect(txs[0].date.getTime()).toBeLessThan(txs[1].date.getTime());
  });

  it("filters transactions by date range", async () => {
    const txOld = makeMockNativeTx({
      transactionHash: "0xtx-old",
      blockTime: 1700000000, // 2023-11-14
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "1000000000000000000",
    });

    const txInRange = makeMockNativeTx({
      transactionHash: "0xtx-in-range",
      blockTime: 1705312200, // 2024-01-15
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "2000000000000000000",
    });

    const txNew = makeMockNativeTx({
      transactionHash: "0xtx-new",
      blockTime: 1710000000, // 2024-03-09
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "3000000000000000000",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([txOld, txInRange, txNew])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS, {
      fromDate: new Date("2024-01-01T00:00:00Z"),
      toDate: new Date("2024-02-01T00:00:00Z"),
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe("0xtx-in-range");
  });

  it("handles empty transaction list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
  });

  it("handles API error with retry", async () => {
    let callCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response(
        JSON.stringify(makeNativeTxResponse([])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);
    expect(txs).toHaveLength(0);
    expect(callCount).toBeGreaterThan(2);
  });

  it("accepts ronin:-prefixed addresses", async () => {
    const mockTx = makeMockNativeTx({
      transactionHash: "0xtx-ronin-prefix-001",
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "1000000000000000000",
      blockTime: 1705312200,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([mockTx])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    // Use ronin: prefix
    const roninAddress =
      "ronin:f6fd5fca4bd769ba495b29b98dba5f2ecf4ceed3";
    const txs = await roninAdapter.fetchTransactions(roninAddress);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("receive");
  });

  it("combines native and token transactions", async () => {
    const nativeTx = makeMockNativeTx({
      transactionHash: "0xtx-native-001",
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "1000000000000000000",
      blockTime: 1705312200,
    });

    const tokenTransfer = makeMockTokenTransfer({
      transactionHash: "0xtx-token-001",
      from: OTHER_ADDRESS,
      to: VALID_ADDRESS,
      value: "5000000000000000000",
      tokenSymbol: "AXS",
      decimals: 18,
      blockTime: 1705312300,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([nativeTx])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([tokenTransfer])),
        { status: 200 },
      );
    });

    const txs = await roninAdapter.fetchTransactions(VALID_ADDRESS);

    expect(txs).toHaveLength(2);
    // Should be sorted by date
    expect(txs[0].receivedCurrency).toBe("RON");
    expect(txs[1].receivedCurrency).toBe("AXS");
  });

  it("sends requests to the Ronin Skynet Explorer API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr).toContain("skynet-api.roninchain.com/ronin/explorer/v2");
      if (urlStr.includes("/txs")) {
        return new Response(
          JSON.stringify(makeNativeTxResponse([])),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(makeTokenTransferResponse([])),
        { status: 200 },
      );
    });

    await roninAdapter.fetchTransactions(VALID_ADDRESS);
  });
});

// ---------------------------------------------------------------------------
// toAwakenCSV
// ---------------------------------------------------------------------------

describe("roninAdapter.toAwakenCSV", () => {
  it("generates valid CSV from transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2024-01-15T10:30:00Z"),
        type: "send",
        sentQuantity: 2,
        sentCurrency: "RON",
        feeAmount: 0.00042,
        feeCurrency: "RON",
        txHash: "0xtx-abc-123",
      },
      {
        date: new Date("2024-01-16T12:00:00Z"),
        type: "receive",
        receivedQuantity: 5,
        receivedCurrency: "AXS",
        txHash: "0xtx-token-456",
        notes: "Transfer AXS from 0x1234567…",
      },
    ];

    const csv = roninAdapter.toAwakenCSV(txs);
    const lines = csv.split("\n");

    // Header
    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Received Quantity");
    expect(lines[0]).toContain("Sent Quantity");
    expect(lines[0]).toContain("Fee Amount");
    expect(lines[0]).toContain("Transaction Hash");

    // Send row
    expect(lines[1]).toContain("01/15/2024 10:30:00");
    expect(lines[1]).toContain("RON");
    expect(lines[1]).toContain("0xtx-abc-123");

    // Receive row
    expect(lines[2]).toContain("01/16/2024 12:00:00");
    expect(lines[2]).toContain("AXS");
  });
});

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

describe("ronin adapter registration", () => {
  it("is registered in the default registry", async () => {
    const { getAdapter } = await import("@/lib/adapters");
    const adapter = getAdapter("ronin");
    expect(adapter).toBeDefined();
    expect(adapter?.chainId).toBe("ronin");
    expect(adapter?.chainName).toBe("Ronin");
  });

  it("appears in available chains", async () => {
    const { getAvailableChains } = await import("@/lib/adapters");
    const chains = getAvailableChains();
    const ronin = chains.find((c) => c.chainId === "ronin");
    expect(ronin).toBeDefined();
    expect(ronin?.chainName).toBe("Ronin");
    expect(ronin?.enabled).toBe(true);
  });
});
