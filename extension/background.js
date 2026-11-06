// Ambient Shield — Background Service Worker (Manifest V3)
// 100% Local Inference (Ollama/Gemma). Zero API Keys. Fully MV3 Compliant.
// ─────────────────────────────────────────────────────────────────────────────

import { callLLM, checkLLMHealth, getLLMConfig } from "./llm/index.js";
import { PROMPTS } from "./llm/prompts.js";
import { validateMessage, MESSAGE_ACTIONS } from "./messages.js";
import { logStage } from "./logger.js";
import {
  checkTimeParadox,
  filterVerifiableCitations,
  inspectImageHeuristics,
  analyzePolicyLocal,
} from "./heuristics.js";

// ─────────────────────────────────────────────────────────────────────────────
// STATE & PERSISTENCE (MV3 Lifecycle Resilient)
// ─────────────────────────────────────────────────────────────────────────────

let parentalWhitelist = [];
let localOnlyMode = false;

// Rehydrate state on service worker wake-up
async function rehydrateState() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["parentalMode", "parentalWhitelist", "localOnlyMode"], resolve);
    });
    if (data.parentalMode && Array.isArray(data.parentalWhitelist)) {
      parentalWhitelist = data.parentalWhitelist;
    }
    localOnlyMode = Boolean(data.localOnlyMode);
    logStage("LIFECYCLE", "Background service worker state restored.");
  } catch (err) {
    logStage("ERROR", "Failed to rehydrate state", err);
  }
}
rehydrateState();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.parentalWhitelist) parentalWhitelist = changes.parentalWhitelist.newValue || [];
    if (changes.localOnlyMode) localOnlyMode = Boolean(changes.localOnlyMode.newValue);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADULT CONTENT FIREWALL (Tab Watcher & DNR Safety Net)
// ─────────────────────────────────────────────────────────────────────────────

const ADULT_HOST_PATTERNS = [
  "xnxx","pornhub","xvideos","xhamster","redtube","youporn",
  "spankbang","eporner","tube8","beeg","tnaflix","onlyfans","fansly",
  "nhentai","hentaihaven","hentai2read","tsumino","fakku","hanime",
  "rule34","gelbooru","danbooru","e621","brazzers","nubiles","mofos",
  "bangbros","realitykings","chaturbate","bongacams","stripchat",
  "livejasmin","cam4","myfreecams","adultfriendfinder","ashleymadison",
  "sex.com","porn.com","nudevista","freeones","porndig","youjizz",
];

const ADULT_URL_FRAGMENTS = [
  "xnxx","xvideos","pornhub","nhentai",
  "/porn/","/xxx/","/nsfw/",
  "chaturbate","stripchat","rule34",
];

function isAdultUrl(url) {
  if (!url || url.startsWith("chrome") || url.startsWith("about:") || url.includes("blocked.html")) return false;
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const full = url.toLowerCase();

    for (const kw of ADULT_HOST_PATTERNS) {
      if (hostname.includes(kw)) return true;
    }
    for (const frag of ADULT_URL_FRAGMENTS) {
      if (full.includes(frag)) return true;
    }
  } catch (_) {}
  return false;
}

async function injectBlock(tabId, url) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (blockedUrl) => {
        if (document.getElementById("ambient-shield-firewall")) return;
        const hostname = (() => {
          try { return new URL(blockedUrl).hostname.replace(/^www\./, ""); } catch { return blockedUrl; }
        })();

        document.documentElement.style.cssText = "overflow:hidden!important;";
        const overlay = document.createElement("div");
        overlay.id = "ambient-shield-firewall";
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
            <p style="font-size:14px;color:rgba(180,210,255,0.65);line-height:1.7">Ambient Shield has detected this site as <strong style="color:#ff8099">18+ adult content</strong>. Protection active.</p>
            <div style="padding:10px 18px;background:rgba(255,77,109,0.08);border:1px solid rgba(255,77,109,0.2);border-radius:10px;font-size:13px;color:#ff8099;font-family:monospace;word-break:break-all">⛔ ${hostname}</div>
            <button id="_as_back_btn" style="padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,#1e4bb8,#5b9cf6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;border:none;box-shadow:0 2px 18px rgba(91,156,246,0.35);font-family:inherit">← Go Back to Safety</button>
          </div>`;

        document.documentElement.appendChild(overlay);
        document.getElementById("_as_back_btn").addEventListener("click", () => {
          if (history.length > 1) history.go(-1);
          else location.replace("https://www.google.com");
        });
      },
      args: [url],
    });
  } catch (_) {}
}

function isAllowedUrl(url) {
  if (!url) return true;
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.includes("blocked.html")
  ) return true;

  if (parentalWhitelist.length === 0) return true;

  try {
    const visitHost = new URL(url).hostname.replace(/^www\./, "");
    return parentalWhitelist.some(allowed => {
      try {
        const allowedHost = new URL(allowed).hostname.replace(/^www\./, "");
        return visitHost === allowedHost || visitHost.endsWith("." + allowedHost);
      } catch { return false; }
    });
  } catch { return true; }
}

async function blockTab(tabId, url) {
  const blockedPage = chrome.runtime.getURL("blocked.html") + "?url=" + encodeURIComponent(url);
  try { await chrome.tabs.update(tabId, { url: blockedPage }); } catch (_) {}
}

async function enforceOnAllTabs() {
  if (parentalWhitelist.length === 0) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const url = tab.url || "";
    if (!url || isAllowedUrl(url)) continue;
    await blockTab(tab.id, url);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRIEVAL PIPELINE (Wikipedia API + DuckDuckGo Lite)
// ─────────────────────────────────────────────────────────────────────────────

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

export async function retrieveWebEvidence(query) {
  const findings = [];
  if (localOnlyMode) {
    logStage("RETRIEVAL", "Local-only mode active: skipping outbound queries.");
    return findings;
  }

  const cleanQuery = (query || "").replace(/[^\w\s-]/g, " ").trim().slice(0, 100);
  if (!cleanQuery) return findings;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);

  // 1. Wikipedia API Search & Extract
  try {
    const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&origin=*&srlimit=2`;
    const searchRes = await fetch(wikiSearchUrl, { signal: ctrl.signal });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const items = searchData?.query?.search || [];
      for (const item of items.slice(0, 2)) {
        try {
          const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&exsentences=6&titles=${encodeURIComponent(item.title)}&format=json&origin=*`;
          const extRes = await fetch(extractUrl, { signal: ctrl.signal });
          if (extRes.ok) {
            const extData = await extRes.json();
            const pages = extData?.query?.pages || {};
            const snippet = Object.values(pages)[0]?.extract || "";
            if (snippet.length > 50) {
              findings.push({
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                snippet,
                source: "Wikipedia",
                title: item.title,
              });
              break;
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    logStage("RETRIEVAL", "Wikipedia fetch failed", err?.message);
  }

  // 2. DuckDuckGo Lite search for current news/context
  try {
    const ddgRes = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
      body: `q=${encodeURIComponent(cleanQuery)}`,
      signal: ctrl.signal,
    });
    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const snips = html.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g) || [];
      const links = html.match(/href="[^"]*uddg=[^"]+"/g) || [];

      for (let i = 0; i < Math.min(3, snips.length); i++) {
        const snippet = stripHtml(snips[i]).trim();
        let u = "https://duckduckgo.com";
        if (links[i]) {
          const m = links[i].match(/href="([^"]+)"/);
          if (m && m[1].includes("uddg=")) {
            try { u = decodeURIComponent(m[1].split("uddg=")[1].split("&")[0]); } catch (_) {}
          }
        }
        if (snippet.length > 30) {
          findings.push({ url: u, snippet, source: "DuckDuckGo Lite" });
        }
      }
    }
  } catch (err) {
    logStage("RETRIEVAL", "DDG Lite fetch failed", err?.message);
  } finally {
    clearTimeout(tid);
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleFactCheck({ text }, sendResponse) {
  try {
    const claim = (text || "").trim().slice(0, 300);
    if (claim.length < 15) {
      return sendResponse({
        success: true,
        result: {
          verdict: "Couldn't verify",
          riskLevel: "SAFE",
          credibilityScore: 50,
          explanation: "Claim text is too brief to verify.",
          redFlags: [],
          whatToCheck: [],
          simpleSummary: "Please provide a more complete claim.",
        },
      });
    }

    logStage("FACT_CHECK", `Starting fact check: "${claim.slice(0, 60)}"`);

    // 1. Time paradox check with real date
    const paradox = checkTimeParadox(claim, new Date());
    if (paradox.isParadox) {
      logStage("FACT_CHECK", "Time paradox detected");
      return sendResponse({
        success: true,
        result: {
          verdict: "Couldn't verify",
          riskLevel: "CAUTION",
          credibilityScore: 50,
          explanation: paradox.reasoning,
          redFlags: ["Claim asserts future event has already occurred."],
          whatToCheck: [`Current reference year: ${new Date().getFullYear()}`],
          simpleSummary: "Future events cannot be verified yet.",
        },
      });
    }

    // 2. Evidence retrieval
    const evidence = await retrieveWebEvidence(claim);

    // 3. LLM Evidence Judging
    const currentYear = new Date().getFullYear();
    const prompt = PROMPTS.FACT_CHECK.buildPrompt({ claim, evidence, currentYear });

    const llmResult = await callLLM({
      task: "FACT_CHECK",
      system: PROMPTS.FACT_CHECK.system,
      prompt,
      schema: PROMPTS.FACT_CHECK.schema,
    });

    if (!llmResult.success) {
      logStage("FACT_CHECK", "LLM reasoning failed, fallback to retrieval summary", llmResult.error);
      return sendResponse({
        success: true,
        result: {
          verdict: "Couldn't verify",
          riskLevel: "CAUTION",
          credibilityScore: 50,
          explanation: evidence.length > 0
            ? `Found ${evidence.length} web sources, but local LLM could not complete synthesis.`
            : "No verified web sources found to evaluate this claim.",
          redFlags: [],
          whatToCheck: evidence.map(e => `${e.source}: ${e.url}`),
          simpleSummary: "Evaluation inconclusive.",
        },
      });
    }

    const { verdict, confidence, reasoning, citations } = llmResult.data;

    // 4. Verification of citation quotes against retrieved evidence
    const verifiedCitations = filterVerifiableCitations(citations, evidence);

    // 5. Map to UI schema with truthful wording
    let mappedVerdict = "Couldn't verify";
    let riskLevel = "CAUTION";
    let credibilityScore = 50;

    if (verdict === "supported") {
      mappedVerdict = "Supported by sources";
      riskLevel = "SAFE";
      credibilityScore = Math.max(70, Math.round(confidence * 100));
    } else if (verdict === "contradicted") {
      mappedVerdict = "Contradicted by sources";
      riskLevel = "DANGER";
      credibilityScore = Math.min(25, Math.round((1 - confidence) * 100));
    }

    sendResponse({
      success: true,
      cached: llmResult.cached,
      result: {
        verdict: mappedVerdict,
        riskLevel,
        credibilityScore,
        explanation: reasoning,
        redFlags: mappedVerdict === "Contradicted by sources" ? ["Contradicted by retrieved evidence."] : [],
        whatToCheck: verifiedCitations.map(c => `Quote: "${c.quote}" — Source: ${c.url}`),
        simpleSummary: `${mappedVerdict}. Confidence: ${Math.round(confidence * 100)}%`,
      },
    });
  } catch (err) {
    logStage("ERROR", "handleFactCheck exception", err);
    sendResponse({
      success: false,
      error: err?.message || "Fact check evaluation failed.",
    });
  }
}

async function handleTrustAura({ text, isAd }, sendResponse) {
  try {
    const input = (text || "").trim().slice(0, 400);
    if (input.length < 20) {
      return sendResponse({ level: "neutral", reason: "" });
    }

    logStage("TRUST_AURA", `Evaluating post/ad (isAd=${Boolean(isAd)})`);

    // Check LLM health / call LLM
    const prompt = PROMPTS.TRUST_AURA.buildPrompt({ text: input, isAd });
    const res = await callLLM({
      task: "TRUST_AURA",
      system: PROMPTS.TRUST_AURA.system,
      prompt,
      schema: PROMPTS.TRUST_AURA.schema,
    });

    if (!res.success) {
      // Graceful degradation to neutral grey aura
      return sendResponse({ level: "neutral", reason: "Local engine offline" });
    }

    sendResponse({
      level: res.data.level,
      reason: res.data.reason,
      cached: res.cached,
    });
  } catch (_) {
    sendResponse({ level: "neutral", reason: "Engine error" });
  }
}

async function handlePolicyScan({ url, urls, siteName, text }, sendResponse) {
  try {
    let input = (text || "").trim();

    // Multi-URL fetch if provided
    if (!input && Array.isArray(urls) && urls.length > 0) {
      const fetched = await Promise.all(
        urls.map(async (u) => {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(u, {
              signal: ctrl.signal,
              headers: { "User-Agent": "Mozilla/5.0 (compatible; AmbientShield/2.0)" },
            });
            clearTimeout(tid);
            if (!res.ok) return "";
            return stripHtml(await res.text());
          } catch { return ""; }
        })
      );
      input = fetched.filter(t => t.length > 50).join("\n\n").slice(0, 15000);
    }

    // Single URL fetch
    if (!input && url) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AmbientShield/2.0)" },
        });
        clearTimeout(tid);
        if (res.ok) input = stripHtml(await res.text()).slice(0, 15000);
      } catch (_) {}
    }

    if (!input || input.length < 60) {
      return sendResponse({
        success: true,
        result: {
          riskScore: 5,
          riskLevel: "CAUTION",
          summary: "Privacy text is too brief to analyze accurately.",
          whatTheyCollect: [],
          whoTheyShare: [],
          yourRights: [],
          redFlags: ["Insufficient text provided"],
          simpleSummary: "Unable to assess policy text.",
          optOutTips: [],
          verdict: "Policy text too brief.",
        },
      });
    }

    // 1. Compute foundational offline heuristics (always succeeds)
    const baseResult = analyzePolicyLocal(input, siteName);

    // 2. Attempt optional LLM synthesis
    try {
      const prompt = PROMPTS.POLICY_SUMMARY.buildPrompt({ policyText: input, siteName });
      const llmRes = await callLLM({
        task: "POLICY_SUMMARY",
        system: PROMPTS.POLICY_SUMMARY.system,
        prompt,
        schema: PROMPTS.POLICY_SUMMARY.schema,
      });

      if (llmRes.success && llmRes.data) {
        if (llmRes.data.simpleSummary) baseResult.simpleSummary = llmRes.data.simpleSummary;
        if (Array.isArray(llmRes.data.optOutTips) && llmRes.data.optOutTips.length > 0) {
          baseResult.optOutTips = Array.from(new Set([...baseResult.optOutTips, ...llmRes.data.optOutTips]));
        }
      }
    } catch (_) {}

    sendResponse({
      success: true,
      result: baseResult,
      remainingCalls: 999,
    });
  } catch (err) {
    logStage("ERROR", "handlePolicyScan exception", err);
    sendResponse({
      success: false,
      error: err?.message || "Policy scanning failed.",
    });
  }
}

async function handleImageScan({ imageUrl, imageData, filename, fileSize }, sendResponse) {
  try {
    logStage("IMAGE_SCAN", `Scanning image: ${filename || imageUrl || "uploaded"}`);

    // 1. Run local heuristics (formats, size, known generative metadata, adult tags)
    const heuristics = inspectImageHeuristics({
      filename: filename || (imageUrl ? imageUrl.split("/").pop() : ""),
      fileSize: fileSize || 0,
      imageUrl: imageUrl || "",
      mimeType: imageData?.mimeType || "",
    });

    // 2. Multimodal inspection with local model if image bytes available
    if (imageData?.base64) {
      const prompt = PROMPTS.IMAGE_INSPECTION.buildPrompt({
        filename: filename || "uploaded_image",
        heuristicFindings: heuristics,
      });

      const llmRes = await callLLM({
        task: "IMAGE_INSPECTION",
        system: PROMPTS.IMAGE_INSPECTION.system,
        prompt,
        schema: PROMPTS.IMAGE_INSPECTION.schema,
        images: [imageData.base64],
      });

      if (llmRes.success && llmRes.data) {
        heuristics.category = llmRes.data.category;
        heuristics.confidence = llmRes.data.confidence;
        heuristics.reason = llmRes.data.reason;
        if (Array.isArray(llmRes.data.indicators)) {
          heuristics.indicators = Array.from(new Set([...heuristics.indicators, ...llmRes.data.indicators]));
        }
      }
    }

    sendResponse({
      success: true,
      result: heuristics,
      remainingCalls: 999,
    });
  } catch (err) {
    logStage("ERROR", "handleImageScan exception", err);
    sendResponse({
      success: false,
      error: err?.message || "Image inspection failed.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNCHRONOUS LISTENER REGISTRATION (MV3 Top-Level)
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const validation = validateMessage(message);
  if (!validation.valid) {
    sendResponse({ success: false, error: validation.error });
    return true;
  }

  const action = message.action;

  switch (action) {
    case MESSAGE_ACTIONS.TRUST_AURA:
      handleTrustAura(message, sendResponse);
      break;

    case MESSAGE_ACTIONS.SCAN_FACT:
      handleFactCheck(message, sendResponse);
      break;

    case MESSAGE_ACTIONS.SCAN_POLICY:
      handlePolicyScan(message, sendResponse);
      break;

    case MESSAGE_ACTIONS.SCAN_IMAGE:
      handleImageScan(message, sendResponse);
      break;

    case MESSAGE_ACTIONS.LLM_GENERATE:
    case MESSAGE_ACTIONS.GEMINI_GENERATE: {
      (async () => {
        try {
          const images = message.imageBase64 ? [message.imageBase64] : [];
          const res = await callLLM({
            task: "GENERIC",
            system: "You are Ambient Shield AI. Respond strictly in valid JSON.",
            prompt: message.prompt || "",
            images,
          });
          if (res.success) {
            sendResponse({ text: JSON.stringify(res.data) });
          } else {
            sendResponse({ error: res.error || "LLM inference failed" });
          }
        } catch (e) {
          sendResponse({ error: e?.message || "Inference error" });
        }
      })();
      break;
    }

    case MESSAGE_ACTIONS.CHECK_LLM_HEALTH: {
      checkLLMHealth().then(sendResponse);
      break;
    }

    case MESSAGE_ACTIONS.FETCH_IMAGE_BASE64: {
      (async () => {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 10000);
          const res = await fetch(message.url, { signal: ctrl.signal });
          clearTimeout(tid);
          if (!res.ok) {
            sendResponse({ error: "Could not fetch image bytes" });
            return;
          }
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result;
            const base64 = dataUrl.split(",")[1];
            sendResponse({ base64, mime: blob.type || "image/jpeg" });
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          sendResponse({ error: e?.message || "Fetch failed" });
        }
      })();
      break;
    }

    case MESSAGE_ACTIONS.OPEN_FACT_CHECK:
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=factcheck" });
      sendResponse({ ok: true });
      break;

    case MESSAGE_ACTIONS.OPEN_IMAGE_SCAN:
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=deepfake" });
      sendResponse({ ok: true });
      break;

    case MESSAGE_ACTIONS.PARENTAL_MODE_ON: {
      parentalWhitelist = message.whitelist || [];
      chrome.storage.local.set({ parentalMode: true, parentalWhitelist }, () => {
        enforceOnAllTabs();
        sendResponse({ ok: true });
      });
      break;
    }

    case MESSAGE_ACTIONS.PARENTAL_MODE_OFF: {
      parentalWhitelist = [];
      chrome.storage.local.set({ parentalMode: false, parentalWhitelist: [] }, () => {
        sendResponse({ ok: true });
      });
      break;
    }

    case MESSAGE_ACTIONS.PING:
      getLLMConfig().then(cfg => {
        sendResponse({ ok: true, engine: cfg.provider, model: cfg.ollamaModel });
      });
      break;

    default:
      sendResponse({ success: false, error: `Unhandled action: ${action}` });
      break;
  }

  return true; // Keep channel open for async sendResponse
});

// Firewall Navigation Listeners
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (parentalWhitelist.length === 0) return;
  if (details.frameId !== 0) return;
  if (isAllowedUrl(details.url)) return;
  await blockTab(details.tabId, details.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!url) return;

  if (isAdultUrl(url)) {
    injectBlock(tabId, url);
    return;
  }

  if (parentalWhitelist.length > 0 && changeInfo.status === "loading") {
    if (!isAllowedUrl(url)) {
      await blockTab(tabId, url);
    }
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (parentalWhitelist.length === 0) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const url = tab.url || "";
    if (url && !isAllowedUrl(url)) {
      await blockTab(activeInfo.tabId, url);
    }
  } catch (_) {}
});

// Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "ambient-policy",    title: "🛡️ Analyze Privacy Policy", contexts: ["page"] });
    chrome.contextMenus.create({ id: "ambient-factcheck", title: "🛡️ Fact-check Selection",    contexts: ["selection"] });
    chrome.contextMenus.create({ id: "ambient-image",     title: "🛡️ Scan Image",              contexts: ["image"] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "ambient-policy") {
    try {
      const [{ result: pageText }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const main = document.querySelector('main, article, [role="main"], .privacy-policy, .policy-content, #privacy, #policy');
          const src = main || document.body;
          return (src.innerText || src.textContent || "").replace(/\s{2,}/g, " ").trim().slice(0, 12000);
        },
      });
      await chrome.storage.local.set({
        pendingPolicyScan: {
          text: pageText || "",
          url: tab.url || "",
          title: tab.title || "",
          ts: Date.now(),
        },
      });
    } catch (_) {
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

  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});
