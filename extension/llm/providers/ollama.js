// Ambient Shield — Ollama Local Provider (extension/llm/providers/ollama.js)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma3:4b";

/**
 * Health check: Tests if Ollama daemon is reachable and whether the target model is pulled.
 */
export async function checkOllamaHealth(host = DEFAULT_OLLAMA_HOST, model = DEFAULT_OLLAMA_MODEL) {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${host.replace(/\/+$/, "")}/api/tags`, {
      method: "GET",
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      return {
        ok: false,
        status: "offline",
        message: `Ollama returned HTTP ${res.status}. Ensure server is running.`,
      };
    }

    const data = await res.json();
    const models = (data.models || []).map(m => m.name || m.model);
    const modelFound = models.some(m => m === model || m.startsWith(`${model}:`) || m.startsWith(model));

    if (!modelFound) {
      return {
        ok: false,
        status: "model_missing",
        models,
        message: `Model "${model}" not found in Ollama. Run: ollama pull ${model}`,
      };
    }

    return {
      ok: true,
      status: "ready",
      models,
      message: `Ollama ready with ${model}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "offline",
      message: `Cannot connect to Ollama at ${host}. Start Ollama and verify OLLAMA_ORIGINS allows extensions.`,
    };
  }
}

/**
 * Chat request to Ollama with timeout and retry with exponential backoff.
 */
export async function chatOllama({
  host = DEFAULT_OLLAMA_HOST,
  model = DEFAULT_OLLAMA_MODEL,
  system = "",
  prompt = "",
  images = [],
  timeoutMs = 45000,
  maxRetries = 1,
}) {
  const url = `${host.replace(/\/+$/, "")}/api/chat`;

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }

  const userMsg = { role: "user", content: prompt };
  if (Array.isArray(images) && images.length > 0) {
    userMsg.images = images;
  }
  messages.push(userMsg);

  const payload = {
    model,
    messages,
    stream: false,
    format: "json",
    options: {
      temperature: 0.1,
    },
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

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}: ${text || res.statusText}`);
      }

      const json = await res.json();
      const content = json?.message?.content || "";
      return { success: true, raw: content, model: json?.model || model };
    } catch (err) {
      clearTimeout(tid);
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      lastError = isAbort ? new Error(`Ollama request timed out after ${timeoutMs}ms`) : err;

      if (attempt < maxRetries) {
        // Exponential backoff wait (e.g. 500ms)
        await new Promise(r => setTimeout(r, (attempt + 1) * 500));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Ollama request failed",
  };
}
