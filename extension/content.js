// Ambient Shield — Content Script (Trust Aura v4)
// Uses an injected overlay div inside each post for the colored border glow.
// This approach cannot be overridden by site CSS or clipped by overflow:hidden.

(function () {
  "use strict";

  if (window.self !== window.top) return;
  if (location.protocol === "chrome-extension:") return;

  // ── State ──────────────────────────────────────────────────────────────────
  let feedScannerEnabled = true;
  let blurAdultEnabled   = true;

  const processed = new WeakSet(); // elements already queued/done

  // ── AI Queue ───────────────────────────────────────────────────────────────
  const MAX_CONCURRENT = 2;
  let   active = 0;
  const queue  = [];

  function enqueue(task) { queue.push(task); drain(); }
  function drain() {
    while (active < MAX_CONCURRENT && queue.length > 0) {
      const t = queue.shift();
      active++;
      Promise.resolve().then(t).finally(() => { active--; drain(); });
    }
  }

  // ── Host detection ─────────────────────────────────────────────────────────
  const host = location.hostname.replace(/^www\./, "");

  // ── Platform selectors ─────────────────────────────────────────────────────
  // Using data-attribute selectors which are more stable than class names
  function getSelectors() {
    if (matchHost("twitter.com") || matchHost("x.com")) {
      return {
        post: 'article[data-testid="tweet"]',
        adCheck: (el) => !!el.querySelector('[data-testid="promotedIndicator"],[data-testid="placementTracking"]'),
      };
    }
    if (matchHost("facebook.com")) {
      return {
        post: 'div[data-pagelet*="FeedUnit"],div[role="article"]',
        adCheck: (el) => {
          const labels = el.querySelectorAll('[aria-label]');
          for (const l of labels) {
            if (/^Sponsored$/i.test(l.getAttribute('aria-label') || '')) return true;
          }
          return false;
        },
      };
    }
    if (matchHost("instagram.com")) {
      return {
        post: 'article[role="presentation"],article',
        adCheck: (el) => {
          const spans = el.querySelectorAll('span');
          for (const s of spans) {
            if (s.textContent.trim() === 'Sponsored') return true;
          }
          return false;
        },
      };
    }
    if (matchHost("linkedin.com")) {
      return {
        // LinkedIn uses data-urn on feed update containers; also catches sidebar ads
        post: [
          'div[data-urn*="urn:li:activity"]',
          'div[data-urn*="urn:li:sponsoredUpdate"]',
          'li.occludable-update',
          'div.feed-shared-update-v2',
          'div[class*="occludable-update"]',
        ].join(','),
        adCheck: (el) => {
          // LinkedIn marks ads with a "Promoted" label
          if (el.getAttribute('data-urn') && el.getAttribute('data-urn').includes('sponsor')) return true;
          const allText = el.querySelectorAll('span,a');
          for (const t of allText) {
            if (/^Promoted$/i.test(t.textContent.trim())) return true;
          }
          return false;
        },
      };
    }
    if (matchHost("reddit.com")) {
      return {
        post: 'shreddit-post,div[data-testid="post-container"]',
        adCheck: (el) => el.tagName.toLowerCase() === 'shreddit-ad-post' || el.getAttribute('data-promoted') === 'true',
      };
    }
    if (matchHost("youtube.com")) {
      return {
        post: 'ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer',
        adCheck: (el) => {
          const tag = el.tagName.toLowerCase();
          return tag.includes('ad') || tag.includes('promoted') || !!el.querySelector('ytd-ad-slot-renderer');
        },
      };
    }
    if (matchHost("tiktok.com")) {
      return {
        post: 'div[class*="DivItemContainerV2"],div[class*="SwipeCard"]',
        adCheck: (el) => !!el.querySelector('[class*="PromotedLabel"],[data-e2e*="ad"]'),
      };
    }
    // Generic fallback
    return {
      post: 'article,[role="article"],.post,.feed-item,[data-testid*="post"],[data-testid*="tweet"]',
      adCheck: () => false,
    };
  }

  function matchHost(domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }

  const SEL = getSelectors();

  // ── Fast regex pre-filter ──────────────────────────────────────────────────
  const DANGER_RE = [
    /you won['']?t believe/i,  /doctors? hate (this|him|her)/i,
    /secret (cure|treatment|remedy)/i, /claim your (prize|reward|gift)/i,
    /send (bitcoin|crypto|gift card)/i, /guaranteed (income|returns|profit)/i,
    /get rich (quick|fast|now)/i, /miracle (cure|drug|remedy|treatment)/i,
    /plandemic/i, /fake (news|pandemic|election)/i,
  ];
  const CAUTION_RE = [
    /they don['']?t want you to know/i, /shocking (truth|secret)/i,
    /mainstream media won['']?t (report|tell)/i,
    /big pharma (is hiding|doesn['']?t want)/i,
    /scientists? (baffled|stunned)/i, /one weird trick/i,
    /deep state/i, /wake up (sheeple|people)/i,
  ];

  function fastClassify(text) {
    const t = text.slice(0, 500);
    for (const re of DANGER_RE) if (re.test(t)) return "danger";
    let hits = 0;
    for (const re of CAUTION_RE) if (re.test(t)) hits++;
    if (hits >= 2) return "danger";
    if (hits === 1) return "caution";
    // Excessive caps
    const words = t.split(/\s+/).filter(w => w.length > 2);
    if (words.length >= 6) {
      const caps = words.filter(w => /^[A-Z]+$/.test(w));
      if (caps.length / words.length > 0.5) return "caution";
    }
    return null;
  }

  // ── Overlay-based glow (injected child div, never clipped) ────────────────
  function getOrCreateOverlay(el) {
    let ov = el.querySelector(':scope > .ambient-aura-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'ambient-aura-overlay';
      // Must be first child so it's behind content
      el.insertBefore(ov, el.firstChild);
    }
    // Ensure the parent is positioned so absolute child works
    const pos = getComputedStyle(el).position;
    if (pos === 'static') el.style.setProperty('position', 'relative', 'important');
    return ov;
  }

  function applyGlow(el, level, reason, isAd) {
    el.setAttribute('data-ambient-level', level);

    const ov = getOrCreateOverlay(el);
    ov.setAttribute('data-level', level);
    ov.className = `ambient-aura-overlay ambient-aura-${level}`;

    // Remove old badge
    ov.querySelectorAll('.ambient-badge').forEach(b => b.remove());
    if (level === 'scanning') return;

    // Build badge
    const MAP = {
      safe:    { icon: '✅', color: '#3ecf8e', label: isAd ? 'Ad Verified'       : 'Verified'       },
      caution: { icon: '🟡', color: '#f5a623', label: isAd ? 'Ad — Check Source' : 'Take a 2nd Look' },
      danger:  { icon: '🔴', color: '#ff4d6d', label: isAd ? 'Ad — Likely False' : 'Misinformation'  },
    };
    const m = MAP[level];
    if (!m) return;

    const badge = document.createElement('div');
    badge.className = 'ambient-badge';
    badge.style.cssText = `--badge-color:${m.color}`;
    badge.innerHTML =
      `<span class="ambient-badge-icon">${m.icon}</span>` +
      `<span class="ambient-badge-text">${esc(m.label)}` +
      (reason ? ` <span class="ambient-badge-reason">· ${esc(reason.slice(0, 40))}</span>` : '') +
      `</span>`;
    ov.appendChild(badge);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── AI call via background.js ──────────────────────────────────────────────
  function runAI(el, text, isAd) {
    enqueue(() => new Promise(resolve => {
      const timer = setTimeout(() => {
        if (el.getAttribute('data-ambient-level') === 'scanning') applyGlow(el, 'safe', '', isAd);
        resolve();
      }, 20000);

      try {
        chrome.runtime.sendMessage(
          { action: 'TRUST_AURA', text: text.slice(0, 400), isAd },
          (resp) => {
            clearTimeout(timer);
            if (!resp || chrome.runtime.lastError) {
              if (el.getAttribute('data-ambient-level') === 'scanning') applyGlow(el, 'safe', '', isAd);
            } else {
              const lvl = ['safe','caution','danger'].includes(resp.level) ? resp.level : 'safe';
              applyGlow(el, lvl, resp.reason || '', isAd);
            }
            resolve();
          }
        );
      } catch {
        clearTimeout(timer);
        if (el.getAttribute('data-ambient-level') === 'scanning') applyGlow(el, 'safe', '', isAd);
        resolve();
      }
    }));
  }

  // ── Process one element ────────────────────────────────────────────────────
  function processEl(el) {
    if (processed.has(el)) return;
    if ((el.offsetHeight || 0) < 40) return;

    const text = (el.innerText || el.textContent || '').replace(/\s{2,}/g, ' ').trim();
    if (text.length < 20) return;

    processed.add(el);
    el.setAttribute('data-ambient-scanned', 'true');

    const isAd   = SEL.adCheck(el);
    const fast   = fastClassify(text);

    if (fast === 'danger' || fast === 'caution') {
      applyGlow(el, fast, 'Pattern detected', isAd);
      return;
    }

    // Show scanning shimmer immediately
    applyGlow(el, 'scanning', '', isAd);
    // Queue AI verification
    runAI(el, text, isAd);
  }

  // ── Scan feed ──────────────────────────────────────────────────────────────
  function scanFeed() {
    if (!feedScannerEnabled) return;
    try {
      document.querySelectorAll(SEL.post).forEach(el => {
        if (!el.dataset.ambientScanned) processEl(el);
      });
    } catch (e) {
      // Silently swallow selector errors (don't crash host page)
    }
  }

  // ── Adult image blur ──────────────────────────────────────────────────────
  const blurProcessed = new WeakSet();
  const ADULT_HOSTS   = ['pornhub.com','xvideos.com','xhamster.com','nhentai.net','onlyfans.com','chaturbate.com'];

  function applyBlur(img) {
    if (blurProcessed.has(img)) return;
    const src = (img.src || img.currentSrc || '').toLowerCase();
    if (!ADULT_HOSTS.some(h => src.includes(h))) return;
    blurProcessed.add(img);
    img.style.setProperty('filter', 'blur(24px)', 'important');
    img.dataset.ambientBlurred = 'true';
    const parent = img.parentElement;
    if (!parent) return;
    parent.style.setProperty('position', 'relative', 'important');
    const ov = document.createElement('div');
    ov.className = 'ambient-blur-overlay';
    ov.innerHTML =
      '<span class="ambient-blur-icon">🔞</span>' +
      '<span class="ambient-blur-text">Adult content detected</span>' +
      '<button class="ambient-blur-reveal">Reveal</button>';
    ov.querySelector('.ambient-blur-reveal').addEventListener('click', e => {
      e.stopPropagation();
      img.style.removeProperty('filter');
      img.dataset.ambientBlurred = '';
      ov.remove();
    });
    parent.appendChild(ov);
  }

  function scanBlurImages() {
    if (!blurAdultEnabled) return;
    try {
      document.querySelectorAll('img').forEach(img => {
        if (img.dataset.ambientBlurred === 'true') return;
        if ((img.offsetWidth || 0) < 80 || (img.offsetHeight || 0) < 80) return;
        applyBlur(img);
      });
    } catch {}
  }

  // ── Image scan button ──────────────────────────────────────────────────────
  const imgProcessed = new WeakSet();

  function addScanButton(img) {
    if (imgProcessed.has(img) || img.dataset.ambientScanBtn) return;
    if ((img.offsetWidth || 0) < 100 || (img.offsetHeight || 0) < 100) return;
    imgProcessed.add(img);
    img.dataset.ambientScanBtn = 'true';

    const parent = img.parentElement;
    if (!parent) return;
    const pos = getComputedStyle(parent).position;
    if (pos === 'static') parent.style.setProperty('position', 'relative', 'important');

    const btn = document.createElement('button');
    btn.className   = 'ambient-scan-btn';
    btn.textContent = '🛡️ Scan';
    btn.title       = 'Scan with Ambient Shield';
    btn.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      const src = img.src || img.currentSrc || '';
      if (src) try { chrome.runtime.sendMessage({ action: 'OPEN_IMAGE_SCAN', imageUrl: src }); } catch {}
    });
    parent.appendChild(btn);
  }

  function scanImages() {
    try {
      document.querySelectorAll('img').forEach(img => {
        const go = () => { if ((img.naturalWidth || 0) >= 100) addScanButton(img); };
        if (img.complete) go(); else img.addEventListener('load', go, { once: true, passive: true });
      });
    } catch {}
  }

  // ── Status badge ───────────────────────────────────────────────────────────
  function createStatusIndicator() {
    if (document.getElementById('ambient-status-indicator')) return;
    const el = document.createElement('div');
    el.id        = 'ambient-status-indicator';
    el.className = 'ambient-status-indicator';
    el.title     = 'Ambient Shield — Trust Aura active';
    el.innerHTML = '<span>🛡️</span><span class="ambient-status-text">Trust Aura Active</span>';
    el.addEventListener('click', () => el.classList.toggle('ambient-status-expanded'));
    document.body.appendChild(el);
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    try {
      switch (msg.action) {
        case 'SET_FEED_SCANNER':
          feedScannerEnabled = !!msg.enabled;
          if (feedScannerEnabled) {
            scanFeed();
          } else {
            document.querySelectorAll('[data-ambient-scanned]').forEach(el => {
              el.querySelector('.ambient-aura-overlay')?.remove();
              el.removeAttribute('data-ambient-scanned');
              el.removeAttribute('data-ambient-level');
            });
          }
          sendResponse({ ok: true });
          break;
        case 'SET_BLUR_ADULT':
          blurAdultEnabled = !!msg.enabled;
          if (!blurAdultEnabled) {
            document.querySelectorAll('img[data-ambient-blurred="true"]').forEach(img => {
              img.style.removeProperty('filter');
              img.dataset.ambientBlurred = '';
            });
            document.querySelectorAll('.ambient-blur-overlay').forEach(o => o.remove());
          }
          sendResponse({ ok: true });
          break;
        case 'PING':
          sendResponse({ ok: true, url: location.href });
          break;
        default:
          sendResponse({ ok: false });
      }
    } catch { sendResponse({ ok: false }); }
    return true;
  });

  // ── MutationObserver (infinite scroll) ────────────────────────────────────
  let rafPending = false;
  function scheduleRescan() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      scanFeed();
      scanImages();
      scanBlurImages();
    });
  }

  const observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.addedNodes.length > 0) { scheduleRescan(); return; }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    chrome.storage.sync.get({ feedScanner: true, blurAdult: true }, cfg => {
      feedScannerEnabled = cfg.feedScanner !== false;
      blurAdultEnabled   = cfg.blurAdult   !== false;
      createStatusIndicator();
      scanFeed();
      scanImages();
      scanBlurImages();
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
