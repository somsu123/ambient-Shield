// Ambient Shield — Deepfake Vision Client (extension/deepfake/vision-client.js)
// Handles all LLM vision calls for deepfake analysis via Ollama /api/chat.
// ─────────────────────────────────────────────────────────────────────────────

import { extractJSON } from "../llm/repair.js";
import { checkOllamaHealth } from "../llm/providers/ollama.js";
import { checkGroqHealth, DEFAULT_GROQ_KEY, DEFAULT_GROQ_MODEL } from "../llm/providers/groq.js";
import { DEEPFAKE_CONFIG } from "./config.js";

// ── Concurrency Semaphore ────────────────────────────────────────────────────
// Limits simultaneous in-flight vision requests to CONCURRENCY_LIMIT.

class Semaphore {
  constructor(max) {
    this._max = max;
    this._count = 0;
    this._queue = [];
  }

  /** Acquire a slot; resolves when one is available. */
  acquire() {
    return new Promise((resolve) => {
      if (this._count < this._max) {
        this._count++;
        resolve();
      } else {
        this._queue.push(resolve);
      }
    });
  }

  /** Release a slot, unblocking the next queued caller. */
  release() {
    this._count--;
    if (this._queue.length > 0) {
      this._count++;
      const next = this._queue.shift();
      next();
    }
  }
}

const _semaphore = new Semaphore(DEEPFAKE_CONFIG.CONCURRENCY_LIMIT);

// ── Core Vision Call ─────────────────────────────────────────────────────────

/**
 * callVision — Sends a vision-capable multimodal request to Ollama /api/chat.
 *
 * @param {object} opts
 * @param {string}   opts.system      System prompt for the LLM.
 * @param {string}   opts.prompt      User-facing prompt text.
 * @param {string[]} opts.images      Array of base64-encoded image strings (no data URI prefix).
 * @param {object}   [opts.schema]    Expected schema shape (for documentation; validation done by caller).
 * @param {string}   [opts.host]      Ollama host URL.
 * @param {string}   [opts.model]     Vision model name.
 * @param {number}   [opts.timeoutMs] Per-request timeout in ms.
 *
 * @returns {Promise<{success:boolean, data?:object, error?:string, raw?:string, latencyMs:number}>}
 *   Never throws — always returns a structured result.
 */
export async function callVision({
  system = "",
  prompt = "",
  images = [],
  schema = null, // eslint-disable-line no-unused-vars
  provider = "ollama",
  apiKey = null,
  groqModel = null,
  host = DEEPFAKE_CONFIG.DEFAULT_OLLAMA_HOST || "http://localhost:11434",
  model = DEEPFAKE_CONFIG.DEFAULT_VISION_MODEL,
  timeoutMs = DEEPFAKE_CONFIG.DEFAULT_TIMEOUT_MS,
} = {}) {
  const startTime = Date.now();

  // Respect concurrency limit
  await _semaphore.acquire();

  try {
    let result;
    if (provider === "groq") {
      result = await _callGroqVisionWithRetry({
        system,
        prompt,
        images,
        apiKey: apiKey || DEFAULT_GROQ_KEY,
        model: groqModel || model || DEFAULT_GROQ_MODEL,
        timeoutMs,
      });
      // Optional fallback to Ollama if Groq fails
      if (!result.success && host) {
        const fallback = await _callVisionWithRetry({ system, prompt, images, host, model, timeoutMs });
        if (fallback.success) result = fallback;
      }
    } else {
      result = await _callVisionWithRetry({ system, prompt, images, host, model, timeoutMs });
      // Optional fallback to Groq if Ollama is offline and key is available
      const keyToTry = apiKey || DEFAULT_GROQ_KEY;
      if (!result.success && keyToTry) {
        const fallback = await _callGroqVisionWithRetry({
          system,
          prompt,
          images,
          apiKey: keyToTry,
          model: groqModel || DEFAULT_GROQ_MODEL,
          timeoutMs,
        });
        if (fallback.success) result = fallback;
      }
    }
    return { ...result, latencyMs: Date.now() - startTime };
  } finally {
    _semaphore.release();
  }
}

/**
 * Groq Vision inference handler using OpenAI-compatible image_url format.
 */
async function _callGroqVisionWithRetry({ system, prompt, images, apiKey, model, timeoutMs }) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const messages = [];
  if (system) messages.push({ role: "system", content: system });

  const contentParts = [{ type: "text", text: prompt }];
  if (Array.isArray(images)) {
    for (const img of images) {
      const dataUri = typeof img === "string" && img.startsWith("data:")
        ? img
        : `data:image/jpeg;base64,${img}`;
      contentParts.push({
        type: "image_url",
        image_url: { url: dataUri },
      });
    }
  }
  messages.push({ role: "user", content: contentParts });

  const payload = {
    model: model || DEFAULT_GROQ_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
  };

  const maxRetries = DEEPFAKE_CONFIG.MAX_RETRIES;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs || 30000);

    try {
      const res = await fetch(url, {
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
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || `Groq HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawContent = json?.choices?.[0]?.message?.content || "";
      let parsed = extractJSON(rawContent);
      if (!parsed && rawContent) {
        parsed = await _repairJSON(rawContent, { system, host: null, model, timeoutMs });
      }
      return { success: true, data: parsed || {}, raw: rawContent, provider: "groq" };
    } catch (err) {
      clearTimeout(tid);
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      lastError = isAbort ? new Error(`Groq request timed out after ${timeoutMs}ms`) : err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 800));
      }
    }
  }

  return { success: false, error: lastError?.message || "Groq vision request failed", provider: "groq" };
}

/**
 * Internal retry wrapper with exponential backoff.
 * Retries up to MAX_RETRIES times on transient failure.
 * On HTTP 400 with vision-unsupported text, sets visionUnsupported flag immediately.
 */
async function _callVisionWithRetry({ system, prompt, images, host, model, timeoutMs }) {
  const baseUrl = host.replace(/\/+$/, "");
  const url = `${baseUrl}/api/chat`;
  const maxRetries = DEEPFAKE_CONFIG.MAX_RETRIES;

  const messages = [];
  if (system) messages.push({ role: "system", content: system });

  const userMsg = { role: "user", content: prompt };
  if (Array.isArray(images) && images.length > 0) {
    // Ollama expects bare base64 strings in the images array
    userMsg.images = images.map((img) =>
      typeof img === "string" && img.startsWith("data:")
        ? img.split(",")[1]
        : img
    );
  }
  messages.push(userMsg);

  const payload = {
    model,
    messages,
    stream: false,
    format: "json",
    options: { temperature: 0.1 },
  };

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      // Handle HTTP 400: check if it's a vision-unsupported error
      if (res.status === 400) {
        const text = await res.text().catch(() => "");
        const lowerText = text.toLowerCase();
        if (
          lowerText.includes("does not support") ||
          lowerText.includes("vision") ||
          lowerText.includes("multimodal") ||
          lowerText.includes("images")
        ) {
          return {
            success: false,
            error: `Model "${model}" does not support vision/images.`,
            data: { visionUnsupported: true },
          };
        }
        return { success: false, error: `Ollama HTTP 400: ${text || "Bad Request"}` };
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}: ${text || res.statusText}`);
      }

      const json = await res.json();
      const rawContent = json?.message?.content || "";

      // Attempt JSON parse; if failed, do one repair retry
      let parsed = extractJSON(rawContent);
      if (!parsed && rawContent) {
        parsed = await _repairJSON(rawContent, { system, host, model, timeoutMs });
      }

      return { success: true, data: parsed || {}, raw: rawContent };
    } catch (err) {
      clearTimeout(tid);
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      lastError = isAbort
        ? new Error(`Vision request timed out after ${timeoutMs}ms`)
        : err;

      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms
        await new Promise((r) => setTimeout(r, (attempt + 1) * 500));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Vision request failed after retries",
  };
}

/**
 * One repair pass: asks the model to convert broken text to valid JSON.
 * Returns parsed object or null.
 */
async function _repairJSON(rawText, { system, host, model, timeoutMs }) {
  const repairPrompt = `The following text should be valid JSON. Convert it to valid JSON only, with no explanation:\n\n${rawText.slice(0, 2000)}`;
  const baseUrl = host.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: repairPrompt },
        ],
        stream: false,
        format: "json",
        options: { temperature: 0 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const json = await res.json();
    return extractJSON(json?.message?.content || "");
  } catch (_) {
    clearTimeout(tid);
    return null;
  }
}

// ── Model Capability Check ───────────────────────────────────────────────────

/**
 * checkVisionModel — Queries /api/show to determine if a model supports vision.
 *
 * A model is considered vision-capable if its families include "clip" or
 * "projector" (the typical multimodal projection layers in Ollama model cards).
 *
 * @param {string} host   Ollama host URL.
 * @param {string} model  Model name (e.g. "llava", "gemma3:4b").
 * @returns {Promise<{ok:boolean, supportsVision:boolean, message:string}>}
 */
export async function checkVisionModel(
  host = "http://localhost:11434",
  model = DEEPFAKE_CONFIG.DEFAULT_VISION_MODEL
) {
  const baseUrl = host.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404 || text.toLowerCase().includes("not found")) {
        return {
          ok: false,
          supportsVision: false,
          message: `Model "${model}" not found in Ollama. Run: ollama pull ${model}`,
        };
      }
      return {
        ok: false,
        supportsVision: false,
        message: `Ollama /api/show returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();

    // Ollama model details can be in details.families or info.families
    const families = [
      ...(Array.isArray(data?.details?.families) ? data.details.families : []),
      ...(Array.isArray(data?.info?.families) ? data.info.families : []),
    ].map((f) => (typeof f === "string" ? f.toLowerCase() : ""));

    const hasVisionKeys = Boolean(data?.projector_info) ||
      Object.keys(data?.model_info || {}).some(k => k.includes("vision") || k.includes("clip") || k.includes("projector"));

    const isKnownVision = DEEPFAKE_CONFIG.KNOWN_VISION_MODELS.some((known) =>
      model.toLowerCase().startsWith(known.toLowerCase())
    );

    const isKnownTextOnly = /^(gemma|gemma2|llama2|llama3|mistral|phi|qwen2)(:|$)/i.test(model);

    const supportsVision = (families.includes("clip") || families.includes("projector") || hasVisionKeys || isKnownVision) && !isKnownTextOnly;

    return {
      ok: true,
      supportsVision,
      message: supportsVision
        ? `Model "${model}" supports image analysis.`
        : `This model cannot analyze images. Run: ollama pull gemma3:4b`,
    };
  } catch (err) {
    clearTimeout(tid);
    const isAbort = err.name === "AbortError";
    return {
      ok: false,
      supportsVision: false,
      message: isAbort
        ? `Timeout checking model "${model}" capabilities.`
        : `Error checking model: ${err.message}`,
    };
  }
}

// ── Deepfake Health Check ────────────────────────────────────────────────────

/**
 * deepfakeHealthCheck — Composite health check for the deepfake scanner.
 *
 * Steps:
 *   1. Check Ollama daemon is reachable (via checkOllamaHealth from ollama.js).
 *   2. Check selected vision model is pulled and supports vision (via checkVisionModel).
 *
 * @param {string} host   Ollama host URL.
 * @param {string} model  Vision model to check.
 * @returns {Promise<{ok:boolean, status:string, message:string, model:string}>}
 *   status is one of: "online" | "offline" | "model_missing" | "model_no_vision"
 */
export async function deepfakeHealthCheck(
  host = "http://localhost:11434",
  model = DEEPFAKE_CONFIG.DEFAULT_VISION_MODEL,
  provider = "ollama",
  apiKey = null,
  groqModel = null,
) {
  // If provider is Groq Cloud
  if (provider === "groq") {
    const key = (apiKey || DEFAULT_GROQ_KEY).trim();
    const m = groqModel || DEFAULT_GROQ_MODEL;
    const groqHealth = await checkGroqHealth(key, m);
    return {
      ok: groqHealth.ok,
      status: groqHealth.ok ? "online" : "offline",
      provider: "groq",
      message: groqHealth.ok ? `Connected to Groq Cloud (${m})` : groqHealth.message,
      model: m,
    };
  }

  // Step 1: Basic Ollama daemon + model availability check
  const ollamaHealth = await checkOllamaHealth(host, model);

  if (!ollamaHealth.ok) {
    const isModelMissing = ollamaHealth.status === "model_missing";
    return {
      ok: false,
      status: isModelMissing ? "model_missing" : "offline",
      message: ollamaHealth.message,
      model,
    };
  }

  // Step 2: Vision capability check
  const visionCheck = await checkVisionModel(host, model);

  if (!visionCheck.ok) {
    return {
      ok: false,
      status: "model_missing",
      message: visionCheck.message,
      model,
    };
  }

  if (!visionCheck.supportsVision) {
    return {
      ok: false,
      status: "model_no_vision",
      message: visionCheck.message,
      model,
    };
  }

  return {
    ok: true,
    status: "online",
    message: `Deepfake scanner ready. ${visionCheck.message}`,
    model,
  };
}
