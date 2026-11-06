// Ambient Shield — Content Firewall (Wall 2)
// Runs at document_start. Blocks adult content before the page renders.
// Works alongside the background tab-watcher (Wall 3).

(function () {
  "use strict";

  if (window.self !== window.top) return;
  if (location.protocol === "chrome-extension:") return;

  // ── Master adult hostname list (regex) ───────────────────────────────────
  const BLOCKED_HOSTS = [
    /\bxnxx\b/, /\bxnxxx\b/, /\bxnxx2\b/, /\bxnxxcom\b/,
    /\bpornhub\b/, /\bxvideos\b/, /\bxhamster\b/, /\bredtube\b/,
    /\byouporn\b/, /\bspankbang\b/, /\beporner\b/, /\btube8\b/,
    /\bbeeg\b/, /\btnaflix\b/, /\bonlyfans\b/, /\bfansly\b/,
    /\bnhentai\b/, /\bhentaihaven\b/, /\bhentai2read\b/, /\btsumino\b/,
    /\bfakku\b/, /\bhanime\b/, /\bhentaimama\b/, /\bexhentai\b/,
    /\be-hentai\b/, /\banimehentai\b/,
    /\brule34\b/, /\bgelbooru\b/, /\bdanbooru\b/, /\be621\b/,
    /\bbrazzers\b/, /\bnubiles\b/, /\bmofos\b/, /\bbangbros\b/,
    /\brealitykings\b/, /\bdigitalplayground\b/, /\bwankz\b/,
    /\bnaughtyamerica\b/, /\bczechav\b/,
    /\bchaturbate\b/, /\bbongacams\b/, /\bstripchat\b/,
    /\blivejasmin\b/, /\bcam4\b/, /\bmyfreecams\b/,
    /\badultfriendfinder\b/, /\bashleymadison\b/,
    /\bsex\.com\b/, /\bporn\.com\b/, /\bnudevista\b/, /\bixxx\b/,
    /\bfreeones\b/, /\bdrtuber\b/, /\bempflix\b/, /\bporndig\b/,
    /\b4tube\b/, /\byoujizz\b/, /\bslutload\b/, /\bhclips\b/,
    /\bporntrex\b/, /\bporngo\b/, /\bfaphouse\b/, /\bpornpics\b/,
    /\belitebabes\b/, /\bhegre\b/, /\bmet-art\b/, /\bvivud\b/,
    /\bsexu\b/, /\bpornone\b/, /\bpornktube\b/,
  ];

  // ── URL path/query keywords that indicate adult content ───────────────────
  // These match against the FULL URL (hostname + path + query)
  // NOTE: Keep this list SPECIFIC — avoid generic words that match ad CDN URLs.
  // "erotic-", "/sex/", "/nude/" etc. were removed because they matched
  // legitimate ad network subdomains and were hiding normal advertisements.
  const ADULT_URL_FRAGMENTS = [
    "xnxx.com", "xvideos.com", "pornhub.com", "xhamster.com",
    "nhentai.net", "onlyfans.com", "chaturbate.com", "stripchat.com",
    "hentaihaven.xxx", "rule34.xxx", "gelbooru.com", "danbooru.donmai.us",
    "redtube.com", "youporn.com", "spankbang.com", "beeg.com",
    "cam4.com", "myfreecams.com", "bongacams.com",
  ];

  // ── Search query patterns (catches Google/Bing/DDG/YouTube searches) ──────
  const ADULT_SEARCH_PATTERNS = [
    /\bxnxx\b/i, /\bxvideos\b/i, /\bpornhub\b/i, /\bnhentai\b/i,
    /\bporn\b/i, /\bnude\b/i, /\bnudes\b/i, /\bsex\b/i, /\bxxx\b/i,
    /\bhentai\b/i, /\bnsfw\b/i, /\berotic\b/i, /\bnaked\b/i,
    /\bboobs\b/i, /\bboob\b/i, /\bnipple\b/i,
    /\bpussy\b/i, /\bdick\b/i, /\bcock\b/i, /\bfuck\b/i,
    /\bsexual\b/i, /\bpornography\b/i, /\bpornographic\b/i,
    /\bcamgirl\b/i, /\bstripcam\b/i, /\bwebcam.sex\b/i,
    /anime.*(sex|nude|hentai|ecchi|lewd|porn)/i,
    /(sex|nude|hentai|ecchi|lewd|porn).*anime/i,
    /18\+.*(video|pic|image|content)/i,
    /\bfap\b/i, /\bjerk.?off\b/i, /\bmasturbat/i,
    /\bonly.?fans\b/i, /\bof.?leak/i,
  ];

  // ── Check whether this page/URL should be blocked ─────────────────────────
  function detectAdultContent() {
    const href     = location.href;
    const hrefLow  = href.toLowerCase();
    const hostname = location.hostname.toLowerCase();

    // 1. Hostname pattern match
    for (const pat of BLOCKED_HOSTS) {
      if (pat.test(hostname)) {
        return { reason: "known-adult-site", match: hostname };
      }
    }

    // 2. URL fragment match (works on all sites including CDNs, mirrors, etc.)
    for (const frag of ADULT_URL_FRAGMENTS) {
      if (hrefLow.includes(frag)) {
        return { reason: "url-keyword", match: frag };
      }
    }

    // 3. Search query match — decode the full search string
    const fullQuery = decodeURIComponent(location.search + " " + location.pathname).toLowerCase();
    for (const pat of ADULT_SEARCH_PATTERNS) {
      if (pat.test(fullQuery)) {
        return { reason: "adult-search-query", match: pat.source };
      }
    }

    return null;
  }

  // ── Build the shield overlay ──────────────────────────────────────────────
  function buildOverlay(info) {
    const hostname = location.hostname.replace(/^www\./, "") || location.href.slice(0, 60);
    const reasons  = buildReasons(info);

    const el = document.createElement("div");
    el.id = "ambient-shield-firewall";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `
      <div class="as-fw-glow-1"></div>
      <div class="as-fw-glow-2"></div>
      <div class="as-fw-inner">
        <div class="as-fw-shield">🛡️</div>
        <div class="as-fw-badge">🔒 Ambient Shield · Adult Content Firewall</div>
        <div class="as-fw-title">Access <span>Blocked</span></div>
        <p class="as-fw-desc">
          Ambient Shield has detected that this page contains
          <strong style="color:#ff8099">18+ adult content</strong>.
          This firewall has <strong style="color:#e2eeff">no off switch</strong>.
        </p>
        <div class="as-fw-domain">⛔ ${esc(hostname)}</div>
        <div class="as-fw-divider"></div>
        <div class="as-fw-reasons">
          ${reasons.map(r => `<div class="as-fw-reason"><div class="as-fw-reason-dot"></div><span>${r}</span></div>`).join("")}
        </div>
        <button class="as-fw-btn" id="as-fw-back">← Go Back to Safety</button>
        <div class="as-fw-lock">🔒 Enforced by Ambient Shield · Cannot be bypassed or disabled</div>
      </div>`;

    return el;
  }

  function buildReasons(info) {
    if (info.reason === "adult-search-query") {
      return [
        "Your search contains adult content keywords",
        "Ambient Shield blocks ALL searches for 18+ material",
        "This applies to Google, Bing, DuckDuckGo and all search engines",
      ];
    }
    if (info.reason === "url-keyword") {
      return [
        `The URL contains a blocked adult keyword: <strong style="color:#ff8099">"${esc(info.match)}"</strong>`,
        "Access to any URL with adult content identifiers is blocked",
        "This protection cannot be removed or disabled",
      ];
    }
    return [
      "This domain is classified as an adult content website",
      "All 18+ sites are blocked regardless of search or direct navigation",
      "Ambient Shield's firewall is permanently active while installed",
    ];
  }

  // ── Inject the overlay and lock the page ──────────────────────────────────
  function blockPage(info) {
    // Hide body immediately to prevent content flash
    const style = document.createElement("style");
    style.textContent = "html,body{overflow:hidden!important;}body>*:not(#ambient-shield-firewall){display:none!important;}";
    document.documentElement.appendChild(style);

    const injectOverlay = () => {
      if (document.getElementById("ambient-shield-firewall")) return;

      // Inject CSS
      const link = document.createElement("link");
      link.rel  = "stylesheet";
      link.href = chrome.runtime.getURL("content-firewall.css");
      document.documentElement.appendChild(link);

      const overlay = buildOverlay(info);

      // Back button
      overlay.querySelector("#as-fw-back").addEventListener("click", () => {
        if (history.length > 1) history.go(-1);
        else location.replace("https://www.google.com");
      });

      // Stop all events on the overlay from propagating to hidden page
      ["click","keydown","keyup","scroll","wheel","touchstart","touchmove"].forEach(ev => {
        overlay.addEventListener(ev, e => e.stopPropagation(), { capture: true, passive: false });
      });

      document.documentElement.appendChild(overlay);
    };

    // Inject now and on DOM ready
    injectOverlay();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectOverlay);
    }

    // Anti-tamper: MutationObserver re-injects if removed
    const observer = new MutationObserver(() => {
      if (!document.getElementById("ambient-shield-firewall")) {
        injectOverlay();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });

    // Block developer tool shortcuts and bypass attempts
    document.addEventListener("keydown", (e) => {
      const blocked =
        e.key === "F12" ||
        e.key === "Escape" ||
        (e.ctrlKey && e.shiftKey && ["I","J","C","K"].includes(e.key)) ||
        (e.metaKey && e.altKey  && ["I","J","C"].includes(e.key)) ||
        (e.ctrlKey && e.key === "U") ||
        (e.ctrlKey && e.key === "s");
      if (blocked) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // Block right-click context menu
    document.addEventListener("contextmenu", e => e.preventDefault(), true);
  }

  function esc(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ── RUN ───────────────────────────────────────────────────────────────────
  const detection = detectAdultContent();
  if (detection) {
    blockPage(detection);
  }

})();
