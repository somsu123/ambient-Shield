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
| **Local LLM Engine** | ✅ Complete | Local Ollama abstraction (`extension/llm.js`) supporting Gemma models with retry, timeout, JSON repair, and persistent LRU cache. |
| **Unified Scanner** | ✅ Complete | Auto-detects Job Notices vs News Claims; multi-source retrieval (DDG Lite, Wikipedia API, Google News RSS); 7 Job Legitimacy checks (RDAP domain age, free-mail, shorteners, scam searches, fees); Gemma evidence judging; verifiable citation substrings; real-date time paradox check. |
| **Trust Aura** | ✅ Complete | Viewport-aware via `IntersectionObserver`, concurrency throttled (2), dedupe cache, graceful grey/neutral fallback when offline. |
| **Privacy Policy Analyzer** | ✅ Complete | 100% offline regex & heuristic keyword scoring + optional local Gemma synthesis. |
| **Image & Deepfake Detector** | ✅ Complete | Local file/URL heuristics + Gemma multimodal inspection with explicit non-conclusive disclaimers. |
| **Content Firewall** | ✅ Complete | DeclarativeNetRequest network rules + DOM overlay; truthful non-DNS claims. |
| **MV3 Service Worker Hardening** | ✅ Complete | Synchronously registered listeners, persistent storage rehydration on SW wake-up, keep-alive ping during fetch, session storage survivability, guaranteed `sendResponse`. |

---

## 4. Known Technical Debt & Security Observations

1. **In-Browser Fallback:** `offscreen-fallback.js` is currently a clean stub. If full zero-install in-browser LLM is desired in the future, transformers.js ONNX runtime can be mounted in an offscreen document.
2. **CORS on Ollama:** Ollama requires launching with `OLLAMA_ORIGINS="chrome-extension://*"` to allow requests from the extension background origin. Documented clearly in README and Settings.
3. **RDAP Rate Limits:** Free RDAP at `https://rdap.org` might occasionally rate-limit under heavy usage; handled gracefully with fallback status `unknown`.

---

## 5. Changelog & Modifications Ledger

### [2026-11-07] — Phase 0 to 8 Complete: Unified Misinformation & Job Legitimacy Scanner
- **Unified Scanner Core (`extension/scanner/`):**
  - Built `classifier.js`: Fast rule-based classifier detecting hiring signals (`hiring`, `internship`, `walk-in`, `freshers`, `stipend`, `vacancy`, `recruitment`, `CTC`, `registration fee`) and structured entity extractor for company, roles, locations, contacts, and fees.
  - Built `text-extractor.js`: Service worker-safe DOM-less HTML stripper and passage ranker capping output to ~3,000 characters of top passages.
  - Built `retrieval.js`: Keyless multi-source search provider (DuckDuckGo Lite, Wikipedia API, Google News RSS) with domain authority scoring and parallel page fetching (limit 3, 8s timeout).
  - Built `job-verifier.js`: 7 critical legitimacy checks (Company existence, Careers portal listing, LinkedIn presence, Contact validity [flagging @gmail, bit.ly, WhatsApp-only], Domain age via RDAP [< 6 months], Scam & fraud complaint search, Fee checks) with Pass/Risk/Unverified checklist and actionable advice.
  - Built `judge.js`: Sends only retrieved passages to local Gemma; strictly drops hallucinated citations (exact substring verification); real-date time paradox check (`new Date()`); evidence-only mode when Ollama is offline.
  - Built `index.js`: Orchestrator with stage logging and local history persistence (capped at 50, deduplicated).
- **Dashboard & UI Enhancements (`extension/dashboard.html`, `extension/dashboard.js`, `components/analyze/FactChecker.tsx`):**
  - Added real-time progress steps (`Classify -> Search -> Read Sources -> Judge`).
  - Added type badges (`Detected: Job Posting` vs `Detected: News / Claim`).
  - Rendered 7-item Job Verification Checklist with Pass/Risk/Unverified badges and actionable advice.
  - Rendered Verbatim Citations with highlighted quotes and source links.
  - Added Collapsible Advanced Settings for Ollama Model (`gemma3:4b`), Host (`http://localhost:11434`), and local storage persistence.
  - Expanded input character limits from 200 to 5,000 to accommodate full job descriptions.
  - Added Raw JSON viewer toggle and explicit privacy/disclaimer notes.
- **Context Menu & Shortcuts:**
  - Added context menu `"🛡️ Ambient Shield: Check this text"` and keyboard shortcut `Alt+Shift+C` (`MacCtrl+Shift+C` on macOS).
  - Passes selected text via `chrome.storage.session` and `chrome.storage.local` with `autorun: true` to prevent URL truncation or leaks.
- **MV3 Worker Survivability:** Added interval keep-alive during multi-step page fetch and persisted active scan state in `chrome.storage.session`.
- **Testing:** 21/21 tests passing across 4 test suites (`npm test`). Builds verified passing (`npm run lint`, `npm run build`, `npm run build:ext`).
