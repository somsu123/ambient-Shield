// Ambient Shield — In-Browser Offscreen Fallback Stub (extension/llm/providers/offscreen-fallback.js)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkOffscreenHealth() {
  return {
    ok: false,
    status: "unavailable",
    message: "In-browser WebLLM / transformers.js offscreen worker is not bundled. Ollama is the active local engine.",
  };
}

export async function chatOffscreen() {
  return {
    success: false,
    error: "In-browser offscreen model unavailable. Please start Ollama locally.",
  };
}
