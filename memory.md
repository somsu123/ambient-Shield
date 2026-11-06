# Ambient Shield: Memory & State Ledger

> **Purpose:** Persistent, token-efficient system memory for Ambient Shield.  
> **Rule for Agents:** Consult this file at the start of tasks. When code changes or new features are implemented, update the **Changelog** and **Feature Status** sections below using concise bullet points to avoid token bloat.

---

## 1. System Metadata & Health

- **Repository:** `ambient-Shield` (Branch: `main`)
- **Primary Tech Stack:** Next.js 14 (App Router, Static Export), React 18, TypeScript 5, Tailwind CSS, Chrome Extensions MV3.
- **AI Integrations:** 100% Local Inference via Ollama (`gemma3:4b` default, `gemma2:2b` lightweight fallback). ZERO cloud API keys required.
- **Local & Offline Engines:** Offline Regex & Heuristic Policy Analyzer (100% offline), Wikipedia API + DuckDuckGo Lite retrieval pipeline (Fact Checker), Real-Date Time Paradox Detector, Verifiable Citation Substring Matcher.
- **Testing:** Node.js native test runner (`node --test tests/*.test.js`) — 13 tests passing across provider fallback, JSON repair, timeouts, caching, and heuristics.
- **Build Status:** Verified passing (`npm run lint`, `npm run build`, `npm run build:ext`).

---

## 2. Codebase Inventory & Map

| Path | Purpose & Responsibilities |
|---|---|
| `extension/manifest.json` | Manifest V3 specification with `type: module` service worker, DNR rules, `http://localhost:11434/*` host permissions. |
| `extension/background.js` | Service Worker: Handles all IPC messages (`TRUST_AURA`, `SCAN_POLICY`, `SCAN_FACT`, `SCAN_IMAGE`, `LLM_GENERATE`, `CHECK_LLM_HEALTH`), synchronous listeners, state persistence. |
| `extension/llm/` | Provider abstraction: `index.js`, `cache.js` (persistent LRU), `repair.js` (JSON cleanup & validation), `prompts.js`, `providers/ollama.js`, `providers/offscreen-fallback.js`. |
| `extension/heuristics.js` | Time paradox check (`new Date()`), citation verification, image forensic heuristics, and offline policy analyzer. |
| `extension/messages.js` | Centralized message actions and boundary payload validation. |
| `extension/logger.js` | Structured logger with stage tagging and toggleable debug mode. |
| `extension/content.js` | DOM feed monitor with `IntersectionObserver` viewport triggering, concurrency limit (2), dedupe cache, and neutral fallback. |
| `extension/content-firewall.js` | Content security firewall DOM script; mounts full-screen block overlay on adult/restricted domains. |
| `extension/block-rules.json` | DeclarativeNetRequest network filtering rules blocking known adult domains at the browser network layer. |
| `app/page.tsx` | Dashboard landing view and quick navigation. |
| `app/analyze/page.tsx` | Comprehensive analysis hub hosting Fact Checker, Policy Analyzer, Image Analyzer, and History tabs. |
| `app/settings/SettingsForm.tsx` | Configuration page for local Ollama host, model name, timeout, local-only mode, and live connection health check. |
| `lib/ai.ts` | Local Ollama client (`callLocalLLM` and `callLocalLLMMultimodal`) with zero cloud dependencies. |
| `lib/extension-api.ts` | Unified IPC bridge converting UI actions into extension messages or direct local Ollama web fallback. |
| `tests/` | Mock-harness and unit test suite covering providers, repair, caching, and heuristics. |

---

## 3. Feature Matrix & Implementation Status

| Feature | Status | Implementation Details |
|---|---|---|
| **Local LLM Engine** | ✅ Complete | Local Ollama abstraction supporting Gemma models with retry, timeout, JSON repair, and LRU cache. |
| **Trust Aura** | ✅ Complete | Viewport-aware via `IntersectionObserver`, concurrency throttled (2), dedupe cache, graceful grey/neutral fallback when offline. |
| **Fact Checker** | ✅ Complete | Wikipedia API + DDG Lite retrieval; LLM evidence judging; verifiable citation substrings; real-date time paradox check. |
| **Privacy Policy Analyzer** | ✅ Complete | 100% offline regex & heuristic keyword scoring + optional local Gemma synthesis. |
| **Image & Deepfake Detector** | ✅ Complete | Local file/URL heuristics + Gemma multimodal inspection with explicit non-conclusive disclaimers. |
| **Content Firewall** | ✅ Complete | DeclarativeNetRequest network rules + DOM overlay; truthful non-DNS claims. |
| **MV3 Service Worker Hardening** | ✅ Complete | Synchronously registered listeners, persistent storage rehydration on SW wake-up, guaranteed `sendResponse`. |

---

## 4. Known Technical Debt & Security Observations

1. **In-Browser Fallback:** `offscreen-fallback.js` is currently a clean stub. If full zero-install in-browser LLM is desired in the future, transformers.js ONNX runtime can be mounted in an offscreen document.
2. **CORS on Ollama:** Ollama requires launching with `OLLAMA_ORIGINS="chrome-extension://*"` to allow requests from the extension background origin. Documented clearly in README and Settings.

---

## 5. Changelog & Modifications Ledger

### [2026-11-07] — Phase 0 to 5 Complete: Full Refactoring & Truthfulness Realized
- **Zero API Keys & Zero Gemini:** Completely removed `@google/generative-ai`, Gemini API keys, and hardcoded keys across the codebase.
- **Provider Abstraction:** Implemented `extension/llm/` with Ollama as primary local provider (`gemma3:4b`), persistent LRU caching, JSON extraction, and repair retries.
- **Fact Checker Fixed:** Swapped hardcoded political regexes for Wikipedia API & DDG Lite retrieval + LLM evidence judging with strict JSON schema. Verified citation substring matching and real-date time paradox logic.
- **Trust Aura Viewport-Aware:** Added `IntersectionObserver` triggering, concurrency limiter (2), dedupe cache, and neutral grey aura for offline states.
- **Deepfake Honest Scans:** Shifted claims from "conclusive deepfake detection" to heuristic metadata analysis + indicative local vision model with explicit disclaimers.
- **MV3 Reliability:** Enforced synchronous listener registrations, persisted service worker state in `chrome.storage.local`, validated message boundaries.
- **Test Suite:** Built unit test suite with 13 tests running on native Node test runner (`node --test`).
- **Docs Rewritten:** Rewrote `README.md` to reflect true local AI architecture, explicit Ollama setup for Windows/macOS/Linux, and transparent privacy disclosures.
