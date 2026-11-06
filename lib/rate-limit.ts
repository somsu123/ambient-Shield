const PER_IP_MINUTE_LIMIT = 8;
const PER_IP_DAILY_LIMIT = 30;
const GLOBAL_DAILY_LIMIT = 800;

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

interface IPRecord {
  /** Requests in the current 1-minute window */
  minuteCount: number;
  /** When the current minute window resets (epoch ms) */
  minuteReset: number;
  /** Requests in the current 24-hour window */
  dailyCount: number;
  /** When the daily window resets (epoch ms) */
  dailyReset: number;
}

interface GlobalRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current per-IP minute window */
  remaining: number;
  /** Milliseconds until the most restrictive window resets */
  resetIn: number;
  /** HTTP-ready error payload (only populated when allowed === false) */
  error?: {
    code: 429;
    message: string;
  };
}

// Module-level stores — survive across requests in the same Node.js process
const ipStore = new Map<string, IPRecord>();
const globalStore: GlobalRecord = {
  count: 0,
  resetAt: Date.now() + DAY_MS,
};

function resetGlobalIfNeeded(): void {
  if (Date.now() >= globalStore.resetAt) {
    globalStore.count = 0;
    globalStore.resetAt = Date.now() + DAY_MS;
  }
}

function getOrCreateIPRecord(ip: string): IPRecord {
  const now = Date.now();
  let record = ipStore.get(ip);

  if (!record) {
    record = {
      minuteCount: 0,
      minuteReset: now + MINUTE_MS,
      dailyCount: 0,
      dailyReset: now + DAY_MS,
    };
    ipStore.set(ip, record);
  }

  // Roll over the minute window if expired
  if (now >= record.minuteReset) {
    record.minuteCount = 0;
    record.minuteReset = now + MINUTE_MS;
  }

  // Roll over the daily window if expired
  if (now >= record.dailyReset) {
    record.dailyCount = 0;
    record.dailyReset = now + DAY_MS;
  }

  return record;
}

/**
 * Check whether the given IP is allowed to make an AI call.
 * When allowed, increments both IP and global counters immediately.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  resetGlobalIfNeeded();

  // ── Global safety cap ───────────────────────────────────────────────────
  if (globalStore.count >= GLOBAL_DAILY_LIMIT) {
    const resetIn = Math.max(0, globalStore.resetAt - Date.now());
    return {
      allowed: false,
      remaining: 0,
      resetIn,
      error: {
        code: 429,
        message:
          "Global daily request limit reached. Service resets in " +
          Math.ceil(resetIn / 1_000 / 60) +
          " minutes.",
      },
    };
  }

  const record = getOrCreateIPRecord(ip);
  const now = Date.now();

  // ── Per-IP daily limit ──────────────────────────────────────────────────
  if (record.dailyCount >= PER_IP_DAILY_LIMIT) {
    const resetIn = Math.max(0, record.dailyReset - now);
    return {
      allowed: false,
      remaining: 0,
      resetIn,
      error: {
        code: 429,
        message:
          "Daily limit reached. Your quota resets in " +
          Math.ceil(resetIn / 1_000 / 60) +
          " minutes.",
      },
    };
  }

  // ── Per-IP per-minute limit ─────────────────────────────────────────────
  if (record.minuteCount >= PER_IP_MINUTE_LIMIT) {
    const resetIn = Math.max(0, record.minuteReset - now);
    return {
      allowed: false,
      remaining: 0,
      resetIn,
      error: {
        code: 429,
        message:
          "Too many requests. Please wait " +
          Math.ceil(resetIn / 1_000) +
          " seconds before trying again.",
      },
    };
  }

  // ── Allowed — increment counters ────────────────────────────────────────
  record.minuteCount += 1;
  record.dailyCount += 1;
  globalStore.count += 1;

  const remaining = Math.min(
    PER_IP_MINUTE_LIMIT - record.minuteCount,
    PER_IP_DAILY_LIMIT - record.dailyCount
  );
  const resetIn = Math.max(0, record.minuteReset - now);

  return { allowed: true, remaining, resetIn };
}

/**
 * Expose global remaining capacity (for the /health endpoint).
 */
export function getGlobalRemaining(): number {
  resetGlobalIfNeeded();
  return Math.max(0, GLOBAL_DAILY_LIMIT - globalStore.count);
}
