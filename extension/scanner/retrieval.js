// Ambient Shield — Multi-Source Search & Retrieval Engine (extension/scanner/retrieval.js)
// ─────────────────────────────────────────────────────────────────────────────

import { scoreSourceAuthority } from "../sources-config.js";
import { extractTextFromHtml, extractRelevantPassages } from "./text-extractor.js";

const PAGE_FETCH_TIMEOUT_MS = 8000;
const MAX_CONCURRENT_FETCHES = 3;
const MAX_SEARCH_RESULTS = 8;

/**
 * Strips basic markup from snippets.
 */
function stripSnippetMarkup(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Searches DuckDuckGo Lite (no API key required).
 */
export async function searchDuckDuckGoLite(query, limit = 5) {
  const results = [];
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    });

    if (res.ok) {
      const html = await res.text();
      // Match result-snippet table cells
      const snipMatches = html.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g) || [];
      const linkMatches = html.match(/href="[^"]*uddg=[^"]+"/g) || [];
      const titleMatches = html.match(/class="result-link"[^>]*>([\s\S]*?)<\/a>/g) || [];

      for (let i = 0; i < Math.min(limit, snipMatches.length); i++) {
        const snippet = stripSnippetMarkup(snipMatches[i]);
        let url = "";
        let title = "";

        if (titleMatches[i]) {
          title = stripSnippetMarkup(titleMatches[i]);
        }

        if (linkMatches[i]) {
          const m = linkMatches[i].match(/href="([^"]+)"/);
          if (m && m[1].includes("uddg=")) {
            try {
              url = decodeURIComponent(m[1].split("uddg=")[1].split("&")[0]);
            } catch (_) {}
          }
        }

        if (url && (snippet || title)) {
          results.push({
            title: title || query,
            url,
            snippet,
            source: "DuckDuckGo",
          });
        }
      }
    }
  } catch (_) {
    // Graceful silent fallback
  } finally {
    clearTimeout(tid);
  }

  return results;
}

/**
 * Searches Wikipedia API for encyclopedic context.
 */
export async function searchWikipedia(query, limit = 2) {
  const results = [];
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${limit}`;
    const res = await fetch(searchUrl, { signal: ctrl.signal });
    if (res.ok) {
      const data = await res.json();
      const items = data?.query?.search || [];
      for (const item of items) {
        try {
          const extUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&exsentences=5&titles=${encodeURIComponent(item.title)}&format=json&origin=*`;
          const extRes = await fetch(extUrl, { signal: ctrl.signal });
          if (extRes.ok) {
            const extData = await extRes.json();
            const pages = extData?.query?.pages || {};
            const snippet = Object.values(pages)[0]?.extract || "";
            if (snippet.length > 40) {
              results.push({
                title: item.title,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                snippet,
                source: "Wikipedia",
              });
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {
    // Graceful fallback
  } finally {
    clearTimeout(tid);
  }

  return results;
}

/**
 * Searches Google News RSS feed for news claims.
 */
export async function searchGoogleNewsRSS(query, limit = 4) {
  const results = [];
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, { signal: ctrl.signal });
    if (res.ok) {
      const xml = await res.text();
      // Regex match <item> blocks
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (let i = 0; i < Math.min(limit, items.length); i++) {
        const itemXml = items[i];
        const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

        const title = titleMatch ? stripSnippetMarkup(titleMatch[1]) : "";
        const link = linkMatch ? linkMatch[1].trim() : "";
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";

        if (title && link) {
          results.push({
            title,
            url: link,
            snippet: `${title} (${pubDate})`,
            source: "Google News",
          });
        }
      }
    }
  } catch (_) {
    // Graceful fallback
  } finally {
    clearTimeout(tid);
  }

  return results;
}

/**
 * Fetches page content and extracts text safely in parallel.
 * @param {string} url
 * @param {string[]} keywords
 * @returns {Promise<{ url: string, content: string }>}
 */
export async function fetchPageContent(url, keywords = []) {
  if (!url || !url.startsWith("http")) return { url, content: "" };

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), PAGE_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });

    if (!res.ok) return { url, content: "" };

    const html = await res.text();
    const cleanText = extractTextFromHtml(html);
    const relevantPassages = extractRelevantPassages(cleanText, keywords, 3000);

    return {
      url,
      content: relevantPassages,
    };
  } catch (_) {
    return { url, content: "" };
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Core multi-source retrieval orchestration with ranking and page reading.
 */
export async function retrieveMultiSourceEvidence({
  queries = [],
  keywords = [],
  officialDomain = null,
  isJob = false,
  onProgress = () => {},
}) {
  onProgress({ step: "searching", message: `Executing ${queries.length} search queries across sources...` });

  // 1. Run search queries
  const allResults = [];
  const seenUrls = new Set();

  for (const q of queries.slice(0, 4)) {
    const searchPromises = [searchDuckDuckGoLite(q, 4)];
    if (!isJob) {
      searchPromises.push(searchWikipedia(q, 2));
      searchPromises.push(searchGoogleNewsRSS(q, 3));
    }

    const settled = await Promise.allSettled(searchPromises);
    for (const s of settled) {
      if (s.status === "fulfilled" && Array.isArray(s.value)) {
        for (const item of s.value) {
          if (item?.url && !seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            allResults.push(item);
          }
        }
      }
    }
  }

  // 2. Score and rank search results
  for (const r of allResults) {
    r.authorityScore = scoreSourceAuthority(r.url, officialDomain);
  }

  allResults.sort((a, b) => (b.authorityScore || 0) - (a.authorityScore || 0));
  const topResults = allResults.slice(0, MAX_SEARCH_RESULTS);

  onProgress({ step: "reading", message: `Reading top ${Math.min(topResults.length, 4)} sources for evidence...` });

  // 3. Parallel fetch page contents (limit concurrency to 3)
  const pagesToRead = topResults.slice(0, 4);
  const fetchedEvidence = [];

  for (let i = 0; i < pagesToRead.length; i += MAX_CONCURRENT_FETCHES) {
    const batch = pagesToRead.slice(i, i + MAX_CONCURRENT_FETCHES);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        // If Wikipedia snippet is already full, we don't need a heavy page scrape
        if (item.source === "Wikipedia" && item.snippet && item.snippet.length > 200) {
          return {
            url: item.url,
            title: item.title,
            source: item.source,
            snippet: item.snippet,
            fullContent: item.snippet,
            authorityScore: item.authorityScore,
          };
        }

        const page = await fetchPageContent(item.url, keywords);
        const finalContent = page.content || item.snippet;

        return {
          url: item.url,
          title: item.title,
          source: item.source,
          snippet: item.snippet,
          fullContent: finalContent,
          authorityScore: item.authorityScore,
        };
      })
    );

    fetchedEvidence.push(...batchResults);
  }

  return fetchedEvidence.filter((e) => e && e.fullContent && e.fullContent.length > 30);
}

