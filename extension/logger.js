// Ambient Shield — Structured Logger (extension/logger.js)
// ─────────────────────────────────────────────────────────────────────────────

let debugEnabled = false;

if (typeof chrome !== "undefined" && chrome?.storage?.local) {
  chrome.storage.local.get(["llmDebug"], (res) => {
    debugEnabled = Boolean(res.llmDebug);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.llmDebug) {
      debugEnabled = Boolean(changes.llmDebug.newValue);
    }
  });
}

export function logStage(stage, message, data = null) {
  if (!debugEnabled && stage !== "ERROR") return;

  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = `[AmbientShield][${timestamp}][${stage}]`;

  if (stage === "ERROR") {
    if (data) console.error(prefix, message, data);
    else console.error(prefix, message);
  } else {
    if (data) console.log(prefix, message, data);
    else console.log(prefix, message);
  }
}
