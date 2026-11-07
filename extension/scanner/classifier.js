// Ambient Shield — Scanner Classifier & Entity Extractor (extension/scanner/classifier.js)
// ─────────────────────────────────────────────────────────────────────────────

const JOB_SIGNALS = [
  /\bhiring\b/i,
  /\binternship\b/i,
  /\bwalk-?in\b/i,
  /\bfreshers?\b/i,
  /\bapply\b/i,
  /\bstipend\b/i,
  /\bvacanc(y|ies)\b/i,
  /\brecruitment\b/i,
  /\bctc\b/i,
  /\bregistration fee\b/i,
  /\bjob opening\b/i,
  /\bqualification\b/i,
  /\binterview\b/i,
  /\bimmediate joiner\b/i,
  /\brole:\b/i,
  /\bdesignation:\b/i,
  /\bwork from home\b/i,
  /\bwfh\b/i,
  /\bsalary:\b/i,
  /\bexperience:\b/i,
  /\bjob description\b/i,
];

const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "rediffmail.com",
  "yandex.com",
  "icloud.com",
];

const SHORTENER_DOMAINS = [
  "bit.ly",
  "tinyurl.com",
  "t.me",
  "rb.gy",
  "is.gd",
  "cutt.ly",
  "forms.gle",
  "linktr.ee",
];

const FORM_DOMAINS = [
  "docs.google.com/forms",
  "forms.google.com",
  "typeform.com",
  "forms.office.com",
  "surveymonkey.com",
  "jotform.com",
];

/**
 * Fast rule-based classifier to determine if input text is a job notice or general claim.
 * @param {string} text
 * @returns { "job" | "claim" }
 */
export function classifyInputType(text) {
  if (!text || typeof text !== "string") return "claim";
  const clean = text.trim();
  let matches = 0;
  for (const regex of JOB_SIGNALS) {
    if (regex.test(clean)) matches++;
  }
  // Strong standalone indicators: walk-in, internship, hiring, vacancy, recruitment, or >=2 signals
  if (
    matches >= 2 ||
    /\bwalk-?in\b/i.test(clean) ||
    /\binternship\b/i.test(clean) ||
    /\b(hiring|vacanc(?:y|ies)|recruitment)\b/i.test(clean) ||
    /freshers/i.test(clean)
  ) {
    return "job";
  }
  return "claim";
}

/**
 * Extracts structured entities from a job posting.
 */
export function extractJobEntities(text) {
  if (!text) return { company: "", roles: [], locations: [], contacts: {}, fees: null, raw: "" };

  const raw = text.trim();
  const emails = [];
  const phones = [];
  const urls = [];
  const forms = [];
  const shortened = [];

  // 1. Email extraction
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let match;
  while ((match = emailRegex.exec(raw)) !== null) {
    const email = match[1].toLowerCase();
    if (!emails.includes(email)) emails.push(email);
  }

  // 2. Phone / WhatsApp extraction
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
  while ((match = phoneRegex.exec(raw)) !== null) {
    const num = match[0].trim();
    if (num.replace(/\D/g, "").length >= 10 && !phones.includes(num)) {
      phones.push(num);
    }
  }

  // 3. URL and link shortener extraction (handles both protocol and bare shortener domains)
  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"]+|(?:\b(?:bit\.ly|tinyurl\.com|t\.me|rb\.gy|is\.gd|cutt\.ly|forms\.gle|linktr\.ee)\/[^\s<>"]+)/gi;
  while ((match = urlRegex.exec(raw)) !== null) {
    const u = match[0];
    if (!urls.includes(u)) urls.push(u);
    const low = u.toLowerCase();
    if (SHORTENER_DOMAINS.some((d) => low.includes(d))) {
      if (!shortened.includes(u)) shortened.push(u);
    }
    if (FORM_DOMAINS.some((d) => low.includes(d))) {
      if (!forms.includes(u)) forms.push(u);
    }
  }

  // 4. Company Name Extraction (heuristics)
  let company = "";
  // Check patterns like: HIRING FRESHERS | COMPANY | LOCATION
  const pipeParts = raw.split("\n")[0].split("|").map((p) => p.trim());
  if (pipeParts.length >= 2) {
    for (const part of pipeParts) {
      if (
        !/hiring|freshers|walk-?in|immediate|opening|internship/i.test(part) &&
        !/hyderabad|bangalore|delhi|mumbai|chennai|pune|noida|kolkata/i.test(part) &&
        part.length >= 2 &&
        part.length <= 40
      ) {
        company = part;
        break;
      }
    }
  }

  if (!company) {
    const atMatch = raw.match(/(?:at|company:?|organization:?|employer:?)\s+([A-Z][A-Za-z0-9&.\s]{2,30})/);
    if (atMatch && atMatch[1]) {
      company = atMatch[1].trim();
    }
  }

  if (!company) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 3)) {
      const parts = line.split(/[|:-]/).map((p) => p.trim());
      for (const p of parts) {
        if (/^[A-Z0-9\s&]{3,25}$/.test(p) && !/HIRING|FRESHERS|WALK-IN|INTERNSHIP|URGENT|VACANCY/i.test(p)) {
          company = p;
          break;
        }
      }
      if (company) break;
    }
  }

  // 5. Role / Designation Extraction
  const roles = [];
  const roleMatch = raw.match(/(?:role|designation|position|job\s*title):?\s*([^\n\r,;|]+)/i);
  if (roleMatch) roles.push(roleMatch[1].trim());

  if (roles.length === 0) {
    const knownRoles = [
      "Production", "Quality Control", "QC", "QA", "Quality Assurance", "R&D", "AR&D",
      "Software Engineer", "Developer", "Data Analyst", "Data Scientist", "Product Manager",
      "Sales Executive", "HR Executive", "Recruiter", "Marketing Associate", "Accountant",
      "Executive", "Officer", "Analyst", "Intern"
    ];
    for (const r of knownRoles) {
      const rx = new RegExp(`\\b${r}\\b`, "i");
      if (rx.test(raw) && !roles.includes(r)) {
        roles.push(r);
      }
    }
  }

  // 6. Location Extraction
  const locations = [];
  const commonCities = [
    "Hyderabad", "Bengaluru", "Bangalore", "Mumbai", "Pune", "Delhi", "Noida", "Gurugram",
    "Gurgaon", "Chennai", "Kolkata", "Ahmedabad", "Sanath Nagar", "Kazipally", "Jadcherla",
    "Chandigarh", "Jaipur", "Kochi", "Indore"
  ];
  for (const city of commonCities) {
    const rx = new RegExp(`\\b${city}\\b`, "i");
    if (rx.test(raw) && !locations.includes(city)) {
      locations.push(city);
    }
  }

  // 7. Fees Mentioned
  const feeMatch = raw.match(/(?:registration|training|security|processing|application|caution)\s*(?:fee|charges?|deposit|amount)[\s:]*([^\n.,;]+)/i);
  const fees = feeMatch ? feeMatch[0].trim() : null;

  // 8. Contact Analysis
  const isWhatsAppOnly = phones.length > 0 && emails.length === 0 && urls.length === 0 && /whatsapp/i.test(raw);
  const freeEmailList = emails.filter((e) => {
    const domain = e.split("@")[1];
    return FREE_EMAIL_DOMAINS.includes(domain);
  });
  const corporateEmails = emails.filter((e) => {
    const domain = e.split("@")[1];
    return !FREE_EMAIL_DOMAINS.includes(domain);
  });

  return {
    company: company.replace(/[^\w\s&.-]/g, "").trim(),
    roles,
    locations,
    contacts: {
      emails,
      corporateEmails,
      freeEmails: freeEmailList,
      phones,
      urls,
      forms,
      shortened,
      isWhatsAppOnly,
    },
    fees,
    raw,
  };
}

/**
 * Extracts claim statement and query targets from a news or general text claim.
 */
export function extractClaimEntities(text) {
  if (!text) return { claim: "", who: "", when: "", where: "", cleanQuery: "" };
  const clean = text.replace(/[\r\n]+/g, " ").trim();
  const currentYear = new Date().getFullYear();

  // Basic entity/time cues
  const yearMatch = clean.match(/\b(19\d\d|20\d\d)\b/);
  const when = yearMatch ? yearMatch[0] : `${currentYear}`;

  // Sliced clean claim for queries
  const cleanQuery = clean
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return {
    claim: clean,
    who: "",
    when,
    where: "",
    cleanQuery,
  };
}
