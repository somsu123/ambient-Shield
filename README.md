<div align="center">

<img src="extension/icon128.svg" width="120" alt="Ambient Shield Logo"/>

# 🛡️ Ambient Shield

### *Your Quiet Digital Protector*

**An AI-powered Chrome Extension that shields you from misinformation, privacy violations, and deepfakes — entirely at the browser edge, with zero data sent to the cloud.**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)](https://github.com/somsu123/ambient-Shield)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![Zero API Keys](https://img.shields.io/badge/Privacy_Features-Zero_API_Keys-blueviolet)](https://github.com/somsu123/ambient-Shield)
[![Hackathon](https://img.shields.io/badge/Built_for-Hackathon-orange)](https://github.com/somsu123/ambient-Shield)

---

[Features](#-features) • [Architecture](#-architecture) • [Tech Stack](#-tech-stack) • [Installation](#-installation) • [How It Works](#-how-it-works) • [Screenshots](#-screenshots)

</div>

---

## 🌟 The Problem We Solved

Every day, billions of people scroll through social media and encounter:
- 📰 **Fake news and misinformation** disguised as real posts
- 🎭 **AI-generated deepfake images** used to manipulate public opinion
- 🔒 **Privacy policies** written in complex legal language no one reads
- 📢 **Deceptive advertisements** with no way to verify their legitimacy

Ambient Shield makes the invisible **visible** — providing real-time, ambient awareness without interrupting your browsing experience.

---

## ✨ Features

### 🔵 Trust Aura — Real-time Social Feed Scanner
> *"No pop-ups. No blocking. Just ambient awareness that lets YOU decide."*

- **Always-on** overlay that wraps every social media post and advertisement with a colored glow
- 🟢 **Green** = Verified / Factual content
- 🟡 **Amber** = Unverified / Take a second look
- 🔴 **Red** = Known misinformation or scam
- Works on **LinkedIn, Facebook, Twitter/X, Instagram, Reddit** and all major social platforms
- Uses a **Web Search Bot** to cross-reference content against live web results — **zero API key required**

---

### 🔍 Fact Checker — Entity-Aware Misinformation Scanner
> *"Searches the whole web and tells you if it's real or fake."*

The most advanced feature — a fully autonomous fact-checking engine that:

1. **Extracts Entities**: Identifies the claimed party, location, year, and action from any text
2. **Wikipedia Deep-Fetch**: Fetches the **full article intro** of the most relevant Wikipedia page
3. **Entity Cross-Check**: Compares the claimed winner/result against what Wikipedia actually says
4. **Time Paradox Detector**: Automatically flags claims about future events as impossible
5. **Shows the Source**: Displays the exact Wikipedia URL and quote that proves or disproves the claim

**Example**: If someone claims "TMC won the 2026 West Bengal election" when BJP actually won, the scanner detects this by reading the Wikipedia article and returns:
> ❌ FALSE: According to our web search, **BJP** won — not Trinamool Congress (TMC). Source: [Wikipedia](https://en.wikipedia.org)

**Zero Gemini API calls. Zero cost. Works offline.**

---

### 📋 Privacy Policy Analyzer — Instant Legal Translator
> *"Turns 50 pages of legal jargon into 5 bullet points you actually understand."*

- **Offline Analysis Engine**: 100% local keyword and regex-based scanning — your data never leaves your device
- Auto-detects the current website and fetches the official privacy policy
- Smart knowledge base for **25+ major platforms** (LinkedIn, Facebook, Google, Twitter, etc.)
- Instantly generates:
  - 📊 **Risk Score** (1-10) and Risk Level (SAFE / CAUTION / DANGER)
  - 📋 **What They Collect** (cookies, biometrics, location, etc.)
  - 🤝 **Who They Share With** (advertisers, law enforcement, etc.)
  - ⚖️ **Your Rights** (GDPR, CCPA opt-out, right to delete)
  - 🚩 **Red Flags** (data selling, forced arbitration, cross-site tracking)
  - 💡 **Opt-Out Tips** (actionable steps to limit data collection)

---

### 🖼️ Deepfake Detector — AI Forensic Image Analyzer
> *"Trained to see what your eyes can't."*

- Upload any image or paste a URL for forensic AI analysis
- Multi-phase analysis pipeline: URL heuristics → AI text analysis → Full multimodal scan
- Detects: **Deepfakes, NSFW content, violent imagery, deceptive ads**
- Full resilience: 60-second timeout, exponential backoff, 4-model fallback cascade
- Image validation: 10MB limit, auto-resize to 2048px to prevent browser crashes

---

### 🔥 Content Firewall — Triple-Layer Security Shield
> *"An unbypassable wall against adult and harmful content."*

- **Layer 1**: Declarative Network Blocking (blocks at DNS level before content loads)
- **Layer 2**: DOM-level full-screen overlay shield (for content that slips through)
- **Layer 3**: Background tab-watcher that monitors every navigation in real-time
- **Dev Tools Blocker**: Prevents bypass attempts via the browser console

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AMBIENT SHIELD                               │
│                   Chrome Extension (MV3)                            │
├─────────────────┬───────────────────────┬───────────────────────────┤
│   content.js    │    background.js       │      dashboard.js         │
│  (DOM Layer)    │  (Service Worker)      │  (Next.js UI)             │
│                 │                        │                           │
│  Trust Aura     │  ┌─────────────────┐  │  Policy Analyzer UI       │
│  Overlays       │  │  callGemini()   │  │  Fact Checker UI          │
│                 │  │  4-model cascade│  │  Deepfake Detector UI     │
│  Content        │  │  + 2 endpoints  │  │                           │
│  Firewall       │  └─────────────────┘  │                           │
│                 │                        │                           │
│                 │  ┌─────────────────┐  │                           │
│                 │  │ deepSearchWeb() │  │                           │
│                 │  │ Wikipedia API   │  │                           │
│                 │  │ + DDG Lite      │  │                           │
│                 │  └─────────────────┘  │                           │
│                 │                        │                           │
│                 │  ┌─────────────────┐  │                           │
│                 │  │analyzePolicyLocal│ │                           │
│                 │  │ 100% Offline    │  │                           │
│                 │  └─────────────────┘  │                           │
└─────────────────┴───────────────────────┴───────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Extension Core** | Chrome MV3 (Manifest V3) | Browser-native extension runtime |
| **UI Framework** | Next.js 14 (Static Export) | Dashboard and analysis pages |
| **Styling** | Vanilla CSS + CSS Variables | Zero-dependency, ultra-fast UI |
| **Fact Checker** | Wikipedia API + DuckDuckGo Lite | Offline entity-aware web search |
| **Policy Analyzer** | Custom Regex/Heuristic Engine | 100% local, zero API cost |
| **AI Backbone** | Google Gemini (4-model cascade) | Deepfake detection & Trust Aura |
| **Caching** | LRU In-Memory Cache (500 entries) | Zero redundant API calls |
| **Network** | Chrome `declarativeNetRequest` | DNS-level content blocking |
| **Security** | AbortController + 60s timeout | Prevents service worker hangs |

### 🧠 AI Model Cascade (Self-Healing)
```
gemini-1.5-flash → gemini-1.5-pro → gemini-2.0-flash → gemini-1.5-flash-002
     ↓ 404?              ↓ 503?           ↓ timeout?            ↓ 
  Try next            Try next          Try next            Last resort
```
Tries both `v1beta` and `v1` API endpoints for each model. Never crashes.

---

## 📦 Installation

### Load as Unpacked Extension (Development)

```bash
# 1. Clone the repository
git clone https://github.com/somsu123/ambient-Shield.git
cd ambient-Shield

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build:ext

# 4. Load in Chrome
# Go to chrome://extensions
# Enable "Developer Mode" (top right toggle)
# Click "Load unpacked"
# Select the /extension folder
```

### Building from Source
```bash
npm run build:ext    # Builds Next.js + copies to /extension
npm run dev          # Dev server for the dashboard UI
```

---

## 🚀 How It Works

### Trust Aura (Feed Scanner)
```
User scrolls feed
    ↓
content.js detects new post/ad via MutationObserver
    ↓
Sends { text, isAd } → background.js (TRUST_AURA)
    ↓
deepSearchWeb() → Wikipedia API + DDG Lite
    ↓
analyzeFindings() → Entity cross-check + sentiment analysis
    ↓
Injects colored glow overlay div (position:absolute, z-index:9999)
    [GREEN = safe] [AMBER = caution] [RED = danger]
```

### Fact Checker
```
User pastes claim → "TMC won the 2026 Bengal election"
    ↓
extractEntities() → { party: "TMC", location: "West Bengal", year: "2026", claimedWon: true }
    ↓
Wikipedia search: "2026 West Bengal Legislative Assembly election"
    ↓
Fetch article extract (8 sentences of intro)
    ↓
Entity cross-check: "bjp...won" found? → YES
    ↓
❌ FALSE: "BJP won, not TMC" + Wikipedia source URL shown
```

### Privacy Policy Analyzer
```
User visits linkedin.com → clicks "Analyze Policy"
    ↓
popup.js maps domain → PRIVACY_POLICY_MAP → LinkedIn policy URLs
    ↓
background.js fetches all policy pages → strips HTML
    ↓
analyzePolicyLocal() — fully offline heuristic engine:
  • Detects: data selling, cross-site tracking, forced arbitration
  • Extracts: your rights, opt-out tips, risk score
    ↓
Dashboard renders: Risk Score, Red Flags, Rights, Opt-Out Tips
```

---

## 📁 Project Structure

```
ambient-Shield/
├── extension/                 # The Chrome Extension
│   ├── manifest.json          # MV3 config, permissions, host_permissions
│   ├── background.js          # Service Worker: ALL AI calls, caching, routing
│   ├── content.js             # DOM: Trust Aura overlays, feed scanner
│   ├── content-firewall.js    # DOM: Triple-layer content blocking
│   ├── dashboard.js           # Dashboard: Fact Check, Policy, Deepfake UI
│   ├── dashboard.html         # Dashboard page
│   ├── popup.js               # Popup: Quick actions, settings
│   ├── popup.html             # Extension popup
│   └── block-rules.json       # declarativeNetRequest blocking rules
├── app/                       # Next.js pages
│   ├── page.tsx               # Landing page
│   ├── analyze/               # Analysis dashboard
│   └── settings/              # Extension settings
├── build-extension.ps1        # PowerShell build script
├── package.json
└── README.md
```

---

## 🔑 Key Technical Innovations

### 1. Zero-Cost Fact Checking
Unlike other fact-checkers that require expensive AI APIs, Ambient Shield uses a **custom Entity-Aware Engine** that:
- Parses political entities (10 Indian/international parties)
- Maps geographic locations (10 states + cities)
- Fetches structured Wikipedia article data via the free MediaWiki API
- Cross-references claimed winners against actual reported winners

### 2. Offline Privacy Analysis
The Privacy Policy Analyzer processes legal text **entirely in the browser** using:
- 50+ keyword patterns for data collection types
- 10+ red flag detection rules (data selling, arbitration clauses, etc.)
- GDPR/CCPA rights mapping

### 3. Edge-First Architecture
All intelligence runs in the Chrome Extension Service Worker — a background process that acts as a **local AI proxy**, meaning:
- Zero latency for cached results
- No user data ever leaves the browser (for privacy/policy analysis)
- Works even with slow/unreliable internet

### 4. Resilient AI Backbone
The `callGemini()` function implements:
- 4-model cascade with automatic failover
- Dual endpoint retry (v1beta + v1)
- 60-second hard timeout via `AbortController`
- LRU cache (500 entries) to prevent redundant API calls

---

## 🎯 Use Cases

| Scenario | Feature Used | Result |
|---|---|---|
| Someone shares a fake election result | Fact Checker | ❌ FALSE + Wikipedia source |
| Scrolling LinkedIn and see a suspicious ad | Trust Aura | 🔴 Red glow automatically |
| About to sign up for a new service | Privacy Analyzer | Risk Score + Red Flags shown |
| Received a profile pic that looks AI-generated | Deepfake Detector | Forensic AI analysis |
| Accidentally clicked a suspicious link | Content Firewall | Blocked before page loads |

---

## 🏆 Built For Hackathon

**Ambient Shield** was built to demonstrate that **privacy and digital safety don't require sacrificing user experience**. Instead of aggressive blocking and constant notifications, we use *ambient awareness* — subtle visual signals that empower users to make informed decisions without friction.

> *"The best security is the kind you don't notice — until you need it."*

---

## 👤 Author

**Somsubhro** — [@somsu123](https://github.com/somsu123)

---

<div align="center">

**⭐ Star this repo if Ambient Shield helped protect you! ⭐**

*Made with ❤️ for a safer, more informed internet*

</div>
