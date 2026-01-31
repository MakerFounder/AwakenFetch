/**
 * Client-side address format validation per chain.
 *
 * Provides chain-specific validation with descriptive error messages
 * for inline form feedback. Each chain has its own address format:
 *   - Bittensor (TAO): SS58 format (starts with "5", 46-48 chars, Base58)
 *   - Kaspa (KAS): bech32-like (kaspa:<61-63 lowercase alphanumeric chars>)
 *   - Injective (INJ): bech32 (inj1<38 lowercase alphanumeric chars>, 42 total)
 */

// ---------------------------------------------------------------------------
// Shared regex patterns (mirrored from individual adapters)
// ---------------------------------------------------------------------------

/** Base58 character set (no 0, O, I, l). */
const BASE58_CHARS = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Kaspa address pattern. */
const KASPA_ADDRESS_REGEX = /^kaspa:[a-z0-9]{61,63}$/;

/** Injective address pattern. */
const INJ_ADDRESS_REGEX = /^inj1[a-z0-9]{38}$/;

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface AddressValidationResult {
  /** Whether the address is valid for the selected chain. */
  valid: boolean;
  /** Descriptive error message when invalid, undefined when valid. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Per-chain validators
// ---------------------------------------------------------------------------

function validateBittensorAddress(address: string): AddressValidationResult {
  const trimmed = address.trim();

  if (!trimmed.startsWith("5")) {
    return {
      valid: false,
      error: "Bittensor addresses must start with \"5\"",
    };
  }

  if (trimmed.length < 46 || trimmed.length > 48) {
    return {
      valid: false,
      error: "Bittensor addresses must be 46–48 characters long",
    };
  }

  if (!BASE58_CHARS.test(trimmed)) {
    return {
      valid: false,
      error:
        "Bittensor addresses may only contain Base58 characters (no 0, O, I, or l)",
    };
  }

  return { valid: true };
}

function validateKaspaAddress(address: string): AddressValidationResult {
  const trimmed = address.trim();

  if (!trimmed.startsWith("kaspa:")) {
    return {
      valid: false,
      error: "Kaspa addresses must start with \"kaspa:\"",
    };
  }

  if (!KASPA_ADDRESS_REGEX.test(trimmed)) {
    return {
      valid: false,
      error:
        "Invalid Kaspa address format. Expected: kaspa:<61–63 lowercase alphanumeric characters>",
    };
  }

  return { valid: true };
}

function validateInjectiveAddress(address: string): AddressValidationResult {
  const trimmed = address.trim().toLowerCase();

  if (!trimmed.startsWith("inj1")) {
    return {
      valid: false,
      error: "Injective addresses must start with \"inj1\"",
    };
  }

  if (trimmed.length !== 42) {
    return {
      valid: false,
      error: "Injective addresses must be exactly 42 characters long",
    };
  }

  if (!INJ_ADDRESS_REGEX.test(trimmed)) {
    return {
      valid: false,
      error:
        "Invalid Injective address format. Expected: inj1<38 lowercase alphanumeric characters>",
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Map of chainId → validator function. */
const validators: Record<
  string,
  (address: string) => AddressValidationResult
> = {
  bittensor: validateBittensorAddress,
  kaspa: validateKaspaAddress,
  injective: validateInjectiveAddress,
};

/**
 * Validate a wallet address for the given chain.
 *
 * Returns `{ valid: true }` when the address matches the expected format,
 * or `{ valid: false, error: "..." }` with a human-readable inline error.
 *
 * If no chain is selected (empty string) or the chain has no specific
 * validator, validation is skipped and the address is considered valid.
 */
export function validateAddress(
  address: string,
  chainId: string,
): AddressValidationResult {
  if (!chainId) return { valid: true };
  if (!address.trim()) return { valid: true };

  const validator = validators[chainId];
  if (!validator) return { valid: true };

  return validator(address.trim());
}

/**
 * Get a placeholder example address for the given chain.
 * Useful for guiding users on the expected format.
 */
export function getAddressPlaceholder(chainId: string): string {
  switch (chainId) {
    case "bittensor":
      return "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX";
    case "kaspa":
      return "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73";
    case "injective":
      return "inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz";
    default:
      return "Enter your public wallet address";
  }
}
