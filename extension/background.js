// Ambient Shield — Background Service Worker (Manifest V3)
// 100% Local Inference (Ollama/Gemma). Zero API Keys. Fully MV3 Compliant.
// ─────────────────────────────────────────────────────────────────────────────

import { callLLM, checkLLMHealth, getLLMConfig } from "./llm/index.js";
import { PROMPTS } from "./llm/prompts.js";
import { validateMessage, MESSAGE_ACTIONS } from "./messages.js";
import { logStage } from "./logger.js";
import { runUnifiedScan } from "./scanner/index.js";
import {
  checkTimeParadox,
  filterVerifiableCitations,
  inspectImageHeuristics,
  analyzePolicyLocal,
} from "./heuristics.js";

// ─────────────────────────────────────────────────────────────────────────────
// STATE & PERSISTENCE (MV3 Lifecycle Resilient)
// ─────────────────────────────────────────────────────────────────────────────

let parentalModeActive = false;
let parentalWhitelist = [];
let parentalPassword = "123456";
let parentalTempUnlockUntil = 0;
let localOnlyMode = false;

// Rehydrate state on service worker wake-up
async function rehydrateState() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["parentalMode", "parentalWhitelist", "parentalPassword", "localOnlyMode"], resolve);
    });
    parentalModeActive = Boolean(data.parentalMode);
    if (parentalModeActive && Array.isArray(data.parentalWhitelist)) {
      parentalWhitelist = data.parentalWhitelist;
    }
    if (typeof data.parentalPassword === "string" && data.parentalPassword) {
      parentalPassword = data.parentalPassword;
    }
    localOnlyMode = Boolean(data.localOnlyMode);
    logStage("LIFECYCLE", "Background service worker state restored.");
  } catch (err) {
    logStage("ERROR", "Failed to rehydrate state", err);
  }
}
rehydrateState();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  const prevActive = parentalModeActive;

  if (changes.parentalMode !== undefined) parentalModeActive = Boolean(changes.parentalMode.newValue);
  if (changes.parentalWhitelist) parentalWhitelist = changes.parentalWhitelist.newValue || [];
  if (changes.parentalPassword) parentalPassword = changes.parentalPassword.newValue || "123456";
  if (changes.localOnlyMode) localOnlyMode = Boolean(changes.localOnlyMode.newValue);

  // If parental mode just turned ON (storage-driven, no need for a message), enforce immediately.
  // This is the reliable path: popup.js writes storage → onChanged fires → enforce.
  if (!prevActive && parentalModeActive && parentalWhitelist.length > 0) {
    logStage("PARENTAL", "Mode activated via storage change — enforcing on all tabs.");
    enforceOnAllTabs();
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

function isProtectedManagementUrl(url) {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase().trim();
  return (
    lower.startsWith("chrome://extensions") ||
    lower.startsWith("chrome://settings") ||
    lower.startsWith("edge://extensions") ||
    lower.startsWith("edge://settings") ||
    lower.startsWith("brave://extensions") ||
    lower.startsWith("brave://settings") ||
    lower.startsWith("opera://extensions") ||
    lower.startsWith("opera://settings") ||
    lower.startsWith("about:addons") ||
    lower.startsWith("about:preferences")
  );
}

function isManagementUnlocked() {
  return Date.now() < parentalTempUnlockUntil;
}

function isAllowedUrl(url) {
  if (!url) return true;

  // Always permit Ambient Shield extension pages (parental lock, blocked, dashboard, popup)
  if (
    url.includes("parental-lock.html") ||
    url.includes("blocked.html") ||
    url.includes("dashboard.html") ||
    url.includes("popup.html")
  ) {
    return true;
  }

  // If Parental Mode is active, check protected extension management / settings URLs
  if (parentalModeActive && isProtectedManagementUrl(url)) {
    return isManagementUnlocked();
  }

  // Allow browser internal schemes if not protected management
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("data:")
  ) {
    return true;
  }

  // If parental mode is not active or whitelist is empty, allow navigation
  if (!parentalModeActive || parentalWhitelist.length === 0) return true;

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
  const isMgmt = isProtectedManagementUrl(url);
  const destPage = isMgmt
    ? chrome.runtime.getURL("parental-lock.html") + "?target=" + encodeURIComponent(url)
    : chrome.runtime.getURL("blocked.html") + "?url=" + encodeURIComponent(url);

  try {
    await chrome.tabs.update(tabId, { url: destPage });
  } catch (_) {
    // Privileged browser pages (like chrome://extensions) may block tabs.update; close & recreate tab
    if (isMgmt) {
      try {
        await chrome.tabs.remove(tabId);
        await chrome.tabs.create({ url: destPage });
      } catch (_) {}
    }
  }
}

async function enforceOnAllTabs() {
  if (!parentalModeActive) return;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      const url = tab.url || tab.pendingUrl || "";
      if (!url || isAllowedUrl(url)) continue;
      await blockTab(tab.id, url);
    }
  } catch (_) {}
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
    const raw = (text || "").trim();
    if (raw.length < 15) {
      return sendResponse({
        success: true,
        result: {
          type: "claim",
          verdict: "Couldn't verify",
          riskLevel: "SAFE",
          credibilityScore: 50,
          explanation: "Text is too brief to verify. Please provide a complete claim, headline, or job posting.",
          redFlags: [],
          whatToCheck: [],
          simpleSummary: "Please provide a more complete claim.",
        },
      });
    }

    logStage("FACT_CHECK", `Starting unified scan: "${raw.slice(0, 60)}"`);

    // Keep service worker alive during multi-step retrieval & judging
    const keepAliveInterval = setInterval(() => {
      try {
        if (chrome.runtime?.getPlatformInfo) {
          chrome.runtime.getPlatformInfo(() => {});
        }
      } catch (_) {}
    }, 4000);

    // Persist active scan in session storage for MV3 survivability
    const activeScanState = { text: raw.slice(0, 5000), startedAt: Date.now() };
    if (chrome.storage?.session) {
      chrome.storage.session.set({ activeScan: activeScanState }).catch(() => {});
    }

    const scanOutput = await runUnifiedScan(raw, (progress) => {
      logStage("SCAN_PROGRESS", `${progress.step}: ${progress.message}`);
    });

    clearInterval(keepAliveInterval);
    if (chrome.storage?.session) {
      chrome.storage.session.remove("activeScan").catch(() => {});
    }

    if (!scanOutput.success) {
      logStage("FACT_CHECK", "Unified scan returned error", scanOutput.error);
      return sendResponse({
        success: false,
        error: scanOutput.error || "Fact check evaluation failed.",
      });
    }

    sendResponse({
      success: true,
      cached: scanOutput.result?.cached,
      result: scanOutput.result,
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
      parentalModeActive = true;
      parentalWhitelist = message.whitelist || [];
      chrome.storage.local.set({ parentalMode: true, parentalWhitelist }, () => {
        enforceOnAllTabs();
        sendResponse({ ok: true });
      });
      break;
    }

    case MESSAGE_ACTIONS.PARENTAL_MODE_OFF: {
      const enteredPw = message.password;
      if (enteredPw && enteredPw !== parentalPassword) {
        sendResponse({ ok: false, error: "Incorrect Parental PIN / Password" });
        break;
      }
      parentalModeActive = false;
      parentalWhitelist = [];
      parentalTempUnlockUntil = 0;
      chrome.storage.local.set({ parentalMode: false, parentalWhitelist: [] }, () => {
        sendResponse({ ok: true });
      });
      break;
    }

    case MESSAGE_ACTIONS.UNLOCK_PARENTAL_TEMPORARY: {
      const enteredPw = message.password || "";
      if (enteredPw === parentalPassword) {
        const durationSec = Number(message.durationSeconds) || 120;
        parentalTempUnlockUntil = Date.now() + (durationSec * 1000);
        sendResponse({ ok: true, expiresAt: parentalTempUnlockUntil, durationSeconds: durationSec });
      } else {
        sendResponse({ ok: false, error: "Incorrect Parental PIN / Password" });
      }
      break;
    }

    case MESSAGE_ACTIONS.VERIFY_PARENTAL_PIN: {
      const enteredPw = message.password || "";
      if (enteredPw === parentalPassword) {
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "Incorrect Parental PIN / Password" });
      }
      break;
    }

    case MESSAGE_ACTIONS.SET_PARENTAL_PIN: {
      const currentPw = message.currentPassword || "";
      const newPw = (message.newPassword || "").trim();
      if (currentPw !== parentalPassword) {
        sendResponse({ ok: false, error: "Current PIN / Password is incorrect" });
        break;
      }
      if (!newPw || newPw.length < 4) {
        sendResponse({ ok: false, error: "New PIN must be at least 4 characters" });
        break;
      }
      parentalPassword = newPw;
      chrome.storage.local.set({ parentalPassword: newPw }, () => {
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

// webNavigation fires BEFORE the page loads — fastest interception point
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (!parentalModeActive) return;
  if (details.frameId !== 0) return; // only main frame
  if (isAllowedUrl(details.url)) return;
  await blockTab(details.tabId, details.url);
});

// tabs.onUpdated is a safety net — only act when a URL change is actually happening
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only intercept actual URL navigations, not status/favicon/title updates
  const url = changeInfo.url;   // only set when URL actually changes
  const status = changeInfo.status; // "loading" / "complete"

  // Adult content firewall — runs regardless of parental mode
  const checkUrl = url || (status === "loading" ? tab.url : null);
  if (checkUrl && isAdultUrl(checkUrl)) {
    injectBlock(tabId, checkUrl);
    return;
  }

  if (!parentalModeActive) return;

  // Only block when we have a concrete URL change or the tab just started loading
  if (url && !isAllowedUrl(url)) {
    await blockTab(tabId, url);
  } else if (status === "loading" && tab.url && !isAllowedUrl(tab.url)) {
    await blockTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!parentalModeActive) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const url = tab.url || tab.pendingUrl || "";
    if (url && !isAllowedUrl(url)) {
      await blockTab(activeInfo.tabId, url);
    }
  } catch (_) {}
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!parentalModeActive) return;
  const url = tab.pendingUrl || tab.url || "";
  if (url && !isAllowedUrl(url)) {
    await blockTab(tab.id, url);
  }
});

// Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "ambient-policy",    title: "🛡️ Analyze Privacy Policy", contexts: ["page"] });
    chrome.contextMenus.create({ id: "ambient-factcheck", title: "🛡️ Ambient Shield: Check this text", contexts: ["selection"] });
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

  if (info.menuItemId === "ambient-factcheck" || info.menuItemId === "ambient-check") {
    const selected = (info.selectionText || "").slice(0, 5000);
    const pendingData = {
      text: selected,
      sourceUrl: tab?.url || "",
      ts: Date.now(),
      autorun: true,
    };
    if (chrome.storage?.session) {
      await chrome.storage.session.set({ pendingFactCheck: pendingData }).catch(() => {});
    }
    await chrome.storage.local.set({ pendingFactCheck: pendingData });
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=factcheck&autorun=1" });
    return;
  }

  if (info.menuItemId === "ambient-image") {
    await chrome.storage.local.set({ pendingImageScan: { url: info.srcUrl || "", ts: Date.now() } });
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=deepfake" });
    return;
  }

  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// Keyboard Shortcut: Alt+Shift+C (or Cmd+Shift+C)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "ambient-check") {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        const [{ result: selected }] = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.getSelection().toString().trim(),
        });
        const text = (selected || "").slice(0, 5000);
        if (text) {
          const pendingData = {
            text,
            sourceUrl: activeTab.url || "",
            ts: Date.now(),
            autorun: true,
          };
          if (chrome.storage?.session) {
            await chrome.storage.session.set({ pendingFactCheck: pendingData }).catch(() => {});
          }
          await chrome.storage.local.set({ pendingFactCheck: pendingData });
          chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=factcheck&autorun=1" });
        }
      }
    } catch (_) {}
  }
});
