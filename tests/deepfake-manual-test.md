# Manual Test Script — Deepfake & Video Scanner

This test script validates all functional, error, fallback, and boundary scenarios for the Ambient Shield Deepfake & Video Scanner.

## Prerequisites
- Extension loaded unpacked in Chrome: Navigate to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `d:\ambient-Shield\extension`.
- Ollama installed locally (`http://localhost:11434`).
- Multimodal model: `gemma3:4b` (`ollama pull gemma3:4b`).
- Text-only model for negative test: `gemma:2b` (`ollama pull gemma:2b`).

---

## Test Scenarios

### Scenario 1: Ollama Running with Recommended Multimodal Model (`gemma3:4b`)
1. Start Ollama server: `ollama serve`.
2. Open extension dashboard: Click Ambient Shield icon → click **Dashboard**, or open `chrome-extension://<id>/dashboard.html?tab=deepfake`.
3. In the Deepfake tab, expand **Local AI Settings (Ollama)**.
4. Verify Host is `http://localhost:11434` and Model is `gemma3:4b`.
5. Click **Test Connection**.
   - **Expected Result:** Status pill turns green displaying `✅ Deepfake scanner ready. Model "gemma3:4b" supports image analysis.`
6. Drop or upload a standard photo. Click **🔬 Run Scan**.
   - **Expected Result:** Step indicator progresses through `1. Extract` → `2. Analyze` → `3. Aggregate`.
   - Result card renders with label ("Likely authentic" or "Inconclusive"), Suspicion Index bar, list of forensic observations, and visible disclaimer: *"Indicative only, not forensic proof."*

### Scenario 2: Ollama Daemon Stopped (Offline Detection & Evidence-Only Fallback)
1. Stop Ollama daemon (`Ctrl+C` in Ollama terminal).
2. In the Deepfake tab, click **Test Connection**.
   - **Expected Result:** Status pill turns red displaying `❌ Cannot connect to Ollama at http://localhost:11434. Start Ollama and verify OLLAMA_ORIGINS allows extensions.`
3. Upload an image or video and click **🔬 Run Scan**.
   - **Expected Result:** Does not crash or hang. Evaluates container/file metadata and pixel consistency heuristics, then renders with banner:
     *"🛈 AI analysis unavailable. Ollama offline. Start Ollama and run: ollama pull gemma3:4b"*

### Scenario 3: Text-Only Model Selected (Correction 1: Image Capability Rejection)
1. Start Ollama: `ollama serve`.
2. In the Deepfake Local AI Settings, enter model name: `gemma:2b` (or `gemma2`).
3. Click **Test Connection**.
   - **Expected Result:** Status pill displays warning:
     `⚠️ This model cannot analyze images. Run: ollama pull gemma3:4b`
4. Attempt to run a scan.
   - **Expected Result:** System automatically falls back to evidence-only mode and informs the user to pull `gemma3:4b`.

### Scenario 4: Standard Authentic Photo
1. Select model `gemma3:4b`.
2. Upload a known authentic digital photograph (uncompressed JPEG/PNG).
3. Click **🔬 Run Scan**.
   - **Expected Result:** Suspicion index is low (≤ 30%). Verdict displays `Likely authentic` with high confidence. No artifact red flags reported. Hard verdict "DEEPFAKE" is never shown.

### Scenario 5: AI-Generated / Manipulated Image
1. Upload a known AI-generated portrait (e.g., Midjourney/StyleGAN face with edge-blending or texture over-smoothing).
2. Click **🔬 Run Scan**.
   - **Expected Result:** Visual artifact breakdown lists flagged areas (e.g., `skin_smoothing`, `edge_blending`, `lighting_inconsistency`). Suspicion index exceeds 65%. Verdict displays `Possible manipulation` with calibrated confidence.

### Scenario 6: Video Clip Frame Extraction & Cross-Frame Consistency
1. Drag and drop a valid short video file (MP4 or WebM, < 100 MB).
2. Verify HTML5 video player appears with metadata (dimensions, duration, size).
3. Click **🔬 Run Scan**.
   - **Expected Result:**
     - Video frames are extracted via canvas at adaptive intervals (default 8 frames).
     - Extracted frame gallery displays thumbnails above the scan button.
     - Frame-by-frame progress updates: `Analyzing frame 1/8... 2/8...`.
     - Code computes frame-to-frame pixel luminance/contrast jump metrics to detect temporal splicing.
     - Verdict aggregates LLM artifacts across all frames + cross-frame consistency + metadata.

### Scenario 7: Web URL Import & CORS-Tainted Canvas Fallback (Correction 9)
1. Paste a cross-origin video URL from a site that forbids canvas read-back (e.g., YouTube/Twitter video stream).
2. Click **Load**.
3. Attempt to run extraction.
   - **Expected Result:** SecurityError is caught immediately. System does NOT claim a scan completed without frames. Displays specific message:
     *"⚠️ Cross-origin security restriction: cannot capture frames directly from this webpage video element. Please download the video and drag it into the drop zone above."*

### Scenario 8: One-Click Right-Click Context Menu ("Scan with Ambient Shield")
1. Browse to any webpage containing images or video.
2. Right-click on a media element.
   - **Expected Result:** Context menu item displays `🛡️ Scan with Ambient Shield`.
3. Click the context menu item.
   - **Expected Result:** Automatically opens the Ambient Shield dashboard focused on the Deepfake tab with media URL / captured frame pre-loaded and scan triggered.

### Scenario 9: LAN Host with Custom Origin (Scenario B)
1. Point Ollama Host to a LAN GPU address (e.g. `http://192.168.1.100:11434`).
2. Verify `OLLAMA_ORIGINS="chrome-extension://<your-extension-id>"` is configured on the host.
3. Extension utilizes `optional_host_permissions` without pattern matching bugs.

