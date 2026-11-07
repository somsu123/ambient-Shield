// Ambient Shield — Local LLM Interface for Scanner (extension/llm.js)
// 100% Local Inference via Ollama (default: gemma3:4b). Zero API keys.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
export const DEFAULT_MODEL = "gemma3:4b";
const CACHE_KEY_PREFIX = "llm_cache:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 200;

// In-memory cache mirror
const memCache = new Map();

/** Fast djb2 string hash */
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

/** Read configuration from storage */
export async function getScannerLLMConfig() {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["ollamaModel", "ollamaHost", "llmTimeoutMs"], (res) => {
        resolve({
          host: res.ollamaHost || DEFAULT_OLLAMA_HOST,
          model: res.ollamaModel || DEFAULT_MODEL,
          timeoutMs: Number(res.llmTimeoutMs) || 45000,
        });
      });
    });
  }
  return {
    host: DEFAULT_OLLAMA_HOST,
    model: DEFAULT_MODEL,
    timeoutMs: 45000,
  };
}

/** Persistent LRU cache loader */
export async function getCachedLLM(key) {
  if (memCache.has(key)) {
    const item = memCache.get(key);
    if (Date.now() - item.ts < CACHE_TTL_MS) {
      return item.data;
    }
    memCache.delete(key);
  }

  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      const storageKey = CACHE_KEY_PREFIX + key;
      const res = await new Promise((resolve) => chrome.storage.local.get([storageKey], resolve));
      const entry = res[storageKey];
      if (entry && (Date.now() - entry.ts < CACHE_TTL_MS)) {
        memCache.set(key, entry);
        return entry.data;
      }
    } catch (_) {}
  }
  return null;
}

/** Persistent LRU cache setter */
export async function setCachedLLM(key, data) {
  const entry = { data, ts: Date.now() };
  if (memCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = memCache.keys().next().value;
    if (oldestKey) memCache.delete(oldestKey);
  }
  memCache.set(key, entry);

  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      const storageKey = CACHE_KEY_PREFIX + key;
      chrome.storage.local.set({ [storageKey]: entry }, () => {});
    } catch (_) {}
  }
}

/** Robust JSON cleaner and parser */
export function cleanAndParseJSON(raw) {
  if (typeof raw !== "string") return null;
  let str = raw.trim();

  // Strip markdown code blocks: ```json ... ``` or ``` ... ```
  str = str.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(str);
  } catch (_) {
    // Extract outermost JSON object
    const start = str.indexOf("{");
    const end = str.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(str.slice(start, end + 1));
      } catch (_) {}
    }
    // Extract outermost JSON array
    const aStart = str.indexOf("[");
    const aEnd = str.lastIndexOf("]");
    if (aStart !== -1 && aEnd > aStart) {
      try {
        return JSON.parse(str.slice(aStart, aEnd + 1));
      } catch (_) {}
    }
  }
  return null;
}

/** Health check for Ollama */
export async function checkLLMHealth() {
  const cfg = await getScannerLLMConfig();
  const host = cfg.host.replace(/\/+$/, "");
  const model = cfg.model;

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${host}/api/tags`, { method: "GET", signal: ctrl.signal });
    clearTimeout(tid);

    if (!res.ok) {
      return {
        ok: false,
        status: "offline",
        model,
        message: `Ollama returned HTTP ${res.status}. Start the Ollama server.`,
        instructions: {
          windows: `$env:OLLAMA_ORIGINS = "chrome-extension://*"\nollama serve`,
          unix: `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`,
          pull: `ollama pull ${model}`,
        },
      };
    }

    const data = await res.json();
    const models = (data.models || []).map((m) => m.name || m.model);
    const hasModel = models.some((m) => m === model || m.startsWith(`${model}:`) || m.startsWith(model));

    if (!hasModel) {
      return {
        ok: false,
        status: "model_missing",
        model,
        models,
        message: `Ollama is running, but model "${model}" is not installed.`,
        instructions: {
          windows: `$env:OLLAMA_ORIGINS = "chrome-extension://*"\nollama serve`,
          unix: `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`,
          pull: `ollama pull ${model}`,
        },
      };
    }

    return {
      ok: true,
      status: "ready",
      model,
      models,
      message: `Local LLM ready (${model})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "offline",
      model,
      message: `Cannot reach Ollama at ${host}. Ensure server is running.`,
      instructions: {
        windows: `$env:OLLAMA_ORIGINS = "chrome-extension://*"\nollama serve`,
        unix: `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`,
        pull: `ollama pull ${model}`,
      },
    };
  }
}

/**
 * Core callLLM function for the scanner.
 * Signature: callLLM({ system, prompt, schema, options })
 * - 45s AbortController timeout
 * - 2 retries with exponential backoff
 * - JSON parse + schema validation
 * - 1 repair retry on invalid JSON
 * - Returns typed result { success: boolean, data?: any, error?: string, cached?: boolean }
 * - NEVER throws.
 */
export async function callLLM({
  system = "",
  prompt = "",
  schema = null,
  options = {},
}) {
  const startTime = Date.now();
  const cacheKey = hashString(`${system}|${prompt}|${JSON.stringify(schema || {})}`);

  // 1. Check persistent LRU cache
  if (!options.skipCache) {
    const cached = await getCachedLLM(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        cached: true,
        provider: "cache",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  const cfg = await getScannerLLMConfig();
  const host = options.host || cfg.host;
  const model = options.model || cfg.model;
  const timeoutMs = options.timeoutMs || cfg.timeoutMs;
  const maxRetries = options.retries !== undefined ? options.retries : 2;

  const url = `${host.replace(/\/+$/, "")}/api/chat`;

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const body = {
    model,
    messages,
    stream: false,
    format: "json",
    options: {
      temperature: 0.1,
    },
  };

  let rawContent = null;
  let lastError = null;

  // 2. Network call with up to 2 retries and exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}: ${errText || res.statusText}`);
      }

      const json = await res.json();
      rawContent = json?.message?.content || "";
      break;
    } catch (err) {
      clearTimeout(tid);
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      lastError = isAbort ? new Error(`Ollama request timed out after ${timeoutMs}ms`) : err;

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 800));
      }
    }
  }

  if (rawContent === null) {
    return {
      success: false,
      error: lastError?.message || "Ollama connection failed",
      provider: "ollama",
      latencyMs: Date.now() - startTime,
    };
  }

  // 3. Parse JSON
  let parsed = cleanAndParseJSON(rawContent);

  // 4. One repair retry if JSON is invalid
  if (!parsed && rawContent) {
    const repairMessages = [
      {
        role: "system",
        content: "You are a JSON repair tool. Output strictly valid JSON with no markdown wrapping.",
      },
      {
        role: "user",
        content: `Convert the following text into valid JSON matching this schema: ${JSON.stringify(schema || {})}\n\nText:\n${rawContent.slice(0, 3000)}`,
      },
    ];

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 20000);
      const repairRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: repairMessages, stream: false, format: "json" }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (repairRes.ok) {
        const repairJson = await repairRes.json();
        parsed = cleanAndParseJSON(repairJson?.message?.content || "");
      }
    } catch (_) {}
  }

  if (!parsed) {
    return {
      success: false,
      error: "Failed to parse valid JSON from local LLM output",
      raw: rawContent,
      provider: "ollama",
      latencyMs: Date.now() - startTime,
    };
  }

  // 5. Schema validation (basic checks)
  if (schema && typeof schema === "object" && Array.isArray(schema.required)) {
    for (const reqKey of schema.required) {
      if (parsed[reqKey] === undefined) {
        // Fallback default if missing
        if (reqKey === "verdict") parsed.verdict = "insufficient";
        if (reqKey === "citations") parsed.citations = [];
        if (reqKey === "confidence") parsed.confidence = 0.5;
        if (reqKey === "reasoning") parsed.reasoning = "Evaluated based on provided context.";
      }
    }
  }

  // 6. Cache valid result
  await setCachedLLM(cacheKey, parsed);

  return {
    success: true,
    data: parsed,
    cached: false,
    provider: "ollama",
    latencyMs: Date.now() - startTime,
  };
}

