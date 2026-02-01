import { describe, it, expect } from "vitest";
import { generateStandardCSV } from "@/lib/csv/standard";
import { generatePerpCSV } from "@/lib/csv/perp";
import { formatDate, formatQuantity, escapeCSVField } from "@/lib/csv/utils";
import type { Transaction, PerpTransaction } from "@/types";

describe("CSV Utils", () => {
  describe("formatDate", () => {
    it("formats a date as MM/DD/YYYY HH:MM:SS in UTC", () => {
      const date = new Date("2025-01-15T14:30:00Z");
      expect(formatDate(date)).toBe("01/15/2025 14:30:00");
    });

    it("pads single-digit months and days", () => {
      const date = new Date("2025-03-05T09:05:03Z");
      expect(formatDate(date)).toBe("03/05/2025 09:05:03");
    });
  });

  describe("formatQuantity", () => {
    it("returns empty string for undefined", () => {
      expect(formatQuantity(undefined)).toBe("");
    });

    it("formats integers without trailing zeros", () => {
      expect(formatQuantity(10)).toBe("10");
    });

    it("preserves full decimal precision", () => {
      expect(formatQuantity(1.123456789012)).toBe("1.123456789012");
    });

    it("strips trailing zeros", () => {
      expect(formatQuantity(1.1)).toBe("1.1");
    });

    it("ensures no negative numbers (takes absolute value)", () => {
      expect(formatQuantity(-5.5)).toBe("5.5");
    });
  });

  describe("escapeCSVField", () => {
    it("returns plain text unchanged", () => {
      expect(escapeCSVField("hello")).toBe("hello");
    });

    it("wraps fields containing commas in quotes", () => {
      expect(escapeCSVField("hello,world")).toBe('"hello,world"');
    });

    it("escapes double quotes inside fields", () => {
      expect(escapeCSVField('say "hi"')).toBe('"say ""hi"""');
    });
  });
});

describe("Standard CSV Generation", () => {
  it("generates correct header row", () => {
    const csv = generateStandardCSV([]);
    expect(csv).toBe(
      "Date,Received Quantity,Received Currency,Received Fiat Amount,Sent Quantity,Sent Currency,Sent Fiat Amount,Fee Amount,Fee Currency,Transaction Hash,Notes,Tag",
    );
  });

  it("generates a send transaction row (PRD example)", () => {
    const tx: Transaction = {
      date: new Date("2025-01-15T14:30:00Z"),
      type: "send",
      sentQuantity: 9.999,
      sentCurrency: "USDC",
      feeAmount: 0.001,
      feeCurrency: "ETH",
      txHash: "0xabc123",
    };
    const csv = generateStandardCSV([tx]);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("01/15/2025 14:30:00");
    expect(rows[1]).toContain("9.999,USDC");
    expect(rows[1]).toContain("0.001,ETH");
  });

  it("generates a receive transaction row", () => {
    const tx: Transaction = {
      date: new Date("2025-01-15T14:30:00Z"),
      type: "receive",
      receivedQuantity: 10,
      receivedCurrency: "SOL",
      txHash: "0xdef456",
    };
    const csv = generateStandardCSV([tx]);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("10,SOL");
  });

  it("generates a trade transaction row with both sides", () => {
    const tx: Transaction = {
      date: new Date("2025-01-15T14:30:00Z"),
      type: "trade",
      receivedQuantity: 1,
      receivedCurrency: "SOL",
      sentQuantity: 10,
      sentCurrency: "USDC",
      feeAmount: 0.00005,
      feeCurrency: "SOL",
      txHash: "0x789abc",
    };
    const csv = generateStandardCSV([tx]);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("1,SOL");
    expect(rows[1]).toContain("10,USDC");
  });

  it("handles multiple transactions", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 5,
        sentCurrency: "ETH",
      },
      {
        date: new Date("2025-01-16T10:00:00Z"),
        type: "receive",
        receivedQuantity: 100,
        receivedCurrency: "TAO",
      },
    ];
    const csv = generateStandardCSV(txs);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(3); // header + 2 data rows
  });
});

describe("Perpetuals CSV Generation", () => {
  it("generates correct header row", () => {
    const csv = generatePerpCSV([]);
    expect(csv).toBe(
      "Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag",
    );
  });

  it("generates an open_position row", () => {
    const tx: PerpTransaction = {
      date: new Date("2024-04-01T00:00:00Z"),
      asset: "BTC",
      amount: 2,
      pnl: 0,
      paymentToken: "",
      txHash: "0xperp1",
      tag: "open_position",
    };
    const csv = generatePerpCSV([tx]);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("04/01/2024 00:00:00");
    expect(rows[1]).toContain("BTC");
    expect(rows[1]).toContain("open_position");
  });

  it("allows negative P&L values", () => {
    const tx: PerpTransaction = {
      date: new Date("2024-04-02T00:00:00Z"),
      asset: "BTC",
      amount: 1,
      pnl: -20,
      paymentToken: "USDC",
      tag: "close_position",
    };
    const csv = generatePerpCSV([tx]);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("-20");
  });

  it("generates a funding_payment row with positive P&L", () => {
    const tx: PerpTransaction = {
      date: new Date("2024-04-04T00:00:00Z"),
      asset: "USDC",
      amount: 10,
      pnl: 10,
      paymentToken: "USDC",
      tag: "funding_payment",
    };
    const csv = generatePerpCSV([tx]);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("funding_payment");
    expect(rows[1]).toContain("10");
  });
});
