import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildCSVFilename, downloadCSV } from "@/lib/csv/download";

// ---------------------------------------------------------------------------
// buildCSVFilename
// ---------------------------------------------------------------------------

describe("buildCSVFilename", () => {
  it("follows the naming convention awakenfetch_{chain}_{address_short}_{date}.csv", () => {
    const result = buildCSVFilename(
      "bittensor",
      "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      new Date("2025-03-15T12:00:00Z"),
    );
    expect(result).toBe("awakenfetch_bittensor_5FHneW46_20250315.csv");
  });

  it("lowercases the chain identifier", () => {
    const result = buildCSVFilename(
      "Kaspa",
      "kaspa:abc123defg",
      new Date("2025-01-01T00:00:00Z"),
    );
    expect(result).toBe("awakenfetch_kaspa_kaspa:ab_20250101.csv");
  });

  it("uses first 8 characters of the address", () => {
    const result = buildCSVFilename(
      "ethereum",
      "0xAbCdEf1234567890",
      new Date("2025-12-31T23:59:59Z"),
    );
    expect(result).toBe("awakenfetch_ethereum_0xAbCdEf_20251231.csv");
  });

  it("handles short addresses (< 8 chars) gracefully", () => {
    const result = buildCSVFilename(
      "test",
      "abc",
      new Date("2025-06-15T00:00:00Z"),
    );
    expect(result).toBe("awakenfetch_test_abc_20250615.csv");
  });

  it("handles exactly 8-char addresses", () => {
    const result = buildCSVFilename(
      "test",
      "12345678",
      new Date("2025-06-15T00:00:00Z"),
    );
    expect(result).toBe("awakenfetch_test_12345678_20250615.csv");
  });

  it("uses current date when no timestamp provided", () => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const expected = `awakenfetch_solana_SoLAddr1_${yyyy}${mm}${dd}.csv`;

    const result = buildCSVFilename("solana", "SoLAddr1234567890");
    expect(result).toBe(expected);
  });

  it("formats single-digit months and days with leading zeros", () => {
    const result = buildCSVFilename(
      "chain",
      "walletaddr",
      new Date("2025-01-05T00:00:00Z"),
    );
    expect(result).toBe("awakenfetch_chain_walletad_20250105.csv");
  });

  it("appends _perps suffix when variant is 'perps'", () => {
    const result = buildCSVFilename(
      "injective",
      "inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz",
      new Date("2024-04-01T00:00:00Z"),
      "perps",
    );
    expect(result).toBe("awakenfetch_injective_inj1qy09_20240401_perps.csv");
  });

  it("does not append suffix when variant is 'standard'", () => {
    const result = buildCSVFilename(
      "bittensor",
      "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      new Date("2025-03-15T12:00:00Z"),
      "standard",
    );
    expect(result).toBe("awakenfetch_bittensor_5FHneW46_20250315.csv");
  });

  it("defaults to standard variant when not specified", () => {
    const result = buildCSVFilename(
      "kaspa",
      "kaspa:abc123defg",
      new Date("2025-01-01T00:00:00Z"),
    );
    expect(result).not.toContain("_perps");
  });
});

// ---------------------------------------------------------------------------
// downloadCSV
// ---------------------------------------------------------------------------

describe("downloadCSV", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURLMock = vi.fn();
    clickSpy = vi.fn();

    // Mock URL methods
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    // Spy on DOM methods
    appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    removeChildSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);

    // Mock createElement to return a controllable anchor
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      style: { display: "" },
      click: clickSpy,
    } as unknown as HTMLAnchorElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a Blob with the CSV content and correct MIME type", () => {
    const csvContent = "Date,Amount\n01/01/2025 00:00:00,100";
    downloadCSV(csvContent, "test.csv");

    expect(createObjectURLMock).toHaveBeenCalledOnce();
    const blob = createObjectURLMock.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/csv;charset=utf-8;");
  });

  it("sets the download attribute to the provided filename", () => {
    downloadCSV("data", "awakenfetch_eth_0x123456_20250101.csv");

    const anchor = (document.createElement as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(anchor.download).toBe("awakenfetch_eth_0x123456_20250101.csv");
  });

  it("clicks the anchor to trigger the download", () => {
    downloadCSV("data", "test.csv");
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("appends and removes the anchor element from the DOM", () => {
    downloadCSV("data", "test.csv");
    expect(appendChildSpy).toHaveBeenCalledOnce();
    expect(removeChildSpy).toHaveBeenCalledOnce();
  });

  it("revokes the object URL after download", () => {
    downloadCSV("data", "test.csv");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
  });
});
