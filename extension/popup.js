"use strict";

const dot            = document.getElementById("status-dot");
const statusLabel    = document.getElementById("status-label");
const pageUrlEl      = document.getElementById("page-url");
const faviconEl      = document.getElementById("page-favicon");
const btnDashboard   = document.getElementById("btn-dashboard");
const btnScanPage    = document.getElementById("btn-scan-page");
const toggleFeed     = document.getElementById("toggle-feed");
const toggleBlur     = document.getElementById("toggle-blur");
const toastEl        = document.getElementById("toast");
const apiRowToggle   = document.getElementById("api-row-toggle");
const apiBody        = document.getElementById("api-body");
const apiExpandIcon  = document.getElementById("api-expand-icon");
const apiKeyInput    = document.getElementById("api-key-input");
const btnSaveKey     = document.getElementById("btn-save-key");
const apiKeyStatus   = document.getElementById("api-key-status");

let tabUrl   = "";
let toastTid = null;

// Handle missing favicon
if (faviconEl) {
  faviconEl.addEventListener("error", function() {
    this.style.display = 'none';
  });
}

// ── Toast ──
function showToast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (toastTid) clearTimeout(toastTid);
  toastTid = setTimeout(() => toastEl.classList.remove("show"), ms);
}

// ── Extension URL helper ──
function extPage(path, params) {
  const base = chrome.runtime.getURL(path);
  if (!params || !Object.keys(params).length) return base;
  return base + "?" + new URLSearchParams(params).toString();
}

// ── Current tab ──
function loadCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) return;
    tabUrl = tab.url || "";

    try {
      const parsed = new URL(tabUrl);
      pageUrlEl.textContent = parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname.slice(0, 28) : "");
      faviconEl.src = "https://www.google.com/s2/favicons?domain=" + parsed.hostname + "&sz=16";
      faviconEl.style.display = 'block';
    } catch {
      pageUrlEl.textContent = tabUrl.slice(0, 50) || "Unknown page";
      faviconEl.style.display = "none";
    }

    const isInternal =
      tabUrl.startsWith("chrome://") ||
      tabUrl.startsWith("chrome-extension://") ||
      tabUrl.startsWith("about:") ||
      tabUrl.startsWith("edge://");

    if (isInternal) {
      btnScanPage.disabled    = true;
      btnScanPage.textContent = "🔒 Cannot scan browser pages";
    }
  });
}

// ── Dashboard button ──
btnDashboard.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  window.close();
});

// ── Privacy Policy URL map (known policy pages per domain) ──────────────────
const PRIVACY_POLICY_MAP = {
  "linkedin.com":    { name: "LinkedIn",    urls: ["https://www.linkedin.com/legal/privacy-policy"] },
  "twitter.com":     { name: "Twitter/X",   urls: ["https://twitter.com/en/privacy"] },
  "x.com":           { name: "Twitter/X",   urls: ["https://twitter.com/en/privacy"] },
  "facebook.com":    { name: "Facebook",    urls: ["https://www.facebook.com/privacy/policy/"] },
  "instagram.com":   { name: "Instagram",   urls: ["https://privacycenter.instagram.com/policy/"] },
  "tiktok.com":      { name: "TikTok",      urls: ["https://www.tiktok.com/legal/page/us/privacy-policy/en"] },
  "youtube.com":     { name: "YouTube",     urls: ["https://policies.google.com/privacy"] },
  "google.com":      { name: "Google",      urls: ["https://policies.google.com/privacy"] },
  "reddit.com":      { name: "Reddit",      urls: ["https://www.reddit.com/policies/privacy-policy"] },
  "snapchat.com":    { name: "Snapchat",    urls: ["https://snap.com/en-US/privacy/privacy-policy"] },
  "pinterest.com":   { name: "Pinterest",   urls: ["https://policy.pinterest.com/en/privacy-policy"] },
  "whatsapp.com":    { name: "WhatsApp",    urls: ["https://www.whatsapp.com/legal/privacy-policy/"] },
  "amazon.com":      { name: "Amazon",      urls: ["https://www.amazon.com/gp/help/customer/display.html?nodeId=GX7NJQ4ZB8MHFRNJ"] },
  "netflix.com":     { name: "Netflix",     urls: ["https://help.netflix.com/legal/privacy"] },
  "spotify.com":     { name: "Spotify",     urls: ["https://www.spotify.com/legal/privacy-policy/"] },
  "apple.com":       { name: "Apple",       urls: ["https://www.apple.com/legal/privacy/"] },
  "microsoft.com":   { name: "Microsoft",   urls: ["https://privacy.microsoft.com/en-us/privacystatement"] },
  "github.com":      { name: "GitHub",      urls: ["https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"] },
  "discord.com":     { name: "Discord",     urls: ["https://discord.com/privacy"] },
  "twitch.tv":       { name: "Twitch",      urls: ["https://www.twitch.tv/p/en/legal/privacy-notice/"] },
  "zoom.us":         { name: "Zoom",        urls: ["https://explore.zoom.us/en/privacy/"] },
  "uber.com":        { name: "Uber",        urls: ["https://www.uber.com/global/en/privacy/overview/"] },
  "paypal.com":      { name: "PayPal",      urls: ["https://www.paypal.com/myaccount/privacy/privacyhub"] },
  "airbnb.com":      { name: "Airbnb",      urls: ["https://www.airbnb.com/help/article/2855"] },
  "shopify.com":     { name: "Shopify",     urls: ["https://www.shopify.com/legal/privacy"] },
};

// ── Scan page button ──────────────────────────────────────────────────────────
btnScanPage.addEventListener("click", () => {
  if (!tabUrl) { showToast("⚠ No active tab found"); return; }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) { showToast("⚠ No active tab found"); return; }

    // ── Detect if we know this site's privacy policy URL ──────────────────
    let matchedEntry = null;
    try {
      const hostname = new URL(tab.url || "").hostname.replace(/^www\./, "");
      // Check exact match and subdomain match
      for (const [domain, entry] of Object.entries(PRIVACY_POLICY_MAP)) {
        if (hostname === domain || hostname.endsWith("." + domain)) {
          matchedEntry = entry;
          break;
        }
      }
    } catch { /* ignore URL parse errors */ }

    if (matchedEntry) {
      // ── Known site: use the pre-mapped privacy policy URL(s) ─────────────
      showToast(`🛡️ Fetching ${matchedEntry.name} Privacy Policy…`);
      chrome.storage.local.set({
        pendingPolicyScan: {
          policyUrls: matchedEntry.urls,
          siteName:   matchedEntry.name,
          url:        tab.url || "",
          title:      `${matchedEntry.name} Privacy Policy`,
          ts:         Date.now(),
        }
      }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=policy" });
        window.close();
      });
    } else {
      // ── Unknown site: extract text from the current page ──────────────────
      showToast("🛡️ Extracting policy from page…");
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const main = document.querySelector('main, article, [role="main"], .privacy-policy, .policy-content, #privacy, #policy');
          const src  = main || document.body;
          return (src.innerText || src.textContent || "").replace(/\s{2,}/g, " ").trim().slice(0, 12000);
        },
      }, (results) => {
        const pageText = results && results[0] && results[0].result || "";
        chrome.storage.local.set({
          pendingPolicyScan: {
            text:  pageText,
            url:   tab.url   || "",
            title: tab.title || "Privacy Policy",
            ts:    Date.now(),
          }
        }, () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") + "?tab=policy" });
          window.close();
        });
      });
    }
  });
});

// ── Toggle handlers ──
function saveToggles() {
  chrome.storage.sync.set(
    { feedScanner: toggleFeed.checked, blurAdult: toggleBlur.checked },
    () => showToast(toggleFeed.checked || toggleBlur.checked ? "✓ Settings saved" : "⚠ All shields off")
  );
}

function notifyContentScript(action, enabled) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { action, enabled }, () => {
      if (chrome.runtime.lastError) { /* ignore — tab may not have content script */ }
    });
  });
}

toggleFeed.addEventListener("change", () => {
  saveToggles();
  notifyContentScript("SET_FEED_SCANNER", toggleFeed.checked);
});

toggleBlur.addEventListener("change", () => {
  saveToggles();
  notifyContentScript("SET_BLUR_ADULT", toggleBlur.checked);
});

// ── Local AI Engine panel ──
apiRowToggle.addEventListener("click", () => {
  const isOpen = apiBody.classList.toggle("open");
  apiExpandIcon.classList.toggle("open", isOpen);
});

btnSaveKey.addEventListener("click", () => {
  const model = apiKeyInput.value.trim() || "gemma3:4b";
  chrome.storage.local.set({ ollamaModel: model }, () => {
    checkEngineStatus(model);
    showToast("✓ Model configuration saved!");
    apiBody.classList.remove("open");
    apiExpandIcon.classList.remove("open");
  });
});

function updateKeyStatus(isOk, label) {
  apiKeyStatus.textContent = label;
  if (isOk) {
    apiKeyStatus.classList.remove("missing");
  } else {
    apiKeyStatus.classList.add("missing");
  }
}

function checkEngineStatus(modelName) {
  try {
    chrome.runtime.sendMessage({ action: "CHECK_LLM_HEALTH" }, (resp) => {
      if (resp && resp.ready) {
        updateKeyStatus(true, `✓ Ready (${modelName || "gemma3:4b"})`);
      } else if (resp && resp.providers?.ollama?.status === "model_missing") {
        updateKeyStatus(false, `⚠ Model missing (pull ${modelName})`);
      } else {
        updateKeyStatus(false, "⚠ Ollama Offline");
      }
    });
  } catch (_) {
    updateKeyStatus(false, "⚠ Local Engine Offline");
  }
}

// ── Init ──
chrome.storage.sync.get({ feedScanner: true, blurAdult: true }, (result) => {
  toggleFeed.checked = result.feedScanner !== false;
  toggleBlur.checked = result.blurAdult   !== false;
});

chrome.storage.local.get(["ollamaModel"], (result) => {
  const model = result.ollamaModel || "gemma3:4b";
  apiKeyInput.value = model;
  checkEngineStatus(model);
});

loadCurrentTab();

// ─────────────────────────────────────────────────────────────────────────────
// PARENTAL / WORK MODE
// password is intentionally simple for hackathon — change PARENTAL_MODE_PASSWORD to update it
// ─────────────────────────────────────────────────────────────────────────────
const PARENTAL_MODE_PASSWORD = "123456";

const toggleParental    = document.getElementById("toggle-parental");
const parentalLabel     = document.getElementById("parental-label");
const parentalBadge     = document.getElementById("parental-badge");
const modalPassword     = document.getElementById("modal-password");
const modalPwTitle      = document.getElementById("modal-pw-title");
const modalPwSubtitle   = document.getElementById("modal-pw-subtitle");
const modalPwInput      = document.getElementById("modal-pw-input");
const modalPwError      = document.getElementById("modal-pw-error");
const modalPwCancel     = document.getElementById("modal-pw-cancel");
const modalPwConfirm    = document.getElementById("modal-pw-confirm");
const modalWhitelist    = document.getElementById("modal-whitelist");
const urlChipsContainer = document.getElementById("url-chips-container");
const urlInput          = document.getElementById("url-input");
const btnAddUrl         = document.getElementById("btn-add-url");
const urlError          = document.getElementById("url-error");
const modalWlCancel     = document.getElementById("modal-wl-cancel");
const modalWlDone       = document.getElementById("modal-wl-done");

let pendingWhitelist = [];
let pwResolve        = null;

// ── Render URL chip list ──────────────────────────────────────────────────────
function renderChips(urls) {
  urlChipsContainer.innerHTML = "";
  if (urls.length === 0) {
    urlChipsContainer.innerHTML = '<span style="color:var(--text3);font-size:11px;padding:4px 2px">No URLs added yet</span>';
    return;
  }
  urls.forEach((url, i) => {
    const chip = document.createElement("div");
    chip.className = "url-chip";
    const label = document.createElement("span");
    try { label.textContent = new URL(url).hostname; } catch { label.textContent = url.slice(0, 35); }
    label.title = url;
    const rm = document.createElement("button");
    rm.textContent = "×"; rm.title = "Remove";
    rm.setAttribute("aria-label", `Remove ${url}`);
    rm.onclick = () => { pendingWhitelist.splice(i, 1); renderChips(pendingWhitelist); };
    chip.appendChild(label); chip.appendChild(rm);
    urlChipsContainer.appendChild(chip);
  });
}

// ── Password modal ── (Promise-based)
function askPassword(title, subtitle, confirmLabel) {
  return new Promise(resolve => {
    pwResolve = resolve;
    modalPwTitle.textContent    = title;
    modalPwSubtitle.textContent = subtitle;
    modalPwConfirm.textContent  = confirmLabel;
    modalPwInput.value          = "";
    modalPwError.textContent    = "";
    modalPwInput.classList.remove("error");
    modalPassword.classList.remove("hidden");
    setTimeout(() => modalPwInput.focus(), 80);
  });
}

function closePwModal(result) {
  modalPassword.classList.add("hidden");
  if (pwResolve) { pwResolve(result); pwResolve = null; }
}

modalPwCancel.addEventListener("click",  () => closePwModal(false));
modalPwConfirm.addEventListener("click", () => {
  if (modalPwInput.value === PARENTAL_MODE_PASSWORD) {
    closePwModal(true);
  } else {
    modalPwError.textContent = "Incorrect password. Try again.";
    modalPwInput.classList.add("error");
    modalPwInput.value = "";
    setTimeout(() => modalPwInput.classList.remove("error"), 500);
    setTimeout(() => modalPwInput.focus(), 50);
  }
});
modalPwInput.addEventListener("keydown", e => {
  if (e.key === "Enter")  modalPwConfirm.click();
  if (e.key === "Escape") closePwModal(false);
});

// ── URL Whitelist modal ── (Promise-based)
function openUrlModal(existing = []) {
  return new Promise(resolve => {
    pendingWhitelist = [...existing];
    renderChips(pendingWhitelist);
    urlInput.value = ""; urlError.textContent = "";
    modalWhitelist.classList.remove("hidden");
    setTimeout(() => urlInput.focus(), 80);
    modalWlDone.onclick   = () => { modalWhitelist.classList.add("hidden"); resolve(pendingWhitelist); };
    modalWlCancel.onclick = () => { modalWhitelist.classList.add("hidden"); resolve(null); };
  });
}

function addUrl() {
  let val = urlInput.value.trim();
  if (!val) return;
  if (!/^https?:\/\//i.test(val)) {
    urlError.textContent = "URL must start with http:// or https://";
    urlInput.focus(); return;
  }
  try { new URL(val); } catch {
    urlError.textContent = "Invalid URL. Example: https://example.com";
    urlInput.focus(); return;
  }
  if (pendingWhitelist.includes(val)) {
    urlError.textContent = "This URL is already in the list."; return;
  }
  pendingWhitelist.push(val);
  renderChips(pendingWhitelist);
  urlInput.value = ""; urlError.textContent = "";
  urlInput.focus();
}

btnAddUrl.addEventListener("click", addUrl);
urlInput.addEventListener("keydown", e => {
  if (e.key === "Enter")  addUrl();
  if (e.key === "Escape") { modalWhitelist.classList.add("hidden"); }
});

// ── Update all UI to reflect current parental state ──────────────────────────
function setParentalUI(isActive) {
  toggleParental.checked = isActive;
  parentalBadge.classList.toggle("show", isActive);
  if (parentalLabel) {
    parentalLabel.textContent = isActive ? "Parental / Work Mode: ON 🔒" : "Parental / Work Mode";
  }
}

// ── Toggle handler ────────────────────────────────────────────────────────────
toggleParental.addEventListener("change", async () => {
  const wantsOn = toggleParental.checked;

  if (wantsOn) {
    // ── TURN ON FLOW ──────────────────────────────────────────────────────────
    // Step 1: Password
    const pwOk = await askPassword(
      "Enable Parental / Work Mode",
      "Enter password to activate this mode",
      "Continue"
    );
    if (!pwOk) { setParentalUI(false); return; }

    // Step 2: URL whitelist
    const whitelist = await openUrlModal([]);
    if (!whitelist || whitelist.length === 0) {
      setParentalUI(false);
      showToast("⚠ Add at least one URL to activate Parental Mode.");
      return;
    }

    // Step 3: Activate
    chrome.storage.local.set({ parentalMode: true, parentalWhitelist: whitelist }, () => {
      chrome.runtime.sendMessage({ action: "PARENTAL_MODE_ON", whitelist });
      setParentalUI(true);
      showToast("🔒 Parental Mode Activated!");
    });

  } else {
    // ── TURN OFF FLOW ─────────────────────────────────────────────────────────
    toggleParental.checked = true; // visually keep ON until password confirmed

    const pwOk = await askPassword(
      "Disable Parental / Work Mode",
      "Enter password to disable this mode",
      "Confirm Disable"
    );
    if (!pwOk) return; // stay on

    chrome.storage.local.set({ parentalMode: false, parentalWhitelist: [] }, () => {
      chrome.runtime.sendMessage({ action: "PARENTAL_MODE_OFF" });
      setParentalUI(false);
      showToast("✓ Parental Mode disabled.");
    });
  }
});

// ── Restore persisted state on popup open ─────────────────────────────────────
chrome.storage.local.get(["parentalMode", "parentalWhitelist"], result => {
  if (result.parentalMode) setParentalUI(true);
});
