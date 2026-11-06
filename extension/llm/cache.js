// Ambient Shield — Persistent LRU Cache (extension/llm/cache.js)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CACHE_ENTRIES = 500;
const memoryCache = new Map();
let isHydrated = false;

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

export function computeCacheKey(task, input) {
  const norm = typeof input === "string" ? input : JSON.stringify(input || "");
  return `${task}:${djb2(norm)}`;
}

/**
 * Hydrates cache from chrome.storage.local if running in Chrome Extension environment.
 */
export async function hydrateCache() {
  if (isHydrated) return;
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(["llmCacheStore"], (res) => resolve(res.llmCacheStore || {}));
      });
      for (const [k, v] of Object.entries(data)) {
        memoryCache.set(k, v);
      }
    } catch (_) {}
  }
  isHydrated = true;
}

export function getCached(key) {
  if (!memoryCache.has(key)) return null;
  const item = memoryCache.get(key);
  // Re-insert to keep LRU order
  memoryCache.delete(key);
  memoryCache.set(key, item);
  return item;
}

export function setCached(key, value) {
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  } else if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest (first key in map)
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, value);

  // Asynchronously persist to chrome.storage.local
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      const obj = {};
      // Save top 100 recent entries to avoid exceeding quota
      const entries = Array.from(memoryCache.entries()).slice(-100);
      for (const [k, v] of entries) {
        obj[k] = v;
      }
      chrome.storage.local.set({ llmCacheStore: obj }, () => {});
    } catch (_) {}
  }
}

export function clearCache() {
  memoryCache.clear();
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      chrome.storage.local.remove(["llmCacheStore"], () => {});
    } catch (_) {}
  }
}
