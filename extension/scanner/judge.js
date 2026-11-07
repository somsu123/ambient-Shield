// Ambient Shield — Local LLM Evidence Judge & Citation Verifier (extension/scanner/judge.js)
// ─────────────────────────────────────────────────────────────────────────────

import { callLLM } from "../llm.js";

/**
 * Checks for future date claims (time paradox) using the real current date.
 * Future events cannot be verified yet (verdict: "insufficient" / "Couldn't verify").
 */
export function checkRealDateTimeParadox(claim, referenceDate = new Date()) {
  if (!claim || typeof claim !== "string") {
    return { isParadox: false };
  }

  const currentYear = referenceDate.getFullYear();
  const yearMatches = claim.match(/\b(20\d\d)\b/g);

  if (yearMatches) {
    for (const ym of yearMatches) {
      const year = parseInt(ym, 10);
      if (year > currentYear) {
        return {
          isParadox: true,
          futureYear: year,
          reasoning: `The claim mentions the year ${year}, which is in the future (current year: ${currentYear}). Future events cannot be verified yet.`,
        };
      }
    }
  }

  return { isParadox: false };
}

/**
 * Verifies that each citation quote from the LLM is a literal substring of the fetched text.
 * Drops any hallucinated or non-verbatim quotes.
 */
export function verifyCitationsAgainstEvidence(citations = [], evidence = []) {
  if (!Array.isArray(citations) || citations.length === 0) return [];
  if (!Array.isArray(evidence) || evidence.length === 0) return [];

  const verified = [];

  for (const cite of citations) {
    if (!cite || !cite.quote || typeof cite.quote !== "string") continue;
    const cleanQuote = cite.quote.trim();
    if (cleanQuote.length < 10) continue;

    // Find if cleanQuote exists as a literal substring in any retrieved evidence page
    const matchedEvidence = evidence.find((e) => {
      const full = e.fullContent || e.snippet || "";
      return full.toLowerCase().includes(cleanQuote.toLowerCase());
    });

    if (matchedEvidence) {
      verified.push({
        url: cite.url || matchedEvidence.url,
        quote: cleanQuote,
        title: matchedEvidence.title || "Web Source",
        source: matchedEvidence.source || "Web",
        verifiedSubstring: true,
      });
    }
  }

  return verified;
}

const FACT_CHECK_SYSTEM = `You are a rigorous, unbiased fact-checking judge running locally on the user's device.
You evaluate whether a specific claim is supported or contradicted based SOLELY on the provided retrieved web passages.

CRITICAL RULES:
1. Base your judgment ONLY on the provided evidence passages. Do NOT assume facts or hallucinate external information.
2. If the evidence does not clearly confirm or disprove the claim, or if reliable sources are absent, verdict MUST be "insufficient".
3. NEVER invent or fabricate sources or quotes. Every quote in citations MUST be an exact verbatim substring from the evidence.
4. Output MUST strictly be valid JSON matching the schema. No markdown outside the JSON.`;

const FACT_CHECK_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["supported", "contradicted", "insufficient"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          quote: { type: "string" },
        },
        required: ["url", "quote"],
      },
    },
  },
  required: ["verdict", "confidence", "reasoning", "citations"],
};

/**
 * Judges news or general factual claims against retrieved evidence using local Gemma.
 * Falls back to "evidence-only" mode if LLM is offline or fails.
 */
export async function judgeClaimEvidence({
  claim,
  evidence = [],
  onProgress = () => {},
}) {
  onProgress({ step: "judging", message: "Evaluating evidence with local Gemma model..." });

  // 1. Time paradox check with real current date
  const paradox = checkRealDateTimeParadox(claim, new Date());
  if (paradox.isParadox) {
    return {
      verdict: "Couldn't verify",
      riskLevel: "CAUTION",
      credibilityScore: 50,
      explanation: paradox.reasoning,
      redFlags: ["Claim references a future year or event."],
      evidenceSources: [],
      citations: [],
      simpleSummary: "Future events cannot be verified yet.",
      offlineJudge: false,
    };
  }

  // 2. Prepare passages for LLM
  const passagesText = evidence.map((e, idx) => {
    return `[SOURCE ${idx + 1}] (${e.source}: ${e.url})\n"${(e.fullContent || e.snippet).slice(0, 1200)}"\n`;
  }).join("\n---\n");

  const prompt = `Current Date: ${new Date().toISOString().split("T")[0]}
Claim to judge: "${claim}"

RETRIEVED EVIDENCE PASSAGES:
${passagesText || "No verified web passages could be retrieved."}

Analyze the claim against ONLY the passages above and respond with JSON matching schema:
{
  "verdict": "supported" | "contradicted" | "insufficient",
  "confidence": number between 0.0 and 1.0,
  "reasoning": "Clear factual explanation based on the passages",
  "citations": [{"url": "source url", "quote": "verbatim quote from passage"}]
}`;

  // 3. Call local LLM
  const llmRes = await callLLM({
    system: FACT_CHECK_SYSTEM,
    prompt,
    schema: FACT_CHECK_SCHEMA,
  });

  // 4. Fallback: Evidence-only mode when LLM is unavailable
  if (!llmRes.success) {
    const hasEvidence = evidence.length > 0;
    return {
      verdict: "Couldn't verify",
      riskLevel: "CAUTION",
      credibilityScore: 50,
      explanation: hasEvidence
        ? `Retrieved ${evidence.length} web sources, but local AI judging is offline. Review the retrieved evidence below.`
        : "No reliable web sources found to evaluate this claim, and local AI judging is offline.",
      redFlags: ["Local AI judge offline (evidence-only mode)."],
      evidenceSources: evidence.map((e) => ({
        url: e.url,
        title: e.title || e.source,
        snippet: (e.snippet || e.fullContent || "").slice(0, 200),
        source: e.source,
      })),
      citations: [],
      simpleSummary: "Couldn't verify (AI judge offline).",
      offlineJudge: true,
      llmError: llmRes.error,
    };
  }

  // 5. Parse and verify LLM output
  const data = llmRes.data || {};
  const rawVerdict = data.verdict || "insufficient";
  const confidence = typeof data.confidence === "number" ? data.confidence : 0.5;
  const reasoning = data.reasoning || "Evidence evaluated by local Gemma.";
  const rawCitations = Array.isArray(data.citations) ? data.citations : [];

  // Drop quotes that are not literal substrings of retrieved evidence
  const verifiedCitations = verifyCitationsAgainstEvidence(rawCitations, evidence);

  // Map to honest, truthful UI wording
  let mappedVerdict = "Couldn't verify";
  let riskLevel = "CAUTION";
  let credibilityScore = 50;

  if (rawVerdict === "supported") {
    mappedVerdict = "Supported by sources";
    riskLevel = "SAFE";
    credibilityScore = Math.max(70, Math.round(confidence * 100));
  } else if (rawVerdict === "contradicted") {
    mappedVerdict = "Contradicted by sources";
    riskLevel = "DANGER";
    credibilityScore = Math.min(25, Math.round((1 - confidence) * 100));
  } else {
    mappedVerdict = "Couldn't verify";
    riskLevel = "CAUTION";
    credibilityScore = 50;
  }

  return {
    verdict: mappedVerdict,
    riskLevel,
    credibilityScore,
    explanation: reasoning,
    redFlags: mappedVerdict === "Contradicted by sources" ? ["Contradicted by retrieved live evidence."] : [],
    evidenceSources: evidence.map((e) => ({
      url: e.url,
      title: e.title || e.source,
      snippet: (e.snippet || e.fullContent || "").slice(0, 240),
      source: e.source,
    })),
    citations: verifiedCitations,
    simpleSummary: `${mappedVerdict}. Confidence: ${Math.round(confidence * 100)}%`,
    cached: llmRes.cached,
    offlineJudge: false,
  };
}

