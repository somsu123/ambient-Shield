// Ambient Shield — Deepfake Analysis Cache (extension/deepfake/cache.js)
// Persistent cache backed by chrome.storage.local with per-entry TTL.
// Key: djb2 hash of frame data + model + settings.
// ─────────────────────────────────────────────────────────────────────────────

import { DEEPFAKE_CONFIG } from "./config.js";

const STORAGE_KEY = DEEPFAKE_CONFIG.CACHE_STORAGE_KEY; // "deepfakeCache"
const TTL_MS = DEEPFAKE_CONFIG.CACHE_TTL_MS;           // 24h

// In-memory mirror of chrome.storage for fast synchronous reads within a session
let _memCache = null;

// ── Hash ─────────────────────────────────────────────────────────────────────

/**
 * djb2 — Fast non-cryptographic string hash.
 * @param {string} str
 * @returns {number}
 */
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 XOR charCode
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and return as hex string
  return (hash >>> 0).toString(16);
}

/**
 * computeCacheKey — Derives a stable cache key from frame data, model, and settings.
 *
 * Uses the first 8 KB of each frame joined together, the model name,
 * and a stable JSON serialisation of the settings object.
 *
 * @param {string[]} frameDataArray  Array of base64 frame strings.
 * @param {string}   model           Model name used for inference.
 * @param {object}   settings        Arbitrary settings object (e.g. { frameCount, host }).
 * @returns {string}  A short hex hash string.
 */
export function computeCacheKey(frameDataArray, model, settings) {
  let framesSlice = "";
  if (Array.isArray(frameDataArray)) {
    framesSlice = frameDataArray
      .map((f) => (typeof f === "string" ? f.slice(0, 8192) : (f?.base64 ? f.base64.slice(0, 8192) : "")))
      .join("|");
  } else if (typeof frameDataArray === "string") {
    framesSlice = frameDataArray.slice(0, 32768);
  }
  const raw = `${framesSlice}::${model || ""}::${JSON.stringify(settings || {})}`;
  return djb2(raw);
}

// ── Storage Helpers ───────────────────────────────────────────────────────────

/**
 * _load — Reads the entire cache object from chrome.storage.local into memory.
 * @returns {Promise<object>}
 */
async function _load() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) {
    return {};
  }
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(res[STORAGE_KEY] || {});
    });
  });
}

/**
 * _save — Writes the in-memory cache back to chrome.storage.local.
 * @returns {Promise<void>}
 */
async function _save(cacheObj) {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: cacheObj }, resolve);
  });
}

/**
 * _ensureLoaded — Lazily loads the cache from storage if not already in memory.
 */
async function _ensureLoaded() {
  if (_memCache === null) {
    _memCache = await _load();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getCache — Retrieves a cached analysis result, checking TTL.
 *
 * @param {string} key  Cache key from computeCacheKey().
 * @returns {Promise<object|null>}  The cached data, or null if missing or expired.
 */
export async function getCache(key) {
  await _ensureLoaded();

  const entry = _memCache[key];
  if (!entry) return null;

  const age = Date.now() - (entry.timestamp || 0);
  if (age > TTL_MS) {
    // Expired — evict from memory and storage
    delete _memCache[key];
    await _save(_memCache);
    return null;
  }

  return entry.data;
}

/**
 * setCache — Stores an analysis result with the current timestamp.
 *
 * @param {string} key   Cache key from computeCacheKey().
 * @param {object} data  The analysis result to cache.
 * @returns {Promise<void>}
 */
export async function setCache(key, data) {
  await _ensureLoaded();

  _memCache[key] = {
    timestamp: Date.now(),
    data,
  };

  // Evict expired entries before saving to keep storage tidy
  _evictExpired();

  await _save(_memCache);
}

/**
 * clearCache — Removes all deepfake cache entries from storage.
 * @returns {Promise<void>}
 */
export async function clearCache() {
  _memCache = {};
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    await new Promise((resolve) => {
      chrome.storage.local.remove([STORAGE_KEY], resolve);
    });
  }
}

/**
 * _evictExpired — Removes all entries older than TTL_MS from the in-memory cache.
 * @private
 */
function _evictExpired() {
  if (!_memCache) return;
  const now = Date.now();
  for (const key of Object.keys(_memCache)) {
    const entry = _memCache[key];
    if (!entry?.timestamp || now - entry.timestamp > TTL_MS) {
      delete _memCache[key];
    }
  }
}
