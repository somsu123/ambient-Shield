# Ambient Shield — Deepfake & Video Scanner Architecture & Implementation Guide

*Dual Runtime Forensic Pipeline: Local In-Browser Frame Extraction + MV3 Service Worker Keepalive + Local Multimodal Ollama Inference*

---

## 1. System Architecture (Dual Runtime Model)

Ambient Shield performs local deepfake inspection without sending media bytes to third-party cloud servers.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Browser Tab Context (dashboard.html / dashboard.js)                             │
│                                                                                 │
│  [Video/Image Intake] ──> [HTML5 <video> & Canvas]                              │
│       (Drop / URL)             │                                                │
│                                ├── Adaptive frame sampling (8–16 stills, 768px) │
│                                └── SecurityError (CORS taint) detection         │
│                                        │                                        │
│                                        ▼ Base64 JPEGs                           │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │ chrome.runtime.connect ({ name: 'df-scan' })
                                         ▼ Long-Lived Port
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Manifest V3 Service Worker (background.js)                                      │
│                                                                                 │
│  ├── 1. Model Vision Capability Check (/api/show)                               │
│  ├── 2. Persistent 24h LRU Cache Check (chrome.storage.local)                    │
│  ├── 3. Per-Frame Multimodal LLM Inspection (/api/chat, Concurrency: 2)         │
│  ├── 4. Cross-Frame Pixel Luminance/Contrast Continuity Check (pure code)       │
│  ├── 5. Pluggable External Classifier Stub (optional ONNX/HTTP service)         │
│  ├── 6. Container & Metadata Heuristics                                         │
│  └── 7. Deterministic Weighted Aggregation                                      │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │ Local REST (/api/chat, /api/show)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Ollama Daemon (Scenario A: Localhost / Scenario B: LAN GPU)                     │
│                                                                                 │
│  Model: gemma3:4b (Default) or gemma3:12b (High-VRAM GPU)                       │
│  Returns: Strict JSON Artifact Breakdown per frame                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Honest Forensic Capabilities: What It Can and Cannot Detect

Digital media forensic analysis via open multimodal LLMs operating on sampled keyframes has clear technical boundaries. Ambient Shield never makes deceptive claims.

### What It CAN Detect
- **Per-Frame Visual Synthesis Artifacts:**
  - Skin and facial texture over-smoothing (waxy/plastic GAN/diffusion appearance).
  - Boundary edge blending around the jawline, chin, and hairline (face-swap seams).
  - Inconsistent directional lighting and conflicting shadow angles.
  - Asymmetric specular reflections in the eyes.
  - Morphing or distorted geometry in teeth, ears, spectacles, and jewelry.
  - Unnatural background warping or spatial bleed directly adjacent to subject silhouettes.
- **Cross-Frame Discontinuities (Measured by Code, NOT the LLM):**
  - Sudden frame-to-frame shifts in luminance distribution or contrast spread.
  - Hard splice boundaries between keyframes.
- **Container & Metadata Signals:**
  - Extremely low bitrate relative to video duration (hint of aggressive re-encoding).
  - Non-standard aspect ratios indicating automated reframing/cropping.
  - Truncated or missing container header information.

### What It CANNOT Detect (and NEVER Claims to Measure)
- ❌ **Blink Rate / Blink Rhythm:** Accurately measuring blinks requires continuous 30/60 fps video decoding over time. 8 discrete still frames cannot measure "blinks per minute".
- ❌ **Phoneme Drift & Lip-Sync:** Validating audio-visual alignment requires synchronised audio track extraction and phoneme-viseme temporal analysis.
- ❌ **Micro-Temporal Jitter:** Sub-frame frequency domain flicker cannot be derived from downscaled still captures.

---

## 3. Corrected Interpretation Table

| Overall Suspicion Index | Verdict Label | Significance | Recommended Action |
|---|---|---|---|
| **0% – 30%** | **Likely authentic** | No detectable blending boundaries, smooth lighting coherence, natural texture grain across sampled frames. | Treat as typical authentic media. Remember that advanced synthesis may leave minimal surface artifacts. |
| **31% – 65%** | **Inconclusive** | Ambiguous visual cues, low video resolution, heavy compression artifacts, or partial model uncertainty. | Do not rely on this result. Verify the origin through primary sources, official channels, or original raw media files. |
| **66% – 100%** | **Possible manipulation** | Observable face-swap seams, waxy smoothing, warped peripheral structures, or strong cross-frame discontinuities. | Treat with high skepticism. Inspect specific frame artifact references provided in the result card. |

> [!IMPORTANT]
> **Mandatory Disclaimer:** Ambient Shield outputs are indicative only, not forensic proof. The hard label "DEEPFAKE" is never emitted by this engine.

---

## 4. Model Capabilities & Requirements

| Model | Modality | Status | Notes |
|---|---|---|---|
| **`gemma3:4b`** | Multimodal (Text + Vision) | **Default** | Fast (~1–2s per frame on modern Apple Silicon or NVIDIA RTX 3060+). Fits in 4GB VRAM. |
| **`gemma3:12b`** | Multimodal (Text + Vision) | **Recommended for GPUs** | Higher spatial reasoning fidelity. Requires ≥ 10GB VRAM. |
| `llava`, `moondream` | Multimodal | Supported | Alternative vision models supported if pulled in Ollama. |
| `gemma`, `gemma:2b`, `gemma2` | Text-Only | **Rejected** | Cannot process image frames. Triggers capability warning: *"This model cannot analyze images. Run: ollama pull gemma3:4b"*. |

---

## 5. Secure Ollama Setup

Ollama binds by default without authentication. To prevent arbitrary web pages from executing unauthorized inferences, configure origins strictly.

### Scenario A: Same Device (Localhost)
1. Install Ollama from [ollama.com](https://ollama.com).
2. Pull the vision model:
   ```bash
   ollama pull gemma3:4b
   ```
3. Set `OLLAMA_ORIGINS` to your exact Chrome extension ID (find it at `chrome://extensions`):
   - **Windows PowerShell:**
     ```powershell
     $env:OLLAMA_ORIGINS="chrome-extension://<your-extension-id>"
     ollama serve
     ```
   - **macOS / Linux:**
     ```bash
     OLLAMA_ORIGINS="chrome-extension://<your-extension-id>" ollama serve
     ```
   *(Never set `OLLAMA_ORIGINS="*"` on an untrusted or public network.)*

### Scenario B: Dedicated GPU Machine on Local LAN
1. On the GPU host, bind to the local network interface:
   ```bash
   OLLAMA_HOST="0.0.0.0:11434" OLLAMA_ORIGINS="chrome-extension://<your-extension-id>" ollama serve
   ```
2. **Firewall Requirement:** Restrict incoming connections on port `11434` strictly to your local subnet (e.g. `192.168.1.0/24`). Never expose Ollama directly to the public internet because it provides no built-in authentication or rate limiting.
3. In Ambient Shield **Deepfake Settings**, enter `http://<lan-gpu-ip>:11434`.

---

## 6. Score Aggregation Formula

All weights are configured in `extension/deepfake/config.js`:

$$\text{Suspicion} = \frac{(W_{\text{LLM}} \cdot S_{\text{LLM}}) + (W_{\text{Pixel}} \cdot S_{\text{Pixel}}) + (W_{\text{Meta}} \cdot S_{\text{Meta}}) + (W_{\text{Classifier}} \cdot S_{\text{Classifier}})}{\sum W_{\text{active}}}$$

- **`llm_artifacts` (0.60):** Mean severity of reported visual anomalies across sampled keyframes.
- **`pixel_consistency` (0.25):** Frame-to-frame luminance and contrast delta (active only when $\ge 2$ frames exist).
- **`metadata_flags` (0.15):** File container integrity, bitrate anomalies, and aspect-ratio indicators.
- **`classifier_bonus` (0.20):** Substituted from LLM weight when an external classifier model is active.

When a signal is absent (e.g., cross-frame checks on single still photos), weights dynamically re-normalize across available signals so outputs are never artificially dampened.

---

## 7. Pluggable Classifier Interface

To integrate specialized deepfake neural classifiers (e.g., MesoNet, EfficientNet-B4, or Synth-DF):
1. Refer to `extension/deepfake/classifier-stub.js`.
2. Implement `classifyFrame(base64Jpeg)` returning a normalized score between `0.0` and `1.0`.
3. Supported deployment patterns:
   - **In-Browser ONNX:** Load via Transformers.js in an offscreen document.
   - **Local Microservice:** Run a lightweight Python FastAPI server on `http://127.0.0.1:8765/classify` and declare it in `optional_host_permissions`.

---

## 8. Web Import & CORS Boundary Handling (Correction 9)

Cross-origin videos (`blob:` URLs, authenticated media, CDN streams) cannot be fetched directly from background service workers due to browser security restrictions.

1. **In-Page Canvas Capture:** When initiating a scan via the right-click context menu (`🛡️ Scan with Ambient Shield`), a content script attempts to extract a frame directly from the active `<video>` element on the page.
2. **SecurityError Detection:** If the video source lacks permissive `crossorigin="anonymous"` headers, the browser taints the canvas and throws `SecurityError`. Ambient Shield intercepts this error immediately and displays:
   > *"⚠️ Cross-origin security restriction: cannot capture frames directly from this webpage video element. Please download the video and drag it into the drop zone above."*
3. The system **never** claims a scan was performed when frame capture failed.

---

## 9. Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| `Offline` status in settings | Ollama service is not running | Run `ollama serve` in a terminal. |
| `This model cannot analyze images` | Text-only model selected (e.g. `gemma:2b`) | Run `ollama pull gemma3:4b` and select it in settings. |
| `CORS Error` / Request blocked | Extension origin missing from Ollama | Restart Ollama with `OLLAMA_ORIGINS="chrome-extension://<id>"`. |
| Scan times out after 60s | Running a heavy model on slow CPU | Lower frame count to 4 in settings, or use `gemma3:4b` with GPU acceleration. |
| Canvas tainted error on URL import | Site blocks video canvas readback | Download the video file to your disk and drop it directly into the drop zone. |

