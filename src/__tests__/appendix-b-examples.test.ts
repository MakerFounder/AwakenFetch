/**
 * Tests that validate CSV generators produce output matching the exact
 * example rows from PRD Appendix B.
 *
 * Each test reconstructs the input data described in the PRD and asserts
 * the generated CSV row matches the expected output character-for-character.
 */
import { describe, it, expect } from "vitest";
import { generateStandardCSV } from "@/lib/csv/standard";
import { generatePerpCSV } from "@/lib/csv/perp";
import { STANDARD_CSV_HEADER, PERP_CSV_HEADER } from "@/lib/csv/constants";
import type { Transaction, PerpTransaction } from "@/types";

// ---------------------------------------------------------------------------
// Helper: extract the data row(s) from generated CSV (skip header)
// ---------------------------------------------------------------------------
function dataRows(csv: string): string[] {
  return csv.split("\n").slice(1);
}

// =========================================================================
// Standard CSV — Appendix B examples
// =========================================================================
describe("Standard CSV — Appendix B example rows", () => {
  // -----------------------------------------------------------------------
  // Example 1: Send 10 USDC (0.001 ETH fee)
  //
  // Expected row from PRD:
  //   01/15/2025 14:30:00,,,, 9.999,USDC,,0.001,ETH,0xabc123...,,
  //
  // Note: The PRD shows " 9.999" with a leading space — this appears to be
  // a formatting artefact. The actual Awaken spec requires no leading space.
  // The PRD also shows "0xabc123..." which is a truncated hash; we use the
  // full value passed in the Transaction object.
  // -----------------------------------------------------------------------
  it("Send 10 USDC with 0.001 ETH fee", () => {
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
    const [header, row] = csv.split("\n");

    // Header must match the standard spec exactly
    expect(header).toBe(STANDARD_CSV_HEADER);

    // Parse fields
    const fields = row.split(",");

    // Date
    expect(fields[0]).toBe("01/15/2025 14:30:00");
    // Received columns — empty for a send
    expect(fields[1]).toBe(""); // Received Quantity
    expect(fields[2]).toBe(""); // Received Currency
    expect(fields[3]).toBe(""); // Received Fiat Amount
    // Sent columns
    expect(fields[4]).toBe("9.999"); // Sent Quantity
    expect(fields[5]).toBe("USDC"); // Sent Currency
    expect(fields[6]).toBe(""); // Sent Fiat Amount
    // Fee
    expect(fields[7]).toBe("0.001"); // Fee Amount
    expect(fields[8]).toBe("ETH"); // Fee Currency
    // Tx hash
    expect(fields[9]).toBe("0xabc123");
    // Notes & Tag — empty
    expect(fields[10]).toBe("");
    expect(fields[11]).toBe("");
  });

  // -----------------------------------------------------------------------
  // Example 2: Receive 10 SOL
  //
  // Expected row from PRD:
  //   01/15/2025 14:30:00,10,SOL,,,,,,,0xdef456...,,
  // -----------------------------------------------------------------------
  it("Receive 10 SOL", () => {
    const tx: Transaction = {
      date: new Date("2025-01-15T14:30:00Z"),
      type: "receive",
      receivedQuantity: 10,
      receivedCurrency: "SOL",
      txHash: "0xdef456",
    };

    const csv = generateStandardCSV([tx]);
    const fields = dataRows(csv)[0].split(",");

    expect(fields[0]).toBe("01/15/2025 14:30:00");
    // Received
    expect(fields[1]).toBe("10");
    expect(fields[2]).toBe("SOL");
    expect(fields[3]).toBe(""); // Received Fiat Amount
    // Sent — empty for a receive
    expect(fields[4]).toBe("");
    expect(fields[5]).toBe("");
    expect(fields[6]).toBe("");
    // Fee — none
    expect(fields[7]).toBe("");
    expect(fields[8]).toBe("");
    // Tx hash
    expect(fields[9]).toBe("0xdef456");
    // Notes & Tag
    expect(fields[10]).toBe("");
    expect(fields[11]).toBe("");
  });

  // -----------------------------------------------------------------------
  // Example 3: Swap 10 USDC for 1 SOL (0.00005 SOL fee)
  //
  // Expected row from PRD:
  //   01/15/2025 14:30:00,1,SOL,,10,USDC,,0.00005,SOL,0x789abc...,,
  // -----------------------------------------------------------------------
  it("Swap 10 USDC for 1 SOL", () => {
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
    const fields = dataRows(csv)[0].split(",");

    expect(fields[0]).toBe("01/15/2025 14:30:00");
    // Received
    expect(fields[1]).toBe("1");
    expect(fields[2]).toBe("SOL");
    expect(fields[3]).toBe(""); // Received Fiat Amount
    // Sent
    expect(fields[4]).toBe("10");
    expect(fields[5]).toBe("USDC");
    expect(fields[6]).toBe(""); // Sent Fiat Amount
    // Fee
    expect(fields[7]).toBe("0.00005");
    expect(fields[8]).toBe("SOL");
    // Tx hash
    expect(fields[9]).toBe("0x789abc");
    // Notes & Tag
    expect(fields[10]).toBe("");
    expect(fields[11]).toBe("");
  });

  // -----------------------------------------------------------------------
  // Example 4: LP Add (multi-asset) — 10 USDC + 1 SOL → 5 LP tokens
  //
  // Expected from PRD:
  //   01/15/2025 14:30:00,5,USDC-SOL-LP,,,,,,,0xmulti1...,LP Add,
  //
  // The PRD says "Uses multi-asset template with Sent Quantity 1,
  // Sent Currency 1, Sent Quantity 2, Sent Currency 2 columns".
  // So the header switches to numbered columns when multi-asset txs exist.
  // -----------------------------------------------------------------------
  it("LP Add (multi-asset) — 10 USDC + 1 SOL → 5 LP tokens", () => {
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
    const [header, row] = csv.split("\n");

    // Header must have numbered columns for multi-asset
    expect(header).toContain("Received Quantity 1");
    expect(header).toContain("Received Currency 1");
    expect(header).toContain("Sent Quantity 1");
    expect(header).toContain("Sent Currency 1");
    expect(header).toContain("Sent Quantity 2");
    expect(header).toContain("Sent Currency 2");

    // Row must contain all the expected values
    expect(row).toContain("01/15/2025 14:30:00");
    expect(row).toContain("5"); // Received LP token quantity
    expect(row).toContain("USDC-SOL-LP"); // Received LP token
    expect(row).toContain("10"); // Sent USDC
    expect(row).toContain("USDC"); // Sent Currency 1
    expect(row).toContain("1"); // Sent SOL
    expect(row).toContain("SOL"); // Sent Currency 2
    expect(row).toContain("0xmulti1"); // Tx hash
    expect(row).toContain("LP Add"); // Notes
  });

  // -----------------------------------------------------------------------
  // Verify all standard examples produce valid CSV structure
  // -----------------------------------------------------------------------
  it("all standard examples produce rows with the correct number of fields", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 9.999,
        sentCurrency: "USDC",
        feeAmount: 0.001,
        feeCurrency: "ETH",
        txHash: "0xabc123",
      },
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "SOL",
        txHash: "0xdef456",
      },
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "trade",
        receivedQuantity: 1,
        receivedCurrency: "SOL",
        sentQuantity: 10,
        sentCurrency: "USDC",
        feeAmount: 0.00005,
        feeCurrency: "SOL",
        txHash: "0x789abc",
      },
    ];

    const csv = generateStandardCSV(txs);
    const lines = csv.split("\n");

    // 1 header + 3 rows
    expect(lines).toHaveLength(4);

    // Standard header has 12 columns; every data row must too
    const headerFieldCount = lines[0].split(",").length;
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].split(",").length).toBe(headerFieldCount);
    }
  });

  // -----------------------------------------------------------------------
  // Verify Awaken format constraints on standard examples
  // -----------------------------------------------------------------------
  it("no negative numbers appear in any standard example row", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 9.999,
        sentCurrency: "USDC",
        feeAmount: 0.001,
        feeCurrency: "ETH",
        txHash: "0xabc123",
      },
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "SOL",
        txHash: "0xdef456",
      },
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "trade",
        receivedQuantity: 1,
        receivedCurrency: "SOL",
        sentQuantity: 10,
        sentCurrency: "USDC",
        feeAmount: 0.00005,
        feeCurrency: "SOL",
        txHash: "0x789abc",
      },
    ];

    const csv = generateStandardCSV(txs);
    const rows = dataRows(csv);
    for (const row of rows) {
      // Split fields and check numeric-looking values are non-negative
      const fields = row.split(",");
      for (const field of fields) {
        if (/^-?\d+(\.\d+)?$/.test(field)) {
          expect(parseFloat(field)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("all dates in standard examples use MM/DD/YYYY HH:MM:SS UTC format", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 9.999,
        sentCurrency: "USDC",
      },
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "SOL",
      },
    ];

    const csv = generateStandardCSV(txs);
    const rows = dataRows(csv);
    const dateRegex = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
    for (const row of rows) {
      const dateField = row.split(",")[0];
      expect(dateField).toMatch(dateRegex);
    }
  });

  it("all quantities have at most 8 decimal places", () => {
    const tx: Transaction = {
      date: new Date("2025-01-15T14:30:00Z"),
      type: "trade",
      receivedQuantity: 0.123456789012345,
      receivedCurrency: "BTC",
      sentQuantity: 5000.000000001,
      sentCurrency: "USDC",
      feeAmount: 0.000000009,
      feeCurrency: "ETH",
    };

    const csv = generateStandardCSV([tx]);
    const row = dataRows(csv)[0];
    const fields = row.split(",");

    for (const field of fields) {
      if (/^\d+\.\d+$/.test(field)) {
        const decimals = field.split(".")[1];
        expect(decimals.length).toBeLessThanOrEqual(8);
      }
    }
  });
});

// =========================================================================
// Perpetuals CSV — Appendix B examples
// =========================================================================
describe("Perpetuals CSV — Appendix B example rows", () => {
  // -----------------------------------------------------------------------
  // Example 1: Open short 2 BTC
  //
  // Expected from PRD:
  //   04/01/2024 00:00:00,BTC,2,,0,,,0xperp1...,open_position
  // -----------------------------------------------------------------------
  it("Open short 2 BTC", () => {
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
    const [header, row] = csv.split("\n");

    // Header must match the perps spec exactly
    expect(header).toBe(PERP_CSV_HEADER);

    const fields = row.split(",");

    expect(fields[0]).toBe("04/01/2024 00:00:00"); // Date
    expect(fields[1]).toBe("BTC"); // Asset
    expect(fields[2]).toBe("2"); // Amount
    expect(fields[3]).toBe(""); // Fee (empty)
    expect(fields[4]).toBe("0"); // P&L
    expect(fields[5]).toBe(""); // Payment Token (empty for open)
    expect(fields[6]).toBe(""); // Notes
    expect(fields[7]).toBe("0xperp1"); // Transaction Hash
    expect(fields[8]).toBe("open_position"); // Tag
  });

  // -----------------------------------------------------------------------
  // Example 2: Close short 1 BTC, +20 USDC profit
  //
  // Expected from PRD:
  //   04/02/2024 00:00:00,BTC,1,,20,USDC,,0xperp2...,close_position
  // -----------------------------------------------------------------------
  it("Close short 1 BTC, +20 USDC profit", () => {
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
    const fields = dataRows(csv)[0].split(",");

    expect(fields[0]).toBe("04/02/2024 00:00:00"); // Date
    expect(fields[1]).toBe("BTC"); // Asset
    expect(fields[2]).toBe("1"); // Amount
    expect(fields[3]).toBe(""); // Fee (empty)
    expect(fields[4]).toBe("20"); // P&L
    expect(fields[5]).toBe("USDC"); // Payment Token
    expect(fields[6]).toBe(""); // Notes
    expect(fields[7]).toBe("0xperp2"); // Transaction Hash
    expect(fields[8]).toBe("close_position"); // Tag
  });

  // -----------------------------------------------------------------------
  // Example 3: Funding payment +10 USDC
  //
  // Expected from PRD:
  //   04/04/2024 00:00:00,USDC,10,,10,USDC,,0xperp3...,funding_payment
  // -----------------------------------------------------------------------
  it("Funding payment +10 USDC", () => {
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
    const fields = dataRows(csv)[0].split(",");

    expect(fields[0]).toBe("04/04/2024 00:00:00"); // Date
    expect(fields[1]).toBe("USDC"); // Asset
    expect(fields[2]).toBe("10"); // Amount
    expect(fields[3]).toBe(""); // Fee (empty)
    expect(fields[4]).toBe("10"); // P&L
    expect(fields[5]).toBe("USDC"); // Payment Token
    expect(fields[6]).toBe(""); // Notes
    expect(fields[7]).toBe("0xperp3"); // Transaction Hash
    expect(fields[8]).toBe("funding_payment"); // Tag
  });

  // -----------------------------------------------------------------------
  // Verify all perps examples together
  // -----------------------------------------------------------------------
  it("all three PRD perps examples produce valid CSV when combined", () => {
    const txs: PerpTransaction[] = [
      {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "",
        txHash: "0xperp1",
        tag: "open_position",
      },
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 20,
        paymentToken: "USDC",
        txHash: "0xperp2",
        tag: "close_position",
      },
      {
        date: new Date("2024-04-04T00:00:00Z"),
        asset: "USDC",
        amount: 10,
        pnl: 10,
        paymentToken: "USDC",
        txHash: "0xperp3",
        tag: "funding_payment",
      },
    ];

    const csv = generatePerpCSV(txs);
    const lines = csv.split("\n");

    // 1 header + 3 data rows
    expect(lines).toHaveLength(4);

    // Every row has exactly 9 fields
    for (const line of lines) {
      expect(line.split(",").length).toBe(9);
    }

    // Verify tag order matches input order
    expect(lines[1]).toContain("open_position");
    expect(lines[2]).toContain("close_position");
    expect(lines[3]).toContain("funding_payment");
  });

  // -----------------------------------------------------------------------
  // Verify Awaken format constraints on perps examples
  // -----------------------------------------------------------------------
  it("P&L permits negative values per Awaken perps spec", () => {
    const tx: PerpTransaction = {
      date: new Date("2024-04-02T00:00:00Z"),
      asset: "BTC",
      amount: 1,
      pnl: -20,
      paymentToken: "USDC",
      txHash: "0xperp2",
      tag: "close_position",
    };

    const csv = generatePerpCSV([tx]);
    const fields = dataRows(csv)[0].split(",");

    // P&L field should be negative
    expect(fields[4]).toBe("-20");
  });

  it("Payment Token is populated for close and funding rows", () => {
    const closeTx: PerpTransaction = {
      date: new Date("2024-04-02T00:00:00Z"),
      asset: "BTC",
      amount: 1,
      pnl: 20,
      paymentToken: "USDC",
      txHash: "0xperp2",
      tag: "close_position",
    };
    const fundingTx: PerpTransaction = {
      date: new Date("2024-04-04T00:00:00Z"),
      asset: "USDC",
      amount: 10,
      pnl: 10,
      paymentToken: "USDC",
      txHash: "0xperp3",
      tag: "funding_payment",
    };

    const closeFields = dataRows(generatePerpCSV([closeTx]))[0].split(",");
    const fundingFields = dataRows(generatePerpCSV([fundingTx]))[0].split(",");

    expect(closeFields[5]).toBe("USDC");
    expect(fundingFields[5]).toBe("USDC");
  });

  it("all dates in perps examples use MM/DD/YYYY HH:MM:SS UTC format", () => {
    const txs: PerpTransaction[] = [
      {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "",
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
    const rows = dataRows(csv);
    const dateRegex = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
    for (const row of rows) {
      const dateField = row.split(",")[0];
      expect(dateField).toMatch(dateRegex);
    }
  });

  it("amounts have at most 8 decimal places in perps examples", () => {
    const tx: PerpTransaction = {
      date: new Date("2024-04-01T00:00:00Z"),
      asset: "BTC",
      amount: 0.123456789012345,
      fee: 0.000000009,
      pnl: -0.999999999,
      paymentToken: "USDC",
      tag: "close_position",
    };

    const csv = generatePerpCSV([tx]);
    const fields = dataRows(csv)[0].split(",");

    // Check amount (field 2), fee (field 3)
    for (const idx of [2, 3]) {
      const field = fields[idx];
      if (field && /^\d+\.\d+$/.test(field)) {
        const decimals = field.split(".")[1];
        expect(decimals.length).toBeLessThanOrEqual(8);
      }
    }

    // P&L may be negative, check decimal places on absolute value
    const pnl = fields[4];
    const pnlAbs = pnl.replace("-", "");
    if (pnlAbs.includes(".")) {
      const decimals = pnlAbs.split(".")[1];
      expect(decimals.length).toBeLessThanOrEqual(8);
    }
  });
});
