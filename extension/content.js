// Ambient Shield — Content Script (Trust Aura v5 - Optimized & Viewport-Aware)
// Injects ambient glow badges only when visible. Local pre-filter + concurrency throttle.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  if (window.self !== window.top) return;
  if (location.protocol === "chrome-extension:") return;

  // ── State ──────────────────────────────────────────────────────────────────
  let feedScannerEnabled = true;
  let blurAdultEnabled   = true;
  let localOnlyMode      = false;

  const processed = new WeakSet(); // elements already observed or queued
  const localCache = new Map();   // hash(text) -> { level, reason }
  const MAX_CACHE_SIZE = 300;

  // ── AI Queue (Concurrency Limit: 2) ────────────────────────────────────────
  const MAX_CONCURRENT = 2;
  let active = 0;
  const queue = [];

  function enqueue(task) {
    queue.push(task);
    drain();
  }

  function drain() {
    while (active < MAX_CONCURRENT && queue.length > 0) {
      const task = queue.shift();
      active++;
      Promise.resolve()
        .then(task)
        .catch(() => {})
        .finally(() => {
          active--;
          drain();
        });
    }
  }

  // ── Host detection & Selectors ─────────────────────────────────────────────
  const host = location.hostname.replace(/^www\./, "");
  function matchHost(domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }

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
        post: [
          'div[data-urn*="urn:li:activity"]',
          'div[data-urn*="urn:li:sponsoredUpdate"]',
          'li.occludable-update',
          'div.feed-shared-update-v2',
          'div[class*="occludable-update"]',
        ].join(','),
        adCheck: (el) => {
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
    // Generic fallback
    return {
      post: 'article,[role="article"],.post,.feed-item,[data-testid*="post"],[data-testid*="tweet"]',
      adCheck: () => false,
    };
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

    // Excessive caps check
    const words = t.split(/\s+/).filter(w => w.length > 2);
    if (words.length >= 6) {
      const caps = words.filter(w => /^[A-Z]+$/.test(w));
      if (caps.length / words.length > 0.5) return "caution";
    }
    return null;
  }

  // ── Overlay Glow Rendering ────────────────────────────────────────────────
  function getOrCreateOverlay(el) {
    let ov = el.querySelector(':scope > .ambient-aura-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'ambient-aura-overlay';
      el.insertBefore(ov, el.firstChild);
    }
    const pos = getComputedStyle(el).position;
    if (pos === 'static') el.style.setProperty('position', 'relative', 'important');
    return ov;
  }

  function applyGlow(el, level, reason, isAd) {
    el.setAttribute('data-ambient-level', level);

    const ov = getOrCreateOverlay(el);
    ov.setAttribute('data-level', level);
    ov.className = `ambient-aura-overlay ambient-aura-${level}`;

    // Remove old badges
    ov.querySelectorAll('.ambient-badge').forEach(b => b.remove());
    if (level === 'scanning') return;

    const MAP = {
      safe:    { icon: '✅', color: '#3ecf8e', label: isAd ? 'Ad Verified'       : 'Verified'       },
      caution: { icon: '🟡', color: '#f5a623', label: isAd ? 'Ad — Check Source' : 'Take a 2nd Look' },
      danger:  { icon: '🔴', color: '#ff4d6d', label: isAd ? 'Ad — Likely False' : 'Misinformation'  },
      neutral: { icon: '⚪', color: '#8892b0', label: isAd ? 'Ad — Unverified'   : 'Neutral / Unverified' },
    };
    const m = MAP[level] || MAP.neutral;

    const badge = document.createElement('div');
    badge.className = 'ambient-badge';
    badge.style.cssText = `--badge-color:${m.color}`;
    badge.innerHTML =
      `<span class="ambient-badge-icon">${m.icon}</span>` +
      `<span class="ambient-badge-text">${esc(m.label)}` +
      (reason ? ` <span class="ambient-badge-reason">· ${esc(reason.slice(0, 45))}</span>` : '') +
      `</span>`;
    ov.appendChild(badge);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── AI Evaluation ─────────────────────────────────────────────────────────
  function runAI(el, text, isAd, textHash) {
    enqueue(() => new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (el.getAttribute('data-ambient-level') === 'scanning') {
          applyGlow(el, 'neutral', 'Analysis timed out', isAd);
        }
        resolve();
      }, 15000);

      try {
        chrome.runtime.sendMessage(
          { action: 'TRUST_AURA', text: text.slice(0, 400), isAd },
          (resp) => {
            clearTimeout(timer);
            if (!resp || chrome.runtime.lastError) {
              applyGlow(el, 'neutral', 'Engine offline', isAd);
            } else {
              const lvl = ['safe', 'caution', 'danger', 'neutral'].includes(resp.level) ? resp.level : 'neutral';
              applyGlow(el, lvl, resp.reason || '', isAd);
              if (localCache.size < MAX_CACHE_SIZE) {
                localCache.set(textHash, { level: lvl, reason: resp.reason || '' });
              }
            }
            resolve();
          }
        );
      } catch {
        clearTimeout(timer);
        applyGlow(el, 'neutral', 'Engine offline', isAd);
        resolve();
      }
    }));
  }

  // ── Process One Element (Triggered only when intersecting viewport) ────────
  function processEl(el) {
    if ((el.offsetHeight || 0) < 40) return;

    const text = (el.innerText || el.textContent || '').replace(/\s{2,}/g, ' ').trim();
    if (text.length < 25) return;

    el.setAttribute('data-ambient-scanned', 'true');
    const isAd = SEL.adCheck(el);
    const textHash = text.slice(0, 100).toLowerCase();

    // 1. Cache hit
    if (localCache.has(textHash)) {
      const cached = localCache.get(textHash);
      applyGlow(el, cached.level, cached.reason, isAd);
      return;
    }

    // 2. Cheap pre-filter
    const fast = fastClassify(text);
    if (fast === 'danger' || fast === 'caution') {
      applyGlow(el, fast, 'Pattern detected', isAd);
      localCache.set(textHash, { level: fast, reason: 'Pattern detected' });
      return;
    }

    // 3. Local-only mode check
    if (localOnlyMode) {
      applyGlow(el, 'safe', 'Local mode verified', isAd);
      return;
    }

    // 4. Show scanning state & queue inference
    applyGlow(el, 'scanning', '', isAd);
    runAI(el, text, isAd, textHash);
  }

  // ── Viewport Observer (IntersectionObserver) ──────────────────────────────
  const postObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target;
          postObserver.unobserve(el);
          processEl(el);
        }
      }
    },
    { rootMargin: "150px 0px" } // Pre-trigger slightly before entering view
  );

  // ── Scan Feed ─────────────────────────────────────────────────────────────
  function scanFeed() {
    if (!feedScannerEnabled) return;
    try {
      document.querySelectorAll(SEL.post).forEach((el) => {
        if (processed.has(el) || el.dataset.ambientScanned) return;
        processed.add(el);
        postObserver.observe(el);
      });
    } catch (_) {}
  }

  // ── Adult Image Blur (Firewall assist) ─────────────────────────────────────
  const blurProcessed = new WeakSet();
  const ADULT_HOSTS = ['pornhub.com','xvideos.com','xhamster.com','nhentai.net','onlyfans.com','chaturbate.com'];

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
    } catch (_) {}
  }

  // ── Image Scan Button ─────────────────────────────────────────────────────
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
    btn.className = 'ambient-scan-btn';
    btn.textContent = '🛡️ Scan';
    btn.title = 'Scan with Ambient Shield';
    btn.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      const src = img.src || img.currentSrc || '';
      if (src) try { chrome.runtime.sendMessage({ action: 'OPEN_IMAGE_SCAN', imageUrl: src }); } catch (_) {}
    });
    parent.appendChild(btn);
  }

  function scanImages() {
    try {
      document.querySelectorAll('img').forEach(img => {
        const go = () => { if ((img.naturalWidth || 0) >= 100) addScanButton(img); };
        if (img.complete) go(); else img.addEventListener('load', go, { once: true, passive: true });
      });
    } catch (_) {}
  }

  // ── Status Indicator ──────────────────────────────────────────────────────
  function createStatusIndicator() {
    if (document.getElementById('ambient-status-indicator')) return;
    const el = document.createElement('div');
    el.id = 'ambient-status-indicator';
    el.className = 'ambient-status-indicator';
    el.title = 'Ambient Shield — Trust Aura active';
    el.innerHTML = '<span>🛡️</span><span class="ambient-status-text">Trust Aura Active</span>';
    el.addEventListener('click', () => el.classList.toggle('ambient-status-expanded'));
    document.body.appendChild(el);
  }

  // ── Messages ──────────────────────────────────────────────────────────────
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
    } catch {
      sendResponse({ ok: false });
    }
    return true;
  });

  // ── MutationObserver ──────────────────────────────────────────────────────
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
      if (m.addedNodes.length > 0) {
        scheduleRescan();
        return;
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    chrome.storage.sync.get({ feedScanner: true, blurAdult: true }, cfg => {
      feedScannerEnabled = cfg.feedScanner !== false;
      blurAdultEnabled   = cfg.blurAdult   !== false;

      chrome.storage.local.get(["localOnlyMode"], lcfg => {
        localOnlyMode = Boolean(lcfg.localOnlyMode);
        createStatusIndicator();
        scanFeed();
        scanImages();
        scanBlurImages();
        observer.observe(document.body, { childList: true, subtree: true });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
