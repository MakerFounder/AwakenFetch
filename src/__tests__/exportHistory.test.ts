import { describe, it, expect, beforeEach } from "vitest";
import {
  buildExportKey,
  hasBeenExported,
  recordExport,
  getExportRecord,
} from "@/lib/exportHistory";

// ---------------------------------------------------------------------------
// Setup — clear localStorage before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildExportKey", () => {
  it("builds a deterministic key from the inputs", () => {
    const key = buildExportKey(
      "bittensor",
      "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      "2024-01-01",
      "2024-12-31",
    );
    expect(key).toBe(
      "bittensor:5fhnew46xgxgs5muiveu4sbtygbzmstuspzc92uhjjm694ty:2024-01-01:2024-12-31:standard",
    );
  });

  it("lowercases the address for case-insensitive matching", () => {
    const key1 = buildExportKey("kaspa", "KASPA:ABC123", "2024-01-01", "2024-12-31");
    const key2 = buildExportKey("kaspa", "kaspa:abc123", "2024-01-01", "2024-12-31");
    expect(key1).toBe(key2);
  });

  it("includes variant in the key", () => {
    const standard = buildExportKey("injective", "inj1abc", "2024-01-01", "2024-12-31", "standard");
    const perps = buildExportKey("injective", "inj1abc", "2024-01-01", "2024-12-31", "perps");
    expect(standard).not.toBe(perps);
    expect(standard).toContain(":standard");
    expect(perps).toContain(":perps");
  });

  it("defaults to standard variant", () => {
    const key = buildExportKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");
    expect(key).toContain(":standard");
  });
});

describe("hasBeenExported / recordExport", () => {
  it("returns false when nothing has been exported", () => {
    const key = buildExportKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");
    expect(hasBeenExported(key)).toBe(false);
  });

  it("returns true after recording an export", () => {
    const key = buildExportKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");
    recordExport(key);
    expect(hasBeenExported(key)).toBe(true);
  });

  it("does not cross-match different keys", () => {
    const key1 = buildExportKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");
    const key2 = buildExportKey("kaspa", "kaspa:abc", "2024-01-01", "2024-12-31");
    recordExport(key1);
    expect(hasBeenExported(key1)).toBe(true);
    expect(hasBeenExported(key2)).toBe(false);
  });

  it("different date ranges produce different keys", () => {
    const key1 = buildExportKey("bittensor", "5FHneW46", "2024-01-01", "2024-06-30");
    const key2 = buildExportKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");
    recordExport(key1);
    expect(hasBeenExported(key1)).toBe(true);
    expect(hasBeenExported(key2)).toBe(false);
  });
});

describe("getExportRecord", () => {
  it("returns undefined for unknown keys", () => {
    expect(getExportRecord("nonexistent")).toBeUndefined();
  });

  it("returns the record with an exportedAt timestamp", () => {
    const key = buildExportKey("bittensor", "5FHneW46", "2024-01-01", "2024-12-31");
    recordExport(key);
    const record = getExportRecord(key);
    expect(record).toBeDefined();
    expect(record!.exportedAt).toBeTruthy();
    // Verify it's a valid ISO string
    expect(new Date(record!.exportedAt).toISOString()).toBe(record!.exportedAt);
  });
});
