import { describe, it, expect } from "vitest";
import {
  STANDARD_CSV_COLUMNS,
  STANDARD_CSV_HEADER,
  PERP_CSV_COLUMNS,
  PERP_CSV_HEADER,
  PERP_TAGS,
  standardMultiAssetColumns,
} from "@/lib/csv/constants";

describe("CSV Constants", () => {
  describe("STANDARD_CSV_COLUMNS", () => {
    it("has exactly 12 columns matching Appendix A", () => {
      expect(STANDARD_CSV_COLUMNS).toHaveLength(12);
    });

    it("starts with Date and ends with Tag", () => {
      expect(STANDARD_CSV_COLUMNS[0]).toBe("Date");
      expect(STANDARD_CSV_COLUMNS[STANDARD_CSV_COLUMNS.length - 1]).toBe(
        "Tag",
      );
    });

    it("contains all required Awaken standard columns in order", () => {
      expect([...STANDARD_CSV_COLUMNS]).toEqual([
        "Date",
        "Received Quantity",
        "Received Currency",
        "Received Fiat Amount",
        "Sent Quantity",
        "Sent Currency",
        "Sent Fiat Amount",
        "Fee Amount",
        "Fee Currency",
        "Transaction Hash",
        "Notes",
        "Tag",
      ]);
    });
  });

  describe("STANDARD_CSV_HEADER", () => {
    it("is the columns joined by commas", () => {
      expect(STANDARD_CSV_HEADER).toBe(STANDARD_CSV_COLUMNS.join(","));
    });

    it("matches the exact Awaken header string from the PRD", () => {
      expect(STANDARD_CSV_HEADER).toBe(
        "Date,Received Quantity,Received Currency,Received Fiat Amount,Sent Quantity,Sent Currency,Sent Fiat Amount,Fee Amount,Fee Currency,Transaction Hash,Notes,Tag",
      );
    });
  });

  describe("PERP_CSV_COLUMNS", () => {
    it("has exactly 9 columns matching Appendix A", () => {
      expect(PERP_CSV_COLUMNS).toHaveLength(9);
    });

    it("starts with Date and ends with Tag", () => {
      expect(PERP_CSV_COLUMNS[0]).toBe("Date");
      expect(PERP_CSV_COLUMNS[PERP_CSV_COLUMNS.length - 1]).toBe("Tag");
    });

    it("contains all required Awaken perpetuals columns in order", () => {
      expect([...PERP_CSV_COLUMNS]).toEqual([
        "Date",
        "Asset",
        "Amount",
        "Fee",
        "P&L",
        "Payment Token",
        "Notes",
        "Transaction Hash",
        "Tag",
      ]);
    });
  });

  describe("PERP_CSV_HEADER", () => {
    it("is the columns joined by commas", () => {
      expect(PERP_CSV_HEADER).toBe(PERP_CSV_COLUMNS.join(","));
    });

    it("matches the exact Awaken perps header string from the PRD", () => {
      expect(PERP_CSV_HEADER).toBe(
        "Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag",
      );
    });
  });

  describe("PERP_TAGS", () => {
    it("contains the three valid perpetual tags", () => {
      expect([...PERP_TAGS]).toEqual([
        "open_position",
        "close_position",
        "funding_payment",
      ]);
    });
  });

  describe("standardMultiAssetColumns", () => {
    it("returns 6 numbered columns for a given index", () => {
      const cols = standardMultiAssetColumns(1);
      expect(cols).toHaveLength(6);
    });

    it("applies the correct numeric suffix", () => {
      const cols = standardMultiAssetColumns(2);
      expect(cols).toEqual([
        "Received Quantity 2",
        "Received Currency 2",
        "Received Fiat Amount 2",
        "Sent Quantity 2",
        "Sent Currency 2",
        "Sent Fiat Amount 2",
      ]);
    });

    it("works for index 1", () => {
      const cols = standardMultiAssetColumns(1);
      expect(cols[0]).toBe("Received Quantity 1");
      expect(cols[3]).toBe("Sent Quantity 1");
    });
  });
});
