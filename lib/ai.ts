// Ambient Shield — LLM Client (lib/ai.ts)
// Supports local Ollama and Groq Cloud API for ultra-fast verification.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_HOST = process.env.NEXT_PUBLIC_OLLAMA_HOST || "http://localhost:11434";
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_OLLAMA_MODEL || "gemma3:4b";
const DEFAULT_GROQ_KEY =
  process.env.GROQ_API_KEY ||
  process.env.NEXT_PUBLIC_GROQ_API_KEY ||
  "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";
const DEFAULT_GROQ_MODEL =
  process.env.GROQ_MODEL ||
  process.env.NEXT_PUBLIC_GROQ_MODEL ||
  "qwen/qwen3.8-27b";
const TIMEOUT_MS = 45_000;

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly isNetworkError: boolean = false
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Strip markdown code fences that LLMs sometimes wrap around JSON:
 *   ```json\n{...}\n```  →  {...}
 */
export function stripCodeFences(raw: string): string {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

/**
 * Call Groq Cloud LLM and return parsed JSON.
 */
export async function callGroqLLM<T = Record<string, unknown>>(
  systemPrompt: string,
  userPrompt: string,
  options?: { apiKey?: string; model?: string; timeoutMs?: number }
): Promise<T> {
  const apiKey = (options?.apiKey || DEFAULT_GROQ_KEY).trim();
  const model = options?.model || DEFAULT_GROQ_MODEL;
  const timeout = options?.timeoutMs || 30_000;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new LLMError(`Groq HTTP error ${res.status}: ${errText || res.statusText}`, true);
    }

    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content || "";
    const cleaned = stripCodeFences(rawText);

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new LLMError(`Groq returned non-JSON output. Raw: ${rawText.slice(0, 200)}`);
    }
  } catch (err: unknown) {
    clearTimeout(tid);
    if (err instanceof LLMError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = ctrl.signal.aborted;
    throw new LLMError(isTimeout ? `Groq request timed out after ${timeout}ms` : msg, true);
  }
}

/**
 * Call local Ollama LLM and return parsed JSON.
 */
export async function callLocalLLM<T = Record<string, unknown>>(
  systemPrompt: string,
  userPrompt: string,
  options?: { host?: string; model?: string; timeoutMs?: number }
): Promise<T> {
  const host = options?.host || DEFAULT_HOST;
  const model = options?.model || DEFAULT_MODEL;
  const timeout = options?.timeoutMs || TIMEOUT_MS;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);

  try {
    const res = await fetch(`${host.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      throw new LLMError(`Ollama HTTP error ${res.status}: ${res.statusText}`, true);
    }

    const data = await res.json();
    const rawText = data?.message?.content || "";
    const cleaned = stripCodeFences(rawText);

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new LLMError(`Local LLM returned non-JSON output. Raw: ${rawText.slice(0, 200)}`);
    }
  } catch (err: unknown) {
    clearTimeout(tid);
    if (err instanceof LLMError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = ctrl.signal.aborted;
    throw new LLMError(isTimeout ? `Request timed out after ${timeout}ms` : msg, true);
  }
}

/**
 * Call local Ollama LLM with image input.
 */
export async function callLocalLLMMultimodal<T = Record<string, unknown>>(
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string,
  options?: { host?: string; model?: string; timeoutMs?: number }
): Promise<T> {
  const host = options?.host || DEFAULT_HOST;
  const model = options?.model || DEFAULT_MODEL;
  const timeout = options?.timeoutMs || TIMEOUT_MS;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);

  try {
    const images: string[] = [];
    if (imageBase64) {
      images.push(imageBase64);
    }

    const res = await fetch(`${host.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt, images },
        ],
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      throw new LLMError(`Ollama HTTP error ${res.status}: ${res.statusText}`, true);
    }

    const data = await res.json();
    const rawText = data?.message?.content || "";
    const cleaned = stripCodeFences(rawText);

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new LLMError(`Local LLM returned non-JSON output. Raw: ${rawText.slice(0, 200)}`);
    }
  } catch (err: unknown) {
    clearTimeout(tid);
    if (err instanceof LLMError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = ctrl.signal.aborted;
    throw new LLMError(isTimeout ? `Request timed out after ${timeout}ms` : msg, true);
  }
}
