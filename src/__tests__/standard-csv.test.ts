import { describe, it, expect } from "vitest";
import { generateStandardCSV } from "@/lib/csv/standard";
import { STANDARD_CSV_HEADER } from "@/lib/csv/constants";
import type { Transaction } from "@/types";

describe("generateStandardCSV", () => {
  // -------------------------------------------------------------------
  // Header tests
  // -------------------------------------------------------------------
  describe("header row", () => {
    it("returns the standard header when no transactions are provided", () => {
      const csv = generateStandardCSV([]);
      expect(csv).toBe(STANDARD_CSV_HEADER);
    });

    it("returns the standard header for single-asset transactions", () => {
      const tx: Transaction = {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 10,
        sentCurrency: "USDC",
      };
      const csv = generateStandardCSV([tx]);
      const header = csv.split("\n")[0];
      expect(header).toBe(STANDARD_CSV_HEADER);
    });

    it("uses numbered columns for multi-asset transactions", () => {
      const tx: Transaction = {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "lp_add",
        sentQuantity: 10,
        sentCurrency: "USDC",
        additionalSent: [{ quantity: 1, currency: "SOL" }],
        receivedQuantity: 5,
        receivedCurrency: "USDC-SOL-LP",
      };
      const csv = generateStandardCSV([tx]);
      const header = csv.split("\n")[0];
      expect(header).toContain("Received Quantity 1");
      expect(header).toContain("Received Currency 1");
      expect(header).toContain("Sent Quantity 1");
      expect(header).toContain("Sent Currency 1");
      expect(header).toContain("Received Quantity 2");
      expect(header).toContain("Sent Quantity 2");
    });
  });

  // -------------------------------------------------------------------
  // Date format tests
  // -------------------------------------------------------------------
  describe("date formatting", () => {
    it("formats dates as MM/DD/YYYY HH:MM:SS in UTC", () => {
      const tx: Transaction = {
        date: new Date("2025-06-01T08:05:09Z"),
        type: "receive",
        receivedQuantity: 1,
        receivedCurrency: "ETH",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toMatch(/^06\/01\/2025 08:05:09,/);
    });

    it("does not produce local timezone offsets", () => {
      const tx: Transaction = {
        date: new Date("2025-12-31T23:59:59Z"),
        type: "receive",
        receivedQuantity: 1,
        receivedCurrency: "BTC",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row.startsWith("12/31/2025 23:59:59")).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // No negative numbers
  // -------------------------------------------------------------------
  describe("no negative numbers", () => {
    it("converts negative sent quantity to absolute value", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "send",
        sentQuantity: -5.5,
        sentCurrency: "ETH",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).not.toContain("-");
      expect(row).toContain("5.5");
    });

    it("converts negative received quantity to absolute value", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: -10,
        receivedCurrency: "SOL",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).not.toContain("-");
      expect(row).toContain("10");
    });

    it("converts negative fee to absolute value", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "send",
        sentQuantity: 1,
        sentCurrency: "ETH",
        feeAmount: -0.001,
        feeCurrency: "ETH",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).not.toContain("-");
      expect(row).toContain("0.001");
    });
  });

  // -------------------------------------------------------------------
  // Decimal precision (max 8 places)
  // -------------------------------------------------------------------
  describe("decimal precision", () => {
    it("limits quantities to 8 decimal places", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 0.123456789123,
        receivedCurrency: "BTC",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      // 0.123456789123 rounded to 8 decimal places = 0.12345679
      expect(row).toContain("0.12345679");
    });

    it("strips trailing zeros", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 1.5,
        receivedCurrency: "ETH",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("1.5,ETH");
      expect(row).not.toContain("1.50000000");
    });

    it("formats zero as 0", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 0,
        receivedCurrency: "BTC",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("0,BTC");
    });
  });

  // -------------------------------------------------------------------
  // Transaction types: send, receive, trade
  // -------------------------------------------------------------------
  describe("transaction type handling", () => {
    it("send: leaves received columns empty", () => {
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
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      // fields: Date, RecQty, RecCur, RecFiat, SentQty, SentCur, SentFiat, FeeAmt, FeeCur, TxHash, Notes, Tag
      expect(fields[1]).toBe(""); // Received Quantity
      expect(fields[2]).toBe(""); // Received Currency
      expect(fields[3]).toBe(""); // Received Fiat Amount
      expect(fields[4]).toBe("9.999"); // Sent Quantity
      expect(fields[5]).toBe("USDC"); // Sent Currency
    });

    it("receive: leaves sent columns empty", () => {
      const tx: Transaction = {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "SOL",
        txHash: "0xdef456",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[1]).toBe("10"); // Received Quantity
      expect(fields[2]).toBe("SOL"); // Received Currency
      expect(fields[4]).toBe(""); // Sent Quantity
      expect(fields[5]).toBe(""); // Sent Currency
    });

    it("trade: fills both sent and received columns", () => {
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
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[1]).toBe("1"); // Received Quantity
      expect(fields[2]).toBe("SOL"); // Received Currency
      expect(fields[4]).toBe("10"); // Sent Quantity
      expect(fields[5]).toBe("USDC"); // Sent Currency
      expect(fields[7]).toBe("0.00005"); // Fee Amount
      expect(fields[8]).toBe("SOL"); // Fee Currency
    });
  });

  // -------------------------------------------------------------------
  // Multi-asset transactions (LP add/remove)
  // -------------------------------------------------------------------
  describe("multi-asset transactions", () => {
    it("LP add: uses numbered columns for multiple sent assets", () => {
      const tx: Transaction = {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "lp_add",
        receivedQuantity: 5,
        receivedCurrency: "USDC-SOL-LP",
        sentQuantity: 10,
        sentCurrency: "USDC",
        additionalSent: [{ quantity: 1, currency: "SOL" }],
        txHash: "0xmulti1",
        notes: "LP Add",
      };
      const csv = generateStandardCSV([tx]);
      const header = csv.split("\n")[0];
      const row = csv.split("\n")[1];

      // Header should have numbered columns
      expect(header).toContain("Sent Quantity 1");
      expect(header).toContain("Sent Currency 1");
      expect(header).toContain("Sent Quantity 2");
      expect(header).toContain("Sent Currency 2");

      // Row should contain multi-asset data
      expect(row).toContain("USDC-SOL-LP");
      expect(row).toContain("USDC");
      expect(row).toContain("SOL");
    });

    it("LP remove: uses numbered columns for multiple received assets", () => {
      const tx: Transaction = {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "lp_remove",
        sentQuantity: 5,
        sentCurrency: "USDC-SOL-LP",
        receivedQuantity: 10,
        receivedCurrency: "USDC",
        additionalReceived: [{ quantity: 1, currency: "SOL" }],
        txHash: "0xmulti2",
      };
      const csv = generateStandardCSV([tx]);
      const header = csv.split("\n")[0];
      expect(header).toContain("Received Quantity 2");
      expect(header).toContain("Received Currency 2");
    });

    it("handles 3+ assets in a single transaction", () => {
      const tx: Transaction = {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "lp_remove",
        sentQuantity: 100,
        sentCurrency: "TRI-LP",
        receivedQuantity: 50,
        receivedCurrency: "USDC",
        additionalReceived: [
          { quantity: 25, currency: "ETH" },
          { quantity: 10, currency: "BTC" },
        ],
      };
      const csv = generateStandardCSV([tx]);
      const header = csv.split("\n")[0];
      expect(header).toContain("Received Quantity 3");
      expect(header).toContain("Received Currency 3");

      const row = csv.split("\n")[1];
      expect(row).toContain("50"); // USDC
      expect(row).toContain("25"); // ETH
      expect(row).toContain("10"); // BTC
    });

    it("mixes single and multi-asset transactions with correct padding", () => {
      const txs: Transaction[] = [
        {
          date: new Date("2025-01-15T14:30:00Z"),
          type: "send",
          sentQuantity: 5,
          sentCurrency: "ETH",
        },
        {
          date: new Date("2025-01-16T10:00:00Z"),
          type: "lp_add",
          sentQuantity: 10,
          sentCurrency: "USDC",
          additionalSent: [{ quantity: 1, currency: "SOL" }],
          receivedQuantity: 5,
          receivedCurrency: "LP-TOKEN",
        },
      ];
      const csv = generateStandardCSV(txs);
      const lines = csv.split("\n");
      expect(lines).toHaveLength(3);

      // Header should have numbered columns due to multi-asset tx
      expect(lines[0]).toContain("Sent Quantity 1");
      expect(lines[0]).toContain("Sent Quantity 2");

      // Single-asset row should have empty slots for unused asset columns
      const singleRow = lines[1].split(",");
      // The single-asset send should have ETH in slot 1 and empty slot 2
      expect(singleRow).toContain("ETH");
    });
  });

  // -------------------------------------------------------------------
  // Optional fields
  // -------------------------------------------------------------------
  describe("optional fields", () => {
    it("leaves fiat amount columns empty when not provided", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "trade",
        receivedQuantity: 1,
        receivedCurrency: "SOL",
        sentQuantity: 10,
        sentCurrency: "USDC",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[3]).toBe(""); // Received Fiat Amount
      expect(fields[6]).toBe(""); // Sent Fiat Amount
    });

    it("includes fiat amounts when provided", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "trade",
        receivedQuantity: 1,
        receivedCurrency: "SOL",
        receivedFiatAmount: 150.25,
        sentQuantity: 150,
        sentCurrency: "USDC",
        sentFiatAmount: 150,
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("150.25");
      expect(row).toContain("150");
    });

    it("handles missing fee columns", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "TAO",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[7]).toBe(""); // Fee Amount
      expect(fields[8]).toBe(""); // Fee Currency
    });

    it("includes transaction hash when provided", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "TAO",
        txHash: "0xabcdef1234567890",
      };
      const csv = generateStandardCSV([tx]);
      expect(csv).toContain("0xabcdef1234567890");
    });

    it("includes notes when provided", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "stake",
        sentQuantity: 100,
        sentCurrency: "TAO",
        notes: "Staking delegation",
      };
      const csv = generateStandardCSV([tx]);
      expect(csv).toContain("Staking delegation");
    });

    it("includes tag when provided", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "stake",
        sentQuantity: 100,
        sentCurrency: "TAO",
        tag: "stake",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row.endsWith(",stake")).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // CSV escaping
  // -------------------------------------------------------------------
  describe("CSV escaping", () => {
    it("escapes notes containing commas", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "send",
        sentQuantity: 1,
        sentCurrency: "ETH",
        notes: "Sent to Alice, Bob",
      };
      const csv = generateStandardCSV([tx]);
      expect(csv).toContain('"Sent to Alice, Bob"');
    });

    it("escapes notes containing double quotes", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "send",
        sentQuantity: 1,
        sentCurrency: "ETH",
        notes: 'Called "transfer"',
      };
      const csv = generateStandardCSV([tx]);
      expect(csv).toContain('"Called ""transfer"""');
    });

    it("escapes notes containing newlines", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "send",
        sentQuantity: 1,
        sentCurrency: "ETH",
        notes: "Line 1\nLine 2",
      };
      const csv = generateStandardCSV([tx]);
      expect(csv).toContain('"Line 1\nLine 2"');
    });
  });

  // -------------------------------------------------------------------
  // Multiple transactions
  // -------------------------------------------------------------------
  describe("multiple transactions", () => {
    it("generates correct number of rows", () => {
      const txs: Transaction[] = Array.from({ length: 5 }, (_, i) => ({
        date: new Date(`2025-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
        type: "receive" as const,
        receivedQuantity: i + 1,
        receivedCurrency: "ETH",
      }));
      const csv = generateStandardCSV(txs);
      const lines = csv.split("\n");
      expect(lines).toHaveLength(6); // 1 header + 5 data rows
    });

    it("preserves transaction order", () => {
      const txs: Transaction[] = [
        {
          date: new Date("2025-01-01T00:00:00Z"),
          type: "receive",
          receivedQuantity: 1,
          receivedCurrency: "FIRST",
        },
        {
          date: new Date("2025-01-02T00:00:00Z"),
          type: "receive",
          receivedQuantity: 2,
          receivedCurrency: "SECOND",
        },
        {
          date: new Date("2025-01-03T00:00:00Z"),
          type: "receive",
          receivedQuantity: 3,
          receivedCurrency: "THIRD",
        },
      ];
      const csv = generateStandardCSV(txs);
      const lines = csv.split("\n");
      expect(lines[1]).toContain("FIRST");
      expect(lines[2]).toContain("SECOND");
      expect(lines[3]).toContain("THIRD");
    });
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------
  describe("edge cases", () => {
    it("handles transaction with all optional fields missing", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "other",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      const fields = row.split(",");
      expect(fields[0]).toBe("01/01/2025 00:00:00");
      // All other fields should be empty
      for (let i = 1; i < fields.length; i++) {
        expect(fields[i]).toBe("");
      }
    });

    it("handles very small quantities", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 0.00000001,
        receivedCurrency: "BTC",
      };
      const csv = generateStandardCSV([tx]);
      expect(csv).toContain("0.00000001");
    });

    it("handles very large quantities", () => {
      const tx: Transaction = {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 999999999,
        receivedCurrency: "SHIB",
      };
      const csv = generateStandardCSV([tx]);
      expect(csv).toContain("999999999");
    });

    it("handles multi-asset fiat amounts", () => {
      const tx: Transaction = {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "lp_add",
        sentQuantity: 10,
        sentCurrency: "USDC",
        sentFiatAmount: 10,
        additionalSent: [{ quantity: 1, currency: "SOL", fiatAmount: 150 }],
        receivedQuantity: 5,
        receivedCurrency: "LP-TOKEN",
      };
      const csv = generateStandardCSV([tx]);
      const row = csv.split("\n")[1];
      expect(row).toContain("150");
      expect(row).toContain("10");
    });
  });
});
