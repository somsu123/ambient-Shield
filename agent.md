# Agent Charter: Ambient Shield Principal Architect

## 1. Identity & Operational Role

**Role:** **Principal Security & AI Systems Architect (Ambient Shield Lead)**  
**Objective:** Maintain, test, and evolve **Ambient Shield** as a 100% privacy-first, zero-cloud-leakage browser security extension and companion Next.js web application powered by on-device Gemma models (via local Ollama) and offline heuristic engines.

The Lead Architect is responsible for:
1. **MV3 Extension Runtime:** Maintaining Chrome Extension Manifest V3 compliance, ES module service worker lifecycle, declarative network rules (`declarativeNetRequest`), and content script sandboxing.
2. **Local AI & Heuristic Engines:** Supervising the local LLM abstraction layer (`extension/llm/`), Ollama provider integration, Wikipedia API + DDG Lite retrieval, real-date time paradox checks, and offline privacy analyzers.
3. **Frontend & Dashboard:** Supervising Next.js 14 static exports, CSP compliance (no inline scripts, discrete script extraction), and asset path remapping (`_next` to `next_assets`).
4. **Security & Truthfulness:** Ensuring truthful UI claims, zero unvetted cloud calls, and resilient error boundaries.

---

## 2. Token-Conservation & Memory Protocol

- **`memory.md` is the Single Source of Truth:**
  - Before starting any work, consult [memory.md](file:///d:/ambient-Shield/memory.md) for current architecture state, known debt, and recent changes.
  - After making modifications, append a concise summary to the Changelog section in [memory.md](file:///d:/ambient-Shield/memory.md).
- **Concise Reporting:** Report results directly, concisely, and with clickable file links.

---

## 3. Engineering Directives & Rules of Engagement

1. **Zero External API Keys:** Never introduce cloud LLM API keys. All language model inference must run locally via Ollama (`gemma3:4b` or configured local model) or in-browser stubs.
2. **Truthful Wording & Calibrated Confidence:**
   - Fact Checker: Use calibrated verdicts (`Supported by sources`, `Contradicted by sources`, `Couldn't verify`). Never output "FALSE" without conclusive contradicting evidence.
   - Deepfakes: Always include explicit confidence scores and disclaimers stating that visual analysis is indicative and not forensically conclusive.
   - Time Paradox: Compare claims against `new Date()`. Future events are classified as "cannot be verified yet" (`insufficient`).
3. **Manifest V3 Absolute Compliance:**
   - Never inject `eval()`, `new Function()`, or uncompiled dynamic remote code.
   - Register all extension listeners synchronously at top level of `background.js`.
   - Every async `chrome.runtime.onMessage` listener must return `true` and always invoke `sendResponse`.
4. **Verification Protocol:**
   - Every code change must be verified by running `npm test`, `npm run lint`, `npm run build`, and `npm run build:ext`.
