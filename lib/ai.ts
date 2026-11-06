import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type GenerationConfig,
} from "@google/generative-ai";

// ── Model configuration ─────────────────────────────────────────────────────
const MODEL_NAME = "gemini-2.5-flash";
const TIMEOUT_MS = 15_000;

const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.1,
  maxOutputTokens: 400,
  // Disable thinking budget to minimize latency & token cost on free tier
  // @ts-expect-error — thinkingConfig is available at runtime but not in type defs yet
  thinkingConfig: { thinkingBudget: 0 },
};

const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// ── Internal helpers ────────────────────────────────────────────────────────

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local");
  }
  // Key is never logged — only passed to the SDK constructor
  return new GoogleGenerativeAI(key);
}

/**
 * Strip markdown code fences that Gemini sometimes wraps around JSON:
 *   ```json\n{...}\n```  →  {...}
 */
function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Single attempt at calling the Gemini API.
 * Throws if the network request fails or if the response cannot be parsed as JSON.
 */
async function attemptCall<T>(
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<T> {
  const genAI = getClient();

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: DEFAULT_GENERATION_CONFIG,
    safetySettings: SAFETY_SETTINGS,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  });

  // Check if the signal was aborted (timeout)
  if (signal.aborted) {
    throw new Error("Request timed out after 15 seconds");
  }

  const rawText = result.response.text();
  const cleaned = stripCodeFences(rawText);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Gemini returned non-JSON output. Raw response (first 200 chars): ${rawText.slice(0, 200)}`
    );
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly isNetworkError: boolean = false
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/**
 * Call Gemini and return a parsed JSON object of type T.
 *
 * Strategy:
 *  1. Try the request with a 15-second AbortController timeout.
 *  2. On a network-level error only, retry once.
 *  3. Parsing failures, safety blocks, and invalid keys are NOT retried.
 *
 * @param systemPrompt  Instruction prompt (persona + output format)
 * @param userPrompt    The user's actual input
 */
export async function callGemini<T = Record<string, unknown>>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await attemptCall<T>(systemPrompt, userPrompt, controller.signal);
      clearTimeout(timeoutId);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      const isNetwork =
        error.message.includes("fetch") ||
        error.message.includes("network") ||
        error.message.includes("ECONNRESET") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("timed out");

      // Only retry on network errors, and only once (attempt 0 → attempt 1)
      if (isNetwork && attempt === 0) {
        // Brief back-off before retry
        await new Promise((r) => setTimeout(r, 1_000));
        continue;
      }

      // Non-network error or second attempt — give up
      clearTimeout(timeoutId);
      throw new GeminiError(error.message, isNetwork);
    }
  }

  clearTimeout(timeoutId);
  throw new GeminiError(lastError?.message ?? "Unknown error", true);
}

// ── Multimodal (Phase 3 image scanning) ─────────────────────────────────────

export interface ImagePart {
  mimeType: string;   // e.g. "image/jpeg"
  data: string;       // base64-encoded image bytes
}

/**
 * Send image bytes + text prompt to Gemini vision.
 * Used only when text-only Phase 2 confidence < 0.85 (< ~30% of requests).
 * Same 15-second timeout + 1 network retry as callGemini.
 */
export async function callGeminiMultimodal<T = Record<string, unknown>>(
  systemPrompt: string,
  textPrompt: string,
  image: ImagePart
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const genAI = getClient();
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: DEFAULT_GENERATION_CONFIG,
        safetySettings: SAFETY_SETTINGS,
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: image.mimeType, data: image.data } },
              { text: textPrompt },
            ],
          },
        ],
      });

      if (controller.signal.aborted) {
        throw new Error("Request timed out after 15 seconds");
      }

      const rawText = result.response.text();
      const cleaned = stripCodeFences(rawText);

      try {
        clearTimeout(timeoutId);
        return JSON.parse(cleaned) as T;
      } catch {
        throw new Error(
          `Gemini returned non-JSON output. Raw (first 200): ${rawText.slice(0, 200)}`
        );
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      const isNetwork =
        error.message.includes("fetch") ||
        error.message.includes("network") ||
        error.message.includes("ECONNRESET") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("timed out");

      if (isNetwork && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1_000));
        continue;
      }

      clearTimeout(timeoutId);
      throw new GeminiError(error.message, isNetwork);
    }
  }

  clearTimeout(timeoutId);
  throw new GeminiError(lastError?.message ?? "Unknown error", true);
}
