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
  document.getElementById('btn-save-key').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ geminiKey: key }, () => {
        const res = document.getElementById('settings-result');
        res.style.display = 'block';
        setTimeout(() => res.style.display = 'none', 3000);
      });
    }
  });

  // Load existing key
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['geminiKey'], (res) => {
      if (res.geminiKey) document.getElementById('api-key-input').value = res.geminiKey;
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

      if (stored.pendingFactCheck && (Date.now() - stored.pendingFactCheck.ts) < 30000) {
        const pending = stored.pendingFactCheck;
        chrome.storage.local.remove('pendingFactCheck');
        document.getElementById('factcheck-input').value = pending.text || '';
        if ((pending.text || '').trim().length > 20) setTimeout(runFactCheck, 400);
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

// ── Gemini bridge ─────────────────────────────────────────────────────────────
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
    // Dev fallback — direct Gemini call (not inside extension)
    directGemini(payload, callback);
  }
}

async function directGemini(payload, callback) {
  const KEY   = '';
  const MODEL = 'gemini-2.0-flash';
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  try {
    const parts = [];
    if (payload.imageBase64) {
      parts.push({ inlineData: { mimeType: payload.imageMime || 'image/jpeg', data: payload.imageBase64 } });
    }
    parts.push({ text: payload.prompt });
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 1024 } }),
    });
    const data = await res.json();
    callback({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' });
  } catch (err) {
    callback({ error: err.message });
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

// ── Fact Checker ──────────────────────────────────────────────────────────────
function runFactCheck() {
  const text = document.getElementById('factcheck-input').value.trim();
  if (!text) { showError('factcheck-result', 'Please paste the text or claim you want to verify.'); return; }

  const btn = document.getElementById('btn-factcheck');
  setLoading(btn, 'factcheck-result', true, 'Checking Facts…');

  // The backend uses an offline web scraper now!


  sendMsg({ action: 'SCAN_FACT', text }, (resp) => {
    setLoading(btn, null, false, '✅ Check Facts');
    if (!resp || !resp.success) { showError('factcheck-result', (resp && resp.error) ? resp.error : 'No response from the Fact Check Engine.'); return; }
    try {
      const mappedResult = {
        risk: resp.result.riskLevel,
        score: resp.result.credibilityScore,
        summary: resp.result.explanation + ' ' + resp.result.simpleSummary,
        flags: [...(resp.result.redFlags || [])],
        sources: resp.result.sources || [],
        verdict: resp.result.verdict
      };
      renderFactcheckResult(mappedResult); 
    } catch (e) { renderRawResult('factcheck-result', JSON.stringify(resp.result)); }
  });
}

function renderFactcheckResult(data) {
  const el    = document.getElementById('factcheck-result');
  const risk  = (data.risk || 'caution').toLowerCase();
  const score = clamp(data.score, 0, 100);
  const emoji = { safe: '✅', caution: '⚠️', danger: '❌' }[risk] || '⚠️';
  const verdictLabel = { safe: 'REAL / VERIFIED', caution: 'UNVERIFIED', danger: 'FALSE / FAKE' }[risk] || 'UNVERIFIED';
  const credColor = { safe: 'var(--safe)', danger: 'var(--danger)', caution: 'var(--caution)' }[risk] || 'var(--caution)';

  // Build source cards
  const sourcesHtml = (data.sources || []).filter(s => s.url && !s.url.includes('duckduckgo.com')).map(s => {
    const badge = s.source === 'Wikipedia' ? '📖 Wikipedia' : s.source === 'FactCheck' ? '🔍 Fact Check' : '🌐 Web';
    const badgeColor = s.source === 'Wikipedia' ? '#3b82f6' : s.source === 'FactCheck' ? '#8b5cf6' : '#6b7280';
    const domain = (() => { try { return new URL(s.url).hostname.replace('www.',''); } catch { return s.url; } })();
    return `<a href="${s.url}" target="_blank" rel="noopener" style="display:block;text-decoration:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;transition:border-color 0.2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="background:${badgeColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">${badge}</span>
        <span style="font-size:12px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${domain}</span>
      </div>
      <p style="font-size:13px;color:var(--text2);margin:0;line-height:1.5">${esc(s.snippet)}</p>
    </a>`;
  }).join('');

  const redFlagsHtml = (data.flags || []).filter(f => f && !f.startsWith('Source:') && !f.startsWith('Wikipedia:') && !f.startsWith('FactCheck:')).map(f =>
    `<div class="flag-item danger"><span class="flag-icon">🚩</span><span>${esc(f)}</span></div>`
  ).join('');

  el.innerHTML = `
    <div class="result-card">
      <div class="risk-header">
        <div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Verdict</div>
          <span class="risk-badge ${risk}">${emoji} ${verdictLabel}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Confidence</div>
          <span style="font-size:14px;font-weight:700;color:${credColor}">${score}%</span>
        </div>
      </div>
      <div class="risk-bar-wrap"><div class="risk-bar ${risk}" style="width:${score}%"></div></div>
      <div class="divider"></div>
      ${data.summary ? `<p class="result-summary">${esc(data.summary)}</p>` : ''}
      ${redFlagsHtml ? `<div style="margin-bottom:14px"><div class="section-label" style="margin-bottom:8px">🚩 Warning Signs</div><div class="flags">${redFlagsHtml}</div></div>` : ''}
      ${sourcesHtml ? `<div><div class="section-label" style="margin-bottom:10px">🔗 Sources Found on the Web</div>${sourcesHtml}</div>` : 
        `<div style="padding:12px;background:var(--surface2);border-radius:10px;color:var(--text3);font-size:13px">⚠️ No direct web sources found. Try searching manually for more context.</div>`}
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
  _setDeepfakeLoading(btn, 'Analyzing with Gemini AI…');
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
    { action: 'GEMINI_GENERATE', prompt: systemPrompt, imageBase64: base64, imageMime: mime },
    (resp) => {
      if (!_deepfakeAnalyzing) return; // cancelled
      _cancelDeepfake();
      btn.disabled    = false;
      btn.textContent = '🖼️ Analyze Image';

      if (!resp || resp.error) {
        _showDeepfakeError(btn, resp ? resp.error : 'No response from AI. Check your API key and try again.');
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
      <div style="color:var(--text3);font-size:12px">Powered by Gemini 2.0 Flash</div>
    </div>`;
  el.classList.add('show');
}

function _setDeepfakeSlow(btn) {
  const el = document.getElementById('deepfake-result');
  el.innerHTML = `
    <div class="result-card" style="align-items:center;text-align:center;padding:40px 24px">
      <div class="spinner" style="border-color:rgba(245,166,35,0.2);border-top-color:var(--caution);margin:0 auto 16px;width:32px;height:32px;border-width:3px"></div>
      <div style="color:var(--caution);font-size:14px;font-weight:600;margin-bottom:6px">⏳ Taking longer than expected…</div>
      <div style="color:var(--text3);font-size:12px;margin-bottom:18px">Gemini is processing the image. This can take up to 60 seconds for large files.</div>
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
  
  let displayMsg = esc(msg);
  // Specifically intercept the 429 Quota error to explain the Google AI region issue
  if (msg && msg.includes("429") && msg.includes("quota")) {
    displayMsg = `<b>API Quota Error:</b> Your Gemini API key was rejected. <br><br>
    <b>Why?</b> If you just created a new free key, Google AI Studio restricts the "Free Tier" in certain regions (like Europe/UK) unless you add a billing card. <br><br>
    <i>Solution:</i> You must either use a key from a supported free-tier region, or enable billing on your Google Cloud project.`;
  }

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
