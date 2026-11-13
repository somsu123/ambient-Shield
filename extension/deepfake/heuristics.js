// Ambient Shield — Deepfake-specific Heuristics (extension/deepfake/heuristics.js)
// NOTE: This is NOT the same as extension/heuristics.js (URL/content heuristics).
//       This module handles video metadata and frame-level pixel analysis.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * extractVideoMetadata — Derives structural metadata from a video File object.
 *
 * Since we cannot reliably read codec/container internals in a pure JS extension,
 * codec is guessed from MIME type. Duration and resolution require a temporary
 * HTMLVideoElement (browser-only).
 *
 * @param {File} file  A video File object.
 * @returns {Promise<{duration:number, resolution:{width:number,height:number}, codec:string, fileSize:number, suspiciousReencode:boolean}>}
 */
export async function extractVideoMetadata(file) {
  const codec = _guessCodecFromMime(file.type);
  const fileSize = file.size;

  // Try to get duration + resolution by loading into a hidden video element.
  // Falls back gracefully if not in a browser context.
  let duration = 0;
  let resolution = { width: 0, height: 0 };

  try {
    const result = await _loadVideoElement(file);
    duration = result.duration;
    resolution = result.resolution;
  } catch (_) {
    // Non-browser context or load failure — metadata stays at defaults
  }

  // Heuristic: if the file is very small relative to duration, suspect re-encode.
  // Rough baseline: 500 KB/s is very low for typical video; flags lossy re-encodes.
  const suspiciousReencode =
    duration > 0 && fileSize > 0 && fileSize / duration < 500 * 1024;

  return { duration, resolution, codec, fileSize, suspiciousReencode };
}

/**
 * _loadVideoElement — Resolves video duration and natural resolution via DOM.
 * @private
 */
function _loadVideoElement(file) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      return reject(new Error("No DOM available"));
    }

    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;
      const resolution = { width: video.videoWidth || 0, height: video.videoHeight || 0 };
      URL.revokeObjectURL(url);
      resolve({ duration, resolution });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video element load error"));
    };

    // Timeout safety
    const tid = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("Video metadata load timeout"));
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(tid);
      const duration = video.duration || 0;
      const resolution = { width: video.videoWidth || 0, height: video.videoHeight || 0 };
      URL.revokeObjectURL(url);
      resolve({ duration, resolution });
    };

    video.src = url;
  });
}

/**
 * _guessCodecFromMime — Maps MIME type to a human-readable codec label.
 * @private
 */
function _guessCodecFromMime(mimeType) {
  const map = {
    "video/mp4": "H.264/MP4",
    "video/webm": "VP8/VP9/WebM",
    "video/ogg": "Theora/Ogg",
    "video/quicktime": "H.264/MOV",
    "video/x-msvideo": "AVI",
  };
  return map[mimeType] || mimeType || "unknown";
}

// ── Frame Consistency Analysis ───────────────────────────────────────────────

/**
 * compareFrameConsistency — Detects abrupt discontinuities between consecutive frames.
 *
 * Algorithm:
 *   - For each frame's ImageData, sample 100 evenly-spaced pixels.
 *   - Convert each sampled pixel to luminance: Y = 0.299R + 0.587G + 0.114B
 *   - Compute mean and standard deviation of luminance values across the 100 samples.
 *   - Compare adjacent frames: flag if |meanDiff| > 0.15 OR |stddevDiff| > 0.12.
 *
 * @param {ImageData[]} frames  Array of ImageData objects (one per extracted frame).
 * @returns {{ frameIndex:number, discontinuity:number, reason:string }[]}
 *   One entry per frame (starting at index 1), discontinuity clamped 0–1.
 */
export function compareFrameConsistency(frames) {
  if (!Array.isArray(frames) || frames.length < 2) return [];

  // Pre-compute luminance stats for all frames
  const stats = frames.map((frame) => _computeLuminanceStats(frame));

  const results = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = stats[i - 1];
    const curr = stats[i];

    const meanDiff = Math.abs(curr.mean - prev.mean);
    const stddevDiff = Math.abs(curr.stddev - prev.stddev);

    // Normalise discontinuity: each metric contributes up to 0.5
    const discontinuity = Math.min(1, (meanDiff / 0.15) * 0.5 + (stddevDiff / 0.12) * 0.5);

    const reasons = [];
    if (meanDiff > 0.15) reasons.push(`mean luminance shifted ${(meanDiff * 100).toFixed(1)}%`);
    if (stddevDiff > 0.12) reasons.push(`contrast spread shifted ${(stddevDiff * 100).toFixed(1)}%`);

    results.push({
      frameIndex: i,
      discontinuity: Math.min(1, Math.max(0, discontinuity)),
      reason: reasons.length > 0 ? `Abrupt discontinuity: ${reasons.join("; ")}` : "No significant discontinuity",
    });
  }

  return results;
}

/**
 * _computeLuminanceStats — Samples 100 evenly-spaced pixels and returns mean + stddev of luminance.
 * @private
 * @param {ImageData} imageData
 * @returns {{ mean:number, stddev:number }}
 */
function _computeLuminanceStats(imageData) {
  if (!imageData || !imageData.data || imageData.data.length === 0) {
    return { mean: 0, stddev: 0 };
  }

  const data = imageData.data; // Uint8ClampedArray: [R,G,B,A, R,G,B,A, ...]
  const totalPixels = data.length / 4;
  const sampleCount = Math.min(100, totalPixels);

  const luminances = [];
  const step = Math.max(1, Math.floor(totalPixels / sampleCount));

  for (let p = 0; p < sampleCount; p++) {
    const idx = (p * step) * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    // ITU-R BT.601 luminance
    luminances.push(0.299 * r + 0.587 * g + 0.114 * b);
  }

  const mean = luminances.reduce((s, v) => s + v, 0) / luminances.length;
  const variance = luminances.reduce((s, v) => s + (v - mean) ** 2, 0) / luminances.length;
  const stddev = Math.sqrt(variance);

  return { mean, stddev };
}

// ── Metadata Heuristics ──────────────────────────────────────────────────────

/**
 * runMetadataHeuristics — Scores the file's metadata for manipulation signals.
 *
 * Checks:
 *   1. Very small file size for duration → possible lossy re-encode chain.
 *   2. Unusual aspect ratio (not 16:9, 4:3, 1:1, 9:16, or close) → suspect crop/reframe.
 *   3. Unknown/unusual codec → possible transcoding.
 *
 * @param {File}   file      The video or image file.
 * @param {object} metadata  Result from extractVideoMetadata().
 * @returns {{ flags:string[], score:number }}
 *   score is 0–1 representing heuristic suspicion level.
 */
export function runMetadataHeuristics(file, metadata) {
  const flags = [];
  let rawScore = 0;

  // 1. File-size-to-duration ratio (re-encode signal)
  if (metadata.suspiciousReencode) {
    flags.push("Very low bitrate for video duration — may indicate lossy re-encoding");
    rawScore += 0.4;
  }

  // 2. Unusual aspect ratio
  if (metadata.resolution.width > 0 && metadata.resolution.height > 0) {
    const ar = metadata.resolution.width / metadata.resolution.height;
    const knownAspectRatios = [16 / 9, 4 / 3, 1, 9 / 16, 3 / 4, 21 / 9, 2.35];
    const isKnown = knownAspectRatios.some((known) => Math.abs(ar - known) < 0.05);
    if (!isKnown) {
      flags.push(
        `Unusual aspect ratio (${metadata.resolution.width}×${metadata.resolution.height}, ratio ${ar.toFixed(2)}) — may indicate cropping or reframing`
      );
      rawScore += 0.3;
    }
  }

  // 3. Unknown codec / MIME
  if (
    !metadata.codec ||
    metadata.codec === "unknown" ||
    metadata.codec === file.type
  ) {
    flags.push(`Unrecognised video codec/MIME: "${file.type}" — unusual container format`);
    rawScore += 0.2;
  }

  // 4. Zero duration for a video file (failed to decode)
  if (metadata.duration === 0 && file.type.startsWith("video/")) {
    flags.push("Could not determine video duration — may be a corrupt or unusual container");
    rawScore += 0.1;
  }

  return {
    flags,
    score: Math.min(1, Math.max(0, rawScore)),
  };
}

/**
 * Background / service worker compatible consistency check (operates on base64 data).
 */
export function checkFrameConsistency_bg(frames) {
  if (!Array.isArray(frames) || frames.length < 2) return [];

  function sampleLuminance(b64, samples = 100) {
    if (!b64 || typeof b64 !== "string") return 128;
    const step = Math.max(1, Math.floor(b64.length / samples));
    let sum = 0;
    let count = 0;
    for (let i = 0; i < b64.length; i += step) {
      sum += b64.charCodeAt(i);
      count++;
    }
    return count > 0 ? sum / count : 128;
  }

  const luminances = frames.map((f) => sampleLuminance(typeof f === "string" ? f : f?.base64 || ""));
  const mean = luminances.reduce((a, b) => a + b, 0) / luminances.length;
  const variance = luminances.reduce((a, b) => a + (b - mean) ** 2, 0) / luminances.length;
  const std = Math.sqrt(variance);

  const results = [];
  for (let i = 1; i < frames.length; i++) {
    const diff = Math.abs(luminances[i] - luminances[i - 1]);
    const normalizedDiff = std > 0 ? diff / std : 0;
    const discontinuity = Math.min(1, Math.max(0, normalizedDiff / 3));
    if (discontinuity > 0.4) {
      results.push({
        frameIndex: i,
        discontinuity,
        reason: `Abrupt luminance shift (Δ=${diff.toFixed(1)})`,
      });
    }
  }
  return results;
}

export function extractVideoMetadata_bg(payload = {}) {
  const filename = payload.filename || "";
  const isVideo = Boolean(payload.isVideo || /\.(mp4|webm|ogg|mov|avi)$/i.test(filename));
  const fileSize = payload.fileSize || 0;
  return {
    filename,
    isVideo,
    fileSize,
    suspiciousReencode: isVideo && fileSize > 0 && fileSize < 50000,
  };
}

export function runMetadataHeuristics_bg(payload = {}) {
  const flags = [];
  let score = 0;
  const fileSize = payload.fileSize || 0;
  const filename = (payload.filename || "").toLowerCase();
  const isVideo = payload.isVideo;

  if (isVideo && fileSize > 0 && fileSize < 50000) {
    flags.push("Suspiciously small video file size for standard video container");
    score += 0.3;
  }

  if (filename && !/\.(mp4|webm|ogg|mov|avi|jpg|jpeg|png|webp|gif)$/i.test(filename)) {
    flags.push("Unusual or missing file extension");
    score += 0.15;
  }

  return { flags, score: Math.min(1, Math.max(0, score)) };
}
