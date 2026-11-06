// Ambient Shield — Local LLM Client (lib/ai.ts)
// Local provider client (Ollama/Gemma). Zero external API keys.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_HOST = process.env.NEXT_PUBLIC_OLLAMA_HOST || "http://localhost:11434";
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_OLLAMA_MODEL || "gemma3:4b";
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
