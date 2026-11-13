// Ambient Shield — Deepfake Result Aggregator (extension/deepfake/aggregator.js)
// Combines LLM frame results, pixel consistency, metadata flags, and optional
// classifier scores into a single verdict with confidence.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * aggregateFrameResults — Combines all signal sources into one verdict.
 *
 * Formula (with no classifier):
 *   overallSuspicion =
 *     (avgFrameSuspicion    × WEIGHTS.llm_artifacts)   +
 *     (avgDiscontinuity     × WEIGHTS.pixel_consistency) +
 *     (metadataScore        × WEIGHTS.metadata_flags)
 *
 * When a classifier score is provided (non-null), a fraction of llm_artifacts
 * weight is replaced by classifier_bonus, blending the two:
 *   effectiveLLMWeight      = WEIGHTS.llm_artifacts - WEIGHTS.classifier_bonus
 *   effectiveClassifierWeight = WEIGHTS.classifier_bonus
 *   overallSuspicion =
 *     (avgFrameSuspicion          × effectiveLLMWeight)       +
 *     (classifierScore            × effectiveClassifierWeight) +
 *     (avgDiscontinuity           × WEIGHTS.pixel_consistency) +
 *     (metadataScore              × WEIGHTS.metadata_flags)
 *
 * All intermediate and final values are clamped to [0, 1].
 * Labels follow verdict thresholds from DEEPFAKE_CONFIG.VERDICT.
 *
 * @param {object[]} frameResults
 *   Array of per-frame LLM responses. Each has shape:
 *   { artifacts: Array<{type,location,severity,description}>, overall_suspicion: number, notes: string }
 *
 * @param {{ frameIndex:number, discontinuity:number, reason:string }[]} consistencyResults
 *   Output of compareFrameConsistency().
 *
 * @param {number} metadataScore
 *   0–1 from runMetadataHeuristics().score.
 *
 * @param {number|null} classifierScore
 *   0–1 from an optional ML classifier, or null if unavailable.
 *
 * @param {object} config
 *   DEEPFAKE_CONFIG (must include .WEIGHTS and .VERDICT).
 *
 * @returns {{
 *   label: "Likely authentic"|"Inconclusive"|"Possible manipulation",
 *   confidence: number,
 *   overallSuspicion: number,
 *   artifacts: object[],
 *   frameFlags: string[],
 *   disclaimer: string
 * }}
 */
export function aggregateFrameResults(
  frameResults,
  consistencyResults,
  metadataScore,
  classifierScore,
  config
) {
  const { WEIGHTS, VERDICT } = config;

  // ── 1. Average LLM-reported suspicion across frames ──────────────────────
  const validFrames = Array.isArray(frameResults) ? frameResults.filter(Boolean) : [];
  const avgFrameSuspicion =
    validFrames.length > 0
      ? clamp(
          validFrames.reduce((sum, f) => {
            const s = typeof f.overall_suspicion === "number" ? f.overall_suspicion : 0;
            return sum + clamp(s);
          }, 0) / validFrames.length
        )
      : 0;

  // ── 2. Average pixel discontinuity across frame pairs ────────────────────
  const validConsistency = Array.isArray(consistencyResults)
    ? consistencyResults.filter((r) => typeof r.discontinuity === "number")
    : [];
  const avgDiscontinuity =
    validConsistency.length > 0
      ? clamp(
          validConsistency.reduce((sum, r) => sum + clamp(r.discontinuity), 0) /
            validConsistency.length
        )
      : 0;

  // ── 3. Clamp inputs ───────────────────────────────────────────────────────
  const metaScore = clamp(typeof metadataScore === "number" ? metadataScore : 0);

  // ── 4. Weighted aggregation (formula documented above) ───────────────────
  let overallSuspicion;
  const hasConsistency = validConsistency.length > 0;
  const hasFrames = validFrames.length > 0;

  if (classifierScore !== null && classifierScore !== undefined) {
    const classScore = clamp(classifierScore);
    const effectiveLLMWeight = clamp(WEIGHTS.llm_artifacts - WEIGHTS.classifier_bonus);
    const effectiveClassifierWeight = WEIGHTS.classifier_bonus;
    const wConsistency = hasConsistency ? WEIGHTS.pixel_consistency : 0;
    const wLLM = hasFrames ? effectiveLLMWeight : 0;
    const totalW = wLLM + effectiveClassifierWeight + wConsistency + WEIGHTS.metadata_flags;
    overallSuspicion = clamp(
      (avgFrameSuspicion * wLLM +
       classScore * effectiveClassifierWeight +
       avgDiscontinuity * wConsistency +
       metaScore * WEIGHTS.metadata_flags) / (totalW || 1)
    );
  } else {
    const wLLM = hasFrames ? WEIGHTS.llm_artifacts : 0;
    const wConsistency = hasConsistency ? WEIGHTS.pixel_consistency : 0;
    const wMeta = WEIGHTS.metadata_flags;
    const totalW = wLLM + wConsistency + wMeta;
    overallSuspicion = clamp(
      (avgFrameSuspicion * wLLM +
       avgDiscontinuity * wConsistency +
       metaScore * wMeta) / (totalW || 1)
    );
  }

  // ── 5. Verdict label ──────────────────────────────────────────────────────
  // Note: We deliberately avoid using "DEEPFAKE" as a label.
  let label;
  if (overallSuspicion <= VERDICT.AUTHENTIC_MAX) {
    label = "Likely authentic";
  } else if (overallSuspicion <= VERDICT.INCONCLUSIVE_MAX) {
    label = "Inconclusive";
  } else {
    label = "Possible manipulation";
  }

  // ── 6. Confidence — inverse of uncertainty band ───────────────────────────
  // High suspicion near 0 or 1 → more confident. Near 0.5 → least confident.
  const distFromCenter = Math.abs(overallSuspicion - 0.5);
  const confidence = clamp(distFromCenter * 2); // rescale [0, 0.5] → [0, 1]

  // ── 7. Collect all reported artifacts ────────────────────────────────────
  const artifacts = validFrames.flatMap((f, idx) => {
    if (!Array.isArray(f.artifacts)) return [];
    return f.artifacts.map((a) => ({ ...a, frameIndex: idx }));
  });

  // ── 8. Frame-level discontinuity flags ───────────────────────────────────
  const frameFlags = validConsistency
    .filter((r) => r.discontinuity > 0.3)
    .map((r) => `Frame ${r.frameIndex}: ${r.reason}`);

  return {
    label,
    confidence,
    overallSuspicion,
    artifacts,
    frameFlags,
    scoreBreakdown: {
      "LLM Artifact Suspicion": avgFrameSuspicion,
      "Frame Discontinuity": avgDiscontinuity,
      "Metadata Flags": metaScore,
      ...(classifierScore !== null && classifierScore !== undefined ? { "ML Classifier": clamp(classifierScore) } : {}),
    },
    disclaimer:
      "Indicative only, not forensic proof. " +
      "This analysis is performed by an AI model and is not forensically conclusive. " +
      "Results may vary with video quality, encoding, and model capability. " +
      "Do not use as sole evidence of manipulation.",
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

/** Clamps a number to [0, 1]. */
function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
