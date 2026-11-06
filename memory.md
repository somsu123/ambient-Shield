# Ambient Shield: Memory & State Ledger

> **Purpose:** Persistent, token-efficient system memory for Ambient Shield.  
> **Rule for Agents:** Consult this file at the start of tasks. When code changes or new features are implemented, update the **Changelog** and **Feature Status** sections below using concise bullet points to avoid token bloat.

---

## 1. System Metadata & Health

- **Repository:** `ambient-Shield` (Branch: `main`)
- **Primary Tech Stack:** Next.js 14 (App Router, Static Export), React 18, TypeScript 5, Tailwind CSS, Chrome Extensions MV3.
- **AI Integrations:** Google Generative AI (`gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-1.5-flash-8b` cascade).
- **Offline / Local Engines:** DuckDuckGo Lite & Wikipedia API scraper (Fact Checker), regex/keyword heuristic engine (Policy Analyzer).
- **Build Status:** Verified working (`build-extension.ps1` transforms `_next` to `next_assets`, extracts inline scripts, handles routing fixes).

---

## 2. Codebase Inventory & Map

| Path | Purpose & Responsibilities |
|---|---|
| `extension/manifest.json` | Manifest V3 specification, permissions, declarativeNetRequest rules, CSP definitions. |
| `extension/background.js` | Service Worker: Handles all IPC messages (`TRUST_AURA`, `SCAN_POLICY`, `SCAN_FACT`, `SCAN_IMAGE`), Gemini multi-model cascade, tab URL blocking, LRU cache. |
| `extension/content.js` | DOM feed monitor for LinkedIn, Facebook, X, Reddit, Instagram; injects colored Trust Aura indicator cards. |
| `extension/content-firewall.js` | Content security firewall DOM script; mounts full-screen block overlay on adult/restricted domains. |
| `extension/block-rules.json` | DeclarativeNetRequest network filtering rules blocking known adult domains at the network level. |
| `app/page.tsx` | Dashboard landing view and quick navigation. |
| `app/analyze/page.tsx` | Comprehensive analysis hub hosting Fact Checker, Policy Analyzer, Image Analyzer, and History tabs. |
| `app/settings/page.tsx` | Configuration page for parental controls, API keys, and notification toggles. |
| `components/analyze/` | Sub-components (`FactChecker.tsx`, `PolicyAnalyzer.tsx`, `ImageAnalyzer.tsx`, `HistoryPanel.tsx`). |
| `lib/ai.ts` | Server/client SDK integration for `@google/generative-ai` with JSON schema enforcement. |
| `lib/extension-api.ts` | IPC bridge converting UI actions into `chrome.runtime.sendMessage` or web fallbacks. |
| `build-extension.ps1` | PowerShell build script automating Next.js static export → Chrome extension directory sync. |

---

## 3. Feature Matrix & Implementation Status

| Feature | Status | Implementation Details |
|---|---|---|
| **Trust Aura** | ✅ Complete | Injects ambient borders & badges on social feeds; verified against simulated feed DOMs. |
| **Entity-Aware Fact Checker** | ✅ Complete | Wikipedia API search & intro fetch; entity cross-validation; zero Gemini API cost offline mode. |
| **Privacy Policy Analyzer** | ✅ Complete | 100% offline regex & heuristic keyword scoring + fallback Gemini deep summary. |
| **Image & Deepfake Detector** | ✅ Complete | Base64 image payload handling, image resizing to 2048px, multi-model fallback cascade. |
| **Triple-Layer Firewall** | ✅ Complete | Layer 1: DeclarativeNetRequest; Layer 2: DOM-level overlay; Layer 3: Tab navigation monitor. |
| **Parental Mode Lock** | ✅ Complete | PIN-protected parental mode toggling in extension background state. |
| **Next.js Extension Sync** | ✅ Complete | Static HTML export with inline script extraction complying with MV3 CSP. |

---

## 4. Known Technical Debt & Security Observations

1. **API Key Storage:** `background.js` has a default fallback API key. It should seamlessly prioritize `chrome.storage.local` user-supplied keys and only fall back if allowed.
2. **Tab URL Change Detection:** `chrome.tabs.onUpdated` in `background.js` catches URL navigation, but SPA pushState navigations on some web apps might bypass Layer 3 without content script monitoring.
3. **Cache Invalidation:** LRU cache in `background.js` is memory-only (resets on service worker unload); consider persisting critical lookups in `chrome.storage.local`.
4. **Error Boundaries:** Next.js dashboard UI can benefit from finer error boundaries around tab renders when offline.

---

## 5. Changelog & Modifications Ledger

### [2026-11-07] — Initial Setup & System Alignment
- **Architecture Role Defined:** Principal Security & AI Systems Architect set as operational lead in [agent.md](file:///d:/ambient-Shield/agent.md).
- **Memory Ledger Created:** Initialized [memory.md](file:///d:/ambient-Shield/memory.md) as the persistent state repository for all future updates.
- **Codebase Audited:** Verified MV3 manifest, background service worker, Next.js 14 static build pipeline, and extension bridging utilities.

---

## 6. Future Updates & Roadmap Backlog

- [ ] **P1:** Enhance `chrome.storage.local` persistence for analysis history across service worker idle recycles.
- [ ] **P2:** Add unit/integration tests for entity-matching logic in Fact Checker (`extension/background.js`).
- [ ] **P3:** Refine SPA navigation listeners in `content-firewall.js` using History API monkey-patching.
- [ ] **P4:** Add export capability (JSON/CSV) for audit logs in `HistoryPanel.tsx`.

