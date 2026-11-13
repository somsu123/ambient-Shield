// Ambient Shield — Deepfake LLM Prompts (extension/deepfake/prompts.js)
// Per-frame visual artifact analysis prompt for deepfake/manipulation detection.
// ─────────────────────────────────────────────────────────────────────────────
//
// Scope of analysis (stills only):
//   ✓ Skin/texture over-smoothing (classic GAN artifact)
//   ✓ Edge blending around hairline/jaw (face-swap boundary artifact)
//   ✓ Inconsistent lighting/shadows (composite lighting mismatch)
//   ✓ Asymmetric or specularly inconsistent eye reflections
//   ✓ Warped teeth, ears, or jewelry (geometric distortion near face edges)
//   ✓ Background warping near subject (spatial distortion bleed)
//
// Intentionally excluded (require temporal/multi-frame data):
//   ✗ Blink rate analysis
//   ✗ Lip-sync / phoneme drift
//   ✗ Temporal jitter between frames
//   ✗ Audio-visual alignment

/**
 * DEEPFAKE_SYSTEM_PROMPT — System instruction for the vision model.
 *
 * Keeps the model focused on factual visual observations, prevents speculation,
 * and enforces JSON-only output for reliable downstream parsing.
 */
export const DEEPFAKE_SYSTEM_PROMPT =
  "You are a digital image forensics assistant. " +
  "Analyze this image frame for visual manipulation artifacts. " +
  "Focus only on what is directly observable in the pixels — do not speculate about intent. " +
  "Never claim certainty about whether an image is real or fake. " +
  "Respond ONLY with valid JSON matching the schema provided. Do not add any explanation outside the JSON.";

export const DEEPFAKE_FRAME_SYSTEM = DEEPFAKE_SYSTEM_PROMPT;
export const DEEPFAKE_FRAME_PROMPT = (i, total) => buildFramePrompt(i != null ? (total ? `${i + 1}/${total}` : i + 1) : null);

/**
 * buildFramePrompt — Builds the per-frame user prompt for artifact detection.
 *
 * The model is instructed to report only observable still-image artifacts.
 * Severity values in the output MUST be clamped 0–1 by the caller (see validateFrameResult).
 *
 * @param {number} [frameIndex]  Optional frame index for context (not used by model, aids debugging).
 * @returns {string}  Prompt text to send alongside the base64 image.
 */
export function buildFramePrompt(frameIndex = null) {
  const frameCtx = frameIndex !== null ? ` (frame ${frameIndex})` : "";
  return (
    `Examine this image${frameCtx} for signs of digital manipulation or synthesis. ` +
    `Look for the following specific artifacts and report each one you observe:\n` +
    `1. Skin or facial texture over-smoothing (unnaturally waxy or plastic appearance)\n` +
    `2. Edge blending artifacts around the hairline or jaw (blurry, mismatched, or halo-like borders)\n` +
    `3. Inconsistent lighting or shadows (light source direction conflicts, mismatched shadows)\n` +
    `4. Asymmetric or specularly inconsistent eye reflections (reflections differ between eyes)\n` +
    `5. Warped or geometrically distorted teeth, ears, or jewelry (stretching, morphing near face edges)\n` +
    `6. Background warping or distortion near the subject (rippling, smearing, or blurring of background)\n\n` +
    `For each artifact you observe, provide: its type, approximate location in the image, ` +
    `severity from 0.0 (barely perceptible) to 1.0 (obvious), and a brief description.\n\n` +
    `If you observe NO artifacts, return an empty artifacts array.\n\n` +
    `Respond with ONLY this JSON structure:\n` +
    `{"artifacts":[{"type":"string","location":"string","severity":0.0,"description":"string"}],"overall_suspicion":0.0,"notes":"string"}\n\n` +
    `overall_suspicion is your overall estimate of manipulation likelihood from 0.0 (no signs) to 1.0 (strong signs). ` +
    `notes is a brief observation (1-2 sentences). Do not add any text outside the JSON.`
  );
}

/**
 * FRAME_RESPONSE_SCHEMA — Expected JSON schema for per-frame LLM output.
 * Used as documentation and for validation in validateFrameResult().
 */
export const FRAME_RESPONSE_SCHEMA = {
  artifacts: [
    {
      type: "string",          // e.g. "skin_smoothing", "edge_blending"
      location: "string",      // e.g. "around jawline", "left eye"
      severity: "number",      // 0.0–1.0
      description: "string",   // human-readable observation
    },
  ],
  overall_suspicion: "number", // 0.0–1.0
  notes: "string",             // brief summary
};

/**
 * validateFrameResult — Sanitises and clamps LLM output to the expected schema.
 *
 * Always returns a valid object (never throws). Missing fields get safe defaults.
 * All 0–1 numeric values are clamped.
 *
 * @param {object} raw  Parsed JSON from the LLM response.
 * @returns {object}    Sanitised frame result matching FRAME_RESPONSE_SCHEMA.
 */
export function validateFrameResult(raw) {
  if (!raw || typeof raw !== "object") {
    return { artifacts: [], overall_suspicion: 0, notes: "" };
  }

  const overall_suspicion =
    typeof raw.overall_suspicion === "number"
      ? Math.min(1, Math.max(0, raw.overall_suspicion))
      : 0;

  const notes = typeof raw.notes === "string" ? raw.notes.slice(0, 500) : "";

  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
        .filter((a) => a && typeof a === "object")
        .map((a) => ({
          type: typeof a.type === "string" ? a.type.slice(0, 100) : "unknown",
          location: typeof a.location === "string" ? a.location.slice(0, 200) : "",
          severity:
            typeof a.severity === "number"
              ? Math.min(1, Math.max(0, a.severity))
              : 0,
          description:
            typeof a.description === "string" ? a.description.slice(0, 500) : "",
        }))
    : [];

  return { artifacts, overall_suspicion, notes };
}
