import { describe, it, expect } from "vitest";
import type {
  Transaction,
  PerpTransaction,
  FetchOptions,
  AssetEntry,
  ChainInfo,
  TransactionType,
  PerpTag,
} from "@/types";

describe("Type Definitions", () => {
  it("Transaction interface supports all required fields", () => {
    const tx: Transaction = {
      date: new Date("2025-01-15T14:30:00Z"),
      type: "trade",
      sentQuantity: 10,
      sentCurrency: "USDC",
      receivedQuantity: 1,
      receivedCurrency: "SOL",
      feeAmount: 0.00005,
      feeCurrency: "SOL",
      txHash: "0x789abc",
      notes: "Test swap",
      tag: "trade",
    };
    expect(tx.date).toBeInstanceOf(Date);
    expect(tx.type).toBe("trade");
    expect(tx.sentQuantity).toBe(10);
    expect(tx.receivedQuantity).toBe(1);
  });

  it("Transaction supports multi-asset entries", () => {
    const tx: Transaction = {
      date: new Date(),
      type: "lp_add",
      additionalSent: [
        { quantity: 10, currency: "USDC" },
        { quantity: 1, currency: "SOL" },
      ],
      additionalReceived: [{ quantity: 5, currency: "USDC-SOL-LP" }],
    };
    expect(tx.additionalSent).toHaveLength(2);
    expect(tx.additionalReceived).toHaveLength(1);
  });

  it("PerpTransaction interface supports all required fields", () => {
    const perp: PerpTransaction = {
      date: new Date("2024-04-01T00:00:00Z"),
      asset: "BTC",
      amount: 2,
      fee: 0,
      pnl: -20,
      paymentToken: "USDC",
      txHash: "0xperp1",
      tag: "open_position",
    };
    expect(perp.pnl).toBe(-20);
    expect(perp.tag).toBe("open_position");
  });

  it("PerpTransaction P&L permits negative values", () => {
    const perp: PerpTransaction = {
      date: new Date(),
      asset: "ETH",
      amount: 1,
      pnl: -500.12345678,
      paymentToken: "USDC",
      tag: "close_position",
    };
    expect(perp.pnl).toBeLessThan(0);
  });

  it("TransactionType covers all PRD-specified types", () => {
    const types: TransactionType[] = [
      "send",
      "receive",
      "trade",
      "lp_add",
      "lp_remove",
      "stake",
      "unstake",
      "claim",
      "bridge",
      "approval",
      "other",
    ];
    expect(types).toHaveLength(11);
  });

  it("PerpTag covers all PRD-specified tags", () => {
    const tags: PerpTag[] = [
      "open_position",
      "close_position",
      "funding_payment",
    ];
    expect(tags).toHaveLength(3);
  });

  it("FetchOptions interface is properly typed", () => {
    const opts: FetchOptions = {
      fromDate: new Date("2024-01-01"),
      toDate: new Date("2024-12-31"),
      cursor: "abc123",
      limit: 100,
    };
    expect(opts.fromDate).toBeInstanceOf(Date);
    expect(opts.limit).toBe(100);
  });

  it("AssetEntry interface works for multi-asset data", () => {
    const entry: AssetEntry = {
      quantity: 10.5,
      currency: "USDC",
      fiatAmount: 10.5,
    };
    expect(entry.quantity).toBe(10.5);
    expect(entry.currency).toBe("USDC");
  });

  it("ChainInfo provides registry metadata", () => {
    const info: ChainInfo = {
      chainId: "bittensor",
      chainName: "Bittensor",
      ticker: "TAO",
      enabled: true,
    };
    expect(info.chainId).toBe("bittensor");
    expect(info.enabled).toBe(true);
  });
});
