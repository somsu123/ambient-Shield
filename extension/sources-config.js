// Ambient Shield — Source Credibility & Ranking Config (extension/sources-config.js)
// ─────────────────────────────────────────────────────────────────────────────

export const SOURCE_RANKS = {
  // High authority: Official fact checkers and reference
  TIER_1_FACT_CHECKERS: [
    "snopes.com",
    "reuters.com",
    "apnews.com",
    "politifact.com",
    "factcheck.org",
    "bbc.com",
    "bbc.co.uk",
    "afp.com",
    "fullfact.org",
  ],

  // High authority: Reference & Academic
  TIER_1_REFERENCE: [
    "wikipedia.org",
    "wikimedia.org",
    ".edu",
    ".gov",
    ".mil",
  ],

  // Major News Orgs
  TIER_2_NEWS: [
    "nytimes.com",
    "washingtonpost.com",
    "theguardian.com",
    "wsj.com",
    "bloomberg.com",
    "economist.com",
    "npr.org",
    "cnn.com",
    "ndtv.com",
    "thehindu.com",
    "timesofindia.indiatimes.com",
    "hindustantimes.com",
    "indianexpress.com",
    "hindubusinessline.com",
  ],

  // Downranked: Forums, Social Media & User-generated content
  DOWNRANKED_DOMAINS: [
    "reddit.com",
    "quora.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "tiktok.com",
    "medium.com",
    "pinterest.com",
    "tumblr.com",
    "blogspot.com",
    "wordpress.com",
  ],
};

/**
 * Computes source authority score (0 - 100).
 */
export function scoreSourceAuthority(url, officialDomain = null) {
  if (!url) return 10;
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {
    return 10;
  }

  // 1. If official company domain matches, highest score
  if (officialDomain) {
    const cleanOfficial = officialDomain.toLowerCase().replace(/^www\./, "");
    if (hostname === cleanOfficial || hostname.endsWith(`.${cleanOfficial}`)) {
      return 98;
    }
  }

  // 2. Fact Checkers
  for (const fc of SOURCE_RANKS.TIER_1_FACT_CHECKERS) {
    if (hostname === fc || hostname.endsWith(`.${fc}`)) return 95;
  }

  // 3. Official TLDs & Reference
  for (const ref of SOURCE_RANKS.TIER_1_REFERENCE) {
    if (hostname.endsWith(ref) || hostname.includes(ref)) return 90;
  }

  // 4. Major News
  for (const news of SOURCE_RANKS.TIER_2_NEWS) {
    if (hostname === news || hostname.endsWith(`.${news}`)) return 80;
  }

  // 5. Downranked
  for (const down of SOURCE_RANKS.DOWNRANKED_DOMAINS) {
    if (hostname === down || hostname.endsWith(`.${down}`)) return 25;
  }

  return 50; // Neutral web source
}

