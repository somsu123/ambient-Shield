// Ambient Shield — JSON Stripping, Repair & Validation (extension/llm/repair.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips code fences, markdown wrapping, and extracts outermost JSON block.
 */
export function extractJSON(rawText) {
  if (typeof rawText !== "string") return null;

  let cleaned = rawText.trim();
  // Strip ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Attempt to isolate substring between outermost { } or [ ]
    const firstBrace = cleaned.indexOf("{");
    const lastBrace  = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (_) {}
    }

    const firstSquare = cleaned.indexOf("[");
    const lastSquare  = cleaned.lastIndexOf("]");
    if (firstSquare !== -1 && lastSquare > firstSquare) {
      try {
        return JSON.parse(cleaned.substring(firstSquare, lastSquare + 1));
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Validates and sanitizes parsed JSON against expected schema structure.
 */
export function validateSchema(task, data) {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Result is not an object" };
  }

  if (task === "FACT_CHECK") {
    const validVerdicts = ["supported", "contradicted", "insufficient"];
    const verdict = validVerdicts.includes(data.verdict) ? data.verdict : "insufficient";
    const confidence = typeof data.confidence === "number"
      ? Math.max(0, Math.min(1, data.confidence))
      : 0.5;
    const reasoning = typeof data.reasoning === "string" ? data.reasoning : "Analysis completed.";
    const rawCitations = Array.isArray(data.citations) ? data.citations : [];
    const citations = rawCitations
      .filter(c => c && typeof c.url === "string" && typeof c.quote === "string")
      .map(c => ({ url: c.url.trim(), quote: c.quote.trim() }));

    return {
      valid: true,
      data: { verdict, confidence, reasoning, citations }
    };
  }

  if (task === "TRUST_AURA") {
    const validLevels = ["safe", "caution", "danger"];
    const level = validLevels.includes(data.level) ? data.level : "caution";
    const confidence = typeof data.confidence === "number"
      ? Math.max(0, Math.min(1, data.confidence))
      : 0.5;
    const reason = typeof data.reason === "string" ? data.reason.slice(0, 80) : "";

    return {
      valid: true,
      data: { level, confidence, reason }
    };
  }

  if (task === "POLICY_SUMMARY") {
    return {
      valid: true,
      data: {
        simpleSummary: typeof data.simpleSummary === "string" ? data.simpleSummary : "",
        keyRisks: Array.isArray(data.keyRisks) ? data.keyRisks.filter(s => typeof s === "string") : [],
        dataCollected: Array.isArray(data.dataCollected) ? data.dataCollected.filter(s => typeof s === "string") : [],
        rights: Array.isArray(data.rights) ? data.rights.filter(s => typeof s === "string") : [],
        optOutTips: Array.isArray(data.optOutTips) ? data.optOutTips.filter(s => typeof s === "string") : []
      }
    };
  }

  if (task === "IMAGE_INSPECTION") {
    const validCats = ["CLEAN", "SUSPICIOUS", "POTENTIAL_AI_GENERATED", "ADULT", "VIOLENCE"];
    const category = validCats.includes(data.category) ? data.category : "SUSPICIOUS";
    const confidence = typeof data.confidence === "number" ? Math.max(0, Math.min(1, data.confidence)) : 0.5;
    const disclaimer = typeof data.disclaimer === "string"
      ? data.disclaimer
      : "Visual heuristics are indicative and not forensically conclusive.";
    const indicators = Array.isArray(data.indicators) ? data.indicators.filter(s => typeof s === "string") : [];
    const reason = typeof data.reason === "string" ? data.reason : "";

    return {
      valid: true,
      data: { category, confidence, disclaimer, indicators, reason }
    };
  }

  // Fallback pass-through
  return { valid: true, data };
}
