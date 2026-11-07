// Ambient Shield — LLM Orchestrator Unit Tests (tests/llm.test.js)
// ─────────────────────────────────────────────────────────────────────────────

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callLLM, checkLLMHealth } from "../extension/llm/index.js";
import { clearCache } from "../extension/llm/cache.js";
import { createMockFetch } from "./mock-harness.js";

describe("LLM Provider Abstraction & Orchestrator", () => {
  let restoreFetch;

  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
  });

  test("1. Health Check: verifies Ollama running and model availability", async () => {
    restoreFetch = createMockFetch({
      "/api/tags": async () => ({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: "gemma3:4b" }] }),
      }),
    });

    const health = await checkLLMHealth();
    assert.equal(health.ready, true);
    assert.equal(health.providers.ollama.status, "ready");
    assert.match(health.guidance, /Connected to Ollama/);
  });

  test("2. Cache Hit: returns cached value on second identical call", async () => {
    let callCount = 0;
    restoreFetch = createMockFetch({
      "/api/chat": async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              content: JSON.stringify({
                level: "safe",
                confidence: 0.9,
                reason: "Authentic announcement",
              }),
            },
          }),
        };
      },
    });

    // Call 1: Miss
    const res1 = await callLLM({
      task: "TRUST_AURA",
      prompt: "Identical post text content",
    });
    assert.equal(res1.success, true);
    assert.equal(res1.cached, false);
    assert.equal(callCount, 1);

    // Call 2: Hit
    const res2 = await callLLM({
      task: "TRUST_AURA",
      prompt: "Identical post text content",
    });
    assert.equal(res2.success, true);
    assert.equal(res2.cached, true);
    assert.equal(res2.provider, "cache");
    assert.equal(callCount, 1); // No second network call made
  });

  test("3. Invalid JSON Repair: strips markdown code fences and repairs malformed output", async () => {
    let attempts = 0;
    restoreFetch = createMockFetch({
      "/api/chat": async () => {
        attempts++;
        if (attempts === 1) {
          // LLM returns markdown fenced JSON with extra text
          return {
            ok: true,
            status: 200,
            json: async () => ({
              message: {
                content: "Here is the JSON evaluation:\n```json\n{\"level\":\"caution\",\"confidence\":0.7,\"reason\":\"Check source\"}\n```\nHope that helps!",
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: { content: "{\"level\":\"caution\",\"confidence\":0.7,\"reason\":\"Check source\"}" },
          }),
        };
      },
    });

    const res = await callLLM({
      task: "TRUST_AURA",
      prompt: "Sensationalist post text",
    });

    assert.equal(res.success, true);
    assert.equal(res.data.level, "caution");
    assert.equal(res.data.confidence, 0.7);
  });

  test("4. Timeout Handling: gracefully aborts and returns typed error result (never throws)", async () => {
    restoreFetch = createMockFetch({
      "/api/chat": async (_url, options) => {
        // Wait until AbortSignal fires
        await new Promise((resolve) => {
          if (options.signal) {
            options.signal.addEventListener("abort", resolve);
          }
        });
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      },
    });

    const res = await callLLM({
      task: "GENERIC",
      prompt: "Long processing query",
      options: { timeoutMs: 50 },
    });

    assert.equal(res.success, false);
    assert.match(res.error, /timed out|aborted/i);
  });

  test("5. Provider Fallback: when Ollama is offline, attempts fallback and returns typed failure", async () => {
    restoreFetch = createMockFetch({
      "/api/chat": async () => {
        throw new Error("Failed to connect to localhost:11434");
      },
    });

    const res = await callLLM({
      task: "TRUST_AURA",
      prompt: "Query when server is down",
      options: { timeoutMs: 100 },
    });

    assert.equal(res.success, false);
    assert.match(res.error, /failed to connect|failed across providers|unavailable/i);
  });

  test("6. Groq Provider: health check verifies Groq API connection and models", async () => {
    restoreFetch = createMockFetch({
      "api.groq.com/openai/v1/models": async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: "qwen/qwen3.8-27b" }, { id: "openai/gpt-oss-120b" }],
        }),
      }),
    });

    const { checkGroqHealth } = await import("../extension/llm/providers/groq.js");
    const health = await checkGroqHealth("gsk_mock_test_key", "qwen/qwen3.8-27b");
    assert.equal(health.ok, true);
    assert.equal(health.status, "ready");
    assert.equal(health.model, "qwen/qwen3.8-27b");
  });

  test("7. Groq Provider: executes chat request and returns structured data", async () => {
    restoreFetch = createMockFetch({
      "api.groq.com/openai/v1/chat/completions": async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  level: "safe",
                  confidence: 0.98,
                  reason: "Verified corporate announcement",
                }),
              },
            },
          ],
        }),
      }),
    });

    const res = await callLLM({
      task: "TRUST_AURA",
      prompt: "Authentic company notice",
      options: {
        provider: "groq",
        groqApiKey: "gsk_mock_test_key",
        groqModel: "qwen/qwen3.8-27b",
      },
    });

    assert.equal(res.success, true);
    assert.equal(res.provider, "groq");
    assert.equal(res.data.level, "safe");
    assert.equal(res.data.confidence, 0.98);
  });
});
