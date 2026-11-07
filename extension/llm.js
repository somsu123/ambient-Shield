// Ambient Shield — Local & Cloud LLM Interface for Scanner (extension/llm.js)
// Supports Groq Cloud (ultra-fast verification) & local Ollama inference.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
export const DEFAULT_MODEL = "gemma3:4b";
export const DEFAULT_GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_KEY = "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";
export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

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
      chrome.storage.local.get(
        ["llmProvider", "ollamaModel", "ollamaHost", "groqApiKey", "groqModel", "llmTimeoutMs"],
        (res) => {
          resolve({
            provider: res.llmProvider || (res.groqApiKey || DEFAULT_GROQ_KEY ? "groq" : "ollama"),
            host: res.ollamaHost || DEFAULT_OLLAMA_HOST,
            model: res.ollamaModel || DEFAULT_MODEL,
            groqApiKey: res.groqApiKey || DEFAULT_GROQ_KEY,
            groqModel: res.groqModel || DEFAULT_GROQ_MODEL,
            timeoutMs: Number(res.llmTimeoutMs) || 30000,
          });
        }
      );
    });
  }

  // Node environment default
  return {
    provider: (typeof process !== "undefined" && process.env?.DEFAULT_LLM_PROVIDER) || "ollama",
    host: DEFAULT_OLLAMA_HOST,
    model: DEFAULT_MODEL,
    groqApiKey: (typeof process !== "undefined" && process.env?.GROQ_API_KEY) || DEFAULT_GROQ_KEY,
    groqModel: (typeof process !== "undefined" && process.env?.GROQ_MODEL) || DEFAULT_GROQ_MODEL,
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

/** Health check for Groq and Ollama */
export async function checkLLMHealth() {
  const cfg = await getScannerLLMConfig();

  // 1. Check Groq if configured as active
  if (cfg.provider === "groq" && cfg.groqApiKey) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${cfg.groqApiKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (res.ok) {
        return {
          ok: true,
          status: "ready",
          provider: "groq",
          model: cfg.groqModel,
          message: `Groq Cloud LLM ready (${cfg.groqModel})`,
        };
      }
    } catch (_) {}
  }

  // 2. Check Ollama
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
      };
    }

    return {
      ok: true,
      status: "ready",
      provider: "ollama",
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
    };
  }
}

/**
 * Core callLLM function for the scanner.
 * Signature: callLLM({ system, prompt, schema, options })
 * - Supports Groq Cloud (ultra-fast) & Ollama
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
  const provider = options.provider || cfg.provider || "ollama";
  const timeoutMs = options.timeoutMs || cfg.timeoutMs || 30000;
  const maxRetries = options.retries !== undefined ? options.retries : 2;

  let rawContent = null;
  let lastError = null;
  let providerUsed = provider;

  // Groq Call Implementation
  async function callGroqNetwork() {
    const apiKey = options.groqApiKey || cfg.groqApiKey || DEFAULT_GROQ_KEY;
    const model = options.groqModel || cfg.groqModel || DEFAULT_GROQ_MODEL;

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const payload = {
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        const res = await fetch(DEFAULT_GROQ_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        clearTimeout(tid);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Groq HTTP ${res.status}: ${errText || res.statusText}`);
        }

        const json = await res.json();
        return json?.choices?.[0]?.message?.content || "";
      } catch (err) {
        clearTimeout(tid);
        const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
        lastError = isAbort ? new Error(`Groq request timed out after ${timeoutMs}ms`) : err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 800));
        }
      }
    }
    return null;
  }

  // Ollama Call Implementation
  async function callOllamaNetwork() {
    const host = options.host || cfg.host;
    const model = options.model || cfg.model;
    const url = `${host.replace(/\/+$/, "")}/api/chat`;

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const body = {
      model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0.1 },
    };

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
        return json?.message?.content || "";
      } catch (err) {
        clearTimeout(tid);
        const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
        lastError = isAbort ? new Error(`Ollama request timed out after ${timeoutMs}ms`) : err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 800));
        }
      }
    }
    return null;
  }

  // Execute primary provider
  if (provider === "groq") {
    rawContent = await callGroqNetwork();
    providerUsed = "groq";
    if (rawContent === null && options.fallback !== false) {
      // Fallback to Ollama if Groq fails
      rawContent = await callOllamaNetwork();
      if (rawContent !== null) providerUsed = "ollama";
    }
  } else {
    rawContent = await callOllamaNetwork();
    providerUsed = "ollama";
    // Only fall back to Groq if explicitly enabled
    if (rawContent === null && (options.fallback === "groq" || options.allowCloudFallback)) {
      rawContent = await callGroqNetwork();
      if (rawContent !== null) providerUsed = "groq";
    }
  }

  if (rawContent === null) {
    return {
      success: false,
      error: lastError?.message || `${providerUsed} connection failed`,
      provider: providerUsed,
      latencyMs: Date.now() - startTime,
    };
  }

  // 3. Parse JSON
  let parsed = cleanAndParseJSON(rawContent);

  // 4. One repair retry if JSON is invalid
  if (!parsed && rawContent) {
    try {
      if (providerUsed === "groq") {
        const repairPrompt = `Convert the following text into valid JSON matching this schema: ${JSON.stringify(schema || {})}\n\nText:\n${rawContent.slice(0, 3000)}`;
        const apiKey = options.groqApiKey || cfg.groqApiKey || DEFAULT_GROQ_KEY;
        const model = options.groqModel || cfg.groqModel || DEFAULT_GROQ_MODEL;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 15000);
        const repairRes = await fetch(DEFAULT_GROQ_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "You are a JSON repair tool. Output strictly valid JSON." },
              { role: "user", content: repairPrompt },
            ],
            response_format: { type: "json_object" },
          }),
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (repairRes.ok) {
          const repairJson = await repairRes.json();
          parsed = cleanAndParseJSON(repairJson?.choices?.[0]?.message?.content || "");
        }
      } else {
        const repairMessages = [
          { role: "system", content: "You are a JSON repair tool. Output strictly valid JSON with no markdown wrapping." },
          { role: "user", content: `Convert the following text into valid JSON matching this schema: ${JSON.stringify(schema || {})}\n\nText:\n${rawContent.slice(0, 3000)}` },
        ];
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 20000);
        const host = options.host || cfg.host;
        const model = options.model || cfg.model;
        const repairRes = await fetch(`${host.replace(/\/+$/, "")}/api/chat`, {
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
      }
    } catch (_) {}
  }

  if (!parsed) {
    return {
      success: false,
      error: `Failed to parse valid JSON from ${providerUsed} output`,
      raw: rawContent,
      provider: providerUsed,
      latencyMs: Date.now() - startTime,
    };
  }

  // 5. Schema validation
  if (schema && typeof schema === "object" && Array.isArray(schema.required)) {
    for (const reqKey of schema.required) {
      if (parsed[reqKey] === undefined) {
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
    provider: providerUsed,
    latencyMs: Date.now() - startTime,
  };
}
