// Ambient Shield — LLM Prompts & Schemas (extension/llm/prompts.js)
// Centralized, strict prompt templates and JSON output schemas.
// ─────────────────────────────────────────────────────────────────────────────

export const PROMPTS = {
  FACT_CHECK: {
    system: `You are an impartial, forensic fact-checking engine.
Evaluate the user's claim strictly and ONLY based on the provided retrieved evidence passages.
Do not invent information or extrapolate beyond the provided text.
Always reply in valid JSON adhering to the specified schema.`,
    schema: {
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
    },
    buildPrompt: ({ claim, evidence, currentYear }) => {
      const evidenceFormatted = evidence.length > 0
        ? evidence.map((e, idx) => `[Source ${idx + 1}] URL: ${e.url}\nExcerpt: "${e.snippet}"`).join("\n\n")
        : "No evidence found.";

      return `Current Reference Year: ${currentYear}

CLAIM TO VERIFY:
"${claim}"

RETRIEVED EVIDENCE PASSAGES:
${evidenceFormatted}

INSTRUCTIONS:
1. Compare the claim with the evidence passages.
2. If the evidence directly supports the claim, output verdict "supported".
3. If the evidence directly contradicts the claim, output verdict "contradicted".
4. If the evidence is incomplete, absent, or inconclusive, output verdict "insufficient".
5. Every citation must include the exact URL and an EXACT verbatim quote substring present in that source passage.
6. Return JSON only.`;
    },
  },

  TRUST_AURA: {
    system: `You are a social feed credibility classifier.
Analyze the given post/ad text for deceptive claims, clickbait, scams, or factual accuracy.
Always respond with valid JSON adhering to the specified schema.`,
    schema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["safe", "caution", "danger"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" },
      },
      required: ["level", "confidence", "reason"],
    },
    buildPrompt: ({ text, isAd, context }) => {
      return `Item Type: ${isAd ? "Sponsored Ad" : "Social Feed Post"}
${context ? `Context / Web Search: ${context}\n` : ""}
Post Content:
"${text.slice(0, 500)}"

Evaluate whether this content is:
- "safe": normal discussion, verified announcement, or authentic post.
- "caution": sensationalist, unverified claim, high-pressure marketing.
- "danger": known fraud, financial scam, fabricated headline, or dangerous misinformation.

Keep "reason" under 60 characters. Return JSON only.`;
    },
  },

  POLICY_SUMMARY: {
    system: `You are a consumer privacy and digital rights analyst.
Synthesize privacy policy text into concise, plain-language insights.
Always respond with valid JSON adhering to the specified schema.`,
    schema: {
      type: "object",
      properties: {
        simpleSummary: { type: "string" },
        keyRisks: { type: "array", items: { type: "string" } },
        dataCollected: { type: "array", items: { type: "string" } },
        rights: { type: "array", items: { type: "string" } },
        optOutTips: { type: "array", items: { type: "string" } },
      },
      required: ["simpleSummary", "keyRisks", "dataCollected", "rights", "optOutTips"],
    },
    buildPrompt: ({ policyText, siteName }) => {
      return `Target Entity: ${siteName || "Web Service"}
Policy Excerpt:
"${policyText.slice(0, 4000)}"

Provide a plain-English summary of:
1. What personal data is collected.
2. Major red flags or risks (e.g. tracking, data sales).
3. Consumer rights available (GDPR/CCPA/deletion).
4. Concrete opt-out steps the user can take.
Return JSON only.`;
    },
  },

  IMAGE_INSPECTION: {
    system: `You are an image forensic assistant.
Evaluate image attributes and visual indicators.
Deepfake detection is not conclusive; always provide calibrated confidence and transparent disclaimers.
Always respond with valid JSON adhering to the specified schema.`,
    schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["CLEAN", "SUSPICIOUS", "POTENTIAL_AI_GENERATED", "ADULT", "VIOLENCE"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        disclaimer: { type: "string" },
        indicators: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: ["category", "confidence", "disclaimer", "indicators", "reason"],
    },
    buildPrompt: ({ filename, heuristicFindings, note }) => {
      return `Filename: ${filename || "uploaded_image"}
Heuristic metadata findings: ${JSON.stringify(heuristicFindings || {})}
${note ? `Notes: ${note}\n` : ""}
Inspect the available visual indicators and metadata.
Provide an indicative category assessment with honest limitations.
Return JSON only.`;
    },
  },
};
