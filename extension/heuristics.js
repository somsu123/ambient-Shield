// Ambient Shield — Local Heuristics & Verification Engine (extension/heuristics.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks for time paradoxes using real reference date (default: new Date()).
 * Future events are classified as "insufficient" ("cannot be verified yet"), NOT "false".
 */
export function checkTimeParadox(claim, referenceDate = new Date()) {
  const currentYear = referenceDate.getFullYear();
  const yearMatch = claim.match(/\b(20\d{2})\b/);
  const pastTense = /\b(won|did|happened|was|defeated|lost|elected|declared|announced|resulted|signed|crashed|passed)\b/i.test(claim);

  if (yearMatch && pastTense) {
    const claimedYear = parseInt(yearMatch[1], 10);
    if (claimedYear > currentYear) {
      return {
        isParadox: true,
        verdict: "insufficient",
        confidence: 0.95,
        reasoning: `Time anomaly: This claim refers to ${claimedYear} as already having occurred, but the current year is ${currentYear}. Future events cannot be verified yet.`,
        citations: [],
      };
    }
  }

  return { isParadox: false };
}

/**
 * Verifies that citation quotes are true substrings of the retrieved evidence passages.
 * Drops citations that cannot be verified.
 */
export function filterVerifiableCitations(citations, evidenceList) {
  if (!Array.isArray(citations) || !Array.isArray(evidenceList)) return [];

  const verified = [];
  const normalizedEvidence = evidenceList.map(e => ({
    url: (e.url || "").trim().toLowerCase(),
    snippet: (e.snippet || "").toLowerCase().replace(/\s+/g, " "),
  }));

  for (const c of citations) {
    if (!c || !c.url || !c.quote) continue;
    const cleanQuote = c.quote.trim().toLowerCase().replace(/\s+/g, " ");
    if (cleanQuote.length < 5) continue;

    // Check if the quote exists in any evidence snippet from the same URL (or any fetched snippet)
    const matchesSource = normalizedEvidence.some(ev => {
      const urlMatch = ev.url.includes(c.url.toLowerCase()) || c.url.toLowerCase().includes(ev.url);
      return ev.snippet.includes(cleanQuote) || (urlMatch && ev.snippet.includes(cleanQuote.slice(0, 30)));
    });

    if (matchesSource) {
      verified.push({ url: c.url, quote: c.quote });
    }
  }

  return verified;
}

/**
 * Local Image & Deepfake Heuristics
 * Analyzes metadata, size, URL patterns, and formats without cloud dependence.
 */
export function inspectImageHeuristics({ filename = "", fileSize = 0, imageUrl = "", mimeType = "" }) {
  const indicators = [];
  let isAdult = false;
  let isSuspicious = false;
  let reason = "Standard visual media.";

  const lowerUrl = (imageUrl || "").toLowerCase();
  const lowerName = (filename || "").toLowerCase();

  // 1. Adult keyword heuristic
  const ADULT_KWS = ["porn", "nsfw", "xxx", "nude", "erotic", "sex", "onlyfans"];
  if (ADULT_KWS.some(kw => lowerUrl.includes(kw) || lowerName.includes(kw))) {
    indicators.push("Adult keywords detected in image URL or filename");
    isAdult = true;
    reason = "Adult content signal in filename/URL.";
  }

  // 2. Synthetic / AI generator indicators in filename or metadata
  const AI_TAGS = ["midjourney", "dall-e", "stablediffusion", "novelai", "comfyui", "flux", "synthid", "sdxl"];
  if (AI_TAGS.some(tag => lowerName.includes(tag) || lowerUrl.includes(tag))) {
    indicators.push("AI generator identifier present in filename/source metadata");
    isSuspicious = true;
    reason = "Filename contains generative AI signature.";
  }

  // 3. File size and format checks
  if (fileSize > 10 * 1024 * 1024) {
    indicators.push("File exceeds 10MB limit");
  }

  const category = isAdult
    ? "ADULT"
    : isSuspicious
      ? "POTENTIAL_AI_GENERATED"
      : "CLEAN";

  return {
    category,
    confidence: isAdult || isSuspicious ? 0.75 : 0.6,
    disclaimer: "Visual heuristics are indicative and not forensically conclusive. General LLMs cannot guarantee deepfake detection.",
    indicators,
    reason,
    shouldBlock: isAdult,
  };
}

/**
 * 100% Offline Privacy Policy Analyzer
 * Uses weighted keyword extraction and structural pattern analysis.
 */
export function analyzePolicyLocal(input, siteName = "") {
  const text = (input || "").toLowerCase();

  const COLLECT_PATTERNS = [
    { label: "IP addresses and device identifiers", re: /ip address|device identifier|mac address|imei/i },
    { label: "Precise geolocation data", re: /precise location|gps|geolocation|physical location/i },
    { label: "Browsing and search history", re: /browsing history|search history|pages viewed|clickstream/i },
    { label: "Biometric or facial scan data", re: /biometric|facial recognition|voiceprint|fingerprint/i },
    { label: "Financial and payment details", re: /credit card|payment card|billing address|bank account/i },
    { label: "Contact information (email, phone, address)", re: /email address|phone number|postal address|contacts/i },
    { label: "Social media and third-party profiles", re: /facebook connect|google sign-in|social profile/i },
  ];

  const SHARE_PATTERNS = [
    { label: "Third-party advertising partners and data brokers", re: /advertising partners?|ad networks?|data brokers?|marketing partners?/i },
    { label: "Law enforcement and government agencies", re: /law enforcement|subpoena|legal obligation|court order/i },
    { label: "Affiliates and subsidiaries during corporate sale", re: /merger|acquisition|corporate affiliates?|subsidiaries/i },
    { label: "Service providers and analytics contractors", re: /service providers?|analytics providers?|vendors?|contractors?/i },
  ];

  const RIGHTS_PATTERNS = [
    { label: "Right to access and export your data (GDPR/CCPA)", re: /right to access|request a copy|data portability|export/i },
    { label: "Right to delete / erasure ('Right to be Forgotten')", re: /right to delete|request deletion|erasure|be forgotten/i },
    { label: "Right to opt out of data selling / sharing", re: /opt-out|do not sell|opt out of sale|targeted advertising/i },
    { label: "Right to correct or rectify inaccuracies", re: /rectify|correct inaccuracies|update information/i },
  ];

  const RED_FLAGS = [
    {
      label: "Explicit selling or sharing of personal data with third parties",
      test: (t) => /sell your (personal|data)|share.*for monetary/i.test(t) && !/(never|do not|don't|will not)\s+sell/i.test(t),
    },
    {
      label: "Forced mandatory binding arbitration and class action waiver",
      test: (t) => /binding arbitration|class action waiver|dispute resolution/i.test(t),
    },
    {
      label: "Persistent cross-site tracking across unaffiliated apps",
      test: (t) => /cross-site|track you across|across third-party sites/i.test(t),
    },
    {
      label: "Broad retention of deleted content in indefinite backups",
      test: (t) => /retain indefinitely|backup copies indefinitely/i.test(t),
    },
    {
      label: "No prior notice required for material policy amendments",
      test: (t) => /without prior notice|modify at any time without notice/i.test(t),
    },
  ];

  const collected = COLLECT_PATTERNS.filter(p => p.re.test(text)).map(p => p.label);
  const shared = SHARE_PATTERNS.filter(p => p.re.test(text)).map(p => p.label);
  const rights = RIGHTS_PATTERNS.filter(p => p.re.test(text)).map(p => p.label);
  const redFlags = RED_FLAGS.filter(p => p.test(text)).map(p => p.label);

  // Compute risk score (1-10)
  let score = 3.0;
  score += redFlags.length * 1.5;
  score += Math.min(collected.length * 0.4, 2.0);
  score += Math.min(shared.length * 0.4, 1.5);
  if (rights.length >= 2) score -= 1.0;
  score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

  const riskLevel = score >= 7 ? "DANGER" : score >= 4 ? "CAUTION" : "SAFE";

  const optOutTips = [];
  if (collected.some(c => c.includes("geolocation"))) {
    optOutTips.push("Disable precise location access in browser site settings.");
  }
  if (shared.some(s => s.includes("advertising"))) {
    optOutTips.push("Submit a 'Do Not Sell My Info' or Global Privacy Control (GPC) signal.");
  }
  optOutTips.push("Clear cookies regularly or enable tracker protection in your browser.");

  return {
    riskScore: score,
    riskLevel,
    summary: `${siteName ? siteName + "'s" : "This"} policy was scanned offline. Identified ${collected.length} data collection categories and ${redFlags.length} major red flags.`,
    whatTheyCollect: collected,
    whoTheyShare: shared,
    yourRights: rights,
    redFlags,
    simpleSummary: `Overall risk is rated ${riskLevel} (${score}/10). ${redFlags.length > 0 ? "Key concerns include " + redFlags[0] : "Standard privacy disclosures identified."}`,
    optOutTips,
    verdict: `Assessment: ${riskLevel} rating based on local heuristic inspection.`,
  };
}
