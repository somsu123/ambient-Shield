import { createHash } from "crypto";

const MAX_ENTRIES = 500;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

class LRUCache {
  private store = new Map<string, CacheEntry>();

  /**
   * Retrieve a cached value by key.
   * Returns null if the entry doesn't exist or has expired.
   */
  get<T = unknown>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      // Expired — evict and signal miss
      this.store.delete(key);
      return null;
    }

    // Refresh LRU position: delete then re-insert so this key becomes "newest"
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  /**
   * Store a value under key. Evicts the oldest entry when the cache is full.
   */
  set<T = unknown>(key: string, value: T): void {
    // If key already exists, remove it so we can re-insert at the "newest" position
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Evict oldest entries until we're under the limit
    while (this.store.size >= MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  /** Current number of live (non-expired) entries. */
  get size(): number {
    return this.store.size;
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }
}

// ── Singleton exported for use across the app ───────────────────────────────
export const cache = new LRUCache();

/**
 * Generate a SHA-256 cache key from an arbitrary string input.
 * Deterministic: same input → same key every time.
 */
export function makeCacheKey(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
