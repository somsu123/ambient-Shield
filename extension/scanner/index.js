// Ambient Shield — Unified Scanner Orchestrator (extension/scanner/index.js)
// ─────────────────────────────────────────────────────────────────────────────

import { classifyInputType, extractJobEntities, extractClaimEntities } from "./classifier.js";
import { retrieveMultiSourceEvidence } from "./retrieval.js";
import { verifyJobPosting } from "./job-verifier.js";
import { judgeClaimEvidence } from "./judge.js";
import { hashString } from "../llm.js";

const SCAN_HISTORY_KEY = "scanner_history";
const MAX_HISTORY = 50;

/**
 * Persists scan result in chrome.storage.local history (capped at 50, deduplicated).
 */
export async function saveScanToHistory(item) {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    const res = await new Promise((resolve) => chrome.storage.local.get([SCAN_HISTORY_KEY], resolve));
    const history = Array.isArray(res[SCAN_HISTORY_KEY]) ? res[SCAN_HISTORY_KEY] : [];
    // Deduplicate by text hash
    const filtered = history.filter((h) => h.id !== item.id);
    filtered.unshift(item);
    if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
    await new Promise((resolve) => chrome.storage.local.set({ [SCAN_HISTORY_KEY]: filtered }, resolve));
  } catch (_) {}
}

/**
 * Main entry point for scanning any text (Claims or Job Notices).
 * @param {string} rawText
 * @param {Function} onProgress Optional progress callback ({ step, message })
 */
export async function runUnifiedScan(rawText, onProgress = () => {}) {
  const text = (rawText || "").trim();
  if (!text || text.length < 10) {
    return {
      success: true,
      result: {
        type: "claim",
        verdict: "Couldn't verify",
        riskLevel: "SAFE",
        credibilityScore: 50,
        explanation: "Input text is too short to evaluate. Please provide a headline, claim, or job notice.",
        redFlags: [],
        whatToCheck: [],
        simpleSummary: "Please provide a more complete claim or job notice.",
      },
    };
  }

  // 1. Classify stage
  onProgress({ step: "classifying", message: "Detecting content type (Claim vs Job Notice)..." });
  const detectedType = classifyInputType(text);

  let scanResult = null;

  if (detectedType === "job") {
    // ── Branch A: Job Posting Verification ──
    onProgress({ step: "extracting", message: "Extracting employer, roles, locations, and recruiter contacts..." });
    const entities = extractJobEntities(text);

    scanResult = await verifyJobPosting(entities, onProgress);
    scanResult.type = "job";
  } else {
    // ── Branch B: General Claim / News Verification ──
    onProgress({ step: "extracting", message: "Analyzing claim structure..." });
    const claimEntities = extractClaimEntities(text);

    // Generate targeted search queries
    const queries = [
      claimEntities.cleanQuery,
      `${claimEntities.cleanQuery} fact check`,
    ];

    const evidence = await retrieveMultiSourceEvidence({
      queries,
      keywords: claimEntities.cleanQuery.split(" ").slice(0, 5),
      isJob: false,
      onProgress,
    });

    scanResult = await judgeClaimEvidence({
      claim: text,
      evidence,
      onProgress,
    });
    scanResult.type = "claim";
  }

  // Persist scan in local history
  const historyEntry = {
    id: hashString(text),
    type: scanResult.type,
    text: text.slice(0, 140),
    verdict: scanResult.verdict,
    riskLevel: scanResult.riskLevel,
    credibilityScore: scanResult.credibilityScore,
    timestamp: Date.now(),
  };
  saveScanToHistory(historyEntry);

  return {
    success: true,
    result: scanResult,
  };
}

