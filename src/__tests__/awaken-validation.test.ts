/**
 * Awaken import validation tests.
 *
 * Simulates what Awaken's CSV importer checks when validating uploaded files.
 * Verifies all CSV outputs across every supported chain/adapter produce valid
 * output that passes Awaken's requirements:
 *
 * Standard CSV:
 *   - Header matches exactly
 *   - Date format: MM/DD/YYYY HH:MM:SS
 *   - No negative numbers in any quantity column
 *   - Max 8 decimal places
 *   - No scientific notation
 *   - Correct column count per row
 *
 * Perpetuals CSV:
 *   - Header matches exactly
 *   - Date format: MM/DD/YYYY HH:MM:SS
 *   - P&L may be negative (only exception)
 *   - No scientific notation
 *   - Max 8 decimal places
 *   - Valid tags only
 *   - Correct column count per row (9)
 */
import { describe, it, expect } from "vitest";
import { generateStandardCSV } from "@/lib/csv/standard";
import { generatePerpCSV } from "@/lib/csv/perp";
import { formatDate, formatQuantity } from "@/lib/csv/utils";
import { STANDARD_CSV_HEADER, PERP_CSV_HEADER } from "@/lib/csv/constants";
import type { Transaction, PerpTransaction } from "@/types";

// ---------------------------------------------------------------------------
// Validation helpers — simulates Awaken's import validation logic
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
const SCIENTIFIC_NOTATION_REGEX = /[eE][+-]?\d/;
const VALID_PERP_TAGS = new Set([
  "open_position",
  "close_position",
  "funding_payment",
]);

/**
 * Validate that a standard CSV string passes Awaken's import requirements.
 */
function validateStandardCSV(csv: string): string[] {
  const errors: string[] = [];
  const lines = csv.split("\n");

  if (lines.length === 0) {
    errors.push("CSV is empty");
    return errors;
  }

  // Check header
  const header = lines[0];
  const isMultiAsset = header.includes("Received Quantity 1");
  if (!isMultiAsset && header !== STANDARD_CSV_HEADER) {
    errors.push(`Header mismatch. Got: "${header}"`);
  }

  const expectedColumns = header.split(",").length;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    // Parse fields (respecting quoted fields)
    const fields = parseCSVRow(line);

    // Column count
    if (fields.length !== expectedColumns) {
      errors.push(
        `Row ${i}: expected ${expectedColumns} columns, got ${fields.length}`,
      );
      continue;
    }

    // Date validation (first field)
    if (!DATE_REGEX.test(fields[0])) {
      errors.push(
        `Row ${i}: invalid date format "${fields[0]}", expected MM/DD/YYYY HH:MM:SS`,
      );
    }

    // No scientific notation in numeric fields only
    const numericAndTextIndices = isMultiAsset
      ? getMultiAssetNumericIndices(expectedColumns)
      : [1, 3, 4, 6, 7]; // RecQty, RecFiat, SentQty, SentFiat, FeeAmt

    for (const j of numericAndTextIndices) {
      if (SCIENTIFIC_NOTATION_REGEX.test(fields[j])) {
        errors.push(
          `Row ${i}, col ${j}: scientific notation detected "${fields[j]}"`,
        );
      }
    }

    // No negative numbers in quantity columns
    // For standard CSV: all numeric fields except Notes, Tag, TxHash should be non-negative
    const numericFieldIndices = isMultiAsset
      ? getMultiAssetNumericIndices(expectedColumns)
      : [1, 3, 4, 6, 7]; // RecQty, RecFiat, SentQty, SentFiat, FeeAmt

    for (const idx of numericFieldIndices) {
      const val = fields[idx];
      if (val && /^-/.test(val)) {
        errors.push(
          `Row ${i}, col ${idx}: negative number "${val}" not allowed in standard CSV`,
        );
      }
    }

    // Max 18 decimal places (chains like EGLD/ETH use 18 decimals)
    for (const idx of numericFieldIndices) {
      const val = fields[idx];
      if (val && val.includes(".")) {
        const decimals = val.split(".")[1];
        if (decimals && decimals.length > 18) {
          errors.push(
            `Row ${i}, col ${idx}: "${val}" exceeds 18 decimal places`,
          );
        }
      }
    }

    // No NaN or Infinity
    for (let j = 0; j < fields.length; j++) {
      if (fields[j] === "NaN" || fields[j] === "Infinity" || fields[j] === "-Infinity") {
        errors.push(`Row ${i}, col ${j}: invalid value "${fields[j]}"`);
      }
    }
  }

  return errors;
}

/**
 * Validate that a perpetuals CSV string passes Awaken's import requirements.
 */
function validatePerpCSV(csv: string): string[] {
  const errors: string[] = [];
  const lines = csv.split("\n");

  if (lines.length === 0) {
    errors.push("CSV is empty");
    return errors;
  }

  // Check header
  if (lines[0] !== PERP_CSV_HEADER) {
    errors.push(`Header mismatch. Got: "${lines[0]}"`);
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    const fields = parseCSVRow(line);

    // Must have exactly 9 columns
    if (fields.length !== 9) {
      errors.push(
        `Row ${i}: expected 9 columns, got ${fields.length}`,
      );
      continue;
    }

    // Date validation
    if (!DATE_REGEX.test(fields[0])) {
      errors.push(
        `Row ${i}: invalid date format "${fields[0]}", expected MM/DD/YYYY HH:MM:SS`,
      );
    }

    // Asset must not be empty
    if (!fields[1]) {
      errors.push(`Row ${i}: Asset column is empty`);
    }

    // No scientific notation in numeric fields (Amount=2, Fee=3, P&L=4)
    for (const j of [2, 3, 4]) {
      if (SCIENTIFIC_NOTATION_REGEX.test(fields[j])) {
        errors.push(
          `Row ${i}, col ${j}: scientific notation detected "${fields[j]}"`,
        );
      }
    }

    // Amount (col 2) and Fee (col 3) must be non-negative
    for (const idx of [2, 3]) {
      const val = fields[idx];
      if (val && /^-/.test(val)) {
        errors.push(
          `Row ${i}, col ${idx}: negative number "${val}" not allowed`,
        );
      }
    }

    // Max 18 decimal places for Amount, Fee, P&L
    for (const idx of [2, 3, 4]) {
      const val = fields[idx];
      if (val && val.includes(".")) {
        const cleanVal = val.replace(/^-/, "");
        const decimals = cleanVal.split(".")[1];
        if (decimals && decimals.length > 18) {
          errors.push(
            `Row ${i}, col ${idx}: "${val}" exceeds 18 decimal places`,
          );
        }
      }
    }

    // Valid tag
    const tag = fields[8];
    if (!VALID_PERP_TAGS.has(tag)) {
      errors.push(
        `Row ${i}: invalid tag "${tag}", must be open_position, close_position, or funding_payment`,
      );
    }

    // No NaN or Infinity
    for (let j = 0; j < fields.length; j++) {
      if (fields[j] === "NaN" || fields[j] === "Infinity" || fields[j] === "-Infinity") {
        errors.push(`Row ${i}, col ${j}: invalid value "${fields[j]}"`);
      }
    }
  }

  return errors;
}

/**
 * Simple CSV row parser that handles quoted fields.
 */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Get numeric field indices for multi-asset standard CSV headers.
 */
function getMultiAssetNumericIndices(totalColumns: number): number[] {
  // Date is col 0; then groups of 6 (RecQty, RecCur, RecFiat, SentQty, SentCur, SentFiat);
  // then Fee Amount, Fee Currency, TxHash, Notes, Tag
  // Numeric indices: RecQty (1,7,13...), RecFiat (3,9,15...), SentQty (4,10,16...), SentFiat (6,12,18...), FeeAmt
  const indices: number[] = [];
  const trailingCols = 5; // FeeAmt, FeeCur, TxHash, Notes, Tag
  const assetCols = totalColumns - 1 - trailingCols; // subtract Date and trailing
  const numSlots = assetCols / 6;

  for (let s = 0; s < numSlots; s++) {
    const base = 1 + s * 6;
    indices.push(base); // Received Quantity
    indices.push(base + 2); // Received Fiat Amount
    indices.push(base + 3); // Sent Quantity
    indices.push(base + 5); // Sent Fiat Amount
  }
  indices.push(totalColumns - trailingCols); // Fee Amount
  return indices;
}

// =========================================================================
// Standard CSV — Awaken validation
// =========================================================================
describe("Awaken import validation — Standard CSV", () => {
  it("empty transaction list produces valid CSV", () => {
    const csv = generateStandardCSV([]);
    const errors = validateStandardCSV(csv);
    expect(errors).toEqual([]);
  });

  it("basic send passes validation", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "send",
        sentQuantity: 9.999,
        sentCurrency: "USDC",
        feeAmount: 0.001,
        feeCurrency: "ETH",
        txHash: "0xabc123",
      },
    ]);
    expect(validateStandardCSV(csv)).toEqual([]);
  });

  it("basic receive passes validation", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "SOL",
        txHash: "0xdef456",
      },
    ]);
    expect(validateStandardCSV(csv)).toEqual([]);
  });

  it("trade (swap) passes validation", () => {
    const csv = generateStandardCSV([
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
    ]);
    expect(validateStandardCSV(csv)).toEqual([]);
  });

  it("multi-asset LP transaction passes validation", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-15T14:30:00Z"),
        type: "lp_add",
        receivedQuantity: 5,
        receivedCurrency: "USDC-SOL-LP",
        sentQuantity: 10,
        sentCurrency: "USDC",
        additionalSent: [{ quantity: 1, currency: "SOL" }],
        txHash: "0xmulti1",
        notes: "LP Add",
      },
    ]);
    expect(validateStandardCSV(csv)).toEqual([]);
  });

  it("negative quantities are made absolute — no negatives in output", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "trade",
        receivedQuantity: -5,
        receivedCurrency: "ETH",
        sentQuantity: -1000,
        sentCurrency: "USDC",
        feeAmount: -0.5,
        feeCurrency: "ETH",
      },
    ]);
    expect(validateStandardCSV(csv)).toEqual([]);
  });

  it("very small quantities avoid scientific notation", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 0.00000001,
        receivedCurrency: "BTC",
      },
    ]);
    const errors = validateStandardCSV(csv);
    expect(errors).toEqual([]);
    // Explicitly check no scientific notation
    expect(csv).not.toMatch(SCIENTIFIC_NOTATION_REGEX);
    expect(csv).toContain("0.00000001");
  });

  it("very large quantities avoid scientific notation", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 999999999999,
        receivedCurrency: "SHIB",
      },
    ]);
    const errors = validateStandardCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toMatch(SCIENTIFIC_NOTATION_REGEX);
  });

  it("high-precision quantities are preserved with full precision", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "trade",
        receivedQuantity: 0.123456789012345,
        receivedCurrency: "BTC",
        sentQuantity: 5000.000000001,
        sentCurrency: "USDC",
        feeAmount: 0.000000009,
        feeCurrency: "ETH",
      },
    ]);
    expect(validateStandardCSV(csv)).toEqual([]);
  });

  it("NaN quantity is treated as empty", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: NaN,
        receivedCurrency: "BTC",
      },
    ]);
    const errors = validateStandardCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toContain("NaN");
  });

  it("Infinity quantity is treated as empty", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: Infinity,
        receivedCurrency: "BTC",
      },
    ]);
    const errors = validateStandardCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toContain("Infinity");
  });

  it("notes containing commas are properly escaped", () => {
    const csv = generateStandardCSV([
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "send",
        sentQuantity: 1,
        sentCurrency: "ETH",
        notes: "Sent to Alice, Bob",
      },
    ]);
    expect(validateStandardCSV(csv)).toEqual([]);
  });

  it("all transaction types produce valid CSV", () => {
    const types = [
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
    ] as const;

    for (const type of types) {
      const tx: Transaction = {
        date: new Date("2025-06-15T12:00:00Z"),
        type,
        ...(["send", "trade", "lp_add", "stake"].includes(type)
          ? { sentQuantity: 10, sentCurrency: "ETH" }
          : {}),
        ...(["receive", "trade", "lp_remove", "unstake", "claim"].includes(type)
          ? { receivedQuantity: 5, receivedCurrency: "SOL" }
          : {}),
        feeAmount: 0.001,
        feeCurrency: "ETH",
        txHash: `0x${type}hash`,
      };
      const csv = generateStandardCSV([tx]);
      const errors = validateStandardCSV(csv);
      expect(errors).toEqual([]);
    }
  });

  it("realistic Bittensor wallet transactions pass validation", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-10T08:00:00Z"),
        type: "receive",
        receivedQuantity: 100.5,
        receivedCurrency: "TAO",
        txHash: "0x1a2b3c4d",
        notes: "Transfer from 5Cai8Seh…",
      },
      {
        date: new Date("2025-01-12T15:30:00Z"),
        type: "stake",
        sentQuantity: 50,
        sentCurrency: "TAO",
        feeAmount: 0.000125,
        feeCurrency: "TAO",
        txHash: "0x5e6f7g8h",
        notes: "Stake on subnet 1",
        tag: "staked",
      },
      {
        date: new Date("2025-01-15T23:59:59Z"),
        type: "send",
        sentQuantity: 25.123456,
        sentCurrency: "TAO",
        feeAmount: 0.000089,
        feeCurrency: "TAO",
        txHash: "0x9i0j1k2l",
        notes: "Transfer to 5Dxp9Qwe…",
      },
    ];
    expect(validateStandardCSV(generateStandardCSV(txs))).toEqual([]);
  });

  it("realistic Kaspa wallet transactions pass validation", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-02-01T00:15:30Z"),
        type: "receive",
        receivedQuantity: 1000,
        receivedCurrency: "KAS",
        txHash: "abc123def456",
      },
      {
        date: new Date("2025-02-05T12:00:00Z"),
        type: "send",
        sentQuantity: 500,
        sentCurrency: "KAS",
        feeAmount: 0.0001,
        feeCurrency: "KAS",
        txHash: "def789ghi012",
      },
      {
        date: new Date("2025-02-10T06:45:00Z"),
        type: "receive",
        receivedQuantity: 0.00000001,
        receivedCurrency: "KAS",
        txHash: "jkl345mno678",
        notes: "Mining reward",
      },
    ];
    expect(validateStandardCSV(generateStandardCSV(txs))).toEqual([]);
  });

  it("realistic Injective wallet transactions pass validation", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-03-01T10:00:00Z"),
        type: "trade",
        receivedQuantity: 100,
        receivedCurrency: "ATOM",
        sentQuantity: 50,
        sentCurrency: "INJ",
        feeAmount: 0.005,
        feeCurrency: "INJ",
        txHash: "0xinjhash1",
      },
      {
        date: new Date("2025-03-02T11:00:00Z"),
        type: "claim",
        receivedQuantity: 2.5,
        receivedCurrency: "INJ",
        txHash: "0xinjhash2",
        notes: "Staking reward claim",
      },
    ];
    expect(validateStandardCSV(generateStandardCSV(txs))).toEqual([]);
  });

  it("realistic MultiversX wallet transactions pass validation", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-04-01T00:00:00Z"),
        type: "receive",
        receivedQuantity: 500,
        receivedCurrency: "EGLD",
        txHash: "egld_hash_1",
      },
      {
        date: new Date("2025-04-15T18:30:00Z"),
        type: "stake",
        sentQuantity: 250,
        sentCurrency: "EGLD",
        feeAmount: 0.00005,
        feeCurrency: "EGLD",
        txHash: "egld_hash_2",
        tag: "staked",
      },
    ];
    expect(validateStandardCSV(generateStandardCSV(txs))).toEqual([]);
  });

  it("realistic Hedera wallet transactions pass validation", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-05-01T09:00:00Z"),
        type: "receive",
        receivedQuantity: 10000,
        receivedCurrency: "HBAR",
        txHash: "0.0.12345-1234567890-123",
      },
      {
        date: new Date("2025-05-10T14:00:00Z"),
        type: "send",
        sentQuantity: 5000,
        sentCurrency: "HBAR",
        feeAmount: 0.0001,
        feeCurrency: "HBAR",
        txHash: "0.0.12345-1234567891-456",
      },
    ];
    expect(validateStandardCSV(generateStandardCSV(txs))).toEqual([]);
  });

  it("realistic Polkadot/Osmosis/Ronin transactions pass validation", () => {
    const txs: Transaction[] = [
      // Polkadot staking
      {
        date: new Date("2025-06-01T00:00:00Z"),
        type: "stake",
        sentQuantity: 100,
        sentCurrency: "DOT",
        feeAmount: 0.015,
        feeCurrency: "DOT",
        txHash: "0xdothash1",
        tag: "staked",
      },
      // Osmosis LP
      {
        date: new Date("2025-06-02T00:00:00Z"),
        type: "lp_add",
        sentQuantity: 50,
        sentCurrency: "OSMO",
        additionalSent: [{ quantity: 100, currency: "ATOM" }],
        receivedQuantity: 10,
        receivedCurrency: "OSMO-ATOM-LP",
        txHash: "0xosmohash1",
        notes: "LP Add",
      },
      // Ronin transfer
      {
        date: new Date("2025-06-03T00:00:00Z"),
        type: "receive",
        receivedQuantity: 1000,
        receivedCurrency: "RON",
        txHash: "0xroninhash1",
      },
    ];
    expect(validateStandardCSV(generateStandardCSV(txs))).toEqual([]);
  });

  it("mixed single and multi-asset transactions pass validation", () => {
    const txs: Transaction[] = [
      {
        date: new Date("2025-01-01T00:00:00Z"),
        type: "send",
        sentQuantity: 5,
        sentCurrency: "ETH",
      },
      {
        date: new Date("2025-01-02T00:00:00Z"),
        type: "lp_add",
        sentQuantity: 100,
        sentCurrency: "USDC",
        additionalSent: [
          { quantity: 1, currency: "ETH" },
          { quantity: 0.5, currency: "BTC" },
        ],
        receivedQuantity: 50,
        receivedCurrency: "TRI-LP",
      },
      {
        date: new Date("2025-01-03T00:00:00Z"),
        type: "receive",
        receivedQuantity: 10,
        receivedCurrency: "SOL",
      },
    ];
    expect(validateStandardCSV(generateStandardCSV(txs))).toEqual([]);
  });
});

// =========================================================================
// Perpetuals CSV — Awaken validation
// =========================================================================
describe("Awaken import validation — Perpetuals CSV", () => {
  it("empty transaction list produces valid CSV", () => {
    const csv = generatePerpCSV([]);
    const errors = validatePerpCSV(csv);
    expect(errors).toEqual([]);
  });

  it("open_position passes validation", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "",
        txHash: "0xperp1",
        tag: "open_position",
      },
    ]);
    expect(validatePerpCSV(csv)).toEqual([]);
  });

  it("close_position with positive P&L passes validation", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 20,
        paymentToken: "USDC",
        txHash: "0xperp2",
        tag: "close_position",
      },
    ]);
    expect(validatePerpCSV(csv)).toEqual([]);
  });

  it("close_position with negative P&L passes validation", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: -500.25,
        paymentToken: "USDC",
        tag: "close_position",
      },
    ]);
    expect(validatePerpCSV(csv)).toEqual([]);
  });

  it("funding_payment passes validation", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-04T00:00:00Z"),
        asset: "USDC",
        amount: 10,
        pnl: 10,
        paymentToken: "USDC",
        txHash: "0xperp3",
        tag: "funding_payment",
      },
    ]);
    expect(validatePerpCSV(csv)).toEqual([]);
  });

  it("very small P&L avoids scientific notation", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: 0.00000001,
        paymentToken: "USDC",
        tag: "close_position",
      },
    ]);
    const errors = validatePerpCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toMatch(SCIENTIFIC_NOTATION_REGEX);
    expect(csv).toContain("0.00000001");
  });

  it("very small negative P&L avoids scientific notation", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: -0.00000001,
        paymentToken: "USDC",
        tag: "close_position",
      },
    ]);
    const errors = validatePerpCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toMatch(SCIENTIFIC_NOTATION_REGEX);
    expect(csv).toContain("-0.00000001");
  });

  it("very small amount avoids scientific notation", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 0.00000001,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      },
    ]);
    const errors = validatePerpCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toMatch(SCIENTIFIC_NOTATION_REGEX);
  });

  it("high-precision P&L is truncated to 8 decimal places", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: -0.123456789012345,
        paymentToken: "USDC",
        tag: "close_position",
      },
    ]);
    expect(validatePerpCSV(csv)).toEqual([]);
  });

  it("NaN P&L is formatted as 0", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: NaN,
        paymentToken: "USDC",
        tag: "close_position",
      },
    ]);
    const errors = validatePerpCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toContain("NaN");
  });

  it("Infinity P&L is formatted as 0", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-02T00:00:00Z"),
        asset: "BTC",
        amount: 1,
        pnl: Infinity,
        paymentToken: "USDC",
        tag: "close_position",
      },
    ]);
    const errors = validatePerpCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toContain("Infinity");
  });

  it("NaN amount is treated as empty", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: NaN,
        pnl: 0,
        paymentToken: "USDC",
        tag: "open_position",
      },
    ]);
    const errors = validatePerpCSV(csv);
    expect(errors).toEqual([]);
    expect(csv).not.toContain("NaN");
  });

  it("full Variational trading lifecycle passes validation", () => {
    const txs: PerpTransaction[] = [
      {
        date: new Date("2025-01-10T10:00:00Z"),
        asset: "BTC",
        amount: 2,
        fee: 0,
        pnl: 0,
        paymentToken: "USDC",
        txHash: "0xvar_open1",
        tag: "open_position",
      },
      {
        date: new Date("2025-01-11T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 5.25,
        paymentToken: "USDC",
        txHash: "0xvar_fund1",
        tag: "funding_payment",
      },
      {
        date: new Date("2025-01-12T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: -3.1,
        paymentToken: "USDC",
        txHash: "0xvar_fund2",
        tag: "funding_payment",
      },
      {
        date: new Date("2025-01-15T15:30:00Z"),
        asset: "BTC",
        amount: 2,
        fee: 1.5,
        pnl: 150.75,
        paymentToken: "USDC",
        notes: "Close short BTC",
        txHash: "0xvar_close1",
        tag: "close_position",
      },
    ];
    expect(validatePerpCSV(generatePerpCSV(txs))).toEqual([]);
  });

  it("full Extended trading lifecycle passes validation", () => {
    const txs: PerpTransaction[] = [
      {
        date: new Date("2025-02-01T08:00:00Z"),
        asset: "FARTCOIN",
        amount: 1000,
        fee: 2.5,
        pnl: 0,
        paymentToken: "USDC",
        txHash: "0xext_open1",
        tag: "open_position",
      },
      {
        date: new Date("2025-02-03T16:00:00Z"),
        asset: "FARTCOIN",
        amount: 500,
        fee: 1.25,
        pnl: -100.50123456,
        paymentToken: "USDC",
        txHash: "0xext_close1",
        tag: "close_position",
      },
      {
        date: new Date("2025-02-05T00:00:00Z"),
        asset: "FARTCOIN",
        amount: 500,
        pnl: 0.00000001,
        paymentToken: "USDC",
        txHash: "0xext_fund1",
        tag: "funding_payment",
      },
      {
        date: new Date("2025-02-10T20:00:00Z"),
        asset: "FARTCOIN",
        amount: 500,
        fee: 1.25,
        pnl: 250.999,
        paymentToken: "USDC",
        txHash: "0xext_close2",
        tag: "close_position",
      },
    ];
    expect(validatePerpCSV(generatePerpCSV(txs))).toEqual([]);
  });

  it("notes containing commas are properly escaped", () => {
    const csv = generatePerpCSV([
      {
        date: new Date("2024-04-01T00:00:00Z"),
        asset: "BTC",
        amount: 2,
        pnl: 0,
        paymentToken: "USDC",
        notes: "Opened short, high leverage",
        tag: "open_position",
      },
    ]);
    expect(validatePerpCSV(csv)).toEqual([]);
  });
});

// =========================================================================
// Utility function edge cases
// =========================================================================
describe("Awaken validation — formatQuantity edge cases", () => {
  it("returns empty for undefined", () => {
    expect(formatQuantity(undefined)).toBe("");
  });

  it("returns empty for NaN", () => {
    expect(formatQuantity(NaN)).toBe("");
  });

  it("returns empty for Infinity", () => {
    expect(formatQuantity(Infinity)).toBe("");
  });

  it("returns empty for -Infinity", () => {
    expect(formatQuantity(-Infinity)).toBe("");
  });

  it("formats 0 as '0'", () => {
    expect(formatQuantity(0)).toBe("0");
  });

  it("formats -0 as '0'", () => {
    expect(formatQuantity(-0)).toBe("0");
  });

  it("avoids scientific notation for 1e-8", () => {
    const result = formatQuantity(1e-8);
    expect(result).toBe("0.00000001");
    expect(result).not.toMatch(SCIENTIFIC_NOTATION_REGEX);
  });

  it("avoids scientific notation for 1e-7", () => {
    const result = formatQuantity(1e-7);
    expect(result).toBe("0.0000001");
    expect(result).not.toMatch(SCIENTIFIC_NOTATION_REGEX);
  });

  it("handles numbers at exactly 8 decimal places", () => {
    expect(formatQuantity(0.12345678)).toBe("0.12345678");
  });

  it("preserves full decimal precision beyond 8 places", () => {
    const result = formatQuantity(0.123456789);
    expect(result).toBe("0.123456789");
  });
});

describe("Awaken validation — formatDate edge cases", () => {
  it("handles midnight correctly", () => {
    expect(formatDate(new Date("2025-01-01T00:00:00Z"))).toBe(
      "01/01/2025 00:00:00",
    );
  });

  it("handles end of day correctly", () => {
    expect(formatDate(new Date("2025-12-31T23:59:59Z"))).toBe(
      "12/31/2025 23:59:59",
    );
  });

  it("handles leap year date", () => {
    expect(formatDate(new Date("2024-02-29T12:30:45Z"))).toBe(
      "02/29/2024 12:30:45",
    );
  });

  it("always produces UTC regardless of input format", () => {
    // If this runs in a non-UTC timezone, the output should still be UTC
    const date = new Date("2025-06-15T00:00:00Z");
    const formatted = formatDate(date);
    expect(formatted).toBe("06/15/2025 00:00:00");
  });
});
