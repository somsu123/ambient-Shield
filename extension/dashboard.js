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
  document.getElementById('btn-load-url').addEventListener('click', loadDfUrl);

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
    if (e.key === 'Enter') loadDfUrl();
  });

  // Initialize deepfake dropzone, settings, and file handlers
  initDfDropzone();

  // Auto-load pending scans stored by context menu handler
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['pendingPolicyScan', 'pendingFactCheck', 'pendingImageScan', 'pendingVideoScan'], (stored) => {

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

      const handlePendingDF = (pending, isVideo) => {
        if (!pending || (Date.now() - pending.ts) > 60000) return;
        const dfTab = document.querySelector('.tab-btn[data-tab="deepfake"]');
        if (dfTab && !dfTab.classList.contains('active')) dfTab.click();

        if (pending.captureError === 'CORS_TAINTED') {
          showError('deepfake-result',
            '⚠️ Cross-origin security restriction: cannot capture frames directly from this webpage video element. ' +
            'Please download the video and drag it into the drop zone above.'
          );
          return;
        }

        if (pending.capturedFrame) {
          _dfCurrentFrames = [{ base64: pending.capturedFrame, mime: 'image/jpeg', index: 0 }];
          showDfFrameGallery([pending.capturedFrame]);
          showImagePreview('data:image/jpeg;base64,' + pending.capturedFrame);
          if (pending.autorun || urlParams.get('autorun') === '1') {
            setTimeout(runDeepfakeAnalysis, 500);
          }
          return;
        }

        if (pending.url) {
          const uInput = document.getElementById('img-url');
          if (uInput) uInput.value = pending.url;
          _dfCurrentUrl = pending.url;
          _dfIsVideo = Boolean(isVideo);
          loadDfUrl();
          if (pending.autorun || urlParams.get('autorun') === '1') {
            setTimeout(runDeepfakeAnalysis, 900);
          }
        }
      };

      if (chrome.storage.session) {
        chrome.storage.session.get(['pendingFactCheck', 'pendingVideoScan', 'pendingImageScan'], (s) => {
          if (s && s.pendingFactCheck) {
            chrome.storage.session.remove('pendingFactCheck');
            handlePendingFC(s.pendingFactCheck);
          } else if (stored.pendingFactCheck) {
            chrome.storage.local.remove('pendingFactCheck');
            handlePendingFC(stored.pendingFactCheck);
          }

          if (s && s.pendingVideoScan) {
            chrome.storage.session.remove('pendingVideoScan');
            handlePendingDF(s.pendingVideoScan, true);
          } else if (stored.pendingVideoScan) {
            chrome.storage.local.remove('pendingVideoScan');
            handlePendingDF(stored.pendingVideoScan, true);
          }

          if (s && s.pendingImageScan) {
            chrome.storage.session.remove('pendingImageScan');
            handlePendingDF(s.pendingImageScan, false);
          } else if (stored.pendingImageScan) {
            chrome.storage.local.remove('pendingImageScan');
            handlePendingDF(stored.pendingImageScan, false);
          }
        });
      } else {
        if (stored.pendingFactCheck) {
          chrome.storage.local.remove('pendingFactCheck');
          handlePendingFC(stored.pendingFactCheck);
        }
        if (stored.pendingVideoScan) {
          chrome.storage.local.remove('pendingVideoScan');
          handlePendingDF(stored.pendingVideoScan, true);
        }
        if (stored.pendingImageScan) {
          chrome.storage.local.remove('pendingImageScan');
          handlePendingDF(stored.pendingImageScan, false);
        }
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

// ── Deepfake & Video Scanner ───────────────────────────────────────────────────
// Frame extraction happens HERE (dashboard page has DOM/canvas access).
// Background service worker runs LLM analysis only.
// ─────────────────────────────────────────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────────
let _dfController = null;    // AbortController for cancellation
let _dfAnalyzing  = false;
let _dfSlowTimer  = null;
let _dfCurrentFrames = [];   // [{ base64: string, mime: 'image/jpeg', index: number }]
let _dfCurrentFile = null;   // File object (image or video)
let _dfCurrentUrl  = null;   // URL if loaded from URL
let _dfIsVideo = false;

// ── Settings helpers ───────────────────────────────────────────────────────────
function updateDfProviderVisibility(prov) {
  const groqBlock = document.getElementById('df-groq-block');
  const ollamaBlock = document.getElementById('df-ollama-block');
  if (groqBlock)   groqBlock.style.display = prov === 'groq' ? 'grid' : 'none';
  if (ollamaBlock) ollamaBlock.style.display = prov === 'ollama' ? 'grid' : 'none';
}

function getDfSettings() {
  return {
    provider:    document.getElementById('df-provider-select')?.value || 'groq',
    groqApiKey:  (document.getElementById('df-groq-key')?.value || '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').trim(),
    groqModel:   (document.getElementById('df-groq-model')?.value || 'qwen/qwen3.8-27b').trim(),
    ollamaHost:  (document.getElementById('df-ollama-host')?.value  || 'http://localhost:11434').trim(),
    ollamaModel: (document.getElementById('df-ollama-model')?.value || 'gemma3:4b').trim(),
    frameCount:  Math.min(16, Math.max(3, parseInt(document.getElementById('df-frame-count')?.value || '8', 10))),
    timeoutMs:   Math.min(300000, Math.max(15000, parseInt(document.getElementById('df-timeout-s')?.value || '60', 10) * 1000)),
  };
}

function loadDfSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.get(['dfProvider','dfGroqKey','dfGroqModel','dfOllamaHost','dfOllamaModel','dfFrameCount','dfTimeoutS'], (r) => {
    if (r.dfProvider) {
      const el = document.getElementById('df-provider-select');
      if (el) el.value = r.dfProvider;
      updateDfProviderVisibility(r.dfProvider);
    }
    if (r.dfGroqKey) {
      const el = document.getElementById('df-groq-key');
      if (el) el.value = r.dfGroqKey;
    }
    if (r.dfGroqModel) {
      const el = document.getElementById('df-groq-model');
      if (el) el.value = r.dfGroqModel;
    }
    if (r.dfOllamaHost)  { const el = document.getElementById('df-ollama-host');  if (el) el.value = r.dfOllamaHost; }
    if (r.dfOllamaModel) { const el = document.getElementById('df-ollama-model'); if (el) el.value = r.dfOllamaModel; }
    if (r.dfFrameCount)  { const el = document.getElementById('df-frame-count');  if (el) el.value = r.dfFrameCount; }
    if (r.dfTimeoutS)    { const el = document.getElementById('df-timeout-s');    if (el) el.value = r.dfTimeoutS; }
  });
}

function saveDfSettings() {
  const s = getDfSettings();
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({
      dfProvider:    s.provider,
      dfGroqKey:     s.groqApiKey,
      dfGroqModel:   s.groqModel,
      dfOllamaHost:  s.ollamaHost,
      dfOllamaModel: s.ollamaModel,
      dfFrameCount:  s.frameCount,
      dfTimeoutS:    Math.round(s.timeoutMs / 1000),
    });
  }
}

// ── File drop & input ─────────────────────────────────────────────────────────
function initDfDropzone() {
  const drop  = document.getElementById('df-file-drop');
  const input = document.getElementById('df-file-input');
  const urlInput = document.getElementById('img-url');

  if (!drop || !input) return;

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) handleDfFile(f);
  });
  input.addEventListener('change', (e) => { if (e.target.files[0]) handleDfFile(e.target.files[0]); });

  document.getElementById('btn-load-url')?.addEventListener('click', loadDfUrl);
  if (urlInput) urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadDfUrl(); });

  document.getElementById('df-btn-test-conn')?.addEventListener('click', testDfConnection);

  const providerSelect = document.getElementById('df-provider-select');
  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => {
      updateDfProviderVisibility(e.target.value);
      saveDfSettings();
    });
  }

  // Save settings on change
  ['df-groq-key','df-groq-model','df-ollama-host','df-ollama-model','df-frame-count','df-timeout-s'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', saveDfSettings);
  });

  loadDfSettings();
}

async function handleDfFile(file) {
  _dfCurrentUrl = null;
  _dfCurrentFrames = [];
  _dfIsVideo = file.type.startsWith('video/');

  const VIDEO_MAX = 100 * 1024 * 1024;
  const IMG_MAX   = 10  * 1024 * 1024;
  const ALLOWED_IMG = ['image/jpeg','image/png','image/webp','image/gif'];
  const ALLOWED_VID = ['video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo'];

  if (_dfIsVideo) {
    if (!ALLOWED_VID.includes(file.type)) {
      showError('deepfake-result', `Unsupported video format: ${file.type}. Use MP4, WebM, MOV, OGV, or AVI.`);
      return;
    }
    if (file.size > VIDEO_MAX) {
      showError('deepfake-result', `Video too large (${(file.size/1024/1024).toFixed(1)} MB). Max 100 MB.`);
      return;
    }
    _dfCurrentFile = file;
    showDfVideoPreview(file);
  } else {
    if (!ALLOWED_IMG.includes(file.type)) {
      showError('deepfake-result', `Unsupported image format: ${file.type}. Use JPG, PNG, WebP, or GIF.`);
      return;
    }
    if (file.size > IMG_MAX) {
      showError('deepfake-result', `Image too large (${(file.size/1024/1024).toFixed(1)} MB). Max 10 MB.`);
      return;
    }
    _dfCurrentFile = file;
    _dfIsVideo = false;
    try {
      const { base64, mime } = await prepareImageForDf(file);
      _dfCurrentFrames = [{ base64, mime, index: 0 }];
      showImagePreview('data:' + mime + ';base64,' + base64);
      hideDfVideoPreview();
      showDfFrameGallery([base64]);
    } catch (err) {
      showError('deepfake-result', err.message);
    }
  }
}

function showDfVideoPreview(file) {
  const wrap = document.getElementById('df-video-wrap');
  const videoEl = document.getElementById('df-video-el');
  const meta = document.getElementById('df-video-meta');
  if (!wrap || !videoEl) return;

  const url = URL.createObjectURL(file);
  videoEl.src = url;
  wrap.style.display = 'block';
  document.getElementById('img-preview')?.classList.remove('show');

  videoEl.onloadedmetadata = () => {
    const dur = videoEl.duration;
    const w   = videoEl.videoWidth;
    const h   = videoEl.videoHeight;
    if (meta) meta.textContent =
      `${w}×${h} · ${dur ? dur.toFixed(1) + 's' : '?'} · ${(file.size/1024/1024).toFixed(1)} MB · ${file.type}`;
  };
  // Clear old gallery
  document.getElementById('df-frame-gallery').style.display = 'none';
  document.getElementById('df-frame-strip').innerHTML = '';
}

function hideDfVideoPreview() {
  const wrap = document.getElementById('df-video-wrap');
  if (wrap) wrap.style.display = 'none';
}

function showDfFrameGallery(base64Frames) {
  const gallery = document.getElementById('df-frame-gallery');
  const strip   = document.getElementById('df-frame-strip');
  if (!gallery || !strip) return;
  strip.innerHTML = '';
  base64Frames.forEach((b64, i) => {
    const img = document.createElement('img');
    img.src = 'data:image/jpeg;base64,' + b64;
    img.style.cssText = 'height:64px;border-radius:4px;border:1px solid var(--border);flex-shrink:0;cursor:pointer';
    img.title = `Frame ${i + 1}`;
    img.dataset.frameIdx = i;
    strip.appendChild(img);
  });
  gallery.style.display = 'block';
}

/** Resize image to max 768px longest side, return { base64, mime } */
async function prepareImageForDf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Cannot decode image. It may be corrupted.'));
      img.onload = () => {
        const MAX_PX = 768;
        const scale = MAX_PX / Math.max(img.width, img.height);
        const W = scale < 1 ? Math.round(img.width * scale)  : img.width;
        const H = scale < 1 ? Math.round(img.height * scale) : img.height;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        canvas.getContext('2d').drawImage(img, 0, 0, W, H);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg', width: W, height: H });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Extract N evenly-spaced frames from a video file using HTML5 video + canvas */
async function extractVideoFrames(file, count) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const frames = [];
    const MAX_PX = 768;
    const QUALITY = 0.8;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration)) {
        URL.revokeObjectURL(url);
        return reject(new Error('Cannot determine video duration. The video may be corrupted or in an unsupported format.'));
      }

      // Evenly space frame times; avoid exact 0 and exact end (may not be decodeable)
      const times = [];
      for (let i = 0; i < count; i++) {
        times.push(((i + 0.5) / count) * duration);
      }

      for (const t of times) {
        try {
          const frame = await seekAndCapture(video, t, MAX_PX, QUALITY);
          frames.push(frame);
        } catch (e) {
          // skip undecodeable frame
        }
        // Report progress (call site checks _dfAnalyzing)
        if (!_dfAnalyzing) {
          URL.revokeObjectURL(url);
          return reject(new Error('Scan cancelled.'));
        }
        setDfProgress(`Extracting frame ${frames.length}/${count}…`, 0);
      }

      URL.revokeObjectURL(url);
      if (frames.length === 0) {
        return reject(new Error('Could not extract any frames from this video. Try a different format.'));
      }
      resolve(frames);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Browser cannot decode this video. Try MP4/H.264 or WebM/VP8.'));
    };

    video.load();
  });
}

function seekAndCapture(video, time, maxPx, quality) {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('Seek timeout')), 5000);
    video.onseeked = () => {
      clearTimeout(tid);
      try {
        const scale = maxPx / Math.max(video.videoWidth, video.videoHeight);
        const W = scale < 1 ? Math.round(video.videoWidth * scale)  : video.videoWidth;
        const H = scale < 1 ? Math.round(video.videoHeight * scale) : video.videoHeight;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        canvas.getContext('2d').drawImage(video, 0, 0, W, H);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg', time });
      } catch (e) {
        reject(e);
      }
    };
    video.onerror = () => { clearTimeout(tid); reject(new Error('Video decode error')); };
    video.currentTime = time;
  });
}

/** Cheap frame-to-frame consistency check using pixel sampling */
function checkFrameConsistency(frames) {
  if (!frames || frames.length < 2) return [];
  const results = [];

  function sampleLuminance(base64, samples) {
    // We can't decode base64 to pixels in dashboard JS without canvas+drawImage.
    // Use a fast approximation: sample the base64 character distribution as a proxy.
    // Characters closer to 'A'-'Z' are lighter pixels; this is an approximation.
    const step = Math.max(1, Math.floor(base64.length / samples));
    let sum = 0;
    for (let i = 0; i < base64.length; i += step) {
      sum += base64.charCodeAt(i);
    }
    return sum / Math.ceil(base64.length / step);
  }

  const luminances = frames.map(f => sampleLuminance(f.base64, 200));
  const mean = luminances.reduce((a, b) => a + b, 0) / luminances.length;
  const std  = Math.sqrt(luminances.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / luminances.length);

  for (let i = 1; i < frames.length; i++) {
    const diff = Math.abs(luminances[i] - luminances[i-1]);
    const normalizedDiff = std > 0 ? diff / std : 0;
    const discontinuity = Math.min(1, normalizedDiff / 3);
    if (discontinuity > 0.4) {
      results.push({ frameIndex: i, discontinuity, reason: `Abrupt luminance shift (Δ=${diff.toFixed(1)})` });
    }
  }
  return results;
}

// ── URL loading ───────────────────────────────────────────────────────────────
async function loadDfUrl() {
  const rawUrl = (document.getElementById('img-url')?.value || '').trim();
  if (!rawUrl) return;

  try { new URL(rawUrl); } catch {
    showError('deepfake-result', 'Invalid URL. Enter a full URL starting with https://');
    return;
  }

  _dfCurrentUrl = rawUrl;
  _dfCurrentFile = null;
  _dfCurrentFrames = [];

  // Determine if likely video by extension
  const isVidUrl = /\.(mp4|webm|ogg|mov|avi)(\?.*)?$/i.test(rawUrl);
  _dfIsVideo = isVidUrl;

  if (isVidUrl) {
    // Try loading in video element
    const videoEl = document.getElementById('df-video-el');
    const wrap = document.getElementById('df-video-wrap');
    if (videoEl && wrap) {
      videoEl.src = rawUrl;
      wrap.style.display = 'block';
      videoEl.onerror = () => {
        // Show CORS message
        showError('deepfake-result',
          '⚠️ Cannot load this video URL directly (possible CORS restriction). ' +
          'Download the video and drag it into the drop zone, or use a local file.'
        );
        wrap.style.display = 'none';
      };
    }
  } else {
    // Image URL — preview
    const previewEl = document.getElementById('img-preview-el');
    const preview   = document.getElementById('img-preview');
    if (previewEl && preview) {
      previewEl.src = rawUrl;
      previewEl.onload  = () => preview.classList.add('show');
      previewEl.onerror = () => preview.classList.remove('show');
    }
    hideDfVideoPreview();
  }
}

// ── Connection test ────────────────────────────────────────────────────────────
async function testDfConnection() {
  const statusEl = document.getElementById('df-conn-status');
  if (statusEl) statusEl.textContent = 'Testing…';
  const s = getDfSettings();
  saveDfSettings();

  sendMsg({
    action: 'DF_HEALTH_CHECK',
    provider: s.provider,
    groqApiKey: s.groqApiKey,
    groqModel: s.groqModel,
    ollamaHost: s.ollamaHost,
    ollamaModel: s.ollamaModel,
  }, (resp) => {
    if (!statusEl) return;
    if (!resp) {
      statusEl.textContent = '❌ No response';
      statusEl.style.color = 'var(--danger)';
      return;
    }
    if (resp.ok) {
      statusEl.textContent = `✅ ${resp.message || 'Connected'}`;
      statusEl.style.color = 'var(--safe)';
    } else if (resp.status === 'model_no_vision') {
      statusEl.textContent = `⚠️ ${resp.message}`;
      statusEl.style.color = 'var(--caution)';
    } else {
      statusEl.textContent = `❌ ${resp.message || 'Offline'}`;
      statusEl.style.color = 'var(--danger)';
    }
  });
}

// ── Progress UI ────────────────────────────────────────────────────────────────
function setDfStepActive(stepId) {
  ['df-step-extract','df-step-analyze','df-step-aggregate'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active','done');
    if (id === stepId) el.classList.add('active');
    else if (['df-step-extract','df-step-analyze','df-step-aggregate'].indexOf(id) <
             ['df-step-extract','df-step-analyze','df-step-aggregate'].indexOf(stepId)) {
      el.classList.add('done');
    }
  });
}

function setDfProgress(msg, stepIndex) {
  const bar = document.getElementById('df-progress');
  const msgEl = document.getElementById('df-progress-msg');
  if (bar)   bar.style.display = 'block';
  if (msgEl) msgEl.textContent = msg;
  const steps = ['df-step-extract','df-step-analyze','df-step-aggregate'];
  if (stepIndex >= 0 && stepIndex < steps.length) setDfStepActive(steps[stepIndex]);
}

function hideDfProgress() {
  const bar = document.getElementById('df-progress');
  if (bar) bar.style.display = 'none';
}

// ── Cancel ─────────────────────────────────────────────────────────────────────
function cancelDf() {
  if (_dfController) { _dfController.abort(); _dfController = null; }
  if (_dfSlowTimer)  { clearTimeout(_dfSlowTimer); _dfSlowTimer = null; }
  _dfAnalyzing = false;
  hideDfProgress();
}

// ── Main scan entry point ──────────────────────────────────────────────────────
async function runDeepfakeAnalysis() {
  cancelDf();

  const s = getDfSettings();
  saveDfSettings();

  const hasFile = !!_dfCurrentFile;
  const hasUrl  = !!_dfCurrentUrl;

  if (!hasFile && !hasUrl && _dfCurrentFrames.length === 0) {
    showError('deepfake-result', 'Please upload an image or video, or paste a URL, then click Run Scan.');
    return;
  }

  _dfAnalyzing = true;
  _dfController = new AbortController();
  const btn = document.getElementById('btn-deepfake');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Scanning…'; }

  const resultEl = document.getElementById('deepfake-result');
  if (resultEl) { resultEl.innerHTML = ''; resultEl.classList.remove('show'); }

  _dfSlowTimer = setTimeout(() => {
    if (_dfAnalyzing) setDfProgress('⏳ Still running — large model or slow CPU. Please wait…', -1);
  }, 35000);

  try {
    let frames = _dfCurrentFrames;

    // ── Step 1: Extract frames ─────────────────────────────────────────────
    setDfProgress('Extracting frames…', 0);

    if (hasFile && _dfIsVideo) {
      // Extract from video file
      frames = await extractVideoFrames(_dfCurrentFile, s.frameCount);
      _dfCurrentFrames = frames.map((f, i) => ({ ...f, index: i }));
      showDfFrameGallery(frames.map(f => f.base64));
    } else if (hasUrl && _dfIsVideo) {
      // Can't extract from cross-origin video URL in background SW
      // Try loading the URL video element and extracting
      const videoEl = document.getElementById('df-video-el');
      if (videoEl && videoEl.src && videoEl.readyState >= 2) {
        // Video is loaded, extract directly
        try {
          frames = await extractFromVideoElement(videoEl, s.frameCount);
          _dfCurrentFrames = frames.map((f, i) => ({ ...f, index: i }));
          showDfFrameGallery(frames.map(f => f.base64));
        } catch (corsErr) {
          // Canvas taint (SecurityError) or other error
          _dfAnalyzing = false;
          cancelDf();
          if (btn) { btn.disabled = false; btn.textContent = '🔬 Run Scan'; }
          showError('deepfake-result',
            '⚠️ Cannot extract frames from this video URL (CORS/security restriction). ' +
            'Download the video file and drag it into the drop zone instead.'
          );
          return;
        }
      } else {
        _dfAnalyzing = false;
        cancelDf();
        if (btn) { btn.disabled = false; btn.textContent = '🔬 Run Scan'; }
        showError('deepfake-result',
          '⚠️ Video not loaded. Wait for the video to load in the player, or use a local file.'
        );
        return;
      }
    } else if (hasUrl && !_dfIsVideo) {
      // Image URL: fetch base64 via background (bypasses CORS)
      setDfProgress('Fetching image…', 0);
      const fetchResp = await new Promise(resolve =>
        sendMsg({ action: 'FETCH_IMAGE_BASE64', url: _dfCurrentUrl }, resolve)
      );
      if (!_dfAnalyzing) { cancelDf(); return; }
      if (!fetchResp || !fetchResp.base64) {
        cancelDf();
        if (btn) { btn.disabled = false; btn.textContent = '🔬 Run Scan'; }
        showError('deepfake-result',
          '⚠️ Could not fetch image. The URL may require authentication or be CORS-restricted. ' +
          'Try right-clicking the image and saving it, then upload the file directly.'
        );
        return;
      }
      frames = [{ base64: fetchResp.base64, mime: fetchResp.mime || 'image/jpeg', index: 0 }];
      _dfCurrentFrames = frames;
      showImagePreview('data:' + frames[0].mime + ';base64,' + frames[0].base64);
    }

    if (!_dfAnalyzing) { cancelDf(); return; }
    if (frames.length === 0) {
      cancelDf();
      if (btn) { btn.disabled = false; btn.textContent = '🔬 Run Scan'; }
      showError('deepfake-result', 'No frames to analyze. Please load a valid image or video.');
      return;
    }

    // ── Step 2: Frame-by-frame analysis ───────────────────────────────────
    setDfProgress(`Analyzing frame 1/${frames.length}…`, 1);

    const payload = {
      action: 'SCAN_VIDEO',
      frames: frames.map(f => ({ base64: f.base64, mime: f.mime || 'image/jpeg', index: f.index ?? 0 })),
      isVideo: _dfIsVideo,
      filename: _dfCurrentFile?.name || _dfCurrentUrl || 'uploaded',
      fileSize: _dfCurrentFile?.size || 0,
      provider:    s.provider,
      groqApiKey:  s.groqApiKey,
      groqModel:   s.groqModel,
      ollamaHost:  s.ollamaHost,
      ollamaModel: s.ollamaModel,
      timeoutMs:   s.timeoutMs,
    };

    // Use a port for long-lived connection (keeps SW alive, gets progress updates)
    const result = await runScanViaPort(payload, (progress) => {
      if (!_dfAnalyzing) return;
      if (progress.step === 'frame') {
        setDfProgress(`Analyzing frame ${progress.current}/${progress.total}…`, 1);
        // Update frame gallery flags if flags reported
        if (progress.frameResult && progress.frameResult.overall_suspicion > 0.5) {
          const imgs = document.querySelectorAll('#df-frame-strip img');
          const img = imgs[progress.current - 1];
          if (img) img.style.border = '2px solid var(--caution)';
        }
      } else if (progress.step === 'aggregate') {
        setDfProgress('Aggregating results…', 2);
      }
    });

    if (!_dfAnalyzing) { cancelDf(); return; }

    cancelDf();
    if (btn) { btn.disabled = false; btn.textContent = '🔬 Run Scan'; }

    if (!result || !result.success) {
      showError('deepfake-result', result?.error || 'Analysis failed. Check Ollama is running with a vision model.');
      return;
    }

    renderDeepfakeResult(result.result);

  } catch (err) {
    cancelDf();
    if (btn) { btn.disabled = false; btn.textContent = '🔬 Run Scan'; }
    showError('deepfake-result', err.message || 'Unexpected error during scan.');
  }
}

/** Extract frames from an already-loaded <video> element (may throw SecurityError for cross-origin) */
async function extractFromVideoElement(videoEl, count) {
  const duration = videoEl.duration;
  if (!duration || !isFinite(duration)) throw new Error('Cannot determine video duration.');
  const frames = [];
  const MAX_PX = 768;
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count) * duration;
    try {
      const f = await seekAndCapture(videoEl, t, MAX_PX, 0.8); // may throw SecurityError
      frames.push({ ...f, index: i });
    } catch (e) {
      if (e.name === 'SecurityError') throw e; // propagate CORS taint
    }
  }
  return frames;
}

/** Run scan via long-lived chrome.runtime.connect port for SW keep-alive */
function runScanViaPort(payload, onProgress) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.connect) {
      // Dev fallback
      resolve({ success: false, error: 'Extension context not available.' });
      return;
    }

    let port;
    try {
      port = chrome.runtime.connect({ name: 'df-scan' });
    } catch (e) {
      resolve({ success: false, error: 'Cannot connect to extension background.' });
      return;
    }

    port.onMessage.addListener((msg) => {
      if (msg.type === 'progress') {
        onProgress(msg.data);
      } else if (msg.type === 'result') {
        port.disconnect();
        resolve(msg.data);
      } else if (msg.type === 'error') {
        port.disconnect();
        resolve({ success: false, error: msg.error });
      }
    });

    port.onDisconnect.addListener(() => {
      resolve({ success: false, error: 'Extension service worker disconnected. Try again.' });
    });

    port.postMessage({ action: 'SCAN_VIDEO_PORT', payload });
  });
}

// ── Result renderer ────────────────────────────────────────────────────────────
function renderDeepfakeResult(data) {
  const el = document.getElementById('deepfake-result');
  if (!el || !data) return;

  const label = data.label || 'Inconclusive';
  const confidence = clamp(Math.round((data.confidence || 0.5) * 100), 0, 100);
  const suspicion  = clamp(Math.round((data.overallSuspicion || 0.5) * 100), 0, 100);

  // Map label → risk class
  const risk = label.toLowerCase().includes('authentic') ? 'safe'
             : label.toLowerCase().includes('manipulat') ? 'danger'
             : 'caution';
  const emoji = { safe: '✅', caution: '🔍', danger: '⚠️' }[risk] || '🔍';

  // Build artifacts list
  const allArtifacts = data.artifacts || [];
  const artifactHtml = allArtifacts.length > 0
    ? allArtifacts.map(a => {
        const sev = typeof a.severity === 'number' ? Math.round(a.severity * 100) : '?';
        const sevColor = a.severity > 0.6 ? 'var(--danger)' : a.severity > 0.3 ? 'var(--caution)' : 'var(--safe)';
        return `<div class="flag">
          <div class="flag-dot" style="background:${sevColor}"></div>
          <span><strong>${esc(a.type || '?')}</strong>
          ${a.location ? ` · ${esc(a.location)}` : ''}
          ${a.frameIndex != null ? ` [Frame ${a.frameIndex + 1}]` : ''}
          <span style="color:${sevColor};font-size:11px;margin-left:4px">${sev}%</span>
          ${a.description ? `<br/><span style="color:var(--text3);font-size:11px">${esc(a.description)}</span>` : ''}
          </span>
        </div>`;
      }).join('')
    : '<div style="color:var(--text3);font-size:13px">No specific artifacts flagged.</div>';

  // Frame flags
  const frameFlags = data.frameFlags || [];
  const frameFlagsHtml = frameFlags.length > 0
    ? `<div style="margin-top:12px">
        <div class="section-label" style="margin-bottom:6px;color:var(--caution)">📊 Frame Consistency Flags</div>
        ${frameFlags.map(f => `<div class="flag"><div class="flag-dot" style="background:var(--caution)"></div><span>Frame ${f.frameIndex + 1}: ${esc(f.reason)} (${Math.round(f.discontinuity * 100)}% jump)</span></div>`).join('')}
      </div>`
    : '';

  // Score breakdown
  const breakdown = data.scoreBreakdown
    ? `<details style="font-size:11px;color:var(--text3);margin-top:10px;cursor:pointer">
        <summary style="color:var(--accent);outline:none">ℹ️ How this score is computed</summary>
        <div style="padding:8px 0 4px;line-height:1.7">
          ${Object.entries(data.scoreBreakdown).map(([k,v]) => `${k}: ${typeof v === 'number' ? (v*100).toFixed(0)+'%' : v}`).join('<br/>')}
        </div>
      </details>`
    : '';

  el.innerHTML = `
    <div class="result-card">
      <div class="risk-header">
        <div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Authenticity Assessment</div>
          <span class="risk-badge ${risk}">${emoji} ${esc(label)}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--text3);margin-bottom:2px">Suspicion Index</div>
          <div class="risk-score ${risk}" style="font-size:24px">${suspicion}%</div>
        </div>
      </div>
      <div class="risk-bar-wrap"><div class="risk-bar ${risk}" style="width:${suspicion}%"></div></div>

      <div style="margin:12px 0 8px;padding:10px 12px;background:rgba(255,165,0,0.07);border:1px solid rgba(255,165,0,0.2);border-radius:8px;font-size:12px;color:var(--caution)">
        ⚠️ <strong>Indicative only, not forensic proof.</strong> This analysis is based on visual artifact detection from ${data.frameCount || 1} frame(s). It cannot reliably detect all manipulations and may produce false positives or negatives. Always corroborate with other sources.
      </div>

      ${data.notes ? `<p style="font-size:14px;color:var(--text2);line-height:1.7;border-left:3px solid var(--accent);padding-left:12px;margin:10px 0">${esc(data.notes)}</p>` : ''}

      ${allArtifacts.length > 0 ? `
        <div style="margin-top:14px">
          <div class="section-label" style="margin-bottom:8px">🔬 Visual Artifact Analysis</div>
          <div class="flags">${artifactHtml}</div>
        </div>` : `<div style="margin-top:12px;color:var(--text3);font-size:13px">No visual artifacts detected.</div>`}

      ${frameFlagsHtml}
      ${breakdown}

      ${data.evidenceOnlyMode ? `
        <div style="margin-top:12px;padding:10px;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:8px;font-size:12px;color:var(--caution)">
          🛈 <strong>AI analysis unavailable.</strong> ${esc(data.evidenceOnlyReason || 'Ollama offline or model lacks vision.')}
          Run: <code>ollama pull ${esc(data.suggestedModel || 'gemma3:4b')}</code>
        </div>` : ''}

      <div class="divider" style="margin:14px 0 10px"></div>
      <details style="font-size:12px;color:var(--text3);cursor:pointer">
        <summary style="outline:none;user-select:none;color:var(--accent)">🔍 Raw JSON Output</summary>
        <pre style="margin-top:8px;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;overflow-x:auto;font-size:11px;color:#a5c8ff;font-family:monospace">${esc(JSON.stringify(data, null, 2))}</pre>
      </details>
    </div>`;

  el.classList.add('show');
}

// ── Kept helpers (used by old image-only flow, kept for compat) ────────────────
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

/** Validate & optionally resize an image file before base64 encoding (kept for compat) */
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
          resolve({ base64: dataUrl.split(',')[1], mime: file.type, width: img.width, height: img.height });
          return;
        }
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
