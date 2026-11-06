/**
 * djb2 hash — fast, deterministic, no Node.js dependencies.
 * Safe to import in both client and server components.
 *
 * Produces a 32-bit unsigned integer as a hex string, e.g. "5c1a3b7f".
 * Collision rate is acceptable for cache key generation (not cryptographic use).
 */
export function hashString(input: string): string {
  let hash = 5381;

  for (let i = 0; i < input.length; i++) {
    // hash * 33 ^ charCode  (equivalent to: (hash << 5) + hash + charCode)
    hash = (Math.imul(hash, 33) ^ input.charCodeAt(i)) >>> 0;
  }

  // Pad to 8 hex characters so keys are a consistent length
  return hash.toString(16).padStart(8, "0");
}

/**
 * Build a cache key from one or more segments.
 * Segments are joined with "::" before hashing so
 * hashKey("privacy", text) !== hashKey("deepfake", text).
 *
 * @example
 *   hashKey("privacy", policyText) // "privacy::abc...  → "3f8a1c02"
 */
export function hashKey(...segments: string[]): string {
  return hashString(segments.join("::"));
}
