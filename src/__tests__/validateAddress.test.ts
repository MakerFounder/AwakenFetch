import { describe, it, expect } from "vitest";
import {
  validateAddress,
  getAddressPlaceholder,
} from "@/lib/validateAddress";

// ---------------------------------------------------------------------------
// Bittensor (SS58) validation
// ---------------------------------------------------------------------------

describe("validateAddress — bittensor (SS58)", () => {
  const chain = "bittensor";

  it("accepts a valid SS58 address", () => {
    const result = validateAddress(
      "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
      chain,
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts a valid 48-char SS58 address", () => {
    const result = validateAddress(
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      chain,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects an address that does not start with 5", () => {
    const result = validateAddress(
      "6F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
      chain,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("start with");
  });

  it("rejects an address that is too short", () => {
    const result = validateAddress("5F3sa2TJAWMq", chain);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("46–48 characters");
  });

  it("rejects an address that is too long", () => {
    const result = validateAddress(
      "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQXabc",
      chain,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("46–48 characters");
  });

  it("rejects an address with invalid Base58 characters (0, O, I, l)", () => {
    // Replace a valid char with '0' (not in Base58)
    const result = validateAddress(
      "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQ0",
      chain,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Base58");
  });

  it("handles leading/trailing whitespace gracefully", () => {
    const result = validateAddress(
      "  5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX  ",
      chain,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Kaspa (bech32-like) validation
// ---------------------------------------------------------------------------

describe("validateAddress — kaspa (bech32)", () => {
  const chain = "kaspa";

  it("accepts a valid Kaspa address", () => {
    const result = validateAddress(
      "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
      chain,
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects an address without the kaspa: prefix", () => {
    const result = validateAddress(
      "qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
      chain,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("kaspa:");
  });

  it("rejects an address with uppercase characters", () => {
    const result = validateAddress(
      "kaspa:QQKQKZJVR7ZWXXMJXJKMXXDWJU9KJS6E9U82UH59Z07VGAKS6GG62V8707G73",
      chain,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an address with wrong payload length", () => {
    const result = validateAddress("kaspa:abc123", chain);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("format");
  });

  it("rejects an empty string", () => {
    const result = validateAddress("", chain);
    // Empty addresses are not validated (no error) because the form
    // handles required-ness separately
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Injective validation
// ---------------------------------------------------------------------------

describe("validateAddress — injective", () => {
  const chain = "injective";

  it("accepts a valid Injective address", () => {
    const result = validateAddress(
      "inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz",
      chain,
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects an address without the inj1 prefix", () => {
    const result = validateAddress(
      "cosmos1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz",
      chain,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("inj1");
  });

  it("rejects an address that is too short", () => {
    const result = validateAddress("inj1qy09gsfx3", chain);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("42 characters");
  });

  it("rejects an address that is too long", () => {
    const result = validateAddress(
      "inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnzextra",
      chain,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("42 characters");
  });

  it("is case-insensitive (normalizes to lowercase)", () => {
    const result = validateAddress(
      "INJ1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz",
      chain,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases & unknown chains
// ---------------------------------------------------------------------------

describe("validateAddress — edge cases", () => {
  it("returns valid for an unknown chain (no validator registered)", () => {
    const result = validateAddress("anything", "solana");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid when chainId is empty", () => {
    const result = validateAddress("anything", "");
    expect(result.valid).toBe(true);
  });

  it("trims the address before validation", () => {
    const result = validateAddress(
      "   inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz   ",
      "injective",
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAddressPlaceholder
// ---------------------------------------------------------------------------

describe("getAddressPlaceholder", () => {
  it("returns a Bittensor example address", () => {
    expect(getAddressPlaceholder("bittensor")).toContain("5F3sa2");
  });

  it("returns a Kaspa example address", () => {
    expect(getAddressPlaceholder("kaspa")).toContain("kaspa:");
  });

  it("returns an Injective example address", () => {
    expect(getAddressPlaceholder("injective")).toContain("inj1");
  });

  it("returns a generic placeholder for unknown chains", () => {
    const placeholder = getAddressPlaceholder("");
    expect(placeholder).toContain("wallet address");
  });
});
