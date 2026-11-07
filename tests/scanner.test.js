// Ambient Shield — Unified Scanner Unit & Integration Tests (tests/scanner.test.js)
// ─────────────────────────────────────────────────────────────────────────────

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyInputType, extractJobEntities, extractClaimEntities } from "../extension/scanner/classifier.js";
import { checkDomainAgeRDAP, verifyJobPosting } from "../extension/scanner/job-verifier.js";
import { checkRealDateTimeParadox, verifyCitationsAgainstEvidence, judgeClaimEvidence } from "../extension/scanner/judge.js";
import { cleanAndParseJSON } from "../extension/llm.js";

describe("Unified Misinformation & Job Legitimacy Scanner", () => {

  // 1. Classification Tests
  test("1. Job vs Claim classification on 10 diverse examples", () => {
    const examples = [
      { text: "HIRING FRESHERS | HETERO | SANATH NAGAR, HYDERABAD | Walk-in Interview for QC/QA", expected: "job" },
      { text: "Urgent recruitment: Software Engineer at Infosys Bangalore. Apply at careers@infosys.com", expected: "job" },
      { text: "Summer internship opening with stipend 25000/month. Freshers eligible. Register now.", expected: "job" },
      { text: "Immediate walk-in drive for Production executive at Dr Reddys Hyderabad.", expected: "job" },
      { text: "Work from home data entry vacancy. Registration fee of Rs 500 required before joining.", expected: "job" },
      { text: "NASA confirms that the James Webb telescope detected water vapor on an exoplanet.", expected: "claim" },
      { text: "Drinking hot lemon water cures cancer in 48 hours according to new study.", expected: "claim" },
      { text: "The Eiffel Tower was originally intended for Barcelona, Spain.", expected: "claim" },
      { text: "World Health Organization declares new global health emergency.", expected: "claim" },
      { text: "Government announces tax reform bill passed by parliament.", expected: "claim" },
    ];

    for (const ex of examples) {
      const type = classifyInputType(ex.text);
      assert.equal(type, ex.expected, `Failed on: "${ex.text.slice(0, 40)}" (got ${type}, expected ${ex.expected})`);
    }
  });

  // 2. Entity Extraction on Screenshot Case
  test("2. Entity extraction parses company, role, location, and contacts from screenshot case", () => {
    const heteroPost = `HIRING FRESHERS | HETERO | SANATH NAGAR, HYDERABAD
Walk-in Interview for Production & Quality Control (QC)
Location: Sanath Nagar, Hyderabad
Date: 15th Nov
Eligibility: B.Sc / M.Sc Freshers
Contact: hr@hetero.com or call 9876543210
Official careers portal: https://www.hetero.com/careers`;

    const entities = extractJobEntities(heteroPost);

    assert.equal(entities.company, "HETERO");
    assert.ok(entities.roles.some((r) => /production|quality control|qc/i.test(r)));
    assert.ok(entities.locations.some((l) => /hyderabad|sanath nagar/i.test(l)));
    assert.ok(entities.contacts.emails.includes("hr@hetero.com"));
    assert.ok(entities.contacts.corporateEmails.includes("hr@hetero.com"));
    assert.equal(entities.contacts.freeEmails.length, 0);
  });

  // 3. Verifiable Citation Substring Matcher
  test("3. Verifiable citation check drops quotes that are not substrings of fetched text", () => {
    const evidence = [
      {
        url: "https://example.com/report",
        title: "Official Press Release",
        snippet: "Global temperatures rose by 1.1 degrees Celsius over the pre-industrial baseline.",
        fullContent: "Global temperatures rose by 1.1 degrees Celsius over the pre-industrial baseline according to the consensus report.",
      },
    ];

    const citations = [
      { url: "https://example.com/report", quote: "1.1 degrees Celsius over the pre-industrial baseline" },
      { url: "https://example.com/report", quote: "temperatures will definitely skyrocket by 10 degrees next month" }, // Hallucinated
    ];

    const verified = verifyCitationsAgainstEvidence(citations, evidence);

    assert.equal(verified.length, 1);
    assert.equal(verified[0].quote, "1.1 degrees Celsius over the pre-industrial baseline");
  });

  // 4. Time Paradox Check with Real Date
  test("4. Time paradox check flags future claims as non-verifiable using real date", () => {
    const realNow = new Date();
    const futureYear = realNow.getFullYear() + 3;

    const futureClaim = `In ${futureYear}, the new space station was successfully launched.`;
    const pastClaim = `In 1969, Apollo 11 landed on the Moon.`;

    const resFuture = checkRealDateTimeParadox(futureClaim, realNow);
    const resPast = checkRealDateTimeParadox(pastClaim, realNow);

    assert.equal(resFuture.isParadox, true);
    assert.equal(resFuture.futureYear, futureYear);
    assert.match(resFuture.reasoning, /cannot be verified yet/i);

    assert.equal(resPast.isParadox, false);
  });

  // 5. Fallback Mode when Ollama is Offline
  test("5. Fallback mode: when Ollama is offline, returns evidence-only verdict capped at 'Couldn't verify'", async () => {
    const fakeEvidence = [
      { url: "https://example.com/source", title: "Source 1", snippet: "Relevant factual excerpt here.", source: "Web" },
    ];

    // Force judge to run without a working Ollama server
    const result = await judgeClaimEvidence({
      claim: "Some controversial claim about health",
      evidence: fakeEvidence,
      onProgress: () => {},
    });

    assert.ok(result.verdict === "Couldn't verify" || result.verdict === "Unverified");
    assert.equal(result.riskLevel, "CAUTION");
    assert.equal(result.credibilityScore, 50);
    assert.equal(result.offlineJudge, true);
    assert.ok(result.evidenceSources.length > 0);
  });

  // 6. JSON Repair & Extraction
  test("6. JSON repair handles markdown code fences, leading text, and trailing blocks", () => {
    const rawFenced = "```json\n{\n  \"verdict\": \"supported\",\n  \"confidence\": 0.95,\n  \"reasoning\": \"Valid claim\"\n}\n```";
    const parsed = cleanAndParseJSON(rawFenced);

    assert.ok(parsed);
    assert.equal(parsed.verdict, "supported");
    assert.equal(parsed.confidence, 0.95);

    const conversational = "Here is your JSON output:\n{\"status\":\"ok\",\"score\":88}\nHope this helps!";
    const parsed2 = cleanAndParseJSON(conversational);

    assert.ok(parsed2);
    assert.equal(parsed2.status, "ok");
    assert.equal(parsed2.score, 88);
  });

  // 7. RDAP Domain Age Check
  test("7. RDAP domain age parsing flags new domains and handles errors gracefully", async () => {
    // Test with invalid domain
    const badRes = await checkDomainAgeRDAP("invalid-nonexistent-domain-123456789.xyz");
    assert.equal(badRes.status, "unknown");

    // Null/empty domain input
    const emptyRes = await checkDomainAgeRDAP("");
    assert.equal(emptyRes.status, "unknown");
  });

  // 8. Job Contact Red Flags & Scam Detection
  test("8. Job contact red flag tests catch free-mail (@gmail), link shorteners, WhatsApp-only, and registration fees", async () => {
    const scamPost = `WALK-IN INTERVIEW AT TECH SOLUTIONS!
Role: Data Entry Clerk / Assistant
Immediate Joining! Salary: 45,000/month.
Registration fee of Rs. 1500 must be deposited for interview pass.
Apply via bit.ly/easyjob2026 or WhatsApp your resume to 919999888877.
Contact: recruiter.techsolutions@gmail.com`;

    const entities = extractJobEntities(scamPost);

    assert.ok(entities.contacts.freeEmails.includes("recruiter.techsolutions@gmail.com"));
    assert.ok(entities.contacts.shortened.length > 0);
    assert.ok(entities.fees);

    const evaluation = await verifyJobPosting(entities, () => {});

    assert.equal(evaluation.verdict, "High scam risk");
    assert.equal(evaluation.riskLevel, "DANGER");
    assert.ok(evaluation.credibilityScore <= 30);
    assert.equal(evaluation.checklist.feeCheck.status, "fail");
    assert.equal(evaluation.checklist.contactValidity.status, "fail");
    assert.ok(evaluation.redFlags.length >= 2);
  });

  // 9. Legitimate Walk-In Job Post Multi-Check (Hetero)
  test("9. Legitimate walk-in multi-check correctly validates corporate domain, physical venue, and zero fees", async () => {
    const heteroPost = `HIRING FRESHERS | HETERO | SANATH NAGAR, HYDERABAD 🚨
Freshers, start your career with Hetero!
Hetero is hiring freshers for Production & Packing (OSD) and Warehouse roles.
Open Positions: Production & Packing (OSD): ITI / Diploma / BSc / BCom / BA / B.Tech, Warehouse: BSc / BCom / BA
Experience: Freshers. Eligible Batches: 2024 / 2025 / 2026 passed-outs
Work Location: Hyderabad / Bangalore
Interview Date: 7th November 2026 (Saturday) 9:30 AM – 4:00 PM
Venue: 7-2-A2, Hetero Corporate, Industrial Estates, Sanath Nagar, Hyderabad
Please bring: Updated Resume, Education Documents, ID Proof (Aadhar/PAN)
For further information: Hemanth.v@hetero.com`;

    const entities = extractJobEntities(heteroPost);

    assert.equal(entities.company, "HETERO");
    assert.ok(entities.roles.includes("Production & Packing"));
    assert.ok(entities.roles.includes("Warehouse"));
    assert.ok(entities.contacts.corporateEmails.includes("hemanth.v@hetero.com"));
    assert.equal(entities.contacts.freeEmails.length, 0);
    assert.equal(entities.fees, null);

    const evaluation = await verifyJobPosting(entities, () => {});

    assert.equal(evaluation.verdict, "Likely legitimate");
    assert.equal(evaluation.riskLevel, "SAFE");
    assert.ok(evaluation.credibilityScore >= 70);
    assert.equal(evaluation.checklist.feeCheck.status, "pass");
    assert.equal(evaluation.checklist.contactValidity.status, "pass");
    assert.equal(evaluation.checklist.companyWebsite.status, "pass");
    assert.equal(evaluation.officialDomain, "hetero.com");
  });
});

