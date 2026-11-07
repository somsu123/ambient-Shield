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

### [2026-11-07] — Groq Cloud LLM Integration & AI Multi-Check Fact & Job Verifier
- **Groq Cloud LLM Provider (`extension/llm/providers/groq.js`):**
  - Added native Groq provider using Groq's high-speed OpenAI-compatible completions endpoint (`https://api.groq.com/openai/v1/chat/completions`).
  - Active Model: `qwen/qwen3.8-27b` (ultra-fast ~140ms latency with strict JSON formatting `response_format: { type: "json_object" }`).
  - Implemented `checkGroqHealth` and `chatGroq` with AbortController timeout, exponential backoff retries, and schema validation.
- **Unified Orchestrator & Multi-Provider Cascade (`extension/llm/index.js`, `extension/llm.js`):**
  - Upgraded `callLLM`, `checkLLMHealth`, and configuration loaders to dynamically support both Groq Cloud and local Ollama (`gemma3:4b`).
  - Seamless fallback cascade: Groq Cloud -> Local Ollama -> In-browser offscreen worker.
  - Automatic JSON extraction, code-fence stripping, and repair retry on invalid JSON outputs.
- **Deep AI Job & Hiring Post Multi-Check (`extension/scanner/job-verifier.js`):**
  - Integrated 8-point verification pipeline incorporating Check 8: `AI Multi-Check & Deep Audit`.
  - Prompts Groq with full job posting, extracted contacts, corporate domain, and live web search context.
  - Multi-angle forensic analysis:
    1. Corporate Identity & Standing (e.g., verifying Hetero Drugs Limited as a reputable pharmaceutical manufacturer).
    2. Physical Venue & Headquarters Verification (e.g., confirming 7-2-A2 Sanath Nagar Hyderabad corresponds to real corporate offices).
    3. Role & Educational Stream Plausibility (OSD Production & Packing, Warehouse with ITI/Diploma/BSc/BCom/BA/B.Tech).
    4. Contact & Recruiter Authenticity (corporate `hemanth.v@hetero.com` on established 27-year-old `hetero.com` domain vs disposable free-mail).
    5. Scam & Fraud Pattern Analysis (screening for upfront registration fees, training charges, or 'no interview' lures).
  - Synthesizes risk level (`SAFE`, `CAUTION`, `DANGER`), credibility score (up to 95%), and tailored actionable safeguards for applicants.
- **UI & Configuration Hubs (`app/settings/SettingsForm.tsx`, `extension/dashboard.*`, `extension/popup.*`, `lib/ai.ts`, `lib/extension-api.ts`):**
  - Added Groq Cloud Provider selection, API key configuration, and live connection health ping buttons.
  - Embedded AI Multi-Check results, checklist cards, and audit details directly into the dashboard and popup.
- **Testing & Verification:**
  - 33/33 unit tests passing across all suites (`npm test`).
  - Next.js static production build verified passing (`npm run build`).
  - Chrome Extension bundling script verified passing (`npm run build:ext`).

### [2026-11-07] — Frontend Rebuild: 21st.dev White and Black Professional Theme
- **Frontend-Design Skill Imported:**
  - Skill `frontend-design` from `https://github.com/Ilm-Alan/frontend-design` formally imported and integrated.
  - Direction: Swiss & Industrial Monochrome anchor with 21st.dev aesthetic tokens.
  - Surface: Pitch black `#000000` / `#09090b` / `#121215`, crisp 1px borders `rgba(255,255,255,0.08)`, and pure white `#ffffff` high-contrast action triggers.
  - Typography: Swapped to `Inter` and `JetBrains Mono` with tabular numeric data display.
  - Zero AI slop, no filler labels, authentic product nomenclature and exact parameter metrics.
- **Strict Frontend Boundary Preserved:**
  - 100% of backend, MV3 service workers, heuristics, scanner retrieval engines, and API endpoints remained untouched.
  - 100% of DOM IDs, form element names, storage keys, and event listeners strictly preserved.
- **Web Prototype Rebuilt (`app/`, `components/`):**
  - Updated `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`.
  - Rebuilt `components/ui/*`: `button.tsx` (high-contrast white CTA), `card.tsx` (top hairline inset sheen), `badge.tsx`, `input.tsx`, `textarea.tsx`, `tabs.tsx`.
  - Rebuilt `components/layout/*`: `Navbar.tsx` (monochrome status badge, green pulse, inverted CTA), `Footer.tsx`.
  - Rebuilt `components/analyze/*`: `AnalyzeTabs.tsx` (capsule segmented controls), `FactChecker.tsx` (7-point legitimacy checklist cards, substring citations), `PolicyAnalyzer.tsx`, `ImageAnalyzer.tsx`, `HistoryPanel.tsx`.
  - Rebuilt `components/shared/*`: `ResultCard.tsx`, `EmptyState.tsx`, `RateLimitBar.tsx`, `CredibilityRing.tsx`.
  - Rebuilt `app/page.tsx` (sleek hero with telemetry stats, clean features grid, pipeline steps), `app/analyze/page.tsx`, `app/settings/page.tsx`, and `SettingsForm.tsx`.
- **Extension UI Rebuilt (`extension/`):**
  - Rebuilt `popup.html`: High-contrast black & white theme, clean toggle sliders, monospace page URL chips, modal PIN dialogs.
  - Rebuilt `dashboard.html`: Obsidian workspace with segmented tool tabs, monospace telemetry, and clean verification tables.
  - Rebuilt `parental-lock.html` & `blocked.html`: High-contrast protection and anti-tamper challenge screens.
  - Rebuilt `content.css` & `content-firewall.css`: Clean black/white aura badges, scan buttons, and full-screen blocking overlay.
- **Build & Test Verification:**
  - All 30 unit tests passing (`npm test`).
  - Next.js static production build verified passing (`npm run build`).
  - Extension bundling script verified passing (`npm run build:ext`).

### [2026-11-07] — Parental Mode Renaming & Anti-Tamper Extension Removal Protection
- **Terminology Normalization:**
  - Standardized all references from "Parental / Work Mode" to simply "Parental Mode" across `extension/popup.html`, `extension/popup.js`, `extension/blocked.html`, and `extension/background.js`.
- **Anti-Tamper & Extension Removal Guard:**
  - Intercepts navigation to browser management and settings pages (`chrome://extensions*`, `chrome://settings*`, `edge://extensions*`, `edge://settings*`, `brave://extensions*`, `opera://extensions*`, `about:addons*`, `about:preferences*`) whenever Parental Mode is active.
  - Automatically redirects unauthorized access to `chrome-extension://<id>/parental-lock.html` with attempt destination tracked.
  - Developed dedicated `parental-lock.html` & `parental-lock.js` challenge page:
    - Requires Parental PIN / Password verification before granting access.
    - Features a 2-minute temporary unlock grace period (`UNLOCK_PARENTAL_TEMPORARY`) with auto-re-locking timer.
    - Provides one-click password-protected Parental Mode deactivation (`PARENTAL_MODE_OFF`).
    - Provides instant return to safe browsing.
    - Includes one-click copyable Windows Registry / Group Policy command (`ExtensionInstallForcelist`) to completely grey out and disable native right-click "Remove from Chrome" at the OS level.
- **Enhanced Popup PIN Management (`extension/popup.html`, `extension/popup.js`):**
  - Added dynamic PIN storage in `chrome.storage.local.parentalPassword` (default `"123456"`).
  - Added dedicated Change PIN modal dialog (`#modal-change-pin`) allowing parents to securely update their PIN (minimum 4 characters).
  - Added anti-tamper status indicator badge (`#parental-tamper-badge`) displaying "🛡️ Anti-Tamper: Removal & Settings Locked" when active.
  - Added password-protected Whitelist editor directly accessible from the popup.
- **Verification & Testing (`tests/parental.test.js`):**
  - Added comprehensive test suite verifying protected management URLs, active vs inactive blocking, 2-minute unlock expiry, internal page whitelisting, URL filtering, and GPO command formatting.
  - All 30 tests across 4 suites passing (`npm test`). Extension build verified clean (`npm run build:ext`).

### [2026-11-07] — Phase 0 to 8 Complete: Unified Misinformation & Job Legitimacy Scanner
- **DDG Lite HTML & RDAP Fixes:**
  - Resolved DuckDuckGo Lite attribute order regex: updated to match `class='result-link'` and direct `href` regardless of attribute order (`rel`, `class`, `href`), fixing 0-hit issue on company website, careers, and LinkedIn searches.
  - Added browser `User-Agent` header to RDAP queries to prevent HTTP 403 Forbidden on `rdap.org`, and added Verisign direct registry fallback for `.com` and `.net` domains.
  - Initialized `officialDomain` from recruiter corporate email domains (e.g. `hetero.com` from `hemanth.v@hetero.com`).
  - Refined role extraction in `classifier.js` to prioritize known concise roles (`Production & Packing`, `Warehouse`) over multiline bulleted blocks.
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
