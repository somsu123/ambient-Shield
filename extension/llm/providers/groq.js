// Ambient Shield — Groq Cloud LLM Provider (extension/llm/providers/groq.js)
// Ultra-fast cloud inference for Fact & Job Verification
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_KEY = "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";
export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

/**
 * Health check: Validates that the Groq API key is valid and responsive.
 */
export async function checkGroqHealth(apiKey = DEFAULT_GROQ_KEY, model = DEFAULT_GROQ_MODEL) {
  const key = (apiKey || DEFAULT_GROQ_KEY).trim();
  if (!key) {
    return {
      ok: false,
      status: "missing_key",
      message: "Groq API key not provided.",
    };
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        status: "auth_failed",
        message: `Groq authentication error (HTTP ${res.status}): ${errText || res.statusText}`,
      };
    }

    const data = await res.json();
    const models = (data.data || []).map((m) => m.id);
    const hasModel = models.includes(model);

    return {
      ok: true,
      status: "ready",
      model,
      models,
      message: `Groq Cloud LLM ready (${model})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "network_error",
      message: `Cannot reach Groq API: ${err?.message || "Network error"}`,
    };
  }
}

/**
 * Chat request to Groq with timeout, retry backoff, and JSON format enforcement.
 */
export async function chatGroq({
  apiKey = DEFAULT_GROQ_KEY,
  model = DEFAULT_GROQ_MODEL,
  system = "",
  prompt = "",
  timeoutMs = 30000,
  maxRetries = 2,
}) {
  const key = (apiKey || DEFAULT_GROQ_KEY).trim();
  if (!key) {
    return { success: false, error: "Groq API key is missing." };
  }

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });

  const payload = {
    model: model || DEFAULT_GROQ_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
  };

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(DEFAULT_GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `Groq HTTP ${res.status}: ${res.statusText}`;
        throw new Error(errMsg);
      }

      const json = await res.json();
      const raw = json?.choices?.[0]?.message?.content || "";
      return {
        success: true,
        raw,
        provider: "groq",
      };
    } catch (err) {
      clearTimeout(tid);
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      lastError = isAbort ? new Error(`Groq request timed out after ${timeoutMs}ms`) : err;

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 800));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Groq inference request failed",
    provider: "groq",
  };
}

