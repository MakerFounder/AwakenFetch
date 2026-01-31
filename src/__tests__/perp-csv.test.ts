import { describe, it, expect } from "vitest";
import { generatePerpCSV } from "@/lib/csv/perp";
import { PERP_CSV_HEADER } from "@/lib/csv/constants";
import type { PerpTransaction } from "@/types";

describe("generatePerpCSV", () => {
  // -------------------------------------------------------------------
  // Header tests
  // -------------------------------------------------------------------
  describe("header row", () => {
    it("returns the perpetuals header when no transactions are provided", () => {
      const csv = generatePerpCSV([]);
      expect(csv).toBe(PERP_CSV_HEADER);
    });

    it("matches the exact Awaken perps spec header", () => {
      const csv = generatePerpCSV([]);
      expect(csv).toBe(
        "Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag",
      );
    });

    it("header is always the first line regardless of transaction count", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const header = csv.split("\n")[0];
      expect(header).toBe(PERP_CSV_HEADER);
    });
  });

  // -------------------------------------------------------------------
  // Date format tests
  // -------------------------------------------------------------------
  describe("date formatting", () => {
    it("formats dates as MM/DD/YYYY HH:MM:SS in UTC", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-06-01T08:05:09Z"),
        asset: "ETH",
        amount: 5,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toMatch(/^06\/01\/2024 08:05:09,/);
    });

    it("pads single-digit months and days", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-03-05T09:05:03Z"),
        asset: "BTC",
        amount: 1,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toMatch(/^03\/05\/2024 09:05:03,/);
    });

    it("does not produce local timezone offsets", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-12-31T23:59:59Z"),
        asset: "BTC",
        amount: 1,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row.startsWith("12/31/2024 23:59:59")).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Tag handling: open_position, close_position, funding_payment
  // -------------------------------------------------------------------
  describe("tag handling", () => {
    it("generates an open_position row (PRD example)", () => {
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
      const row = csv.split("\n")[1];
      expect(row).toContain("BTC");
      expect(row).toContain("2");
      expect(row).toContain("0xperp1");
      expect(row.endsWith("open_position")).toBe(true);
    });

    it("generates a close_position row (PRD example)", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 20,
        paymentToken: "USDC",
        txHash: "0xperp2",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("BTC");
      expect(row).toContain("USDC");
      expect(row.endsWith("close_position")).toBe(true);
    });

    it("generates a funding_payment row (PRD example)", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-04T00:00:00Z"),
        asset: "USDC",
        amount: 10,
        pnl: 10,
        paymentToken: "USDC",
        txHash: "0xperp3",
        tag: "funding_payment",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("USDC");
      expect(row.endsWith("funding_payment")).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // P&L handling (can be negative, positive, or zero)
  // -------------------------------------------------------------------
  describe("P&L values", () => {
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
      const row = csv.split("\n")[1];
      expect(row).toContain("-20");
    });

    it("handles zero P&L", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "ETH",
        amount: 5,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[4]).toBe("0");
    });

    it("handles positive P&L", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 500.5,
        paymentToken: "USDC",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("500.5");
    });

    it("limits P&L to 8 decimal places", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: -0.123456789123,
        paymentToken: "USDC",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("-0.12345679");
    });

    it("strips trailing zeros from P&L", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 10.5,
        paymentToken: "USDC",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[4]).toBe("10.5");
    });
  });

  // -------------------------------------------------------------------
  // Amount handling (non-negative, max 8 decimal places)
  // -------------------------------------------------------------------
  describe("amount formatting", () => {
    it("formats amount with up to 8 decimal places", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 0.123456789123,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("0.12345679");
    });

    it("strips trailing zeros from amount", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "ETH",
        amount: 5.1,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[2]).toBe("5.1");
    });

    it("ensures amount is non-negative (absolute value)", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: -2,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[2]).toBe("2");
    });

    it("handles very small amounts", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 0.00000001,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain("0.00000001");
    });

    it("handles very large amounts", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "FARTCOIN",
        amount: 999999999,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain("999999999");
    });
  });

  // -------------------------------------------------------------------
  // Fee handling
  // -------------------------------------------------------------------
  describe("fee handling", () => {
    it("includes fee when provided", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        fee: 0.5,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[3]).toBe("0.5");
    });

    it("leaves fee empty when not provided", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[3]).toBe("");
    });

    it("ensures fee is non-negative (absolute value)", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        fee: -0.25,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[3]).toBe("0.25");
    });
  });

  // -------------------------------------------------------------------
  // Payment Token
  // -------------------------------------------------------------------
  describe("payment token", () => {
    it("includes payment token for close_position", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 20,
        paymentToken: "USDC",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[5]).toBe("USDC");
    });

    it("includes payment token for funding_payment", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-04T00:00:00Z"),
        asset: "USDC",
        amount: 10,
        pnl: 10,
        paymentToken: "USDC",
        tag: "funding_payment",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[5]).toBe("USDC");
    });

    it("handles USDT as payment token", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "ETH",
        amount: 10,
        pnl: -50,
        paymentToken: "USDT",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[5]).toBe("USDT");
    });

    it("handles empty payment token for open_position", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[5]).toBe("");
    });
  });

  // -------------------------------------------------------------------
  // Optional fields (notes, txHash)
  // -------------------------------------------------------------------
  describe("optional fields", () => {
    it("includes notes when provided", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        notes: "Short position opened",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain("Short position opened");
    });

    it("leaves notes empty when not provided", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[6]).toBe("");
    });

    it("includes transaction hash when provided", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        txHash: "0xabcdef1234567890",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain("0xabcdef1234567890");
    });

    it("leaves transaction hash empty when not provided", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[7]).toBe("");
    });
  });

  // -------------------------------------------------------------------
  // CSV escaping
  // -------------------------------------------------------------------
  describe("CSV escaping", () => {
    it("escapes notes containing commas", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        notes: "Opened short, high leverage",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain('"Opened short, high leverage"');
    });

    it("escapes notes containing double quotes", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        notes: 'Called "openPosition"',
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain('"Called ""openPosition"""');
    });

    it("escapes notes containing newlines", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        notes: "Line 1\nLine 2",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain('"Line 1\nLine 2"');
    });
  });

  // -------------------------------------------------------------------
  // Multiple transactions
  // -------------------------------------------------------------------
  describe("multiple transactions", () => {
    it("generates correct number of rows", () => {
      const txs: PerpTransaction[] = Array.from({ length: 5 }, (_, i) => ({
        date: new Date(
          `2024-04-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        ),
        asset: "BTC",
        amount: i + 1,
        pnl: i * 10,
        paymentToken: "USDC",
        tag: "open_position" as const,
      }));
      const csv = generatePerpCSV(txs);
      const lines = csv.split("\n");
      expect(lines).toHaveLength(6); // 1 header + 5 data rows
    });

    it("preserves transaction order", () => {
      const txs: PerpTransaction[] = [
        {
          date: new Date("2024-04-01T00:00:00Z"),
          asset: "BTC",
          amount: 2,
          pnl: 0,
          paymentToken: "USDC",
          tag: "open_position",
        },
        {
          date: new Date("2024-04-02T00:00:00Z"),
          asset: "BTC",
          amount: 1,
          pnl: 20,
          paymentToken: "USDC",
          tag: "close_position",
        },
        {
          date: new Date("2024-04-04T00:00:00Z"),
          asset: "USDC",
          amount: 10,
          pnl: 10,
          paymentToken: "USDC",
          tag: "funding_payment",
        },
      ];
      const csv = generatePerpCSV(txs);
      const lines = csv.split("\n");
      expect(lines[1]).toContain("open_position");
      expect(lines[2]).toContain("close_position");
      expect(lines[3]).toContain("funding_payment");
    });

    it("handles a full trading lifecycle (open, funding, close)", () => {
      const txs: PerpTransaction[] = [
        {
          date: new Date("2024-04-01T10:00:00Z"),
          asset: "BTC",
          amount: 2,
          fee: 1.5,
          pnl: 0,
          paymentToken: "USDC",
          notes: "Open short BTC",
          txHash: "0xopen1",
          tag: "open_position",
        },
        {
          date: new Date("2024-04-02T00:00:00Z"),
          asset: "BTC",
          amount: 2,
          pnl: 5.25,
          paymentToken: "USDC",
          txHash: "0xfund1",
          tag: "funding_payment",
        },
        {
          date: new Date("2024-04-03T00:00:00Z"),
          asset: "BTC",
          amount: 2,
          pnl: -3.1,
          paymentToken: "USDC",
          txHash: "0xfund2",
          tag: "funding_payment",
        },
        {
          date: new Date("2024-04-05T15:30:00Z"),
          asset: "BTC",
          amount: 2,
          fee: 1.5,
          pnl: 150.75,
          paymentToken: "USDC",
          notes: "Close short BTC",
          txHash: "0xclose1",
          tag: "close_position",
        },
      ];
      const csv = generatePerpCSV(txs);
      const lines = csv.split("\n");
      expect(lines).toHaveLength(5); // header + 4 rows
      expect(lines[1]).toContain("open_position");
      expect(lines[2]).toContain("5.25");
      expect(lines[3]).toContain("-3.1");
      expect(lines[4]).toContain("150.75");
      expect(lines[4]).toContain("close_position");
    });
  });

  // -------------------------------------------------------------------
  // Column position verification
  // -------------------------------------------------------------------
  describe("column positions", () => {
    it("has correct field positions per Awaken spec", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T12:30:45Z"),
        asset: "ETH",
        amount: 10,
        fee: 0.5,
        pnl: -25.123,
        paymentToken: "USDC",
        notes: "Test trade",
        txHash: "0xtest123",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");

      expect(fields[0]).toBe("04/01/2024 12:30:45"); // Date
      expect(fields[1]).toBe("ETH"); // Asset
      expect(fields[2]).toBe("10"); // Amount
      expect(fields[3]).toBe("0.5"); // Fee
      expect(fields[4]).toBe("-25.123"); // P&L
      expect(fields[5]).toBe("USDC"); // Payment Token
      expect(fields[6]).toBe("Test trade"); // Notes
      expect(fields[7]).toBe("0xtest123"); // Transaction Hash
      expect(fields[8]).toBe("close_position"); // Tag
    });

    it("row has exactly 9 fields", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields).toHaveLength(9);
    });
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------
  describe("edge cases", () => {
    it("handles transaction with all optional fields missing", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[3]).toBe(""); // fee
      expect(fields[6]).toBe(""); // notes
      expect(fields[7]).toBe(""); // txHash
    });

    it("handles exotic asset names", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "FARTCOIN",
        amount: 1000000,
        pnl: -500,
        paymentToken: "USDC",
        tag: "close_position",
      };
      const csv = generatePerpCSV([tx]);
      expect(csv).toContain("FARTCOIN");
    });

    it("handles amount of zero", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 0,
        pnl: 0,
        paymentToken: "USDC",
        tag: "funding_payment",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[2]).toBe("0");
    });

    it("handles fee of zero", () => {
      const tx: PerpTransaction = {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        fee: 0,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      };
      const csv = generatePerpCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[3]).toBe("0");
    });
  });
});
