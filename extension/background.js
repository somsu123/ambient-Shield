// Ambient Shield — Background Service Worker (Manifest V3)
// Handles ALL Gemini API calls, LRU caching, rate-limiting, and context menus.
// The static extension pages communicate here via chrome.runtime.sendMessage.
// ─────────────────────────────────────────────────────────────────────────────

// ── API key configuration ─────────────────────────────────────────────────────
const GEMINI_API_KEY  = "AIzaSyCSJ1a-4c1olBnHyyzG7l6ne4qPKDXzizU";

/** 
 * Resilient Model Cascade:
 * We try these in order. If one 404s or 503s, we skip to the next.
 * This solves the "Model not found" errors once and for all.
 */
const GEMINI_MODELS = [
  "gemini-2.0-flash",       // Primary (Fastest)
  "gemini-1.5-pro",        // Pro (Highest Intelligence - closest to 2.5 Pro)
  "gemini-1.5-flash",      // Stable Fallback
  "gemini-1.5-flash-8b"    // Ultra-compatible Fallback
];


// ── In-memory state (ephemeral — resets on service worker restart) ────────────
const resultCache = new Map();  // hash → { result, ts }
const rateState   = { minute: 0, minuteReset: 0, daily: 0, dailyReset: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// WALL 3 — TAB-LEVEL ADULT CONTENT INTERCEPTOR
// Catches every URL navigation (including clicked links from search results)
// and injects the block overlay before page content becomes visible.
// ─────────────────────────────────────────────────────────────────────────────

const ADULT_HOST_PATTERNS = [
  "xnxx","xnxxx","pornhub","xvideos","xhamster","redtube","youporn",
  "spankbang","eporner","tube8","beeg","tnaflix","onlyfans","fansly",
  "nhentai","hentaihaven","hentai2read","tsumino","fakku","hanime",
  "hentaimama","exhentai","e-hentai","rule34","gelbooru","danbooru","e621",
  "brazzers","nubiles","mofos","bangbros","realitykings","digitalplayground",
  "wankz","naughtyamerica","czechav","chaturbate","bongacams","stripchat",
  "livejasmin","cam4","myfreecams","adultfriendfinder","ashleymadison",
  "sex.com","porn.com","nudevista","ixxx","freeones","drtuber","empflix",
  "porndig","4tube","youjizz","slutload","hclips","porntrex","porngo",
  "faphouse","pornpics","elitebabes","hegre","met-art","vivud","sexu",
  "pornone","pornktube","sexvid","xnxx.com","xnxx.es",
];

const ADULT_URL_FRAGMENTS = [
  "xnxx","xvideos","pornhub","nhentai","hentai",
  "/porn/","/sex/","/nude/","/xxx/","/nsfw/",
  "onlyfans","chaturbate","stripchat","camgirl","erotic","nudist",
  "rule34","gelbooru","danbooru","sexvid","sexvideo",
];

function isAdultUrl(url) {
  if (!url || url.startsWith("chrome") || url.startsWith("about:")) return false;
  try {
    const u        = new URL(url);
    const hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const full     = url.toLowerCase();

    // Hostname contains known adult site keyword
    for (const kw of ADULT_HOST_PATTERNS) {
      if (hostname.includes(kw)) return true;
    }

    // URL path/query contains adult fragment
    for (const frag of ADULT_URL_FRAGMENTS) {
      if (full.includes(frag)) return true;
    }
  } catch (_) { /* invalid URL */ }
  return false;
}

// Inject block overlay via scripting API into the tab
async function injectBlock(tabId, url) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (blockedUrl) => {
        // Already blocked?
        if (document.getElementById("ambient-shield-firewall")) return;

        const hostname = (() => { try { return new URL(blockedUrl).hostname.replace(/^www\./,""); } catch { return blockedUrl; } })();

        // Hide page body
        document.documentElement.style.cssText = "overflow:hidden!important;";

        const overlay = document.createElement("div");
        overlay.id    = "ambient-shield-firewall";
        overlay.style.cssText = [
          "position:fixed","inset:0","z-index:2147483647",
          "display:flex","align-items:center","justify-content:center",
          "background:#070b12","font-family:Inter,system-ui,sans-serif",
        ].join("!important;") + "!important;";

        overlay.innerHTML = `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:20px;max-width:460px;padding:44px 36px;background:rgba(12,18,32,0.98);border:1px solid rgba(255,77,109,0.25);border-radius:22px;box-shadow:0 0 80px rgba(255,77,109,0.15),0 24px 64px rgba(0,0,0,0.7)">
            <div style="font-size:52px;line-height:1">🛡️</div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 14px;border-radius:100px;background:rgba(255,77,109,0.12);border:1px solid rgba(255,77,109,0.3);color:#ff6b87;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">🔒 Ambient Shield · Adult Content Firewall</div>
            <div style="font-size:26px;font-weight:800;color:#e2eeff;letter-spacing:-0.02em">Access <span style="color:#ff4d6d">Blocked</span></div>
            <p style="font-size:14px;color:rgba(180,210,255,0.65);line-height:1.7">Ambient Shield has detected this site as <strong style="color:#ff8099">18+ adult content</strong>. This firewall is always active and has no disable switch.</p>
            <div style="padding:10px 18px;background:rgba(255,77,109,0.08);border:1px solid rgba(255,77,109,0.2);border-radius:10px;font-size:13px;color:#ff8099;font-family:monospace;word-break:break-all">⛔ ${hostname}</div>
            <button id="_as_back_btn" style="padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,#1e4bb8,#5b9cf6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;border:none;box-shadow:0 2px 18px rgba(91,156,246,0.35);font-family:inherit">← Go Back to Safety</button>
            <div style="font-size:12px;color:rgba(180,210,255,0.3)">🔒 Enforced by Ambient Shield · Cannot be bypassed</div>
          </div>`;

        document.documentElement.appendChild(overlay);

        document.getElementById("_as_back_btn").addEventListener("click", () => {
          if (history.length > 1) history.go(-1);
          else location.replace("https://www.google.com");
        });

        // Anti-tamper
        new MutationObserver(() => {
          if (!document.getElementById("ambient-shield-firewall"))
            document.documentElement.appendChild(overlay);
        }).observe(document.documentElement, { childList: true });

        // Block dev tools shortcuts
        document.addEventListener("keydown", e => {
          if (e.key === "F12" || e.key === "Escape" ||
              (e.ctrlKey && e.shiftKey && "IJCK".includes(e.key)) ||
              (e.ctrlKey && e.key === "U")) {
            e.preventDefault(); e.stopImmediatePropagation();
          }
        }, true);
        document.addEventListener("contextmenu", e => e.preventDefault(), true);
      },
      args: [url],
    });
  } catch (_) { /* Tab may have navigated away — ignore */ }
}

// Watch ALL tab navigations
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!url) return;
  if (isAdultUrl(url)) {
    injectBlock(tabId, url);
  }
});



// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Fast djb2 hash — used as cache key */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/** Retrieve from LRU cache, respecting 24-hour TTL */
function getCached(key) {
  const item = resultCache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > 86_400_000) { resultCache.delete(key); return null; }
  // Move to end (LRU refresh)
  resultCache.delete(key);
  resultCache.set(key, item);
  return item.result;
}

/** Insert into cache with LRU eviction at 500 entries */
function setCached(key, result) {
  if (resultCache.size >= 500) resultCache.delete(resultCache.keys().next().value);
  resultCache.set(key, { result, ts: Date.now() });
}

/** Rate limiter: 15 req/min, 100 req/day (hackathon demo limits). */
function checkRateLimit() {
  const now = Date.now();
  if (now > rateState.minuteReset) { rateState.minute = 0; rateState.minuteReset = now + 60_000; }
  if (now > rateState.dailyReset)  { rateState.daily  = 0; rateState.dailyReset  = now + 86_400_000; }

  if (rateState.minute >= 15 || rateState.daily >= 100) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: rateState.minute >= 15 ? rateState.minuteReset - now : rateState.dailyReset - now,
    };
  }
  rateState.minute++;
  rateState.daily++;
  return { allowed: true, remaining: 100 - rateState.daily, resetIn: 0 };
}

function dailyRemaining() { return Math.max(0, 100 - rateState.daily); }

/** Resolve Gemini API key: storage override first, then hardcoded default */
async function getApiKey() {
  return new Promise((resolve) =>
    chrome.storage.local.get(["geminiKey"], (r) => resolve(r.geminiKey || GEMINI_API_KEY || ""))
  );
}

/** Strip markdown code fences from Gemini output, then parse JSON robustly */
function parseJSON(raw) {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(s); } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Gemini returned non-JSON output.");
  }
}

/** Strip HTML to plain text — removes scripts/styles first, then all tags */
function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI CLIENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call Gemini with full resilience:
 *  - 60s hard timeout per attempt (AbortController)
 *  - Max 2 retries with exponential backoff (3s, 6s)
 *  - Automatic fallback to gemini-1.5-flash on 503 overload
 *  - No search tools / grounding / thinking (causes 60-400s hangs)
 */
async function callGemini(systemPrompt, userPrompt, imageData = null, modelOverride = null) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No Gemini API key found.");

  const HARD_TIMEOUT_MS = 60_000;
  const RETRY_DELAYS    = [1000, 3000];
  
  // Refined cascade: Use the most stable, globally-available names first.
  const modelsToTry = modelOverride ? [modelOverride] : [
    "gemini-1.5-flash",     // Most compatible
    "gemini-1.5-pro",      // Best quality
    "gemini-2.0-flash",    // Latest
    "gemini-1.5-flash-002" // Specific stable version
  ];

  const parts = [];
  if (imageData) {
    parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } });
  }
  parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  };

  /** Internal helper to try a specific model on a specific API version */
  async function attemptFetch(model, apiVersion) {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), HARD_TIMEOUT_MS);
    
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
      });
      clearTimeout(tid);
      
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        const err     = new Error(`API ${res.status} (${model} @ ${apiVersion})`);
        err.status    = res.status;
        err.model     = model;
        err.apiVer    = apiVersion;
        err.details   = errText;
        throw err;
      }
      
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  let lastError = null;

  // Outer Loop: Try each model in the cascade
  for (const currentModel of modelsToTry) {
    // Inner Loop: Try both v1beta and v1 endpoints for each model
    for (const apiVer of ["v1beta", "v1"]) {
      // Retry Loop: Handle transient network/503 errors
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          const result = await attemptFetch(currentModel, apiVer);
          if (result) return result;
          throw new Error("Empty response");
        } catch (e) {
          lastError = e;

          // If 404, immediately skip to the next API version or next model
          if (e.status === 404) {
            console.warn(`404: ${currentModel} not found on ${apiVer}.`);
            break; // Skip inner retry loop, try next API version
          }

          // If 503 or 429, maybe retry or skip depending on intensity
          if (e.status === 503 || e.status === 429) {
             if (attempt < RETRY_DELAYS.length) {
               await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
               continue;
             }
             break; // Max retries hit, try next model
          }

          // For other errors, skip to next model
          break;
        }
      }
    }
  }

  // If we reach here, everything failed
  const errorMsg = lastError?.details || lastError?.message || "All models failed.";
  if (errorMsg.includes("404")) {
    throw new Error("Model Discovery Failed: Your API key might be restricted to a specific region or project. Try creating a new key in Google AI Studio.");
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-FILTER CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PRIVACY_KWS  = ["data","collect","share","cookie","privacy","policy","information","personal","track","store"];
const NOISE_WORDS  = new Set(["the","and","is","of","to","a","in","that","have","i","it","for","not","on","with","he","as","you","do","at","this","but","his","by","from","they","we","or","an","will","my","all","there"]);
const SAFE_DOMAINS = ["youtube.com","youtu.be","wikipedia.org","github.com","google.com","facebook.com","twitter.com","x.com","instagram.com","linkedin.com","reddit.com","wikimedia.org","githubusercontent.com","googleusercontent.com"];
const ADULT_URL_KW = ["porn","xxx","nsfw","nude","adult","sex","onlyfans"];
const CLEAN_EXTS   = /\.(svg|ico|gif)$/i;

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: PRIVACY POLICY
// ─────────────────────────────────────────────────────────────────────────────

async function handlePolicy({ url, urls, siteName, text }, sendResponse) {
  try {
    let input = (text || "").trim();

    // ── Multi-URL fetch (for known sites with policy map) ────────────────────
    if (!input && urls && urls.length > 0) {
      const fetched = await Promise.all(
        urls.map(async (u) => {
          try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 12_000);
            const res = await fetch(u, {
              signal: ctrl.signal,
              headers: { "User-Agent": "Mozilla/5.0 (compatible; AmbientShield/1.0)" }
            });
            if (!res.ok) return "";
            return stripHtml(await res.text());
          } catch { return ""; }
        })
      );
      // Combine all fetched texts, deduplicate whitespace
      input = fetched
        .filter(t => t.length > 50)
        .join("\n\n---\n\n")
        .replace(/\s{3,}/g, "\n\n")
        .trim();
    }

    // ── Single URL fetch (context-menu or fallback) ──────────────────────────
    if (!input && url) {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 10_000);
        const res  = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; AmbientShield/1.0)" } });
        input = stripHtml(await res.text());
      } catch { input = ""; }
    }

    // Limit to 12 KB for richer multi-URL coverage
    input = input.slice(0, 12000);

    const TOO_SHORT = {
      riskScore: 5, riskLevel: "CAUTION",
      simpleSummary: "This privacy policy is too brief to properly assess.",
      whatTheyCollect: [], whoTheyShare: [], yourRights: [],
      redFlags: ["Policy text is unusually short — may be incomplete"],
      optOutTips: [], verdict: "Unable to analyze — text too short.",
    };

    if (input.length < 80)
      return sendResponse({ success: true, result: TOO_SHORT, cached: false, remainingCalls: dailyRemaining() });

    if (!PRIVACY_KWS.some(k => input.toLowerCase().includes(k)))
      return sendResponse({ success: true, result: { ...TOO_SHORT, riskLevel: "SAFE", riskScore: 2, verdict: "No privacy-related content found on this page." }, cached: false, remainingCalls: dailyRemaining() });

    const hash   = djb2(`policy:${siteName || ""}:${input.slice(0, 200)}`);
    const cached = getCached(hash);
    if (cached) return sendResponse({ success: true, result: cached, cached: true, remainingCalls: dailyRemaining() });

    const limit = checkRateLimit();
    if (!limit.allowed) return sendResponse({ success: false, error: "Rate limit reached. Try again in a minute.", remainingCalls: 0 });

    const siteCtx = siteName ? `This is ${siteName}'s privacy policy. ` : "";
    
    // ── Offline Privacy Bot (No API Required) ─────────────────────────────────
    const result = analyzePolicyLocal(input, siteName);
    
    setCached(hash, result);
    sendResponse({ success: true, result, cached: false, remainingCalls: "Unlimited (Offline)" });
  } catch (err) {
    sendResponse({ success: false, error: err.message || "Analysis failed. Please retry.", remainingCalls: "Unlimited" });
  }
}

/** 
 * Local, Offline Privacy Policy Analyzer
 * Scans policy text for known keywords, legal loopholes, and trackers 
 * without sending user data to any external API.
 */
function analyzePolicyLocal(text, siteName) {
  const lower = text.toLowerCase();
  
  const result = {
    riskScore: 3,
    riskLevel: "SAFE",
    simpleSummary: `This is the privacy policy for ${siteName || 'this website'}. We analyzed it locally for maximum privacy.`,
    whatTheyCollect: [],
    whoTheyShare: [],
    yourRights: [],
    optOutTips: [],
    redFlags: [],
    verdict: "Standard privacy policy. Some data collection is present."
  };

  // 1. What they collect
  if (lower.includes("ip address")) result.whatTheyCollect.push("IP address and network info");
  if (lower.includes("location") || lower.includes("gps")) result.whatTheyCollect.push("Device location data");
  if (lower.includes("browser") || lower.includes("device type")) result.whatTheyCollect.push("Browser and device info");
  if (lower.includes("cookies") || lower.includes("pixels") || lower.includes("web beacons")) result.whatTheyCollect.push("Tracking cookies and usage data");
  if (lower.includes("contacts") || lower.includes("phonebook")) result.whatTheyCollect.push("Your contacts/address book");
  if (lower.includes("biometric") || lower.includes("face recognition")) result.whatTheyCollect.push("Biometric data (Face/Voice)");
  
  if (result.whatTheyCollect.length === 0) result.whatTheyCollect.push("Basic usage data (standard)");

  // 2. Who they share with
  if (lower.includes("third-party advertisers") || lower.includes("advertising partners")) result.whoTheyShare.push("Third-party advertisers");
  if (lower.includes("affiliates")) result.whoTheyShare.push("Corporate affiliates and subsidiaries");
  if (lower.includes("service providers")) result.whoTheyShare.push("Cloud and IT service providers");
  if (lower.includes("law enforcement") || lower.includes("legal obligation") || lower.includes("subpoena")) result.whoTheyShare.push("Law enforcement (if requested)");
  if (lower.includes("merger") || lower.includes("acquisition")) result.whoTheyShare.push("New owners in case of a business sale");

  if (result.whoTheyShare.length === 0) result.whoTheyShare.push("Service providers (standard)");

  // 3. Red Flags & Risk
  let score = 3;
  if (lower.includes("sell your personal information") || lower.includes("sell your data") || lower.includes("sell personal information")) {
    result.redFlags.push("They explicitly state they may SELL your data.");
    score += 3;
  }
  if (lower.includes("waive your right") || lower.includes("class action waiver") || lower.includes("binding arbitration")) {
    result.redFlags.push("Contains a class-action waiver or forced arbitration (limits your legal rights).");
    score += 2;
  }
  if (lower.includes("tracking across") || lower.includes("cross-site tracking") || lower.includes("track you across")) {
    result.redFlags.push("Tracks your behavior across other websites.");
    score += 2;
  }
  if (lower.includes("indefinitely") || lower.includes("as long as necessary")) {
    result.redFlags.push("Data retention limits are vague (they may keep data forever).");
    score += 1;
  }
  if (lower.includes("do not track") && lower.includes("do not respond")) {
    result.redFlags.push("They ignore your browser's 'Do Not Track' signals.");
    score += 1;
  }

  // 4. Your Rights & Opt-out
  if (lower.includes("right to delete") || lower.includes("erasure") || lower.includes("delete your personal")) result.yourRights.push("Right to delete your data");
  if (lower.includes("right to access") || lower.includes("copy of your") || lower.includes("right to know")) result.yourRights.push("Right to request a copy of your data");
  if (lower.includes("opt-out of sale") || lower.includes("do not sell")) {
    result.optOutTips.push("Look for a 'Do Not Sell My Personal Information' link in the footer of their website.");
    result.yourRights.push("Right to opt-out of data sales");
  }
  if (lower.includes("unsubscribe") || lower.includes("opt-out of marketing")) result.optOutTips.push("You can unsubscribe from marketing emails.");
  if (lower.includes("cookie settings") || lower.includes("manage cookies")) result.optOutTips.push("Use the site's Cookie Settings to disable non-essential tracking.");
  if (lower.includes("california") || lower.includes("ccpa")) result.yourRights.push("Special CCPA privacy rights (if in California)");

  if (result.optOutTips.length === 0) result.optOutTips.push("Use browser extensions like uBlock Origin to block tracking.");

  // Verdict & Formatting
  result.riskScore = Math.min(10, score);
  if (result.riskScore >= 7) {
    result.riskLevel = "DANGER";
    result.verdict = "High-risk policy: They collect extensive data and may sell it or track you aggressively.";
    result.simpleSummary = `The policy for ${siteName || 'this site'} contains several concerning clauses regarding data sharing and tracking. Be careful.`;
  } else if (result.riskScore >= 4) {
    result.riskLevel = "CAUTION";
    result.verdict = "Moderate risk: Standard corporate tracking, but watch out for data sharing.";
    result.simpleSummary = `The policy for ${siteName || 'this site'} is standard but collects quite a bit of tracking data.`;
  } else {
    result.riskLevel = "SAFE";
    result.verdict = "Generally safe: Standard data collection with no obvious red flags.";
    result.simpleSummary = `The policy for ${siteName || 'this site'} looks standard and doesn't contain aggressive tracking or selling clauses.`;
  }

  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: FACT CHECK
// ─────────────────────────────────────────────────────────────────────────────

async function handleFact({ text }, sendResponse) {
  try {
    const input = (text || "").trim().slice(0, 200);

    const TRIVIAL = {
      verdict: "UNVERIFIED", riskLevel: "SAFE", credibilityScore: 50,
      explanation: "Too short or too vague to meaningfully analyze.",
      redFlags: [], whatToCheck: ["Provide a more specific claim"],
      simpleSummary: "Text too short for fact-checking.",
    };

    if (input.length < 20)
      return sendResponse({ success: true, result: TRIVIAL, cached: false, remainingCalls: dailyRemaining() });

    const words = input.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.every(w => NOISE_WORDS.has(w)))
      return sendResponse({ success: true, result: TRIVIAL, cached: false, remainingCalls: dailyRemaining() });

    if (/^[\d\s\W]+$/.test(input))
      return sendResponse({ success: true, result: TRIVIAL, cached: false, remainingCalls: dailyRemaining() });

    // v2: prefix busts old poisoned cache entries from before the web-search upgrade
    const hash   = djb2(`fact:v2:${input}`);
    const cached = getCached(hash);
    if (cached) return sendResponse({ success: true, result: cached, cached: true, remainingCalls: dailyRemaining() });

    const limit = checkRateLimit();
    if (!limit.allowed) return sendResponse({ success: false, error: "Rate limit reached. Try again in a minute.", remainingCalls: 0 });

    // ── Entity-Aware Web Search Bot (No API Required) ──────────────────────
    const searchData = await deepSearchWeb(input);
    const result     = analyzeFindings(input, searchData);
    
    setCached(hash, result);
    sendResponse({ success: true, result, cached: false, remainingCalls: "Unlimited (Web Search)" });
  } catch (err) {
    sendResponse({ success: false, error: err.message || "Fact-check search failed. Please retry.", remainingCalls: "Unlimited" });
  }
}
/** 
 * Extracts political entities, location, year, and claimed outcome from a query.
 */
function extractEntities(query) {
  const lower = query.toLowerCase();
  
  const PARTIES = [
    { name: "Trinamool Congress (TMC)", aliases: ["tmc", "trinamool", "aitc", "mamata"] },
    { name: "BJP",                      aliases: ["bjp", "bharatiya janata", "narendra modi"] },
    { name: "Congress (INC)",           aliases: ["congress", "\\binc\\b", "rahul gandhi"] },
    { name: "AAP",                      aliases: ["\\baap\\b", "aam aadmi", "arvind kejriwal"] },
    { name: "Samajwadi Party",          aliases: ["samajwadi", "\\bsp\\b", "akhilesh"] },
    { name: "BSP",                      aliases: ["\\bbsp\\b", "bahujan samaj", "mayawati"] },
    { name: "CPI(M)",                   aliases: ["cpim", "cpi-m", "communist party"] },
    { name: "YSRCP",                    aliases: ["ysrcp", "ysr congress", "jagan"] },
    { name: "DMK",                      aliases: ["\\bdmk\\b", "dravida munnetra"] },
    { name: "AIADMK",                   aliases: ["aiadmk", "edappadi"] },
  ];

  const LOCATIONS = [
    { name: "West Bengal",    aliases: ["west bengal", "bengal", "\\bwb\\b", "kolkata"] },
    { name: "Uttar Pradesh",  aliases: ["uttar pradesh", "\\bup\\b", "lucknow"] },
    { name: "Bihar",          aliases: ["bihar", "patna"] },
    { name: "Delhi",          aliases: ["\\bdelhi\\b", "new delhi"] },
    { name: "Maharashtra",    aliases: ["maharashtra", "mumbai", "pune"] },
    { name: "Tamil Nadu",     aliases: ["tamil nadu", "\\btn\\b", "chennai"] },
    { name: "Karnataka",      aliases: ["karnataka", "bengaluru", "bangalore"] },
    { name: "Gujarat",        aliases: ["gujarat", "ahmedabad"] },
    { name: "Rajasthan",      aliases: ["rajasthan", "jaipur"] },
    { name: "Andhra Pradesh", aliases: ["andhra", "amaravati", "vijayawada"] },
  ];

  let party = null;
  for (const p of PARTIES) {
    if (p.aliases.some(a => new RegExp(a, "i").test(lower))) { party = p.name; break; }
  }
  let location = null;
  for (const l of LOCATIONS) {
    if (l.aliases.some(a => new RegExp(a, "i").test(lower))) { location = l.name; break; }
  }

  const yearMatch   = query.match(/\b(20\d{2})\b/);
  const claimedWon  = /\b(won|win|victory|winning|elected|majority|largest party|swept|landslide)\b/i.test(query);
  const claimedLost = /\b(lost|lose|defeat|losing|failed|trailing)\b/i.test(query);

  return { party, location, year: yearMatch ? yearMatch[1] : null, claimedWon, claimedLost };
}

/** 
 * STAGE 1 — Wikipedia Article Fetch: Gets the full intro of the most relevant article.
 * STAGE 2 — DuckDuckGo News: Current news for the claim.
 * STAGE 3 — Dedicated Fact-Check Search: Searches for Snopes/Reuters/AFP debunks.
 * Returns: { findings, entities }
 */
async function deepSearchWeb(query) {
  let findings = [];
  const entities = extractEntities(query);

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 15000);

    // ── SMART QUERY BUILDER ────────────────────────────────────────────────
    // Build a targeted Wikipedia query if we detected political entities
    let wikiQuery = query.length > 100 ? query.slice(0, 80) : query;
    if (entities.year && entities.location) {
      wikiQuery = `${entities.year} ${entities.location} Legislative Assembly election`;
    }

    // ── SOURCE 1: WIKIPEDIA (Most credible, structured) ───────────────────
    try {
      const searchRes  = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(wikiQuery)}&format=json&origin=*&srlimit=2`, { signal: ctrl.signal });
      const searchData = await searchRes.json();
      for (const item of (searchData?.query?.search || []).slice(0, 2)) {
        try {
          const extractRes  = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&exsentences=10&titles=${encodeURIComponent(item.title)}&format=json&origin=*`, { signal: ctrl.signal });
          const extractData = await extractRes.json();
          const pages       = extractData?.query?.pages || {};
          const extract     = Object.values(pages)[0]?.extract || "";
          if (extract.length > 60) {
            findings.push({ url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`, snippet: extract, source: "Wikipedia", title: item.title });
            break; // one deep Wikipedia result is enough
          }
        } catch(e) {}
      }
    } catch(e) {}

    // ── SOURCE 2: DUCKDUCKGO — General News ────────────────────────────
    try {
      const ddgRes  = await fetch("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
        body: `q=${encodeURIComponent(query + " news")}`,
        signal: ctrl.signal,
      });
      const html  = await ddgRes.text();
      const snips = html.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g) || [];
      const links = html.match(/href="[^"]*uddg=[^"]+"/g) || [];
      for (let i = 0; i < Math.min(3, snips.length); i++) {
        const snippet = stripHtml(snips[i]).trim();
        let u = "https://duckduckgo.com";
        if (links[i]) { const m = links[i].match(/href="([^"]+)"/); if (m) { u = m[1]; if (u.includes("uddg=")) try { u = decodeURIComponent(u.split("uddg=")[1].split("&")[0]); } catch {} } }
        if (snippet.length > 30) findings.push({ url: u, snippet, source: "Web" });
      }
    } catch(e) {}

    // ── SOURCE 3: DEDICATED FACT-CHECK SEARCH (Snopes, Reuters, AFP, PolitiFact) ──
    try {
      const factRes  = await fetch("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
        body: `q=${encodeURIComponent(query + " fact check site:snopes.com OR site:reuters.com OR site:apnews.com OR site:factcheck.org")}`,
        signal: ctrl.signal,
      });
      const factHtml  = await factRes.text();
      const factSnips = factHtml.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g) || [];
      const factLinks = factHtml.match(/href="[^"]*uddg=[^"]+"/g) || [];
      for (let i = 0; i < Math.min(2, factSnips.length); i++) {
        const snippet = stripHtml(factSnips[i]).trim();
        let u = "https://duckduckgo.com";
        if (factLinks[i]) { const m = factLinks[i].match(/href="([^"]+)"/); if (m) { u = m[1]; if (u.includes("uddg=")) try { u = decodeURIComponent(u.split("uddg=")[1].split("&")[0]); } catch {} } }
        if (snippet.length > 30) {
          // Mark fact-check sources with higher weight
          findings.push({ url: u, snippet, source: "FactCheck", isFactCheck: true });
        }
      }
    } catch(e) {}

    return { findings, entities };
  } catch(e) {
    return { findings, entities };
  }
}

/** 
 * Entity-Aware Claim Verifier: Cross-checks the claim's party against the actual winner
 * found in Wikipedia/web sources. No AI required.
 */
function analyzeFindings(query, { findings, entities } = {}) {
  if (!findings) findings = [];
  if (!entities) entities = {};

  const combinedText = findings.map(f => f.snippet.toLowerCase()).join(" ");
  const sourceLink   = findings.length > 0 ? findings[0].url    : "No verified source found.";
  const extractedFact = findings.length > 0 ? findings[0].snippet.slice(0, 220) + "..." : "No web results found.";

  let verdict     = "UNVERIFIED";
  let riskLevel   = "CAUTION";
  let explanation = "We searched the web but couldn't definitively verify this claim.";
  let redFlags    = [];

  // ── TIME PARADOX DETECTOR ────────────────────────────────────────────────────
  const now         = new Date();
  const currentYear = now.getFullYear();
  const yearMatch   = query.match(/\b(20\d{2})\b/);
  const pastTense   = /\b(won|did|happened|was|defeated|lost|elected|declared|announced|resulted)\b/i.test(query);

  if (yearMatch && pastTense) {
    const claimedYear = parseInt(yearMatch[1]);
    if (claimedYear > currentYear) {
      return {
        verdict: "FALSE", riskLevel: "DANGER", credibilityScore: 0,
        explanation: `Time Paradox: This claim is about ${claimedYear} but we are currently in ${currentYear}. This event has NOT happened yet.`,
        redFlags: ["Claims a future event has already happened.", "Likely fabricated/predictive news."],
        whatToCheck: [`Web Context: ${extractedFact}`, `Source: ${sourceLink}`],
        simpleSummary: `❌ IMPOSSIBLE: We are in ${currentYear}. The year ${claimedYear} is in the future.`
      };
    }
  }

  // ── ENTITY-AWARE WINNER CROSS-CHECK ─────────────────────────────────────────
  if (entities.party && entities.claimedWon && combinedText.length > 50) {
    const PARTY_ALIASES = {
      "Trinamool Congress (TMC)": ["trinamool", "aitc", "tmc", "mamata banerjee"],
      "BJP":                      ["bharatiya janata party", "bjp", "narendra modi"],
      "Congress (INC)":           ["indian national congress", "congress", "rahul gandhi"],
      "AAP":                      ["aam aadmi party", "aap", "kejriwal"],
      "Samajwadi Party":          ["samajwadi party", "akhilesh yadav"],
      "BSP":                      ["bahujan samaj party", "mayawati"],
      "CPI(M)":                   ["communist party", "cpi(m)", "cpim"],
      "YSRCP":                    ["ysrcp", "ysr congress", "jagan"],
      "DMK":                      ["dravida munnetra kazhagam", "dmk", "stalin"],
      "AIADMK":                   ["all india anna", "aiadmk", "edappadi"],
    };

    const claimedAliases = PARTY_ALIASES[entities.party] || [];
    const WIN_SUFFIXES = "(won|wins|victory|elected|largest party|majority|forms government|chief minister|led|swept)";

    let claimedPartyFoundAsWinner = false;
    let rivalPartyFoundAsWinner   = null;

    for (const alias of claimedAliases) {
      if (new RegExp(`${alias}.{0,100}${WIN_SUFFIXES}`, "i").test(combinedText)) {
        claimedPartyFoundAsWinner = true; break;
      }
    }

    if (!claimedPartyFoundAsWinner) {
      for (const [partyName, aliases] of Object.entries(PARTY_ALIASES)) {
        if (partyName === entities.party) continue;
        for (const alias of aliases) {
          if (new RegExp(`${alias}.{0,100}${WIN_SUFFIXES}`, "i").test(combinedText)) {
            rivalPartyFoundAsWinner = partyName; break;
          }
        }
        if (rivalPartyFoundAsWinner) break;
      }
    }

    if (rivalPartyFoundAsWinner) {
      return {
        verdict: "FALSE", riskLevel: "DANGER", credibilityScore: 5,
        explanation: `Claim says "${entities.party} won" but Wikipedia/web says ${rivalPartyFoundAsWinner} won this election.`,
        redFlags: [`Web evidence shows ${rivalPartyFoundAsWinner} was the actual winner, not ${entities.party}.`],
        whatToCheck: [`Wikipedia: ${sourceLink}`, `Context: ${extractedFact}`],
        simpleSummary: `❌ FALSE: According to our web search, ${rivalPartyFoundAsWinner} won — not ${entities.party}.`
      };
    }

    if (claimedPartyFoundAsWinner) {
      return {
        verdict: "TRUE", riskLevel: "SAFE", credibilityScore: 92,
        explanation: `Wikipedia confirms ${entities.party} won this election.`,
        redFlags: [],
        whatToCheck: [`Wikipedia: ${sourceLink}`],
        simpleSummary: `✅ TRUE: Web search confirms ${entities.party} won. Source: Wikipedia`
      };
    }
  }

  // ── FALLBACK: General Sentiment Analysis ────────────────────────────────────
  let fakeScore = 0; let realScore = 0;
  const fakeWords = ["false", "debunked", "fake", "hoax", "misleading", "satire", "unfounded", "not true", "incorrect", "conspiracy", "rumor", "refuted"];
  const realWords = ["true", "factual", "confirmed", "correct", "accurate", "verified", "official", "announced"];

  fakeWords.forEach(w => { if (combinedText.includes(w)) fakeScore++; });
  realWords.forEach(w => { if (combinedText.includes(w)) realScore++; });

  if (fakeScore > realScore && fakeScore > 0) {
    verdict = "FALSE"; riskLevel = "DANGER";
    explanation = "Web sources flag this as false or a hoax.";
    redFlags.push("Keywords matching 'fake' or 'debunked' found in search results.");
  } else if (realScore > fakeScore && realScore > 0) {
    verdict = "TRUE"; riskLevel = "SAFE";
    explanation = "Web search found verified sources supporting this claim.";
  } else if (findings.length > 0) {
    verdict = "UNVERIFIED"; riskLevel = "CAUTION";
    explanation = "We found related articles but couldn't explicitly verify or debunk this.";
  }

  return {
    verdict, riskLevel,
    credibilityScore: verdict === "TRUE" ? 90 : (verdict === "FALSE" ? 10 : 50),
    explanation,
    redFlags,
    whatToCheck: [`Source: ${sourceLink}`],
    simpleSummary: `Web result: "${extractedFact}"`
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: IMAGE SCAN (3 phases)
// ─────────────────────────────────────────────────────────────────────────────

async function handleImage({ imageUrl, imageData }, sendResponse) {
  try {
    const CLEAN = (reason) => ({ category: "CLEAN", confidence: 0.98, reason, shouldBlock: false, indicators: [] });

    // ── Phase 1: URL heuristics (zero API cost) ──────────────────────────────
    if (imageUrl) {
      try {
        const host = new URL(imageUrl).hostname.replace(/^www\./, "");
        if (SAFE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`)))
          return sendResponse({ success: true, result: CLEAN("Trusted domain"), cached: false, phase: 1, remainingCalls: dailyRemaining() });
      } catch {}

      if (CLEAN_EXTS.test(imageUrl))
        return sendResponse({ success: true, result: CLEAN("Safe file type (.svg/.ico/.gif)"), cached: false, phase: 1, remainingCalls: dailyRemaining() });

      const lower = imageUrl.toLowerCase();
      if (ADULT_URL_KW.some(k => lower.includes(k)))
        return sendResponse({ success: true, result: { category: "ADULT", confidence: 0.65, reason: "Adult keywords in URL path", shouldBlock: true, indicators: ["Suspicious URL pattern"] }, cached: false, phase: 1, remainingCalls: dailyRemaining() });
    }

    // ── Cache check (before spending rate-limit) ─────────────────────────────
    const cacheKey = djb2(`image:${imageUrl || ""}:${(imageData?.base64 || "").slice(0, 64)}`);
    const cached   = getCached(cacheKey);
    if (cached) return sendResponse({ success: true, result: cached, cached: true, phase: 2, remainingCalls: dailyRemaining() });

    const limit = checkRateLimit();
    if (!limit.allowed) return sendResponse({ success: false, error: "Rate limit reached. Try again in a minute.", remainingCalls: 0 });

    const system = 'Image classifier. Reply ONLY JSON (no markdown): {"category":"ADULT"|"VIOLENCE"|"DEEPFAKE"|"ADULT_AD"|"EDUCATIONAL"|"CLEAN","confidence":number,"reason":"10 words max","shouldBlock":boolean,"indicators":string[]}';

    // ── Phase 2: Text-only AI (URL / filename signal, no image tokens) ────────
    const fname = imageUrl ? imageUrl.split("/").pop().slice(0, 60) : "upload";
    const raw2  = await callGemini(system, `URL:${(imageUrl || "no-url").slice(0, 200)} Filename:${fname}`);
    const res2  = parseJSON(raw2);
    res2.confidence = Math.max(0, Math.min(1, res2.confidence || 0.5));

    // High-confidence text result or no image bytes → return Phase 2
    if (res2.confidence >= 0.85 || !imageData) {
      setCached(cacheKey, res2);
      return sendResponse({ success: true, result: res2, cached: false, phase: 2, remainingCalls: limit.remaining });
    }

    // ── Phase 3: Multimodal — only when Phase 2 is uncertain + bytes available ─
    const raw3  = await callGemini(system, `Analyze this image carefully. Filename:${fname}`, imageData);
    const res3  = parseJSON(raw3);
    res3.confidence = Math.max(0, Math.min(1, res3.confidence || 0.5));
    setCached(cacheKey, res3);
    sendResponse({ success: true, result: res3, cached: false, phase: 3, remainingCalls: limit.remaining });
  } catch (err) {
    sendResponse({ success: false, error: err.message || "Image scan failed. Please retry.", remainingCalls: dailyRemaining() });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE ROUTER
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: TRUST AURA (fast inline post/ad classifier)
// ─────────────────────────────────────────────────────────────────────────────

async function handleTrustAura({ text, isAd }, sendResponse) {
  try {
    const input = (text || "").trim().slice(0, 400);
    if (input.length < 20) return sendResponse({ level: "safe", reason: "" });

    const hash   = djb2(`aura:${isAd ? "ad" : "post"}:${input}`);
    const cached = getCached(hash);
    if (cached) return sendResponse(cached);

    const limit = checkRateLimit();
    if (!limit.allowed) return sendResponse({ level: "safe", reason: "" }); // fail quietly

    // ── Entity-Aware Web Search for Social Feed (No API) ─────────────────────
    const searchData = await deepSearchWeb(input);
    const analysis   = analyzeFindings(input, searchData);
    
    let level = "safe";
    let reason = "Standard post";

    if (analysis.verdict === "FALSE" || analysis.verdict === "MISLEADING") {
       level = "danger";
       reason = "Web search indicates FALSE";
    } else if (analysis.verdict === "UNVERIFIED") {
       level = "caution";
       reason = "Unverified claim";
    } else if (analysis.verdict === "TRUE") {
       level = "safe";
       reason = "Verified factual";
    }
    
    const result = { level, reason: reason.slice(0, 60) };


    setCached(hash, result);
    sendResponse(result);
  } catch {
    sendResponse({ level: "safe", reason: "" }); // always respond
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {

    case "TRUST_AURA":
      handleTrustAura(message, sendResponse);
      break;

    case "SCAN_POLICY":
      handlePolicy(message, sendResponse);
      break;

    case "SCAN_FACT":
      handleFact(message, sendResponse);
      break;

    case "SCAN_IMAGE":
      handleImage(message, sendResponse);
      break;

    // ── Dashboard direct Gemini call ──────────────────────────────────────────
    // Routes through callGemini() — gets full retry + fallback + timeout logic
    case "GEMINI_GENERATE": {
      (async () => {
        try {
          const systemPrompt = "You are Ambient Shield AI. Answer accurately and helpfully.";
          const userPrompt   = message.prompt || "";
          const imageData    = message.imageBase64
            ? { mimeType: message.imageMime || "image/jpeg", base64: message.imageBase64 }
            : null;
          // Multimodal (deepfake/image) → use gemini-2.5-pro (supports vision)
          // Text-only → also gemini-2.5-pro (highest accuracy for policy/factcheck)
          const text = await callGemini(systemPrompt, userPrompt, imageData);
          sendResponse({ text });
        } catch (e) {
          sendResponse({ error: e.message || "Gemini request failed." });
        }
      })();
      return true;
    }

    // ── Fetch image as base64 (bypasses CORS) ─────────────────────────────────
    case "FETCH_IMAGE_BASE64": {
      (async () => {
        try {
          const res = await fetch(message.url);
          if (!res.ok) { sendResponse({ error: "Could not fetch image" }); return; }
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result;
            const base64  = dataUrl.split(",")[1];
            sendResponse({ base64, mime: blob.type || "image/jpeg" });
          };
          reader.readAsDataURL(blob);
        } catch(e) { sendResponse({ error: e.message }); }
      })();
      return true;
    }

    case "OPEN_FACT_CHECK": {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      sendResponse({ ok: true });
      break;
    }

    case "OPEN_IMAGE_SCAN": {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      sendResponse({ ok: true });
      break;
    }

    case "PARENTAL_MODE_ON": {
      parentalWhitelist = message.whitelist || [];
      // ⚡ Immediately block ALL currently open tabs that aren't in the whitelist
      // This catches tabs that were already open (e.g. YouTube Music) before mode was activated
      enforceOnAllTabs();
      sendResponse({ ok: true });
      break;
    }

    case "PARENTAL_MODE_OFF": {
      parentalWhitelist = [];
      sendResponse({ ok: true });
      break;
    }

    case "PING":
      sendResponse({ ok: true, daily: rateState.daily, remaining: dailyRemaining() });
      break;

    default:
      sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  }
  return true; // keep the message channel open for async handlers
});

// ─────────────────────────────────────────────────────────────────────────────
// PARENTAL / WORK MODE — Multi-Layer URL Enforcement
// ─────────────────────────────────────────────────────────────────────────────

let parentalWhitelist = [];

// Restore whitelist when service worker restarts (e.g. browser relaunch)
chrome.storage.local.get(["parentalMode", "parentalWhitelist"], (result) => {
  if (result.parentalMode && Array.isArray(result.parentalWhitelist)) {
    parentalWhitelist = result.parentalWhitelist;
  }
});

/** Returns true if `url` is allowed under the current whitelist */
function isAllowedUrl(url) {
  if (!url) return true;
  // Always allow Chrome internals and extension pages
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.includes("blocked.html")
  ) return true;

  if (parentalWhitelist.length === 0) return true; // mode not active

  try {
    const visitHost = new URL(url).hostname.replace(/^www\./, "");
    return parentalWhitelist.some(allowed => {
      try {
        const allowedHost = new URL(allowed).hostname.replace(/^www\./, "");
        // exact match OR subdomain (e.g. www.linkedin.com matches linkedin.com)
        return visitHost === allowedHost || visitHost.endsWith("." + allowedHost);
      } catch { return false; }
    });
  } catch { return true; }
}

/** Redirect a tab to the blocked page */
async function blockTab(tabId, url) {
  const blockedPage = chrome.runtime.getURL("blocked.html") + "?url=" + encodeURIComponent(url);
  try { await chrome.tabs.update(tabId, { url: blockedPage }); } catch(_) {}
}

/**
 * LAYER 1 — Scan ALL currently open tabs.
 * Called immediately when Parental Mode is turned ON so that pre-existing
 * tabs (like YouTube Music that was already open) are caught right away.
 */
async function enforceOnAllTabs() {
  if (parentalWhitelist.length === 0) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const url = tab.url || "";
    if (!url || isAllowedUrl(url)) continue;
    await blockTab(tab.id, url);
  }
}

/**
 * LAYER 2 — webNavigation.onBeforeNavigate
 * Fires BEFORE a page starts loading — this is earlier and more reliable
 * than tabs.onUpdated which fires during/after the load.
 */
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (parentalWhitelist.length === 0) return;
  if (details.frameId !== 0) return; // only top-level frame
  if (isAllowedUrl(details.url)) return;
  await blockTab(details.tabId, details.url);
});

/**
 * LAYER 3 — tabs.onUpdated (safety net)
 * Catches navigations that webNavigation might miss (e.g. history.pushState)
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (parentalWhitelist.length === 0) return;
  if (changeInfo.status !== "loading") return;
  const url = changeInfo.url || tab.url || "";
  if (!url || isAllowedUrl(url)) return;
  await blockTab(tabId, url);
});

/**
 * LAYER 4 — tabs.onActivated
 * When a user SWITCHES to a tab that was already open and blocked,
 * redirect it immediately (catches pre-existing tabs the user tabs back to).
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (parentalWhitelist.length === 0) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const url = tab.url || "";
    if (!url || isAllowedUrl(url)) return;
    await blockTab(activeInfo.tabId, url);
  } catch(_) {}
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT MENUS
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "ambient-policy",    title: "🛡️ Analyze Privacy Policy",  contexts: ["page"] });
    chrome.contextMenus.create({ id: "ambient-factcheck", title: "🛡️ Fact-check Selection",     contexts: ["selection"] });
    chrome.contextMenus.create({ id: "ambient-image",     title: "🛡️ Scan Image",               contexts: ["image"] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "ambient-policy") {
    // Extract the page text, store it, then open the dashboard which will auto-run the scan
    try {
      const [{ result: pageText }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Prefer the main article/content element, fall back to full body
          const main = document.querySelector('main, article, [role="main"], .privacy-policy, .policy-content, #privacy, #policy');
          const src  = main || document.body;
          return (src.innerText || src.textContent || "").replace(/\s{2,}/g, " ").trim().slice(0, 12000);
        },
      });
      await chrome.storage.local.set({
        pendingPolicyScan: {
          text: pageText || "",
          url:  tab.url  || "",
          title: tab.title || "",
          ts: Date.now(),
        }
      });
    } catch (_) {
      // If scripting fails, just open with no pre-load
      await chrome.storage.local.remove("pendingPolicyScan");
    }
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=policy" });
    return;
  }

  if (info.menuItemId === "ambient-factcheck") {
    const selected = (info.selectionText || "").slice(0, 500);
    await chrome.storage.local.set({ pendingFactCheck: { text: selected, ts: Date.now() } });
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=factcheck" });
    return;
  }

  if (info.menuItemId === "ambient-image") {
    await chrome.storage.local.set({ pendingImageScan: { url: info.srcUrl || "", ts: Date.now() } });
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=deepfake" });
    return;
  }

  // Fallback
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});
