import { describe, it, expect } from "vitest";
import { getExplorerUrl } from "@/lib/explorerUrls";

describe("getExplorerUrl", () => {
  it("returns correct URL for bittensor", () => {
    expect(getExplorerUrl("bittensor", "0xabc")).toBe(
      "https://taostats.io/extrinsic/0xabc",
    );
  });

  it("returns correct URL for kaspa", () => {
    expect(getExplorerUrl("kaspa", "txhash123")).toBe(
      "https://explorer.kaspa.org/txs/txhash123",
    );
  });

  it("returns correct URL for injective", () => {
    expect(getExplorerUrl("injective", "DEADBEEF")).toBe(
      "https://explorer.injective.network/transaction/DEADBEEF",
    );
  });

  it("returns undefined for unknown chains", () => {
    expect(getExplorerUrl("unknown", "hash")).toBeUndefined();
  });
});
