"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
let currentImageBase64 = null;
let currentImageMime   = 'image/jpeg';
let currentImageUrl    = null;

// ── Init all event listeners after DOM is ready ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Tab pre-selection from URL param (?tab=policy etc)
  const urlParams = new URLSearchParams(location.search);
  const preTab = urlParams.get('tab');
  if (preTab) {
    const targetBtn = document.querySelector('.tab-btn[data-tab="' + preTab + '"]');
    if (targetBtn) targetBtn.click();
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById('panel-' + tab).classList.add('active');
    });
  });

  // Action buttons
  document.getElementById('btn-policy').addEventListener('click', runPolicyAnalysis);
  document.getElementById('btn-factcheck').addEventListener('click', runFactCheck);
  document.getElementById('btn-deepfake').addEventListener('click', runDeepfakeAnalysis);
  document.getElementById('btn-load-url').addEventListener('click', loadImageUrl);

  // Clear button for policy
  document.getElementById('btn-policy-clear').addEventListener('click', () => {
    document.getElementById('policy-input').value = '';
    document.getElementById('policy-source-banner').style.display = 'none';
    const res = document.getElementById('policy-result');
    res.innerHTML = '';
    res.classList.remove('show');
    if (typeof chrome !== 'undefined' && chrome.storage)
      chrome.storage.local.remove('pendingPolicyScan');
  });

  // Settings
  const DEFAULT_GROQ_KEY = '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';
  const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';

  const settingsProviderSelect = document.getElementById('settings-provider-select');
  const fcProviderSelect = document.getElementById('fc-setting-provider');
  const settingsGroqBlock = document.getElementById('settings-groq-block');
  const settingsOllamaBlock = document.getElementById('settings-ollama-block');
  const fcGroqBlock = document.getElementById('fc-groq-settings');
  const fcOllamaBlock = document.getElementById('fc-ollama-settings');

  function updateProviderVisibility(prov) {
    if (settingsProviderSelect) settingsProviderSelect.value = prov;
    if (fcProviderSelect) fcProviderSelect.value = prov;
    if (settingsGroqBlock) settingsGroqBlock.style.display = prov === 'groq' ? 'flex' : 'none';
    if (settingsOllamaBlock) settingsOllamaBlock.style.display = prov === 'ollama' ? 'flex' : 'none';
    if (fcGroqBlock) fcGroqBlock.style.display = prov === 'groq' ? 'grid' : 'none';
    if (fcOllamaBlock) fcOllamaBlock.style.display = prov === 'ollama' ? 'grid' : 'none';
  }

  if (settingsProviderSelect) {
    settingsProviderSelect.addEventListener('change', (e) => {
      const p = e.target.value;
      updateProviderVisibility(p);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ llmProvider: p });
      }
    });
  }
  if (fcProviderSelect) {
    fcProviderSelect.addEventListener('change', (e) => {
      const p = e.target.value;
      updateProviderVisibility(p);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ llmProvider: p });
      }
    });
  }

  const btnSaveKey = document.getElementById('btn-save-key');
  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', () => {
      const prov = settingsProviderSelect ? settingsProviderSelect.value : 'groq';
      const groqKey = (document.getElementById('settings-groq-key')?.value || DEFAULT_GROQ_KEY).trim();
      const groqModel = (document.getElementById('settings-groq-model')?.value || DEFAULT_GROQ_MODEL).trim();
      const ollamaModel = (document.getElementById('api-key-input')?.value || 'gemma3:4b').trim();
      const ollamaHost = (document.getElementById('settings-ollama-host')?.value || 'http://localhost:11434').trim();

      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({
          llmProvider: prov,
          groqApiKey: groqKey,
          groqModel: groqModel,
          ollamaModel: ollamaModel,
          ollamaHost: ollamaHost,
        }, () => {
          const res = document.getElementById('settings-result');
          if (res) {
            res.style.display = 'block';
            setTimeout(() => res.style.display = 'none', 3000);
          }
        });
      }
    });
  }

  // Load existing model & provider settings
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['llmProvider', 'groqApiKey', 'groqModel', 'ollamaModel', 'ollamaHost'], (res) => {
      const prov = res.llmProvider || 'groq';
      updateProviderVisibility(prov);

      const groqKey = res.groqApiKey || DEFAULT_GROQ_KEY;
      const groqModel = res.groqModel || DEFAULT_GROQ_MODEL;

      const sGKey = document.getElementById('settings-groq-key');
      if (sGKey) sGKey.value = groqKey;
      const fcGKey = document.getElementById('fc-setting-groq-key');
      if (fcGKey) fcGKey.value = groqKey;

      const sGModel = document.getElementById('settings-groq-model');
      if (sGModel) sGModel.value = groqModel;
      const fcGModel = document.getElementById('fc-setting-groq-model');
      if (fcGModel) fcGModel.value = groqModel;

      if (res.ollamaModel) {
        const apiKeyEl = document.getElementById('api-key-input');
        if (apiKeyEl) apiKeyEl.value = res.ollamaModel;
        const fcModelEl = document.getElementById('fc-setting-model');
        if (fcModelEl) fcModelEl.value = res.ollamaModel;
      }
      if (res.ollamaHost) {
        const sOHost = document.getElementById('settings-ollama-host');
        if (sOHost) sOHost.value = res.ollamaHost;
        const fcHostEl = document.getElementById('fc-setting-host');
        if (fcHostEl) fcHostEl.value = res.ollamaHost;
      }
    });
  }

  // Fact Checker Advanced Settings Toggle & Storage
  const fcAdvBtn = document.getElementById('btn-factcheck-advanced-toggle');
  const fcAdvArea = document.getElementById('factcheck-advanced-area');
  if (fcAdvBtn && fcAdvArea) {
    fcAdvBtn.addEventListener('click', () => {
      fcAdvArea.style.display = fcAdvArea.style.display === 'none' ? 'block' : 'none';
    });
  }

  const fcModelInput = document.getElementById('fc-setting-model');
  const fcHostInput = document.getElementById('fc-setting-host');
  const fcGroqKeyInput = document.getElementById('fc-setting-groq-key');
  const fcGroqModelInput = document.getElementById('fc-setting-groq-model');

  if (fcGroqKeyInput) {
    fcGroqKeyInput.addEventListener('change', () => {
      const val = fcGroqKeyInput.value.trim() || DEFAULT_GROQ_KEY;
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ groqApiKey: val });
      }
    });
  }
  if (fcGroqModelInput) {
    fcGroqModelInput.addEventListener('change', () => {
      const val = fcGroqModelInput.value.trim() || DEFAULT_GROQ_MODEL;
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ groqModel: val });
      }
    });
  }
  if (fcModelInput) {
    fcModelInput.addEventListener('change', () => {
      const val = fcModelInput.value.trim() || 'gemma3:4b';
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ ollamaModel: val });
      }
    });
  }
  if (fcHostInput) {
    fcHostInput.addEventListener('change', () => {
      const val = fcHostInput.value.trim() || 'http://localhost:11434';
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ ollamaHost: val });
      }
    });
  }

  // File drop zone
  const fileDrop  = document.getElementById('file-drop');
  const fileInput = document.getElementById('img-file');

  fileDrop.addEventListener('click', () => fileInput.click());
  fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.classList.add('drag'); });
  fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag'));
  fileDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDrop.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) readImageFile(file);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) readImageFile(file);
  });
  document.getElementById('img-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadImageUrl();
  });

  // Auto-load pending scans stored by context menu handler
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['pendingPolicyScan', 'pendingFactCheck', 'pendingImageScan'], (stored) => {

      if (stored.pendingPolicyScan && (Date.now() - stored.pendingPolicyScan.ts) < 60000) {
        const pending = stored.pendingPolicyScan;
        chrome.storage.local.remove('pendingPolicyScan');

        // Always show the source banner
        const banner = document.getElementById('policy-source-banner');
        banner.style.display = 'flex';
        document.getElementById('policy-source-title').textContent = pending.title || pending.siteName || 'Privacy Policy';
        document.getElementById('policy-source-url').textContent   = pending.url || (pending.policyUrls && pending.policyUrls[0]) || '';

        if (pending.policyUrls && pending.policyUrls.length > 0) {
          // ── Known site: show fetching state, trigger with URLs ──────────────
          const inputEl = document.getElementById('policy-input');
          inputEl.value = `⏳ Fetching ${pending.siteName || ''} Privacy Policy from:\n${pending.policyUrls.join('\n')}\n\nPlease wait…`;
          setTimeout(() => runPolicyAnalysis(pending.policyUrls, pending.siteName), 400);
        } else if ((pending.text || '').trim().length > 80) {
          // ── Unknown site: use extracted text ───────────────────────────────
          document.getElementById('policy-input').value = pending.text || '';
          setTimeout(() => runPolicyAnalysis(), 400);
        }
      }

      const handlePendingFC = (pending) => {
        if (!pending || (Date.now() - pending.ts) > 60000) return;
        const inputEl = document.getElementById('factcheck-input');
        if (inputEl) inputEl.value = pending.text || '';
        const fcTab = document.querySelector('.tab-btn[data-tab="factcheck"]');
        if (fcTab && !fcTab.classList.contains('active')) fcTab.click();
        if (urlParams.get('autorun') === '1' || pending.autorun) {
          setTimeout(runFactCheck, 400);
        }
      };

      if (chrome.storage.session) {
        chrome.storage.session.get(['pendingFactCheck'], (s) => {
          if (s && s.pendingFactCheck) {
            chrome.storage.session.remove('pendingFactCheck');
            handlePendingFC(s.pendingFactCheck);
          } else if (stored.pendingFactCheck) {
            chrome.storage.local.remove('pendingFactCheck');
            handlePendingFC(stored.pendingFactCheck);
          }
        });
      } else if (stored.pendingFactCheck) {
        chrome.storage.local.remove('pendingFactCheck');
        handlePendingFC(stored.pendingFactCheck);
      }

      if (stored.pendingImageScan && (Date.now() - stored.pendingImageScan.ts) < 30000) {
        const pending = stored.pendingImageScan;
        chrome.storage.local.remove('pendingImageScan');
        if (pending.url) { document.getElementById('img-url').value = pending.url; loadImageUrl(); }
      }
    });
  }
});

// ── Image helpers ─────────────────────────────────────────────────────────────
function readImageFile(file) {
  currentImageMime   = file.type || 'image/jpeg';
  currentImageUrl    = null;
  const reader       = new FileReader();
  reader.onload = (ev) => {
    const dataUrl      = ev.target.result;
    currentImageBase64 = dataUrl.split(',')[1];
    showImagePreview(dataUrl);
  };
  reader.readAsDataURL(file);
}

function loadImageUrl() {
  const url = document.getElementById('img-url').value.trim();
  if (!url) return;
  currentImageBase64 = null;
  currentImageUrl    = url;
  // Attempt a visual preview (works for public images)
  const previewEl = document.getElementById('img-preview-el');
  const preview   = document.getElementById('img-preview');
  previewEl.src   = url;
  previewEl.onload  = () => preview.classList.add('show');
  previewEl.onerror = () => preview.classList.remove('show');
}

function showImagePreview(src) {
  const previewEl = document.getElementById('img-preview-el');
  const preview   = document.getElementById('img-preview');
  previewEl.src   = src;
  preview.classList.add('show');
}

// ── Local LLM bridge ────────────────────────────────────────────────────────
function sendMsg(payload, callback) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) {
        callback({ error: chrome.runtime.lastError.message });
      } else {
        callback(resp);
      }
    });
  } else {
    // Dev fallback — direct local Ollama call (not inside extension)
    directOllama(payload, callback);
  }
}

async function directOllama(payload, callback) {
  const host  = 'http://localhost:11434';
  const model = 'gemma3:4b';
  const url   = `${host}/api/chat`;
  try {
    const messages = [];
    const userMsg = { role: 'user', content: payload.prompt || '' };
    if (payload.imageBase64) {
      userMsg.images = [payload.imageBase64];
    }
    messages.push(userMsg);

    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, format: 'json' }),
    });
    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}`);
    }
    const data = await res.json();
    callback({ text: data.message?.content || '' });
  } catch (err) {
    callback({ error: `Local Ollama error: ${err.message}. Ensure Ollama is running with model ${model}.` });
  }
}

// ── Policy Scanner ────────────────────────────────────────────────────────────
function runPolicyAnalysis(policyUrls, siteName) {
  const btn     = document.getElementById('btn-policy');
  const resultEl = document.getElementById('policy-result');

  // ── Path A: Known site — use URLs (background.js fetches + analyzes) ────────
  if (policyUrls && policyUrls.length > 0) {
    setLoading(btn, 'policy-result', true, `Fetching ${siteName || ''} Privacy Policy…`);

    sendMsg({ action: 'SCAN_POLICY', urls: policyUrls, siteName: siteName || '' }, (resp) => {
      setLoading(btn, null, false, '🔍 Analyze Policy');
      if (!resp || !resp.success) {
        showError('policy-result', (resp && resp.error) ? resp.error : 'Failed to fetch privacy policy. Check your API key.');
        return;
      }
      renderPolicyResult(resp.result);
    });
    return;
  }

  // ── Path B: Unknown site — use pasted / extracted text ──────────────────────
  const text = document.getElementById('policy-input').value.trim();
  // Strip the loading placeholder we set earlier
  const cleanText = text.startsWith('⏳') ? '' : text;
  if (!cleanText) {
    showError('policy-result', 'Please paste a privacy policy or use the extension on a privacy policy page.');
    return;
  }

  setLoading(btn, 'policy-result', true, 'Analyzing Policy…');

  sendMsg({ action: 'SCAN_POLICY', text: cleanText }, (resp) => {
    setLoading(btn, null, false, '🔍 Analyze Policy');
    if (!resp || !resp.success) {
      showError('policy-result', (resp && resp.error) ? resp.error : 'No response from AI. Check your API key.');
      return;
    }
    try { renderPolicyResult(resp.result); }
    catch (e) { renderRawResult('policy-result', JSON.stringify(resp.result)); }
  });
}

function renderPolicyResult(data) {
  const el    = document.getElementById('policy-result');
  const level = (data.riskLevel || 'CAUTION').toUpperCase();
  const risk  = level === 'SAFE' ? 'safe' : level === 'DANGER' ? 'danger' : 'caution';
  const score = clamp(data.riskScore || 5, 1, 10);
  const scorePct = Math.round((score / 10) * 100);
  const emoji = risk === 'safe' ? '\uD83D\uDFE2' : risk === 'danger' ? '\uD83D\uDD34' : '\uD83D\uDFE1';
  const riskLabel = risk === 'safe' ? 'Safe' : risk === 'danger' ? 'Danger' : 'Caution';

  function section(icon, label, items, color) {
    if (!items || !items.length) return '';
    var chips = items.map(function(item) {
      return '<div style="display:flex;align-items:flex-start;gap:9px;padding:9px 12px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:6px">'
        + '<span style="flex-shrink:0;margin-top:1px;color:' + color + ';font-size:13px">&#9679;</span>'
        + '<span style="font-size:13px;color:var(--text2);line-height:1.55">' + esc(item) + '</span>'
        + '</div>';
    }).join('');
    return '<div style="display:flex;flex-direction:column;gap:0">'
      + '<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">'
      + '<span style="font-size:16px">' + icon + '</span>'
      + '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;color:' + color + '">' + label + '</span>'
      + '</div>' + chips + '</div>';
  }

  var redFlagsHtml = '';
  if (data.redFlags && data.redFlags.length) {
    var flagItems = data.redFlags.map(function(f) {
      return '<div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:6px"><span style="color:var(--danger);margin-top:1px">&#9679;</span><span style="font-size:13px;color:#ff8099;line-height:1.55">' + esc(f) + '</span></div>';
    }).join('');
    redFlagsHtml = '<div class="result-card" style="border-color:rgba(255,77,109,0.2);background:rgba(255,77,109,0.04)">'
      + '<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">'
      + '<span style="font-size:16px">⚠️</span>'
      + '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;color:var(--danger)">Red Flags</span>'
      + '</div>' + flagItems + '</div>';
  }

  var verdictHtml = data.verdict
    ? '<div class="verdict-box" style="border-color:rgba(91,156,246,0.2);background:rgba(91,156,246,0.05)"><strong style="color:var(--accent)">🧠 Bottom Line:</strong> ' + esc(data.verdict) + '</div>'
    : '';

  el.innerHTML =
    '<div class="result-card">'
      + '<div class="risk-header">'
        + '<div>'
          + '<div style="font-size:12px;color:var(--text3);margin-bottom:6px">Privacy Risk</div>'
          + '<span class="risk-badge ' + risk + '">' + emoji + ' ' + riskLabel + '</span>'
        + '</div>'
        + '<div style="text-align:right">'
          + '<div style="font-size:12px;color:var(--text3);margin-bottom:2px">Risk Score</div>'
          + '<div class="risk-score ' + risk + '">' + score + '<span style="font-size:16px;font-weight:400;color:var(--text3)">/10</span></div>'
        + '</div>'
      + '</div>'
      + '<div class="risk-bar-wrap"><div class="risk-bar ' + risk + '" style="width:' + scorePct + '%"></div></div>'
      + (data.simpleSummary ? '<p style="font-size:15px;color:var(--text);line-height:1.7;padding:4px 0;border-left:3px solid var(--accent);padding-left:14px;margin-top:12px">' + esc(data.simpleSummary) + '</p>' : '')
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'
      + '<div class="result-card">' + section('\uD83D\uDCCB', 'What They Collect', data.whatTheyCollect, 'var(--accent)') + '</div>'
      + '<div class="result-card">' + section('\uD83D\uDCB0', 'Who They Share With', data.whoTheyShare, 'var(--caution)') + '</div>'
      + '<div class="result-card">' + section('\u2696\uFE0F', 'Your Rights', data.yourRights, 'var(--safe)') + '</div>'
      + '<div class="result-card">' + section('\uD83D\uDEAA', 'How to Opt Out', data.optOutTips, '#a78bfa') + '</div>'
    + '</div>'
    + redFlagsHtml
    + verdictHtml;

  el.classList.add('show');
}

// ── Unified Scanner (Misinformation & Job Legitimacy) ─────────────────────────
function setScannerStep(activeStepIndex, msg) {
  const steps = ['step-classify', 'step-search', 'step-read', 'step-judge'];
  const msgEl = document.getElementById('factcheck-progress-msg');
  if (msgEl && msg) msgEl.textContent = msg;

  steps.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (idx < activeStepIndex) el.classList.add('done');
    else if (idx === activeStepIndex) el.classList.add('active');
  });
}

function runFactCheck() {
  const text = document.getElementById('factcheck-input').value.trim();
  if (!text) {
    showError('factcheck-result', 'Please paste the text, claim, or job notice you want to verify.');
    return;
  }

  const btn = document.getElementById('btn-factcheck');
  const progBar = document.getElementById('factcheck-progress-bar');
  const typeBadge = document.getElementById('factcheck-type-badge');
  const resEl = document.getElementById('factcheck-result');

  setLoading(btn, null, true, 'Scanning…');
  if (progBar) progBar.style.display = 'block';
  if (typeBadge) typeBadge.style.display = 'none';
  if (resEl) {
    resEl.innerHTML = '';
    resEl.classList.remove('show');
  }

  setScannerStep(0, 'Classifying content (Job Notice vs News Claim)...');

  // Realistic UI progression simulation while worker performs background fetch & LLM judge
  const t1 = setTimeout(() => setScannerStep(1, 'Searching live web sources & official directories...'), 600);
  const t2 = setTimeout(() => setScannerStep(2, 'Reading top passages and verifying citations...'), 2400);
  const t3 = setTimeout(() => setScannerStep(3, 'Evaluating authenticity with local Gemma...'), 5000);

  sendMsg({ action: 'SCAN_FACT', text }, (resp) => {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);
    setLoading(btn, null, false, '🔍 Scan & Verify');
    if (progBar) progBar.style.display = 'none';

    if (!resp || !resp.success) {
      showError('factcheck-result', (resp && resp.error) ? resp.error : 'No response from the Scanner Engine.');
      return;
    }

    renderFactcheckResult(resp.result);
  });
}

function renderFactcheckResult(data) {
  const el = document.getElementById('factcheck-result');
  const typeBadge = document.getElementById('factcheck-type-badge');
  if (!data) return;

  const isJob = data.type === 'job';

  // 1. Update detected type pill
  if (typeBadge) {
    typeBadge.style.display = 'inline-flex';
    if (isJob) {
      typeBadge.className = 'type-pill job';
      typeBadge.textContent = 'Detected: Job Posting';
    } else {
      typeBadge.className = 'type-pill claim';
      typeBadge.textContent = 'Detected: News / Social Claim';
    }
  }

  const risk = (data.riskLevel || 'caution').toLowerCase();
  const score = clamp(data.credibilityScore || 50, 0, 100);
  const emoji = risk === 'safe' ? '✅' : risk === 'danger' ? '🚨' : '🔍';
  const verdict = data.verdict || (isJob ? 'Unverified' : "Couldn't verify");

  // Format verdict colors & honest badge
  const credColor = risk === 'safe' ? 'var(--safe)' : risk === 'danger' ? 'var(--danger)' : 'var(--caution)';

  // 2. Build Red Flags
  const redFlagsHtml = (data.redFlags || []).map((f) =>
    `<div class="flag"><span class="flag-dot" style="background:var(--danger)"></span><span>${esc(f)}</span></div>`
  ).join('');

  // 3. Build Job-specific sections
  let jobHtml = '';
  if (isJob && data.checklist) {
    const checkRows = Object.values(data.checklist).map((c) => {
      const statusClass = c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : 'unknown';
      const statusIcon = c.status === 'pass' ? '✓ Pass' : c.status === 'fail' ? '✕ Risk' : '? Unverified';
      return `
        <div class="checklist-row">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${esc(c.label)}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(c.detail)}</div>
            ${c.url ? `<a href="${c.url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);text-decoration:none;display:inline-block;margin-top:4px">View link ↗</a>` : ''}
          </div>
          <span class="check-status-badge ${statusClass}">${statusIcon}</span>
        </div>`;
    }).join('');

    const adviceList = (data.advice || []).map((a) =>
      `<li style="margin-bottom:6px">${esc(a)}</li>`
    ).join('');

    const entities = data.entities || {};
    const entityTags = [];
    if (entities.company) entityTags.push(`<strong>Company:</strong> ${esc(entities.company)}`);
    if (entities.roles && entities.roles.length) entityTags.push(`<strong>Role:</strong> ${esc(entities.roles.join(', '))}`);
    if (entities.locations && entities.locations.length) entityTags.push(`<strong>Location:</strong> ${esc(entities.locations.join(', '))}`);

    jobHtml = `
      <div style="margin-top:16px">
        ${entityTags.length ? `<div style="margin-bottom:12px;font-size:12px;color:var(--text2);display:flex;flex-wrap:wrap;gap:12px">${entityTags.join(' &bull; ')}</div>` : ''}
        <div class="section-label" style="margin-bottom:8px">📋 Verification Checklist (7 Critical Checks)</div>
        <div class="checklist-table">${checkRows}</div>
      </div>
      ${adviceList ? `
      <div style="margin-top:16px;padding:12px 14px;background:rgba(91,156,246,0.06);border:1px solid rgba(91,156,246,0.2);border-radius:10px">
        <div class="section-label" style="margin-bottom:6px;color:var(--accent)">🛡️ Recommended Next Steps</div>
        <ul style="font-size:13px;color:var(--text2);padding-left:18px;line-height:1.6">${adviceList}</ul>
      </div>` : ''}`;
  }

  // 4. Build Claim Evidence & Verified Citations
  let claimHtml = '';
  if (!isJob) {
    const citations = data.citations || [];
    const sources = data.evidenceSources || [];

    if (citations.length > 0) {
      const citeCards = citations.map((c) => {
        const domain = (() => { try { return new URL(c.url).hostname.replace('www.', ''); } catch { return c.url; } })();
        return `
          <div style="padding:12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:11px;font-weight:700;color:var(--accent)">${esc(c.source || 'Web')} &bull; ${domain}</span>
              <a href="${c.url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent2);text-decoration:none">Source Link ↗</a>
            </div>
            <div class="quote-box">"${esc(c.quote)}"</div>
          </div>`;
      }).join('');
      claimHtml += `<div style="margin-top:16px"><div class="section-label" style="margin-bottom:8px">🔍 Verified Citations (Exact Substrings)</div>${citeCards}</div>`;
    }

    if (sources.length > 0) {
      const sourceList = sources.slice(0, 4).map((s) => {
        const domain = (() => { try { return new URL(s.url).hostname.replace('www.', ''); } catch { return s.url; } })();
        return `
          <a href="${s.url}" target="_blank" rel="noopener" style="display:block;text-decoration:none;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;transition:border-color 0.2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="background:rgba(91,156,246,0.15);color:var(--accent);font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px">${esc(s.source || 'Web')}</span>
              <span style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title || domain)}</span>
            </div>
            <p style="font-size:12px;color:var(--text2);margin:0;line-height:1.5">${esc(s.snippet || '')}</p>
          </a>`;
      }).join('');
      claimHtml += `<div style="margin-top:16px"><div class="section-label" style="margin-bottom:8px">🌐 Retrieved Web Context</div>${sourceList}</div>`;
    }
  }

  // 5. Offline note if judge was offline
  const offlineNotice = data.offlineJudge ? `
    <div style="margin-top:12px;padding:8px 12px;background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.25);border-radius:8px;font-size:12px;color:var(--caution)">
      ⚠️ <strong>AI Judge Offline:</strong> Operating in evidence-only fallback mode. To enable full local judging, run <code>ollama pull gemma3:4b</code> and start Ollama with CORS enabled.
    </div>` : '';

  // 6. Build Raw JSON Details
  const rawJson = esc(JSON.stringify(data, null, 2));

  el.innerHTML = `
    <div class="result-card">
      <div class="risk-header">
        <div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Verdict</div>
          <span class="risk-badge ${risk}">${emoji} ${esc(verdict)}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Confidence / Credibility</div>
          <span style="font-size:16px;font-weight:700;color:${credColor}">${score}%</span>
        </div>
      </div>

      <div class="risk-bar-wrap" style="margin:10px 0 14px"><div class="risk-bar ${risk}" style="width:${score}%"></div></div>

      <div class="verdict-box">
        <strong>Summary:</strong> ${esc(data.explanation || data.simpleSummary || 'Evaluation completed.')}
      </div>

      ${offlineNotice}
      ${redFlagsHtml ? `<div style="margin-top:14px"><div class="section-label" style="margin-bottom:6px;color:var(--danger)">🚩 Red Flags &amp; Risk Indicators</div><div class="flags">${redFlagsHtml}</div></div>` : ''}
      ${jobHtml}
      ${claimHtml}

      <div class="divider" style="margin:18px 0 12px"></div>
      <details style="font-size:12px;color:var(--text3);cursor:pointer">
        <summary style="outline:none;user-select:none;color:var(--accent)">🔍 View Raw JSON Output</summary>
        <pre style="margin-top:8px;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;overflow-x:auto;font-size:11px;color:#a5c8ff;font-family:monospace">${rawJson}</pre>
      </details>
    </div>`;

  el.classList.add('show');
}

// ── Deepfake Detector ─────────────────────────────────────────────────────────
// Active fetch controller — aborted if user clicks Analyze again (no memory leaks)
let _deepfakeController = null;

// UI timeout handle — shows 'Taking longer than expected...' at 30s
let _deepfakeSlowTimer  = null;
let _deepfakeAnalyzing  = false;

function _cancelDeepfake() {
  if (_deepfakeController) { _deepfakeController.abort(); _deepfakeController = null; }
  if (_deepfakeSlowTimer)  { clearTimeout(_deepfakeSlowTimer); _deepfakeSlowTimer = null; }
  _deepfakeAnalyzing = false;
}

/** Validate & optionally resize an image file before base64 encoding */
async function prepareImageFile(file) {
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  const ALLOWED   = ['image/jpeg','image/png','image/webp','image/gif'];

  if (!ALLOWED.includes(file.type)) {
    throw new Error(`Unsupported format: ${file.type}. Use JPG, PNG, WebP, or GIF.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (${(file.size/1024/1024).toFixed(1)} MB). Max is 10 MB.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload  = (ev) => {
      const dataUrl = ev.target.result;
      const img     = new Image();
      img.onload = () => {
        const MAX_DIM = 2048;
        if (img.width <= MAX_DIM && img.height <= MAX_DIM) {
          // No resize needed
          resolve({ base64: dataUrl.split(',')[1], mime: file.type, width: img.width, height: img.height });
          return;
        }
        // Resize to fit within MAX_DIM
        const scale  = MAX_DIM / Math.max(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const resized = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
        const base64  = resized.split(',')[1];
        if (base64.length > 5 * 1024 * 1024) {
          reject(new Error('Image is still too large after resize. Try a smaller image.'));
          return;
        }
        resolve({ base64, mime: file.type === 'image/png' ? 'image/png' : 'image/jpeg', width: canvas.width, height: canvas.height });
      };
      img.onerror = () => reject(new Error('Cannot decode image. It may be corrupted.'));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/** Bulletproof JSON parser with fallback schema */
function safeParseDeepfake(raw) {
  if (!raw || typeof raw !== 'string') {
    return _deepfakeFallback('Empty response from AI model.');
  }

  // 1. Try to extract JSON from markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
  }

  // 2. Try to extract raw JSON object
  const jsonMatch = raw.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1].trim()); } catch (e) {
      return _deepfakeFallback('Malformed JSON in response: ' + e.message);
    }
  }

  // 3. Plain text response — wrap in fallback schema
  return _deepfakeFallback('AI returned unstructured text.', raw.slice(0, 300));
}

function _deepfakeFallback(reason, extraText) {
  return {
    risk:       'caution',
    score:      50,
    verdict:    'Caution — Could Not Parse',
    summary:    extraText || 'The AI analysis completed but the response could not be parsed as structured data. Treat results with caution.',
    indicators: ['Unable to parse structured analysis — ' + reason],
    confidence: 50,
  };
}

function runDeepfakeAnalysis() {
  // Cancel any in-progress analysis first (prevents memory leaks)
  _cancelDeepfake();

  const urlInput  = document.getElementById('img-url').value.trim();
  const hasB64    = !!currentImageBase64;
  const targetUrl = urlInput || currentImageUrl;

  if (!hasB64 && !targetUrl) {
    showError('deepfake-result', 'Please upload an image or paste an image URL, then click Analyze.');
    return;
  }

  // Validate URL format if provided
  if (!hasB64 && targetUrl) {
    try { new URL(targetUrl); } catch {
      showError('deepfake-result', 'Invalid URL format. Please enter a complete URL starting with https://');
      return;
    }
  }

  _deepfakeAnalyzing = true;
  _deepfakeController = new AbortController();
  const btn = document.getElementById('btn-deepfake');

  const DEEPFAKE_SYSTEM = `You are an expert in digital image forensics and deepfake detection.
Analyze the image for signs of AI generation, manipulation, or digital forgery.
Respond ONLY with valid JSON (no markdown, no code fences, no extra text):
{
  "risk": "safe" or "caution" or "danger",
  "score": <integer 0-100>,
  "verdict": "Authentic" or "Likely Manipulated" or "AI Generated" or "Uncertain",
  "summary": "<2-3 sentence forensic analysis in plain English>",
  "indicators": ["<specific visual anomaly>", "<another anomaly>"],
  "confidence": <integer 0-100>
}
Risk: safe=authentic (0-30), caution=suspicious (31-65), danger=likely fake (66-100).
Be specific. Note any facial artifacts, lighting inconsistencies, blending edges, or GAN patterns.`;

  // Show loading with 'slow' state after 30s
  _setDeepfakeLoading(btn, 'Analyzing with Local Gemma AI…');
  _deepfakeSlowTimer = setTimeout(() => {
    if (_deepfakeAnalyzing) _setDeepfakeSlow(btn);
  }, 30_000);

  if (hasB64) {
    _doDeepfake(btn, DEEPFAKE_SYSTEM, currentImageBase64, currentImageMime);
  } else {
    // Fetch image via background (bypasses CORS)
    sendMsg({ action: 'FETCH_IMAGE_BASE64', url: targetUrl }, (resp) => {
      if (!_deepfakeAnalyzing) return; // cancelled
      if (resp && resp.base64) {
        currentImageBase64 = resp.base64;
        currentImageMime   = resp.mime || 'image/jpeg';
        showImagePreview('data:' + currentImageMime + ';base64,' + currentImageBase64);
        _doDeepfake(btn, DEEPFAKE_SYSTEM, currentImageBase64, currentImageMime);
      } else {
        // Cannot fetch image — analyze by URL context only
        const urlPrompt = DEEPFAKE_SYSTEM +
          `\n\nThe image could not be fetched (possibly auth-gated). ` +
          `Analyze based on the URL pattern and any available context: ${targetUrl}`;
        sendMsg({ action: 'SCAN_IMAGE', imageUrl: targetUrl }, (r) => {
          if (!_deepfakeAnalyzing) return;
          _cancelDeepfake();
          btn.disabled = false;
          btn.textContent = '🖼️ Analyze Image';
          if (!r || !r.success) {
            _showDeepfakeError(btn, (r && r.error) ? r.error : 'Could not fetch the image. Try uploading it directly.');
          } else {
            renderDeepfakeResult(_mapScanImageResult(r.result));
          }
        });
      }
    });
  }
}

function _doDeepfake(btn, systemPrompt, base64, mime) {
  sendMsg(
    { action: 'LLM_GENERATE', prompt: systemPrompt, imageBase64: base64, imageMime: mime },
    (resp) => {
      if (!_deepfakeAnalyzing) return; // cancelled
      _cancelDeepfake();
      btn.disabled    = false;
      btn.textContent = '🖼️ Analyze Image';

      if (!resp || resp.error) {
        _showDeepfakeError(btn, resp ? resp.error : 'No response from Local LLM. Ensure Ollama is running.');
        return;
      }
      renderDeepfakeResult(safeParseDeepfake(resp.text));
    }
  );
}

/** Map SCAN_IMAGE (handleImage) result schema to deepfake render schema */
function _mapScanImageResult(r) {
  const cat = (r.category || '').toUpperCase();
  const risk = cat === 'ADULT' || cat === 'VIOLENCE' || cat === 'DEEPFAKE' ? 'danger'
             : cat === 'ADULT_AD'                                           ? 'caution'
             : 'safe';
  return {
    risk,
    score:      Math.round((r.confidence || 0.5) * 100),
    verdict:    cat === 'DEEPFAKE' ? 'AI Generated / Manipulated' : r.category || 'Uncertain',
    summary:    r.reason || 'Analysis based on URL context only.',
    indicators: r.indicators || [],
    confidence: Math.round((r.confidence || 0.5) * 100),
  };
}

function _setDeepfakeLoading(btn, label) {
  btn.disabled   = true;
  btn.innerHTML  = `<div class="spinner"></div> ${label}`;
  const el = document.getElementById('deepfake-result');
  el.innerHTML = `
    <div class="result-card" style="align-items:center;text-align:center;padding:40px 24px">
      <div class="spinner" style="border-color:rgba(91,156,246,0.2);border-top-color:var(--accent);margin:0 auto 16px;width:32px;height:32px;border-width:3px"></div>
      <div style="color:var(--text2);font-size:14px;font-weight:600;margin-bottom:6px">${label}</div>
      <div style="color:var(--text3);font-size:12px">Powered by Local Gemma (Ollama)</div>
    </div>`;
  el.classList.add('show');
}

function _setDeepfakeSlow(btn) {
  const el = document.getElementById('deepfake-result');
  el.innerHTML = `
    <div class="result-card" style="align-items:center;text-align:center;padding:40px 24px">
      <div class="spinner" style="border-color:rgba(245,166,35,0.2);border-top-color:var(--caution);margin:0 auto 16px;width:32px;height:32px;border-width:3px"></div>
      <div style="color:var(--caution);font-size:14px;font-weight:600;margin-bottom:6px">⏳ Taking longer than expected…</div>
      <div style="color:var(--text3);font-size:12px;margin-bottom:18px">Local model is processing. Larger models can take 30-45 seconds on CPU.</div>
      <button id="btn-df-cancel" style="padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:var(--text2);font-size:12px;cursor:pointer">Cancel &amp; Retry</button>
    </div>`;
  el.classList.add('show');
  document.getElementById('btn-df-cancel')?.addEventListener('click', () => {
    _cancelDeepfake();
    const btn = document.getElementById('btn-deepfake');
    btn.disabled    = false;
    btn.textContent = '🖼️ Analyze Image';
    document.getElementById('deepfake-result').classList.remove('show');
  });
}

function _showDeepfakeError(btn, msg) {
  showError('deepfake-result', msg);
  // Add retry button to error card
  const retryBtn = document.createElement('button');
  retryBtn.textContent = '🔄 Retry Analysis';
  retryBtn.style.cssText = 'margin-top:12px;padding:8px 18px;border-radius:8px;border:1px solid rgba(91,156,246,0.3);background:rgba(91,156,246,0.1);color:var(--accent);font-size:12px;cursor:pointer;font-family:inherit';
  retryBtn.addEventListener('click', runDeepfakeAnalysis);
  document.querySelector('#deepfake-result .error-card')?.appendChild(retryBtn);
}


function renderDeepfakeResult(data) {
  const el    = document.getElementById('deepfake-result');
  const risk  = (data.risk || 'caution').toLowerCase();
  const score = clamp(data.score, 0, 100);
  const emoji = { safe: '✅', caution: '🔍', danger: '⚠️' }[risk] || '🔍';
  const indicators = renderFlags(data.indicators || [], risk);

  el.innerHTML = `
    <div class="result-card">
      <div class="risk-header">
        <div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Authenticity</div>
          <span class="risk-badge ${risk}">${emoji} ${data.verdict || cap(risk)}</span>
        </div>
        ${data.confidence !== undefined ? `<div style="text-align:right">
          <div style="font-size:12px;color:var(--text3);margin-bottom:2px">Confidence</div>
          <div class="risk-score ${risk}" style="font-size:24px">${data.confidence}%</div>
        </div>` : ''}
      </div>
      <div class="risk-bar-wrap"><div class="risk-bar ${risk}" style="width:${score}%"></div></div>
      <div class="divider"></div>
      ${data.summary ? `<p class="result-summary">${esc(data.summary)}</p>` : ''}
      ${indicators ? `<div><div class="section-label" style="margin-bottom:8px">🔬 Forensic Indicators</div><div class="flags">${indicators}</div></div>` : ''}
    </div>`;
  el.classList.add('show');
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function setLoading(btn, resultId, isLoading, label) {
  btn.disabled = isLoading;
  btn.innerHTML = isLoading
    ? `<div class="spinner"></div> ${label}`
    : label;
  if (resultId && isLoading) {
    const el = document.getElementById(resultId);
    el.innerHTML = `<div class="result-card" style="align-items:center;text-align:center;padding:36px;color:var(--text2)">
      <div class="spinner" style="border-color:rgba(91,156,246,0.2);border-top-color:var(--accent);margin:0 auto 14px;width:28px;height:28px;border-width:3px"></div>
      ${label}
    </div>`;
    el.classList.add('show');
  }
}

function showError(resultId, msg) {
  const el = document.getElementById(resultId);
  const displayMsg = esc(msg);
  el.innerHTML = `<div class="error-card">⚠️ <span>${displayMsg}</span></div>`;
  el.classList.add('show');
}

function renderRawResult(resultId, text) {
  const el = document.getElementById(resultId);
  el.innerHTML = `<div class="result-card"><div class="section-label" style="margin-bottom:8px">Analysis Result</div><p class="result-summary">${esc(text || '')}</p></div>`;
  el.classList.add('show');
}

function renderFlags(items, risk) {
  const color = risk === 'danger' ? 'var(--danger)' : risk === 'safe' ? 'var(--safe)' : 'var(--caution)';
  return items.map(f => `
    <div class="flag">
      <div class="flag-dot" style="background:${color}"></div>
      <span>${esc(f)}</span>
    </div>`).join('');
}

// ── Override readImageFile to add validation ─────────────────────────────────
// Re-wire the file reader to use prepareImageFile for validation + resize
document.addEventListener('DOMContentLoaded', () => {
  // The file input change handler is set in DOMContentLoaded above.
  // We override readImageFile here after it's declared.
});

function readImageFile(file) {
  prepareImageFile(file)
    .then(({ base64, mime, width, height }) => {
      currentImageBase64 = base64;
      currentImageMime   = mime;
      currentImageUrl    = null;
      showImagePreview('data:' + mime + ';base64,' + base64);
      // Show file info
      const info = document.getElementById('file-drop');
      if (info) info.innerHTML = `<div style="text-align:center;padding:16px">
        <div style="font-size:24px;margin-bottom:8px">🖼️</div>
        <div style="color:var(--text2);font-size:13px">${esc(file.name)}</div>
        <div style="color:var(--text3);font-size:11px;margin-top:4px">${width}×${height}px · ${(file.size/1024).toFixed(0)} KB</div>
      </div>`;
    })
    .catch(err => {
      showError('deepfake-result', err.message);
    });
}

function parseJSON(text) {
  return safeParseDeepfake(text); // reuse the bulletproof parser
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, Number(val) || 50));
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
