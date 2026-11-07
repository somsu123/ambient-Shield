// Ambient Shield — LLM Provider Orchestrator (extension/llm/index.js)
// Unified entry point for all model inferences (Groq Cloud & Local Ollama).
// ─────────────────────────────────────────────────────────────────────────────

import { extractJSON, validateSchema } from "./repair.js";
import { chatOllama, checkOllamaHealth, DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL } from "./providers/ollama.js";
import { chatGroq, checkGroqHealth, DEFAULT_GROQ_KEY, DEFAULT_GROQ_MODEL } from "./providers/groq.js";
import { chatOffscreen, checkOffscreenHealth } from "./providers/offscreen-fallback.js";
import { hydrateCache, getCached, setCached, computeCacheKey } from "./cache.js";

/**
 * Reads user LLM settings from chrome.storage.local (with defaults).
 */
export async function getLLMConfig() {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["llmProvider", "ollamaHost", "ollamaModel", "groqApiKey", "groqModel", "llmTimeoutMs", "llmDebug"],
        (res) => {
          resolve({
            provider: res.llmProvider || "groq",
            ollamaHost: res.ollamaHost || DEFAULT_OLLAMA_HOST,
            ollamaModel: res.ollamaModel || DEFAULT_OLLAMA_MODEL,
            groqApiKey: res.groqApiKey || DEFAULT_GROQ_KEY,
            groqModel: res.groqModel || DEFAULT_GROQ_MODEL,
            timeoutMs: Number(res.llmTimeoutMs) || 30000,
            debug: Boolean(res.llmDebug),
          });
        }
      );
    });
  }

  // Node.js test environment default
  return {
    provider: "ollama",
    ollamaHost: DEFAULT_OLLAMA_HOST,
    ollamaModel: DEFAULT_OLLAMA_MODEL,
    groqApiKey: DEFAULT_GROQ_KEY,
    groqModel: DEFAULT_GROQ_MODEL,
    timeoutMs: 45000,
    debug: false,
  };
}

/**
 * Health check covering all providers.
 */
export async function checkLLMHealth() {
  const cfg = await getLLMConfig();
  const ollama = await checkOllamaHealth(cfg.ollamaHost, cfg.ollamaModel);
  const groq = await checkGroqHealth(cfg.groqApiKey, cfg.groqModel);
  const offscreen = await checkOffscreenHealth();

  const isReady = cfg.provider === "groq" ? groq.ok : ollama.ok;

  return {
    activeProvider: cfg.provider,
    config: cfg,
    providers: {
      groq,
      ollama,
      offscreen,
    },
    ready: isReady,
    guidance: cfg.provider === "groq"
      ? (groq.ok ? `Connected to Groq Cloud (${cfg.groqModel})` : groq.message)
      : (ollama.ok ? `Connected to Ollama (${cfg.ollamaModel})` : ollama.message),
  };
}

/**
 * Core entry point: callLLM
 * Always returns a structured object: { success: boolean, data?: any, error?: string, provider?: string, cached?: boolean }
 * NEVER throws.
 */
export async function callLLM({
  task = "GENERIC",
  system = "",
  prompt = "",
  schema = null,
  images = [],
  options = {},
}) {
  const startTime = Date.now();
  await hydrateCache();

  // 1. Check persistent LRU Cache
  const cacheKey = computeCacheKey(task, { prompt, imagesCount: images?.length || 0 });
  const cachedVal = getCached(cacheKey);
  if (cachedVal) {
    return {
      success: true,
      data: cachedVal,
      cached: true,
      provider: "cache",
      latencyMs: Date.now() - startTime,
    };
  }

  // 2. Resolve Config
  const cfg = await getLLMConfig();
  const host = options.host || cfg.ollamaHost;
  const model = options.model || (options.provider === "groq" || cfg.provider === "groq" ? cfg.groqModel : cfg.ollamaModel);
  const timeoutMs = options.timeoutMs || cfg.timeoutMs;
  const preferredProvider = options.provider || cfg.provider;

  // Provider call helper
  async function executeProvider(providerName) {
    if (providerName === "groq") {
      const apiKey = options.groqApiKey || cfg.groqApiKey || DEFAULT_GROQ_KEY;
      const groqModel = options.groqModel || options.model || cfg.groqModel || DEFAULT_GROQ_MODEL;
      return chatGroq({ apiKey, model: groqModel, system, prompt, timeoutMs });
    }
    if (providerName === "ollama") {
      return chatOllama({ host, model, system, prompt, images, timeoutMs });
    }
    if (providerName === "offscreen") {
      return chatOffscreen();
    }
    return { success: false, error: `Unknown provider: ${providerName}` };
  }

  // Provider cascade: Preferred -> Fallback
  let providerUsed = preferredProvider;
  let response = await executeProvider(preferredProvider);

  if (!response.success && preferredProvider === "ollama") {
    // Try fallback
    const fallbackRes = await executeProvider("offscreen");
    if (fallbackRes.success) {
      response = fallbackRes;
      providerUsed = "offscreen";
    }
  } else if (!response.success && preferredProvider === "groq") {
    // If Groq fails, attempt local Ollama fallback
    const fallbackRes = await executeProvider("ollama");
    if (fallbackRes.success) {
      response = fallbackRes;
      providerUsed = "ollama";
    }
  }

  if (!response.success) {
    return {
      success: false,
      error: response.error || "LLM request failed across providers",
      provider: providerUsed,
      latencyMs: Date.now() - startTime,
    };
  }

  // 3. Extract and Parse JSON
  let parsed = extractJSON(response.raw);

  // 4. One Repair Retry if JSON is invalid
  if (!parsed && response.raw) {
    const repairPrompt = `The following text was supposed to be valid JSON. Convert it into valid JSON:\n\n${response.raw.slice(0, 2000)}`;
    const repairRes = await executeProvider(providerUsed);
    if (repairRes.success) {
      parsed = extractJSON(repairRes.raw);
    }
  }

  if (!parsed) {
    return {
      success: false,
      error: `Failed to extract valid JSON from ${providerUsed} output`,
      raw: response.raw,
      provider: providerUsed,
      latencyMs: Date.now() - startTime,
    };
  }

  // 5. Schema Validation & Sanitization
  const validation = validateSchema(task, parsed);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error || "Output failed schema validation",
      provider: providerUsed,
      latencyMs: Date.now() - startTime,
    };
  }

  // 6. Cache valid result
  setCached(cacheKey, validation.data);

  return {
    success: true,
    data: validation.data,
    cached: false,
    provider: providerUsed,
    latencyMs: Date.now() - startTime,
  };
}
