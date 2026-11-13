// Ambient Shield — Deepfake Scanner Tests (Node.js built-in test runner)
// Run: node --test tests/deepfake.test.js
// These tests mock Ollama and frame data; no real external network calls are made.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock Chrome API ──────────────────────────────────────────────────────────
const mockStorage = {};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const res = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          if (mockStorage[k] !== undefined) res[k] = mockStorage[k];
        }
        cb(res);
      },
      set: (obj, cb) => {
        Object.assign(mockStorage, obj);
        if (cb) cb();
      },
      remove: (keys, cb) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) delete mockStorage[k];
        if (cb) cb();
      },
    },
    session: {
      get: (keys, cb) => {
        const res = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          if (mockStorage[k] !== undefined) res[k] = mockStorage[k];
        }
        cb(res);
      },
      set: (obj, cb) => {
        Object.assign(mockStorage, obj);
        if (cb) cb();
      },
      remove: (keys, cb) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) delete mockStorage[k];
        if (cb) cb();
      },
    },
  },
  runtime: {
    lastError: null,
  },
};

let aggregateFrameResults, DEEPFAKE_CONFIG;
let computeCacheKey, getCache, setCache;
let callVision, checkVisionModel, deepfakeHealthCheck;

before(async () => {
  const aggMod = await import('../extension/deepfake/aggregator.js');
  aggregateFrameResults = aggMod.aggregateFrameResults;

  const cfgMod = await import('../extension/deepfake/config.js');
  DEEPFAKE_CONFIG = cfgMod.DEEPFAKE_CONFIG;

  const cacheMod = await import('../extension/deepfake/cache.js');
  computeCacheKey = cacheMod.computeCacheKey;
  getCache = cacheMod.getCache;
  setCache = cacheMod.setCache;

  const visionMod = await import('../extension/deepfake/vision-client.js');
  callVision = visionMod.callVision;
  checkVisionModel = visionMod.checkVisionModel;
  deepfakeHealthCheck = visionMod.deepfakeHealthCheck;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Aggregation Math & Verdicts
// ─────────────────────────────────────────────────────────────────────────────

describe('Aggregation Math & Verdicts', () => {
  it('low suspicion → "Likely authentic"', () => {
    const frames = [
      { frameIndex: 0, artifacts: [], overall_suspicion: 0.1, notes: 'Natural texture' },
      { frameIndex: 1, artifacts: [], overall_suspicion: 0.15, notes: 'Consistent lighting' },
    ];
    const result = aggregateFrameResults(frames, [], 0.05, null, DEEPFAKE_CONFIG);
    assert.equal(result.label, 'Likely authentic');
    assert.ok(result.overallSuspicion <= DEEPFAKE_CONFIG.VERDICT.AUTHENTIC_MAX);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  it('high suspicion → "Possible manipulation"', () => {
    const frames = [
      { frameIndex: 0, artifacts: [{ type: 'skin_smoothing', severity: 0.9, location: 'face' }], overall_suspicion: 0.85 },
      { frameIndex: 1, artifacts: [{ type: 'edge_blending', severity: 0.8, location: 'jaw' }], overall_suspicion: 0.80 },
    ];
    const result = aggregateFrameResults(frames, [], 0.6, null, DEEPFAKE_CONFIG);
    assert.equal(result.label, 'Possible manipulation');
    assert.ok(result.overallSuspicion > DEEPFAKE_CONFIG.VERDICT.INCONCLUSIVE_MAX);
  });

  it('middle suspicion → "Inconclusive"', () => {
    const frames = [
      { frameIndex: 0, artifacts: [], overall_suspicion: 0.4 },
      { frameIndex: 1, artifacts: [{ type: 'shadow_mismatch', severity: 0.5, location: 'neck' }], overall_suspicion: 0.5 },
    ];
    const result = aggregateFrameResults(frames, [], 0.3, null, DEEPFAKE_CONFIG);
    assert.equal(result.label, 'Inconclusive');
  });

  it('never outputs a hard "DEEPFAKE" label', () => {
    const frames = Array.from({ length: 8 }, (_, i) => ({
      frameIndex: i,
      artifacts: [{ type: 'face_warp', severity: 1.0, location: 'face' }],
      overall_suspicion: 1.0,
    }));
    const result = aggregateFrameResults(frames, [], 1.0, 1.0, DEEPFAKE_CONFIG);
    assert.ok(!result.label.toUpperCase().includes('DEEPFAKE'), `Label must not contain DEEPFAKE: got "${result.label}"`);
    assert.equal(result.label, 'Possible manipulation');
  });

  it('clamps all output values to [0, 1]', () => {
    const outOfBoundsFrames = [{ frameIndex: 0, artifacts: [], overall_suspicion: 5.0 }];
    const result = aggregateFrameResults(outOfBoundsFrames, [], -2.0, 3.0, DEEPFAKE_CONFIG);
    assert.ok(result.overallSuspicion >= 0 && result.overallSuspicion <= 1);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  it('blends optional classifier score when present', () => {
    const frames = [{ frameIndex: 0, artifacts: [], overall_suspicion: 0.25 }];
    const withoutClassifier = aggregateFrameResults(frames, [], 0.1, null, DEEPFAKE_CONFIG);
    const withClassifier = aggregateFrameResults(frames, [], 0.1, 0.9, DEEPFAKE_CONFIG);
    assert.ok(withClassifier.overallSuspicion > withoutClassifier.overallSuspicion, 'Classifier should increase suspicion');
  });

  it('includes mandatory disclaimer and score breakdown', () => {
    const frames = [{ frameIndex: 0, artifacts: [], overall_suspicion: 0.2 }];
    const result = aggregateFrameResults(frames, [], 0.1, null, DEEPFAKE_CONFIG);
    assert.ok(result.disclaimer.includes('Indicative only, not forensic proof'));
    assert.ok(result.scoreBreakdown);
    assert.equal(typeof result.scoreBreakdown['LLM Artifact Suspicion'], 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cache Persistence & Invalidation
// ─────────────────────────────────────────────────────────────────────────────

describe('Deepfake Cache', () => {
  it('miss on unknown key', async () => {
    const key = computeCacheKey(['unknown_frame'], 'gemma3:4b', {});
    const val = await getCache(key);
    assert.equal(val, null);
  });

  it('hit after set', async () => {
    const key = computeCacheKey(['sample_frame_base64_data'], 'gemma3:4b', { frameCount: 8 });
    const payload = { label: 'Likely authentic', overallSuspicion: 0.12 };
    await setCache(key, payload);
    const cached = await getCache(key);
    assert.ok(cached);
    assert.equal(cached.label, 'Likely authentic');
    assert.equal(cached.overallSuspicion, 0.12);
  });

  it('different frames yield different cache keys', () => {
    const k1 = computeCacheKey(['frameA'], 'gemma3:4b', {});
    const k2 = computeCacheKey(['frameB'], 'gemma3:4b', {});
    assert.notEqual(k1, k2);
  });

  it('different models yield different cache keys', () => {
    const k1 = computeCacheKey(['sameFrame'], 'gemma3:4b', {});
    const k2 = computeCacheKey(['sameFrame'], 'gemma3:12b', {});
    assert.notEqual(k1, k2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Vision Client: Model Capability Detection (Mocked Ollama)
// ─────────────────────────────────────────────────────────────────────────────

describe('Vision Client: Model Capability Detection', () => {
  it('identifies multimodal model (clip/projector/gemma3)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('/api/show')) {
        return {
          ok: true,
          json: async () => ({
            details: { families: ['gemma3', 'clip'] },
            projector_info: { vision_dim: 1152 },
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    const res = await checkVisionModel('http://localhost:11434', 'gemma3:4b');
    assert.equal(res.ok, true);
    assert.equal(res.supportsVision, true);

    globalThis.fetch = origFetch;
  });

  it('detects text-only model and outputs remediation command', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('/api/show')) {
        return {
          ok: true,
          json: async () => ({
            details: { families: ['gemma'] },
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    const res = await checkVisionModel('http://localhost:11434', 'gemma:2b');
    assert.equal(res.supportsVision, false);
    assert.ok(res.message.includes('This model cannot analyze images'));
    assert.ok(res.message.includes('ollama pull gemma3:4b'));

    globalThis.fetch = origFetch;
  });

  it('reports offline status cleanly when Ollama daemon is unreachable', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    };

    const health = await deepfakeHealthCheck('http://localhost:11434', 'gemma3:4b');
    assert.equal(health.ok, false);
    assert.equal(health.status, 'offline');
    assert.ok(health.message.includes('Cannot connect to Ollama'));

    globalThis.fetch = origFetch;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Vision Client: JSON Parsing, Repair & Timeout
// ─────────────────────────────────────────────────────────────────────────────

describe('Vision Client: JSON Parsing & Repair', () => {
  it('parses clean JSON response', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('/api/chat')) {
        return {
          ok: true,
          json: async () => ({
            message: {
              content: JSON.stringify({
                artifacts: [{ type: 'skin_smoothing', severity: 0.4, location: 'forehead', description: 'slight blur' }],
                overall_suspicion: 0.35,
                notes: 'Minor texture smoothing observed.',
              }),
            },
          }),
        };
      }
      return { ok: false };
    };

    const res = await callVision({
      system: 'test',
      prompt: 'test',
      images: ['testbase64'],
      timeoutMs: 3000,
    });

    assert.equal(res.success, true);
    assert.equal(res.data.overall_suspicion, 0.35);
    assert.equal(res.data.artifacts.length, 1);

    globalThis.fetch = origFetch;
  });

  it('triggers one repair retry on malformed JSON', async () => {
    let callCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('/api/chat')) {
        callCount++;
        if (callCount === 1) {
          // Unstructured text returned on initial inference
          return {
            ok: true,
            json: async () => ({
              message: { content: 'I observed skin smoothing on the cheeks and abnormal light reflections.' },
            }),
          };
        }
        // Repaired JSON returned on repair retry
        return {
          ok: true,
          json: async () => ({
            message: {
              content: JSON.stringify({
                artifacts: [{ type: 'skin_smoothing', severity: 0.5, location: 'cheeks', description: 'smoothed' }],
                overall_suspicion: 0.5,
                notes: 'Repaired JSON',
              }),
            },
          }),
        };
      }
      return { ok: false };
    };

    const res = await callVision({
      system: 'test',
      prompt: 'test',
      images: ['testbase64'],
      timeoutMs: 4000,
    });

    assert.equal(res.success, true);
    assert.ok(callCount >= 2, `Expected at least 2 calls for repair retry, got ${callCount}`);
    assert.equal(res.data.notes, 'Repaired JSON');

    globalThis.fetch = origFetch;
  });

  it('returns structured timeout error without throwing', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      return new Promise((resolve, reject) => {
        const tid = setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 500);
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            clearTimeout(tid);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const res = await callVision({
      system: 'test',
      prompt: 'test',
      images: ['testbase64'],
      timeoutMs: 50, // Short timeout to trigger abort
    });

    assert.equal(res.success, false);
    assert.ok(res.error.includes('timed out'));

    globalThis.fetch = origFetch;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Evidence-only Fallback & Pluggable Classifier Stub
// ─────────────────────────────────────────────────────────────────────────────

describe('Evidence-only Fallback & Pluggable Classifier Stub', () => {
  it('evidence-only mode produces valid assessment when LLM frames unavailable', () => {
    const result = aggregateFrameResults([], [], 0.35, null, DEEPFAKE_CONFIG);
    assert.ok(['Likely authentic', 'Inconclusive', 'Possible manipulation'].includes(result.label));
    assert.ok(result.disclaimer.includes('Indicative only'));
  });

  it('classifier stub returns null when no external model is configured', async () => {
    const stubMod = await import('../extension/deepfake/classifier-stub.js');
    const score = await stubMod.classifyFrame('sample_base64');
    assert.equal(score, null);
    const health = await stubMod.checkClassifierHealth();
    assert.equal(health.ok, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Host Permissions & CORS Taint Fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('Host Permissions & CORS Taint Fallback', () => {
  it('handles invalid or restricted host gracefully', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch (host permission or CORS blocked)');
    };

    const res = await callVision({
      system: 'test',
      prompt: 'test',
      images: ['testbase64'],
      host: 'http://192.168.1.99:11434',
      timeoutMs: 1000,
    });

    assert.equal(res.success, false);
    assert.ok(res.error);

    globalThis.fetch = origFetch;
  });

  it('detects canvas SecurityError (CORS taint) and formats user guidance', () => {
    // Simulates what canvas.toDataURL throws on cross-origin tainted media
    const simulateCanvasExtraction = (isCrossOrigin) => {
      try {
        if (isCrossOrigin) {
          const err = new Error("Failed to execute 'toDataURL' on 'HTMLCanvasElement': Tainted canvases may not be exported.");
          err.name = 'SecurityError';
          throw err;
        }
        return { frame: 'base64_data' };
      } catch (err) {
        if (err.name === 'SecurityError') {
          return {
            error: 'CORS_TAINTED',
            userMessage: '⚠️ Cross-origin security restriction: cannot capture frames directly. Download the video and drag it into the drop zone.',
          };
        }
        throw err;
      }
    };

    const res = simulateCanvasExtraction(true);
    assert.equal(res.error, 'CORS_TAINTED');
    assert.ok(res.userMessage.includes('Download the video and drag it into the drop zone'));
  });
});
