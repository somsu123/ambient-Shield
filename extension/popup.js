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
        const activeModel = resp.activeProvider === "groq"
          ? (resp.config?.groqModel || "qwen/qwen3.8-27b")
          : (modelName || "gemma3:4b");
        const providerLabel = resp.activeProvider === "groq" ? "Groq" : "Ollama";
        updateKeyStatus(true, `✓ ${providerLabel} (${activeModel})`);
      } else if (resp && resp.providers?.ollama?.status === "model_missing") {
        updateKeyStatus(false, `⚠ Model missing (pull ${modelName})`);
      } else {
        updateKeyStatus(false, `⚠ ${resp?.guidance || "Engine Offline"}`);
      }
    });
  } catch (_) {
    updateKeyStatus(false, "⚠ AI Engine Offline");
  }
}

// ── Init ──
chrome.storage.sync.get({ feedScanner: true, blurAdult: true }, (result) => {
  toggleFeed.checked = result.feedScanner !== false;
  toggleBlur.checked = result.blurAdult   !== false;
});

chrome.storage.local.get(["ollamaModel", "groqModel", "llmProvider"], (result) => {
  const isGroq = (result.llmProvider || "groq") === "groq";
  const model = isGroq ? (result.groqModel || "qwen/qwen3.8-27b") : (result.ollamaModel || "gemma3:4b");
  apiKeyInput.value = model;
  checkEngineStatus(model);
});

loadCurrentTab();

// ─────────────────────────────────────────────────────────────────────────────
// PARENTAL MODE (Anti-Tamper & Extension Removal Protection)
// ─────────────────────────────────────────────────────────────────────────────
let PARENTAL_MODE_PASSWORD = "123456";

chrome.storage.local.get(["parentalPassword"], res => {
  if (res?.parentalPassword) {
    PARENTAL_MODE_PASSWORD = res.parentalPassword;
  }
});

const toggleParental       = document.getElementById("toggle-parental");
const parentalLabel        = document.getElementById("parental-label");
const parentalBadge        = document.getElementById("parental-badge");
const parentalTamperBadge  = document.getElementById("parental-tamper-badge");
const btnChangePin         = document.getElementById("btn-change-pin");
const btnEditWhitelist     = document.getElementById("btn-edit-whitelist");

const modalPassword        = document.getElementById("modal-password");
const modalPwTitle         = document.getElementById("modal-pw-title");
const modalPwSubtitle      = document.getElementById("modal-pw-subtitle");
const modalPwInput         = document.getElementById("modal-pw-input");
const modalPwError         = document.getElementById("modal-pw-error");
const modalPwCancel        = document.getElementById("modal-pw-cancel");
const modalPwConfirm       = document.getElementById("modal-pw-confirm");

const modalWhitelist       = document.getElementById("modal-whitelist");
const urlChipsContainer    = document.getElementById("url-chips-container");
const urlInput             = document.getElementById("url-input");
const btnAddUrl            = document.getElementById("btn-add-url");
const urlError             = document.getElementById("url-error");
const modalWlCancel        = document.getElementById("modal-wl-cancel");
const modalWlDone          = document.getElementById("modal-wl-done");

const modalChangePin       = document.getElementById("modal-change-pin");
const modalOldPin          = document.getElementById("modal-old-pin");
const modalNewPin          = document.getElementById("modal-new-pin");
const modalPinError        = document.getElementById("modal-pin-error");
const modalPinCancel       = document.getElementById("modal-pin-cancel");
const modalPinSave         = document.getElementById("modal-pin-save");

let pendingWhitelist = [];
let pwResolve        = null;

// ── Render URL chip list ──────────────────────────────────────────────────────
function renderChips(urls) {
  urlChipsContainer.innerHTML = "";
  if (urls.length === 0) {
    urlChipsContainer.innerHTML = '<span style="color:var(--text3);font-size:11px;padding:4px 2px">No sites added yet — add at least one below</span>';
    // Disable Activate button and grey it out
    modalWlDone.disabled = true;
    modalWlDone.textContent = "✓ Activate Mode";
    modalWlDone.style.opacity = "0.45";
    return;
  }
  // Re-enable Activate button and show count
  modalWlDone.disabled = false;
  modalWlDone.style.opacity = "1";
  modalWlDone.textContent = `✓ Activate Mode (${urls.length} site${urls.length === 1 ? "" : "s"})`;

  urls.forEach((url, i) => {
    const chip = document.createElement("div");
    chip.className = "url-chip";
    const label = document.createElement("span");
    try { label.textContent = new URL(url).hostname; } catch { label.textContent = url.slice(0, 35); }
    label.title = url;
    const rm = document.createElement("button");
    rm.textContent = "×"; rm.title = "Remove " + url;
    rm.setAttribute("aria-label", `Remove ${url}`);
    rm.onclick = () => {
      pendingWhitelist.splice(i, 1);
      renderChips(pendingWhitelist);
    };
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
    modalPwError.textContent = "Incorrect PIN/password. Try again.";
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
let _wlResolve = null;

function openUrlModal(existing = []) {
  return new Promise(resolve => {
    _wlResolve = resolve;
    pendingWhitelist = [...existing];
    renderChips(pendingWhitelist);
    urlInput.value = ""; urlError.textContent = "";
    modalWhitelist.classList.remove("hidden");
    setTimeout(() => urlInput.focus(), 80);
    modalWlDone.onclick   = () => {
      modalWhitelist.classList.add("hidden");
      if (_wlResolve) { _wlResolve([...pendingWhitelist]); _wlResolve = null; }
    };
    modalWlCancel.onclick = () => {
      modalWhitelist.classList.add("hidden");
      if (_wlResolve) { _wlResolve(null); _wlResolve = null; }
    };
  });
}

function addUrl() {
  let val = urlInput.value.trim();
  if (!val) return;
  // Auto-prepend https:// so users can type "google.com" without protocol
  if (!/^https?:\/\//i.test(val)) {
    val = "https://" + val;
  }
  try { new URL(val); } catch {
    urlError.textContent = "Invalid URL — try: google.com or https://example.com";
    urlInput.focus(); return;
  }
  if (pendingWhitelist.includes(val)) {
    urlError.textContent = "Already in list."; return;
  }
  pendingWhitelist.push(val);
  renderChips(pendingWhitelist);
  urlInput.value = "";
  // Show a hint so user knows they can keep adding more
  urlError.style.color = "var(--accent, #4ade80)";
  urlError.textContent = `✓ Added! Type another site or click "Activate Mode".`;
  setTimeout(() => { urlError.textContent = ""; urlError.style.color = ""; }, 2500);
  urlInput.focus();
}

btnAddUrl.addEventListener("click", addUrl);
urlInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();    // prevent Enter from bubbling to buttons
    e.stopPropagation();
    addUrl();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    modalWhitelist.classList.add("hidden");
    if (_wlResolve) { _wlResolve(null); _wlResolve = null; }
  }
});

// ── Update all UI to reflect current parental state ──────────────────────────
function setParentalUI(isActive) {
  toggleParental.checked = isActive;
  parentalBadge.classList.toggle("show", isActive);
  if (parentalTamperBadge) {
    parentalTamperBadge.style.display = isActive ? "inline-flex" : "none";
  }
  if (btnEditWhitelist) {
    btnEditWhitelist.style.display = isActive ? "inline" : "none";
  }
  if (parentalLabel) {
    parentalLabel.textContent = isActive ? "Parental Mode: ON 🔒" : "Parental Mode";
  }
}

// ── Toggle handler ────────────────────────────────────────────────────────────
toggleParental.addEventListener("change", async () => {
  const wantsOn = toggleParental.checked;

  if (wantsOn) {
    // ── TURN ON FLOW ──────────────────────────────────────────────────────────
    // Step 1: Password
    const pwOk = await askPassword(
      "Enable Parental Mode",
      "Enter Parental PIN / Password to activate this mode",
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

    // Step 3: Activate — write storage FIRST (storage.onChanged in background does the
    // enforcement reliably, even if the service worker was just woken up).
    // Then also send a message as a secondary path to ensure enforceOnAllTabs() runs.
    chrome.storage.local.set(
      { parentalMode: true, parentalWhitelist: whitelist },
      () => {
        if (chrome.runtime.lastError) {
          showToast("⚠ Could not save Parental Mode: " + chrome.runtime.lastError.message);
          setParentalUI(false);
          return;
        }
        // Secondary message path — sends PARENTAL_MODE_ON with callback so we know it arrived
        chrome.runtime.sendMessage(
          { action: "PARENTAL_MODE_ON", whitelist },
          (resp) => {
            if (chrome.runtime.lastError) {
              // Service worker rejected message — but storage.onChanged already activated it
              // so this is non-fatal
              console.warn("[Parental] sendMessage failed (non-fatal):", chrome.runtime.lastError.message);
            }
          }
        );
        setParentalUI(true);
        showToast("🔒 Parental Mode Activated! Extension removal locked.");
      }
    );

  } else {
    // ── TURN OFF FLOW ─────────────────────────────────────────────────────────
    toggleParental.checked = true; // visually keep ON until password confirmed

    const pwOk = await askPassword(
      "Disable Parental Mode",
      "Enter Parental PIN / Password to disable this mode and unlock removal",
      "Confirm Disable"
    );
    if (!pwOk) return; // stay on

    // Write storage first — background picks it up via onChanged
    chrome.storage.local.set(
      { parentalMode: false, parentalWhitelist: [] },
      () => {
        if (chrome.runtime.lastError) {
          showToast("⚠ Could not disable Parental Mode: " + chrome.runtime.lastError.message);
          return;
        }
        // Also send message so background can verify password and clean up temp unlock
        chrome.runtime.sendMessage(
          { action: "PARENTAL_MODE_OFF", password: PARENTAL_MODE_PASSWORD },
          (resp) => {
            if (chrome.runtime.lastError) {
              console.warn("[Parental] PARENTAL_MODE_OFF message (non-fatal):", chrome.runtime.lastError.message);
            }
          }
        );
        setParentalUI(false);
        showToast("✓ Parental Mode disabled.");
      }
    );
  }
});

// ── Edit Whitelist when Active ────────────────────────────────────────────────
if (btnEditWhitelist) {
  btnEditWhitelist.addEventListener("click", async () => {
    const pwOk = await askPassword(
      "Manage Whitelist",
      "Enter Parental PIN to edit allowed websites",
      "Unlock List"
    );
    if (!pwOk) return;

    chrome.storage.local.get(["parentalWhitelist"], async (res) => {
      const currentList = res.parentalWhitelist || [];
      const updated = await openUrlModal(currentList);
      if (updated && updated.length > 0) {
        chrome.storage.local.set({ parentalWhitelist: updated }, () => {
          chrome.runtime.sendMessage(
            { action: "PARENTAL_MODE_ON", whitelist: updated },
            (resp) => { if (chrome.runtime.lastError) console.warn("[Parental] whitelist update msg:", chrome.runtime.lastError.message); }
          );
          showToast("✓ Allowed websites updated.");
        });
      }
    });
  });
}

// ── Change PIN Modal ──────────────────────────────────────────────────────────
if (btnChangePin) {
  btnChangePin.addEventListener("click", () => {
    modalOldPin.value = "";
    modalNewPin.value = "";
    modalPinError.textContent = "";
    modalChangePin.classList.remove("hidden");
    setTimeout(() => modalOldPin.focus(), 80);
  });
}

if (modalPinCancel) {
  modalPinCancel.addEventListener("click", () => {
    modalChangePin.classList.add("hidden");
  });
}

if (modalPinSave) {
  modalPinSave.addEventListener("click", () => {
    const oldVal = modalOldPin.value;
    const newVal = modalNewPin.value.trim();

    if (oldVal !== PARENTAL_MODE_PASSWORD) {
      modalPinError.textContent = "Current PIN is incorrect.";
      modalOldPin.classList.add("error");
      setTimeout(() => modalOldPin.classList.remove("error"), 500);
      return;
    }
    if (!newVal || newVal.length < 4) {
      modalPinError.textContent = "New PIN must be at least 4 characters.";
      modalNewPin.classList.add("error");
      setTimeout(() => modalNewPin.classList.remove("error"), 500);
      return;
    }

    chrome.runtime.sendMessage(
      { action: "SET_PARENTAL_PIN", currentPassword: oldVal, newPassword: newVal },
      (res) => {
        if (res?.ok) {
          PARENTAL_MODE_PASSWORD = newVal;
          modalChangePin.classList.add("hidden");
          showToast("✓ Parental PIN updated!");
        } else {
          modalPinError.textContent = res?.error || "Failed to update PIN.";
        }
      }
    );
  });
}

// ── Restore persisted state on popup open ─────────────────────────────────────
chrome.storage.local.get(["parentalMode", "parentalWhitelist", "parentalPassword"], result => {
  if (result.parentalPassword) {
    PARENTAL_MODE_PASSWORD = result.parentalPassword;
  }
  if (result.parentalMode) {
    setParentalUI(true);
  }
});
