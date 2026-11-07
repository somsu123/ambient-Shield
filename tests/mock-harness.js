// Ambient Shield — Test Mock Harness (tests/mock-harness.js)
// Enables full offline test execution without requiring a live Ollama daemon.
// ─────────────────────────────────────────────────────────────────────────────

export function createMockFetch(handlers = {}) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function mockFetch(url, options = {}) {
    const urlStr = String(url);

    // Custom route overrides
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (urlStr.includes(pattern)) {
        return handler(urlStr, options);
      }
    }

    // Default Ollama chat mock
    if (urlStr.includes("/api/chat")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "gemma3:4b",
          message: {
            role: "assistant",
            content: JSON.stringify({
              verdict: "supported",
              confidence: 0.95,
              reasoning: "The retrieved Wikipedia article explicitly confirms this claim.",
              citations: [
                {
                  url: "https://en.wikipedia.org/wiki/Test_Topic",
                  quote: "verified fact in text",
                },
              ],
            }),
          },
        }),
        text: async () => "",
      };
    }

    // Default Ollama tags mock
    if (urlStr.includes("/api/tags")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [{ name: "gemma3:4b" }, { name: "gemma2:2b" }],
        }),
      };
    }

    // Default Groq chat mock
    if (urlStr.includes("api.groq.com") && urlStr.includes("/chat/completions")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: "supported",
                  confidence: 0.95,
                  reasoning: "The retrieved evidence explicitly confirms this claim.",
                  citations: [
                    {
                      url: "https://en.wikipedia.org/wiki/Test_Topic",
                      quote: "verified fact in text",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        text: async () => "",
      };
    }

    // Default Groq models mock
    if (urlStr.includes("api.groq.com") && urlStr.includes("/models")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: "qwen/qwen3.8-27b" }, { id: "openai/gpt-oss-120b" }],
        }),
      };
    }

    return {
      ok: false,
      status: 404,
      text: async () => "Not Found in Mock",
      json: async () => ({ error: "Not Found" }),
    };
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}
