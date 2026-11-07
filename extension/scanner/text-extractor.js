// Ambient Shield — Service Worker HTML Text & Passage Extractor (extension/scanner/text-extractor.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips HTML boilerplate and extracts plain text without requiring DOMParser.
 * Compatible with Chrome Extensions MV3 service workers.
 */
export function extractTextFromHtml(html) {
  if (!html || typeof html !== "string") return "";

  let cleaned = html;

  // 1. Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, " ");

  // 2. Remove script, style, svg, noscript, nav, footer, header tags and their contents
  cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  cleaned = cleaned.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  cleaned = cleaned.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  cleaned = cleaned.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ");
  cleaned = cleaned.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ");

  // 3. Replace block tags with newlines
  cleaned = cleaned.replace(/<\/(p|div|h[1-6]|li|section|article|tr|blockquote)>/gi, "\n");
  cleaned = cleaned.replace(/<(br|hr)\s*\/?>/gi, "\n");

  // 4. Remove all remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");

  // 5. Unescape HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—");

  // 6. Normalize whitespace
  return cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 20) // Drop short nav links / menu items
    .join("\n\n");
}

/**
 * Extracts and scores relevant passages from plain text, capping total output to ~3,000 chars.
 * @param {string} text Plain text of the page
 * @param {string[]} keywords Important search keywords / company name
 * @param {number} maxChars Maximum characters to return (default 3000)
 */
export function extractRelevantPassages(text, keywords = [], maxChars = 3000) {
  if (!text) return "";
  if (text.length <= maxChars) return text;

  const cleanKeywords = (keywords || [])
    .map((k) => k.toLowerCase().trim())
    .filter((k) => k.length > 2);

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);

  if (paragraphs.length === 0) return text.slice(0, maxChars);

  // Score each paragraph based on keyword frequency
  const scored = paragraphs.map((para) => {
    const low = para.toLowerCase();
    let score = 0;
    for (const kw of cleanKeywords) {
      if (low.includes(kw)) score += 5;
    }
    // Prefer substantial informative sentences
    if (para.length > 100 && para.length < 800) score += 2;
    return { para, score };
  });

  // Sort descending by score, maintaining order if tied
  scored.sort((a, b) => b.score - a.score);

  let result = "";
  for (const item of scored) {
    if ((result.length + item.para.length + 2) <= maxChars) {
      result += (result ? "\n\n" : "") + item.para;
    } else {
      const remaining = maxChars - result.length - 2;
      if (remaining > 100) {
        result += (result ? "\n\n" : "") + item.para.slice(0, remaining) + "…";
      }
      break;
    }
  }

  return result || text.slice(0, maxChars);
}

