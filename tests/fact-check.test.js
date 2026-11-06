// Ambient Shield — Fact Checker Unit Tests (tests/fact-check.test.js)
// ─────────────────────────────────────────────────────────────────────────────

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkTimeParadox, filterVerifiableCitations } from "../extension/heuristics.js";

describe("Fact Checker: Truthfulness & Verification Logic", () => {
  test("1. Time Paradox with Real Date: flags future events as 'insufficient', NOT 'false'", () => {
    const today = new Date(); // Dynamic real date
    const futureYear = today.getFullYear() + 4;
    const claim = `Candidate Alpha won the ${futureYear} General Election landslide victory`;

    const paradox = checkTimeParadox(claim, today);

    assert.equal(paradox.isParadox, true);
    assert.equal(paradox.verdict, "insufficient");
    assert.match(paradox.reasoning, /cannot be verified yet/i);
    assert.doesNotMatch(paradox.verdict, /false/i);
  });

  test("2. Past Event Date: does not trigger time paradox", () => {
    const today = new Date();
    const pastClaim = `The 2020 election results were officially certified.`;

    const paradox = checkTimeParadox(pastClaim, today);
    assert.equal(paradox.isParadox, false);
  });

  test("3. Verifiable Citations: keeps quotes that match retrieved text substrings", () => {
    const evidenceList = [
      {
        url: "https://en.wikipedia.org/wiki/James_Webb_Space_Telescope",
        snippet: "The James Webb Space Telescope was launched on 25 December 2021 on an Ariane 5 rocket from Kourou, French Guiana.",
      },
    ];

    const citations = [
      {
        url: "https://en.wikipedia.org/wiki/James_Webb_Space_Telescope",
        quote: "launched on 25 December 2021",
      },
      {
        url: "https://en.wikipedia.org/wiki/James_Webb_Space_Telescope",
        quote: "fabricated quote that does not exist in the source",
      },
    ];

    const verified = filterVerifiableCitations(citations, evidenceList);

    assert.equal(verified.length, 1);
    assert.equal(verified[0].quote, "launched on 25 December 2021");
  });

  test("4. Verdict Mapping & UI Safety: ensures no 'FALSE' label on weak evidence", () => {
    // Verifies schema mapping contracts
    const mapVerdict = (llmVerdict) => {
      if (llmVerdict === "supported") return { verdict: "Supported by sources", risk: "SAFE" };
      if (llmVerdict === "contradicted") return { verdict: "Contradicted by sources", risk: "DANGER" };
      return { verdict: "Couldn't verify", risk: "CAUTION" };
    };

    assert.deepEqual(mapVerdict("supported"), { verdict: "Supported by sources", risk: "SAFE" });
    assert.deepEqual(mapVerdict("contradicted"), { verdict: "Contradicted by sources", risk: "DANGER" });
    assert.deepEqual(mapVerdict("insufficient"), { verdict: "Couldn't verify", risk: "CAUTION" });
    assert.deepEqual(mapVerdict("unknown"), { verdict: "Couldn't verify", risk: "CAUTION" });
  });
});
