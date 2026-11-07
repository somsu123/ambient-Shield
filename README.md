<div align="center">

<img src="extension/icon128.svg" width="120" alt="Ambient Shield Logo"/>

# 🛡️ Ambient Shield

### *Your Quiet Digital Protector — 100% Local AI & Private Edge Security*

**An AI-powered Chrome Extension and web dashboard that shields you from misinformation, predatory privacy policies, and digital manipulation — powered by local Gemma models running on-device with zero cloud AI API keys.**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)](https://github.com/somsu123/ambient-Shield)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![100% Local AI](https://img.shields.io/badge/Inference-Local_Ollama_Gemma-blueviolet)](https://ollama.com)
[![Zero Cloud API Keys](https://img.shields.io/badge/API_Keys-Zero_Required-success)](https://github.com/somsu123/ambient-Shield)

---

[Features](#-features) • [Local AI Setup](#-local-ai-setup-ollama) • [Architecture](#-architecture) • [Privacy & Data Transparency](#-privacy--data-transparency) • [Installation & Build](#-installation--build) • [Testing](#-testing--verification)

</div>

---

## 🌟 The Mission

Every day, internet users encounter:
- 📰 **Unverified claims & misinformation** designed to deceive or trigger outrage
- 🎭 **Manipulated and synthetic imagery** with no context or confidence indicators
- 🔒 **Predatory privacy policies** filled with complex legal jargon hiding tracking and data-selling clauses
- 📢 **Deceptive sponsored ads** blending into legitimate social feeds

**Ambient Shield** provides subtle, non-intrusive ambient awareness directly in the browser. It prioritizes user privacy above all: **no cloud API keys are required, no account is needed, and all language model reasoning happens on your local machine using Gemma.**

---

## ✨ Features & Truthful Capabilities

### 🔵 Trust Aura — Viewport-Aware Social Feed Scanner
- Subtly wraps social media posts and ads on LinkedIn, X/Twitter, Facebook, Instagram, Reddit, and YouTube with a colored credibility border:
  - 🟢 **Green** = Verified / authentic content
  - 🟡 **Amber** = Take a second look / sensationalist phrasing
  - 🔴 **Red** = Known scam / debunked pattern
  - ⚪ **Grey** = Unverified / local engine offline (graceful fallback)
- **Viewport-Aware:** Uses `IntersectionObserver` to analyze only posts actively in view, avoiding unnecessary background processing.
- **Throttled Concurrency:** Employs a concurrency limiter (max 2 parallel tasks), request queue, and local deduplication cache.
- **Strict Local-Only Mode:** A toggle in settings allows disabling all outbound lookups, running entirely on local regex heuristic filters.

---

### 🔍 Unified Misinformation & Job Legitimacy Scanner
Ambient Shield provides a single unified scanner in the **Fact Checker** tab that automatically detects whether an input is a **General News / Social Media Claim** or a **Job / Internship Notice**, querying live web evidence without cloud API keys:

1. **Auto-Detection & Classification:**
   - Detects hiring patterns (`hiring`, `internship`, `walk-in`, `freshers`, `apply`, `stipend`, `vacancy`, `recruitment`, `CTC`, `registration fee`) and routes to the Job Verifier.
   - All other statements route to the Claim & News Fact-Checking engine.

2. **Live Multi-Source Retrieval:**
   - Queries **DuckDuckGo Lite** (HTML, keyless), **Wikipedia MediaWiki API**, and **Google News RSS**.
   - Truncates passages to ~3,000 characters of top relevant text per page using a service-worker-safe passage extractor.
   - Authority scoring: prioritizes official company domains, accredited fact-checkers (Snopes, Reuters, AP), and government/reference sources; downranks forums and aggregators.

3. **Job & Hiring Post Legitimacy Checks (7 Critical Checks):**
   - 🏢 **Company Existence:** Finds the official corporate website and primary domain.
   - 💼 **Careers Portal Listing:** Checks for matching official careers listings or active vacancies.
   - 🔗 **LinkedIn / Social Presence:** Verifies active corporate profiles.
   - ✉️ **Contact Validity (Critical Scam Signal):** Flags free-mail addresses (`@gmail.com`, `@yahoo`, `@outlook`), URL shorteners (`bit.ly`, `tinyurl`), WhatsApp-only contact info, or raw Google Forms.
   - 🌐 **Domain Age / RDAP:** Queries open RDAP (`https://rdap.org/domain/<domain>`) and flags domains created less than 180 days ago (< 6 months).
   - 🚨 **Scam & Fraud Reports:** Searches live complaint boards and LinkedIn warnings for scam reports.
   - 💵 **Fees & Deposits:** Flags registration fees, security deposits, or direct placement guarantees.
   - **Job Verdicts:** `Likely legitimate`, `Unverified`, or `High scam risk`, paired with a verification checklist and actionable advice.

4. **Claim Fact-Checking & Local Gemma Judging:**
   - **Strict Evidence-Based Reasoning:** Passes only retrieved passages to local Gemma (`gemma3:4b`). If evidence is insufficient, Gemma is instructed to answer `insufficient`.
   - **Truthful Claim Verdicts:** `Supported by sources`, `Contradicted by sources`, or `Couldn't verify` (with explicit reasons: no reliable sources found, sources disagree, or AI judge offline).
   - **Verbatim Citation Verification:** Every quotation in citations is checked as an exact literal substring of the fetched text; hallucinated quotes are discarded.
   - **Real-Date Time Paradox Detection:** Uses dynamic system dates (`new Date()`). Future events cannot be verified yet and are classified as `Couldn't verify`, never labelled "FALSE".
   - **Evidence-Only Fallback:** If Ollama is offline, the scanner runs multi-source retrieval and heuristic checks, displaying sources and red flags with verdict capped at `Couldn't verify`.

5. **Right-Click & Shortcut Access:**
   - Select text on any web page > Right-click > **"🛡️ Ambient Shield: Check this text"**.
   - Keyboard shortcut: <kbd>Alt+Shift+C</kbd> (or <kbd>Cmd+Shift+C</kbd> on macOS).
   - Opens `dashboard.html?tab=factcheck&autorun=1` with selected text passed safely through `chrome.storage`.

---

### 📋 Privacy Policy Analyzer — Local Heuristics + LLM Synthesis
- **100% Offline Foundation:** Features an offline regex and heuristic engine that scans legal disclosures without requiring internet access or language model tokens:
  - 📊 **Risk Score (1-10)** and calibrated Risk Level (`SAFE` / `CAUTION` / `DANGER`)
  - 📋 **What They Collect** (IPs, biometrics, location, device IDs)
  - 🤝 **Who They Share With** (ad networks, data brokers, law enforcement)
  - ⚖️ **Your Rights** (GDPR/CCPA access, erasure, deletion, opt-out)
  - 🚩 **Red Flags** (data selling, forced arbitration, cross-site tracking)
  - 💡 **Actionable Opt-Out Guidance**
- **Local LLM Synthesis:** When Ollama is running, optionally synthesizes long policy sections into clear, plain-language summaries. If Ollama is offline, the offline engine completes the analysis seamlessly.

---

### 🖼️ Deepfake & Forensic Image Scanner
- **Realistic Forensic Disclaimers:** General text and multimodal LLMs cannot conclusively prove deepfakes. Ambient Shield makes this clear: all results include explicit confidence ratings and non-conclusive disclaimers.
- **Multi-Layer Heuristics:**
  - File format and dimensional integrity checks (10MB limit, auto-resizing to prevent browser hangs)
  - Known generative AI filename tags (`midjourney`, `dall-e`, `stablediffusion`, `flux`, `comfyui`)
  - Explicit / adult content filename and path indicators
  - Optional local Gemma multimodal analysis for visual anomalies (lighting inconsistency, blending artifacts).

---

### 🔥 Content Firewall — Multi-Layer Protection
- **Declarative Network Request (DNR) Rules:** Blocks navigation to known adult/malicious domains at the browser network layer using declarative MV3 rule tables (`block-rules.json`).
- **DOM Safety Shield:** Displays a full-screen block overlay on flagged domains before page content renders.
- **Tab Navigation Interception:** Catches direct link clicks and redirects in background tabs.
- *Note:* Operates at the browser network level (Chrome `declarativeNetRequest`), not system-wide DNS. Does not claim to be mathematically unbypassable.

---

## 💻 Local AI Setup (Ollama)

Ambient Shield uses **Ollama** running locally on your computer with Google's open **Gemma** model.

### 1. Install Ollama
Download and install Ollama from [ollama.com](https://ollama.com/download).

### 2. Pull the Recommended Model
In your terminal, pull `gemma3:4b` (recommended balance of reasoning speed and accuracy) or `gemma2:2b` (lightweight):

```bash
ollama pull gemma3:4b
```

### 3. Configure Extension Origin Access
Because Chrome extensions communicate from a unique origin (`chrome-extension://<id>`), Ollama must be launched with `OLLAMA_ORIGINS` enabled.

#### Windows (PowerShell):
```powershell
$env:OLLAMA_ORIGINS = "chrome-extension://*"
ollama serve
```

#### macOS:
```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
# Or run in terminal:
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

#### Linux:
```bash
# If using systemd service, add Environment="OLLAMA_ORIGINS=chrome-extension://*" in:
# /etc/systemd/system/ollama.service.d/environment.conf
# Or run manually in terminal:
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

### 4. Verify Connection
Run in your terminal or browser:
```bash
curl http://localhost:11434/api/tags
```
You should see JSON listing your installed models. In the extension settings or popup, click **"Test Ollama Connection"** to verify that Ambient Shield recognizes the daemon.

---

## 🔒 Privacy & Data Transparency

| Data | Destination | Purpose | Can it be disabled? |
|---|---|---|---|
| **AI Prompts & Queries** | Localhost only (`http://localhost:11434`) | Language model reasoning with Gemma | Always on-device |
| **Fact-Check Claims** | Wikipedia MediaWiki API & DuckDuckGo Lite | Retrieving public articles and context snippets | Yes, via "Strict Local-Only Mode" |
| **Policy Analysis** | 100% on-device | Regex heuristic analysis | Always on-device |
| **Images / Media** | Processed locally in browser memory | Heuristic checks and local model vision | Always on-device |
| **Browsing History** | Never stored, never transmitted | Ephemeral tab monitoring only | Always on-device |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AMBIENT SHIELD (Chrome MV3)                     │
├────────────────────┬─────────────────────────────┬─────────────────────┤
│  DOM Content Layer │   Background Service Worker │     Next.js UI      │
│  (content.js,      │   (background.js)           │  (app/, components/)│
│   content-firewall)│                             │                     │
│                    │  • LLM Provider Orchestrator│  • Fact Checker     │
│  • Trust Aura Glow │    (Ollama / Gemma local)   │  • Policy Analyzer  │
│  • Anti-Harm Wall  │  • Evidence Retrieval Engine│  • Image Analyzer   │
│  • Viewport Trigger│    (Wikipedia + DDG Lite)   │  • Settings Form    │
│  • DOM Observers   │  • Persistent Storage Sync  │  • Health Tester    │
└────────────────────┴─────────────────────────────┴─────────────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │    Localhost:11434 (Ollama)   │
                   │      Model: gemma3:4b         │
                   │    100% On-Device Reasoning   │
                   └───────────────────────────────┘
```

---

## 📦 Installation & Build

### Prerequisites
- Node.js 18+ (tested on Node 20 & 25)
- npm 9+
- Google Chrome, Brave, or Chromium-based browser

### Build Steps

```bash
# 1. Clone the repository
git clone https://github.com/somsu123/ambient-Shield.git
cd ambient-Shield

# 2. Install dependencies
npm install

# 3. Build extension package (Next.js static export + MV3 asset transformation)
npm run build:ext
```

### Load Unpacked in Chrome
1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder inside this repository
5. Click the Ambient Shield icon in the extension toolbar to open the popup

---

## 🧪 Testing & Verification

Ambient Shield includes a unit test suite running on Node's native test runner (`node --test`), requiring zero extra test dependencies.

```bash
# Run unit test suite
npm test

# Run Next.js linter
npm run lint

# Run Next.js static build
npm run build
```

### Manual Verification Checklist
1. **With Ollama Running:**
   - Open extension popup or dashboard (`analyze`).
   - Run fact-check on a verified claim (e.g., *"The James Webb Space Telescope launched in December 2021"*). Observe evidence retrieval and verdict: `Supported by sources`.
   - Test a future claim (e.g., *"Candidate won the 2035 election"*). Observe time paradox response: `Couldn't verify: Future events cannot be verified yet`.
2. **With Ollama Stopped:**
   - Stop Ollama.
   - Run Fact Checker: Observe graceful fallback to retrieved web passages without extension crashes.
   - Browse social feed: Observe Trust Aura fallback to neutral grey badges without console exceptions.
   - Run Policy Analyzer: Observe 100% functioning offline heuristic risk score and red flags.

---

## ⚖️ License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
