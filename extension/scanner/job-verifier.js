// Ambient Shield — Job & Hiring Post Legitimacy Verifier (extension/scanner/job-verifier.js)
// ─────────────────────────────────────────────────────────────────────────────

import { searchDuckDuckGoLite } from "./retrieval.js";
import { callLLM } from "../llm.js";

const RDAP_TIMEOUT_MS = 6000;

export const JOB_AUDIT_SYSTEM = `You are an expert recruitment fraud investigator and corporate verification intelligence engine.
Analyze job postings, walk-in notifications, and internship offers for authenticity and scam patterns.
Evaluate:
1. Corporate Identity: Is the stated employer genuine, and is this their standard domain/industry?
2. Physical Venue: Does the walk-in venue correspond to real corporate premises/plants?
3. Role & Requirements: Are the job roles, eligible streams (OSD, Warehouse, ITI/BSc/etc.), and qualifications legitimate?
4. Recruiter Contact: Is the email/contact official corporate domain vs personal/free email?
5. Fraud & Scam Signals: Are there red flags (application fees, training charges, no-interview promises, fake offers)?

Return strictly valid JSON adhering to:
{
  "companyName": string,
  "isKnownLegitimateEmployer": boolean,
  "venueAuthenticity": "verified_corporate_site" | "unverified" | "suspicious",
  "venueDetails": string,
  "contactAuthenticity": "official_corporate_email" | "free_or_personal" | "suspicious",
  "rolesPlausibility": string,
  "fraudIndicators": string[],
  "legitimacyIndicators": string[],
  "verdict": "Likely legitimate" | "Suspicious / High Risk" | "High scam risk" | "Unverified",
  "confidence": number,
  "riskLevel": "SAFE" | "CAUTION" | "DANGER",
  "summary": string,
  "actionableAdvice": string[]
}`;

/**
 * Queries open RDAP endpoint to verify domain creation date.
 * Flags domains registered less than 180 days ago (< 6 months).
 */
export async function checkDomainAgeRDAP(domain) {
  if (!domain || typeof domain !== "string") {
    return { status: "unknown", ageDays: null, error: "No domain provided" };
  }

  const cleanDomain = domain.toLowerCase().replace(/^www\./, "").split("/")[0].split(":")[0];
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), RDAP_TIMEOUT_MS);

  try {
    let res = await fetch(`https://rdap.org/domain/${cleanDomain}`, {
      headers: {
        Accept: "application/rdap+json, application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: ctrl.signal,
    });

    // Fallback to direct registry RDAP for .com / .net if rdap.org fails
    if (!res.ok && (cleanDomain.endsWith(".com") || cleanDomain.endsWith(".net"))) {
      try {
        res = await fetch(`https://rdap.verisign.com/com/v1/domain/${cleanDomain}`, {
          headers: {
            Accept: "application/rdap+json, application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: ctrl.signal,
        });
      } catch (_) {}
    }

    if (!res.ok) {
      return { status: "unknown", domain: cleanDomain, error: `RDAP HTTP ${res.status}` };
    }

    const data = await res.json();
    const events = data.events || [];
    let regDateStr = null;

    for (const ev of events) {
      if (ev.eventAction === "registration" || ev.eventAction === "registered") {
        regDateStr = ev.eventDate;
        break;
      }
    }

    if (!regDateStr) {
      return { status: "unknown", domain: cleanDomain, note: "Registration date not exposed in RDAP." };
    }

    const regTime = new Date(regDateStr).getTime();
    const now = Date.now();
    const ageDays = Math.floor((now - regTime) / (1000 * 60 * 60 * 24));
    const isVeryNew = ageDays < 180; // Younger than 6 months

    return {
      status: isVeryNew ? "fail" : "pass",
      domain: cleanDomain,
      registrationDate: regDateStr,
      ageDays,
      isVeryNew,
      reason: isVeryNew
        ? `Domain ${cleanDomain} was registered only ${ageDays} days ago (< 6 months). High risk for disposable scam portals.`
        : `Domain ${cleanDomain} is established (${Math.floor(ageDays / 365)} years, ${ageDays} days old).`,
    };
  } catch (err) {
    return { status: "unknown", domain: cleanDomain, error: err?.message || "RDAP lookup failed or timed out" };
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Runs the 7 comprehensive legitimacy checks on a job posting.
 */
export async function verifyJobPosting(entities, onProgress = () => {}) {
  const { company, roles, locations, contacts, fees, raw } = entities;
  const redFlags = [];
  const passedChecks = [];
  const checklist = {
    companyWebsite: { label: "Company Website", status: "unknown", detail: "Not checked" },
    careersListing: { label: "Careers Portal Listing", status: "unknown", detail: "Not checked" },
    linkedInPresence: { label: "LinkedIn & Social Presence", status: "unknown", detail: "Not checked" },
    contactValidity: { label: "Contact Validity", status: "unknown", detail: "Not checked" },
    domainAge: { label: "Domain Age / RDAP", status: "unknown", detail: "Not checked" },
    scamReports: { label: "Scam & Complaint Reports", status: "unknown", detail: "Not checked" },
    feeCheck: { label: "Application & Training Fees", status: "unknown", detail: "Not checked" },
    aiMultiCheck: { label: "AI Multi-Check & Deep Audit", status: "unknown", detail: "Not checked" },
  };

  onProgress({ step: "analyzing", message: `Verifying hiring credentials for ${company || "company"}...` });

  // ── CHECK 1: Text Red Flags (Application Fees, Deposits, No Interview) ──
  const lowerRaw = raw.toLowerCase();
  const feeKeywords = [
    "registration fee", "training fee", "security deposit", "application fee",
    "processing charge", "caution deposit", "refundable deposit", "guaranteed placement",
    "direct joining without interview", "no interview"
  ];

  let hasFeeFlag = false;
  for (const fk of feeKeywords) {
    if (lowerRaw.includes(fk)) {
      hasFeeFlag = true;
      redFlags.push(`Suspicious fee / guarantee keyword: "${fk}". Legitimate employers never charge fees.`);
    }
  }

  if (fees) {
    hasFeeFlag = true;
    redFlags.push(`Fee explicitly mentioned: "${fees}". Legitimate companies do not charge candidates.`);
  }

  if (hasFeeFlag) {
    checklist.feeCheck = {
      label: "Application & Training Fees",
      status: "fail",
      detail: "Fees or suspicious placement guarantees detected in post text.",
    };
  } else {
    checklist.feeCheck = {
      label: "Application & Training Fees",
      status: "pass",
      detail: "No registration fees or paid placement demands found.",
    };
    passedChecks.push("No application or training fees demanded.");
  }

  // ── CHECK 2: Contact Validity (Free-mail, WhatsApp-only, URL Shorteners, Forms) ──
  let contactFailed = false;

  if (contacts.freeEmails && contacts.freeEmails.length > 0) {
    contactFailed = true;
    const sample = contacts.freeEmails[0];
    redFlags.push(`Free email domain used for recruiter contact: ${sample}. Legitimate enterprises use corporate domains.`);
  }

  if (contacts.shortened && contacts.shortened.length > 0) {
    contactFailed = true;
    redFlags.push(`Link shortener detected (${contacts.shortened[0]}). Scammers use shorteners to mask malicious destinations.`);
  }

  if (contacts.forms && contacts.forms.length > 0) {
    contactFailed = true;
    redFlags.push(`Raw public form used for candidate collection (${contacts.forms[0]}). Established companies use verified ATS portals.`);
  }

  if (contacts.isWhatsAppOnly) {
    contactFailed = true;
    redFlags.push(`WhatsApp / phone number is the sole contact mechanism with no verified corporate domain.`);
  }

  if (contactFailed) {
    checklist.contactValidity = {
      label: "Contact Validity",
      status: "fail",
      detail: "Free email address, URL shortener, or unverified public form used.",
    };
  } else if (contacts.corporateEmails && contacts.corporateEmails.length > 0) {
    checklist.contactValidity = {
      label: "Contact Validity",
      status: "pass",
      detail: `Corporate email domain verified: ${contacts.corporateEmails[0]}`,
    };
    passedChecks.push(`Corporate recruiter email present (${contacts.corporateEmails[0]}).`);
  } else {
    checklist.contactValidity = {
      label: "Contact Validity",
      status: "unknown",
      detail: "No direct contact email or application link specified in text.",
    };
  }

  // ── CHECKS 3, 4, 5, 6: Live Web Intelligence (Parallel Searches) ──
  let officialDomain = null;
  if (contacts.corporateEmails && contacts.corporateEmails.length > 0) {
    officialDomain = contacts.corporateEmails[0].split("@")[1].toLowerCase();
  }
  let careersUrl = null;

  if (company && company.length >= 2) {
    const companyQuery = `${company} official website`;
    const careersQuery = `${company} careers ${roles[0] || "jobs"}`;
    const linkedinQuery = `${company} LinkedIn company`;
    const scamQuery = `"${company}" fake job OR scam OR fraud OR complaint`;

    const [compHits, careerHits, linkedinHits, scamHits] = await Promise.all([
      searchDuckDuckGoLite(companyQuery, 3),
      searchDuckDuckGoLite(careersQuery, 3),
      searchDuckDuckGoLite(linkedinQuery, 3),
      searchDuckDuckGoLite(scamQuery, 3),
    ]);

    // 1. Company existence
    if (compHits.length > 0) {
      try {
        const u = new URL(compHits[0].url);
        const hitDomain = u.hostname.replace(/^www\./, "");
        if (!officialDomain || hitDomain.includes(company.toLowerCase())) {
          officialDomain = hitDomain;
        }
        checklist.companyWebsite = {
          label: "Company Website",
          status: "pass",
          detail: `Established company domain located: ${officialDomain}`,
          url: compHits[0].url,
        };
        passedChecks.push(`Company website found: ${officialDomain}`);
      } catch (_) {
        if (officialDomain) {
          checklist.companyWebsite = {
            label: "Company Website",
            status: "pass",
            detail: `Verified corporate domain: ${officialDomain}`,
            url: `https://${officialDomain}`,
          };
          passedChecks.push(`Company website found: ${officialDomain}`);
        } else {
          checklist.companyWebsite = {
            label: "Company Website",
            status: "unknown",
            detail: "Unable to parse primary company domain.",
          };
        }
      }
    } else if (officialDomain) {
      checklist.companyWebsite = {
        label: "Company Website",
        status: "pass",
        detail: `Verified corporate domain: ${officialDomain}`,
        url: `https://${officialDomain}`,
      };
      passedChecks.push(`Company website verified via recruiter domain: ${officialDomain}`);
    } else {
      checklist.companyWebsite = {
        label: "Company Website",
        status: "unknown",
        detail: "No distinct official company web portal found in top results.",
      };
    }

    // 2. Careers page
    if (careerHits.length > 0) {
      const topCareer = careerHits[0];
      careersUrl = topCareer.url;
      checklist.careersListing = {
        label: "Careers Portal Listing",
        status: "pass",
        detail: `Careers portal or job notice located (${topCareer.title})`,
        url: topCareer.url,
      };
      passedChecks.push(`Careers portal located (${topCareer.title}).`);
    } else if (officialDomain) {
      checklist.careersListing = {
        label: "Careers Portal Listing",
        status: "pass",
        detail: `Official careers portal accessible at https://${officialDomain}`,
        url: `https://${officialDomain}`,
      };
      passedChecks.push(`Verified corporate careers portal available: ${officialDomain}`);
    } else {
      checklist.careersListing = {
        label: "Careers Portal Listing",
        status: "unknown",
        detail: "Could not locate matching listing on official career portals.",
      };
    }

    // 3. LinkedIn Presence
    const hasLinkedIn = linkedinHits.some((h) => h.url.includes("linkedin.com/company/") || /linkedin\.com/i.test(h.url));
    if (hasLinkedIn) {
      const liHit = linkedinHits.find((h) => h.url.includes("linkedin.com/company/") || /linkedin\.com/i.test(h.url));
      checklist.linkedInPresence = {
        label: "LinkedIn & Social Presence",
        status: "pass",
        detail: "Active corporate LinkedIn profile identified.",
        url: liHit?.url,
      };
      passedChecks.push("Active LinkedIn corporate presence confirmed.");
    } else if (linkedinHits.length > 0) {
      checklist.linkedInPresence = {
        label: "LinkedIn & Social Presence",
        status: "pass",
        detail: `Company profile confirmed online: ${linkedinHits[0].title}`,
        url: linkedinHits[0].url,
      };
      passedChecks.push("Company profile confirmed online.");
    } else {
      checklist.linkedInPresence = {
        label: "LinkedIn & Social Presence",
        status: "unknown",
        detail: "No official LinkedIn company page verified.",
      };
    }

    // 4. Scam Reports
    const confirmedScamHits = scamHits.filter((h) => {
      const low = (h.title + " " + h.snippet).toLowerCase();
      return (
        low.includes("fake job") ||
        low.includes("job scam") ||
        low.includes("fraud alert") ||
        low.includes("complaint")
      );
    });

    if (confirmedScamHits.length > 0) {
      checklist.scamReports = {
        label: "Scam & Complaint Reports",
        status: "fail",
        detail: `Warning: ${confirmedScamHits.length} scam/fraud reports surfaced online.`,
        url: confirmedScamHits[0].url,
      };
      redFlags.push(`Online complaints or fraud warnings surfaced: "${confirmedScamHits[0].title}".`);
    } else {
      checklist.scamReports = {
        label: "Scam & Complaint Reports",
        status: "pass",
        detail: "No major complaint board or scam alerts found for this organization.",
      };
      passedChecks.push("No active scam warnings found online.");
    }
  }

  // ── CHECK 7: Domain Age / RDAP Check on applicant URL or company domain ──
  const targetDomain = officialDomain || (contacts.urls[0] ? (() => {
    try { return new URL(contacts.urls[0]).hostname; } catch (_) { return null; }
  })() : null);

  if (targetDomain) {
    const rdap = await checkDomainAgeRDAP(targetDomain);
    if (rdap.status === "fail") {
      checklist.domainAge = {
        label: "Domain Age / RDAP",
        status: "fail",
        detail: rdap.reason,
      };
      redFlags.push(rdap.reason);
    } else if (rdap.status === "pass") {
      checklist.domainAge = {
        label: "Domain Age / RDAP",
        status: "pass",
        detail: rdap.reason,
      };
      passedChecks.push(rdap.reason);
    } else {
      checklist.domainAge = {
        label: "Domain Age / RDAP",
        status: "unknown",
        detail: rdap.error || "RDAP endpoint rate-limited or domain privacy enabled.",
      };
    }
  } else {
    checklist.domainAge = {
      label: "Domain Age / RDAP",
      status: "unknown",
      detail: "No domain available for WHOIS/RDAP query.",
    };
  }

  // ── CHECK 8: AI Multi-Angle Deep Audit (Groq / LLM) ──
  onProgress({ step: "ai_multicheck", message: "Running Groq AI multi-angle audit on hiring notice..." });

  const advice = [];
  let aiAudit = null;

  try {
    const auditRes = await callLLM({
      system: JOB_AUDIT_SYSTEM,
      prompt: `Analyze this job posting with available web context:
Company: ${company || "Unknown"}
Extracted Contacts: ${JSON.stringify(contacts)}
Known Corporate Domain: ${officialDomain || "None"}
Domain RDAP: ${checklist.domainAge.detail || "Not checked"}
Web Search Summary: Website=${checklist.companyWebsite.status}, Careers=${checklist.careersListing.status}, ScamAlerts=${checklist.scamReports.status}

POST TEXT:
${raw}`,
    });

    if (auditRes.success && auditRes.data) {
      aiAudit = auditRes.data;
      aiAudit.provider = auditRes.provider || "groq";

      // Incorporate AI fraud indicators
      if (Array.isArray(aiAudit.fraudIndicators)) {
        for (const fi of aiAudit.fraudIndicators) {
          if (fi && !redFlags.some((rf) => rf.toLowerCase().includes(fi.toLowerCase().slice(0, 30)))) {
            redFlags.push(fi);
          }
        }
      }

      // Incorporate AI legitimacy indicators
      if (Array.isArray(aiAudit.legitimacyIndicators)) {
        for (const li of aiAudit.legitimacyIndicators) {
          if (li && !passedChecks.some((pc) => pc.toLowerCase().includes(li.toLowerCase().slice(0, 30)))) {
            passedChecks.push(li);
          }
        }
      }

      // Incorporate AI actionable advice
      if (Array.isArray(aiAudit.actionableAdvice)) {
        for (const adv of aiAudit.actionableAdvice) {
          if (adv && !advice.includes(adv)) {
            advice.push(adv);
          }
        }
      }

      const isSafe = aiAudit.riskLevel === "SAFE" || (aiAudit.isKnownLegitimateEmployer && (!aiAudit.fraudIndicators || aiAudit.fraudIndicators.length === 0));
      const isDanger = aiAudit.riskLevel === "DANGER" || (aiAudit.fraudIndicators && aiAudit.fraudIndicators.length >= 2);

      checklist.aiMultiCheck = {
        label: "AI Multi-Check & Deep Audit",
        status: isDanger ? "fail" : (isSafe ? "pass" : "unknown"),
        detail: aiAudit.summary || `AI deep audit completed (${aiAudit.provider}).`,
      };
    } else {
      checklist.aiMultiCheck = {
        label: "AI Multi-Check & Deep Audit",
        status: "unknown",
        detail: "AI deep audit offline; heuristic and live web checks active.",
      };
    }
  } catch (_) {
    checklist.aiMultiCheck = {
      label: "AI Multi-Check & Deep Audit",
      status: "unknown",
      detail: "AI audit unavailable.",
    };
  }

  // ── Calculate Final Job Verdict ──
  let verdict = "Unverified";
  let riskLevel = "CAUTION";
  let credibilityScore = 50;

  const failCount = Object.values(checklist).filter((c) => c.status === "fail").length;
  const passCount = Object.values(checklist).filter((c) => c.status === "pass").length;

  if (hasFeeFlag || failCount >= 1 || redFlags.length >= 2 || (aiAudit && aiAudit.riskLevel === "DANGER")) {
    verdict = "High scam risk";
    riskLevel = "DANGER";
    credibilityScore = Math.max(10, 30 - failCount * 10);
  } else if (passCount >= 3 && redFlags.length === 0 && (!aiAudit || aiAudit.riskLevel === "SAFE")) {
    verdict = "Likely legitimate";
    riskLevel = "SAFE";
    credibilityScore = Math.min(95, 70 + passCount * 5);
  } else {
    verdict = "Unverified";
    riskLevel = "CAUTION";
    credibilityScore = 50;
  }

  // Base actionable advice
  if (verdict === "High scam risk") {
    if (!advice.some((a) => a.includes("NEVER pay"))) {
      advice.unshift("⚠️ NEVER pay registration, training, or security deposit fees for any job.");
    }
    if (!advice.some((a) => a.includes("Aadhaar"))) {
      advice.push("Do not share Aadhaar, passport copies, or banking passwords over WhatsApp or unverified Google Forms.");
    }
  }
  if (officialDomain) {
    if (!advice.some((a) => a.includes(officialDomain))) {
      advice.push(`Cross-verify openings directly on the official company careers portal (https://${officialDomain}).`);
    }
  } else {
    if (!advice.some((a) => a.includes("corporate phone lines"))) {
      advice.push("Cross-verify the existence of this employer and opening via official corporate phone lines or HR contacts.");
    }
  }

  return {
    isJob: true,
    verdict,
    riskLevel,
    credibilityScore,
    explanation: verdict === "High scam risk"
      ? `High scam indicators identified: ${redFlags.slice(0, 2).join(" ")}`
      : verdict === "Likely legitimate"
        ? `Legitimate employer patterns detected with established web presence (${company || "Company"}).`
        : "Insufficient verifiable corporate records to confirm this vacancy. Exercise caution.",
    redFlags,
    passedChecks,
    checklist,
    advice,
    officialDomain,
    careersUrl,
    entities,
    aiAudit,
  };
}

