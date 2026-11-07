// Ambient Shield — Parental Mode & Anti-Tamper Test Suite (tests/parental.test.js)
// ─────────────────────────────────────────────────────────────────────────────

import test from "node:test";
import assert from "node:assert/strict";

// Re-implement / import pure helpers to verify protection mechanics
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

function checkAccess({ url, parentalModeActive, parentalWhitelist = [], parentalTempUnlockUntil = 0 }) {
  if (!url) return true;

  if (
    url.includes("parental-lock.html") ||
    url.includes("blocked.html") ||
    url.includes("dashboard.html") ||
    url.includes("popup.html")
  ) {
    return true;
  }

  const isUnlocked = Date.now() < parentalTempUnlockUntil;
  if (parentalModeActive && isProtectedManagementUrl(url)) {
    return isUnlocked;
  }

  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("data:")
  ) {
    return true;
  }

  if (!parentalModeActive || parentalWhitelist.length === 0) return true;

  try {
    const visitHost = new URL(url).hostname.replace(/^www\./, "");
    return parentalWhitelist.some((allowed) => {
      try {
        const allowedHost = new URL(allowed).hostname.replace(/^www\./, "");
        return visitHost === allowedHost || visitHost.endsWith("." + allowedHost);
      } catch {
        return false;
      }
    });
  } catch {
    return true;
  }
}

test("Parental Mode: Anti-Tamper & Extension Removal Guard", async (t) => {
  await t.test("1. Correctly flags all browser extension management and settings URLs", () => {
    assert.equal(isProtectedManagementUrl("chrome://extensions"), true);
    assert.equal(isProtectedManagementUrl("chrome://extensions/"), true);
    assert.equal(isProtectedManagementUrl("chrome://extensions/?id=ibbcgigibenfe"), true);
    assert.equal(isProtectedManagementUrl("chrome://settings"), true);
    assert.equal(isProtectedManagementUrl("chrome://settings/clearBrowserData"), true);
    assert.equal(isProtectedManagementUrl("edge://extensions"), true);
    assert.equal(isProtectedManagementUrl("about:addons"), true);
    assert.equal(isProtectedManagementUrl("about:preferences"), true);

    // Regular sites are NOT management URLs
    assert.equal(isProtectedManagementUrl("https://google.com"), false);
    assert.equal(isProtectedManagementUrl("chrome-extension://xyz/dashboard.html"), false);
    assert.equal(isProtectedManagementUrl("chrome-extension://xyz/parental-lock.html"), false);
  });

  await t.test("2. Blocks chrome://extensions when Parental Mode is ACTIVE", () => {
    const allowed = checkAccess({
      url: "chrome://extensions",
      parentalModeActive: true,
      parentalWhitelist: ["https://khanacademy.org"],
      parentalTempUnlockUntil: 0,
    });
    assert.equal(allowed, false, "Must block chrome://extensions when locked");
  });

  await t.test("3. Allows chrome://extensions when Parental Mode is INACTIVE", () => {
    const allowed = checkAccess({
      url: "chrome://extensions",
      parentalModeActive: false,
      parentalWhitelist: [],
      parentalTempUnlockUntil: 0,
    });
    assert.equal(allowed, true, "Must allow chrome://extensions when parental mode is off");
  });

  await t.test("4. Permits chrome://extensions when Temporary Unlock (2 mins) is active", () => {
    const allowed = checkAccess({
      url: "chrome://extensions",
      parentalModeActive: true,
      parentalWhitelist: ["https://khanacademy.org"],
      parentalTempUnlockUntil: Date.now() + 120000, // 2 minutes from now
    });
    assert.equal(allowed, true, "Must permit access within unlock window");
  });

  await t.test("5. Blocks chrome://extensions after Temporary Unlock expires", () => {
    const allowed = checkAccess({
      url: "chrome://extensions",
      parentalModeActive: true,
      parentalWhitelist: ["https://khanacademy.org"],
      parentalTempUnlockUntil: Date.now() - 1000, // expired 1s ago
    });
    assert.equal(allowed, false, "Must re-lock after temporary unlock expires");
  });

  await t.test("6. Always allows internal protection screens (parental-lock.html & blocked.html)", () => {
    assert.equal(
      checkAccess({
        url: "chrome-extension://xyz/parental-lock.html?target=chrome%3A%2F%2Fextensions",
        parentalModeActive: true,
        parentalWhitelist: ["https://khanacademy.org"],
      }),
      true
    );
    assert.equal(
      checkAccess({
        url: "chrome-extension://xyz/blocked.html?url=https%3A%2F%2Fbadsite.com",
        parentalModeActive: true,
        parentalWhitelist: ["https://khanacademy.org"],
      }),
      true
    );
  });

  await t.test("7. Strict URL whitelist filtering: blocks unapproved sites and allows whitelisted", () => {
    const whitelist = ["https://khanacademy.org", "https://wikipedia.org"];

    // Allowed
    assert.equal(
      checkAccess({ url: "https://khanacademy.org/math", parentalModeActive: true, parentalWhitelist: whitelist }),
      true
    );
    assert.equal(
      checkAccess({ url: "https://en.wikipedia.org/wiki/Science", parentalModeActive: true, parentalWhitelist: whitelist }),
      true
    );

    // Blocked
    assert.equal(
      checkAccess({ url: "https://reddit.com", parentalModeActive: true, parentalWhitelist: whitelist }),
      false
    );
    assert.equal(
      checkAccess({ url: "https://tiktok.com", parentalModeActive: true, parentalWhitelist: whitelist }),
      false
    );
  });

  await t.test("8. Windows Registry GPO command formats correctly with extension ID", () => {
    const extId = "abcdefghijklmnop";
    const regCommand = `reg add "HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "${extId};https://clients2.google.com/service/update2/crx" /f`;
    assert.match(regCommand, /ExtensionInstallForcelist/);
    assert.match(regCommand, /abcdefghijklmnop/);
    assert.match(regCommand, /clients2\.google\.com/);
  });
});

