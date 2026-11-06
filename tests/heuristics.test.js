// Ambient Shield — Heuristics Unit Tests (tests/heuristics.test.js)
// ─────────────────────────────────────────────────────────────────────────────

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { analyzePolicyLocal, inspectImageHeuristics } from "../extension/heuristics.js";

describe("Offline Heuristics & Local Engines", () => {
  test("1. Offline Privacy Policy Analyzer: parses data types, red flags, and calculates risk score without network", () => {
    const samplePolicy = `
      We collect your precise geolocation, IP address, and biometric facial scan data.
      We sell your personal data to third-party advertising partners and data brokers.
      You agree to mandatory binding arbitration and class action waiver.
      You have the right to request deletion of your information under GDPR.
    `;

    const result = analyzePolicyLocal(samplePolicy, "ExampleApp");

    assert.equal(result.riskLevel, "DANGER");
    assert.ok(result.riskScore >= 7);
    assert.ok(result.whatTheyCollect.length >= 2);
    assert.ok(result.whoTheyShare.length >= 1);
    assert.ok(result.redFlags.length >= 2);
    assert.ok(result.yourRights.length >= 1);
    assert.match(result.summary, /ExampleApp/);
  });

  test("2. Safe Policy: low risk score and safe categorization", () => {
    const safePolicy = `
      We only collect your email address to provide login.
      We never sell your data or share it with third parties.
      You have the right to access and export your data or delete it at any time.
    `;

    const result = analyzePolicyLocal(safePolicy, "PrivacyFirstApp");

    assert.equal(result.riskLevel, "SAFE");
    assert.ok(result.riskScore <= 3.5);
    assert.equal(result.redFlags.length, 0);
  });

  test("3. Image & Deepfake Inspection: includes indicative non-conclusive disclaimer", () => {
    const findings = inspectImageHeuristics({
      filename: "ai_generated_portrait_midjourney_v6.png",
      fileSize: 204800,
      imageUrl: "https://example.com/images/ai_generated_portrait_midjourney_v6.png",
      mimeType: "image/png",
    });

    assert.equal(findings.category, "POTENTIAL_AI_GENERATED");
    assert.match(findings.disclaimer, /indicative and not forensically conclusive/i);
    assert.ok(findings.indicators.length > 0);
  });

  test("4. Adult Content Image Heuristic: blocks adult keyword filenames/URLs", () => {
    const findings = inspectImageHeuristics({
      filename: "explicit_nsfw_banner.jpg",
      fileSize: 102400,
      imageUrl: "https://cdn.example.com/nsfw/banner.jpg",
      mimeType: "image/jpeg",
    });

    assert.equal(findings.category, "ADULT");
    assert.equal(findings.shouldBlock, true);
  });
});
