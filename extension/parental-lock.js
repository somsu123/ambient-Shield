// Ambient Shield — Parental Lock Screen Script
// Prevents unauthorized access to chrome://extensions and extension removal

(function () {
  "use strict";

  const urlParams = new URLSearchParams(window.location.search);
  const rawTarget = urlParams.get("target") || "chrome://extensions";
  const targetUrl = decodeURIComponent(rawTarget);

  const targetDisplay = document.getElementById("target-display");
  const pinInput = document.getElementById("pin-input");
  const btnToggleVis = document.getElementById("btn-toggle-vis");
  const statusMsg = document.getElementById("status-msg");
  const btnUnlockTemp = document.getElementById("btn-unlock-temp");
  const btnDisableMode = document.getElementById("btn-disable-mode");
  const btnGoBack = document.getElementById("btn-go-back");

  const osHeader = document.getElementById("os-header");
  const osBody = document.getElementById("os-body");
  const osArrow = document.getElementById("os-arrow");
  const regCmdBox = document.getElementById("reg-cmd-box");
  const btnCopyCmd = document.getElementById("btn-copy-cmd");

  if (targetDisplay) {
    targetDisplay.textContent = `Attempted Access: ${targetUrl}`;
  }

  // Auto-populate registry anti-removal command
  const extId = (typeof chrome !== "undefined" && chrome.runtime?.id) ? chrome.runtime.id : "YOUR_EXTENSION_ID";
  const regCommand = `reg add "HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "${extId};https://clients2.google.com/service/update2/crx" /f`;
  if (regCmdBox) {
    regCmdBox.textContent = regCommand;
  }

  // Toggle OS protection section
  if (osHeader && osBody) {
    osHeader.addEventListener("click", () => {
      const isOpen = osBody.classList.toggle("open");
      if (osArrow) osArrow.textContent = isOpen ? "▲" : "▼";
    });
  }

  // Copy command button
  if (btnCopyCmd) {
    btnCopyCmd.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(regCommand);
        btnCopyCmd.textContent = "✓ Copied to clipboard!";
        setTimeout(() => { btnCopyCmd.textContent = "📋 Copy PowerShell Command"; }, 2500);
      } catch (_) {
        btnCopyCmd.textContent = "Press Ctrl+C to copy";
      }
    });
  }

  // Toggle PIN visibility
  if (btnToggleVis && pinInput) {
    btnToggleVis.addEventListener("click", () => {
      if (pinInput.type === "password") {
        pinInput.type = "text";
        btnToggleVis.textContent = "🔒";
      } else {
        pinInput.type = "password";
        btnToggleVis.textContent = "👁️";
      }
      pinInput.focus();
    });
  }

  function showError(msg) {
    if (!statusMsg) return;
    statusMsg.className = "error-msg";
    statusMsg.textContent = msg;
    if (pinInput) {
      pinInput.classList.add("error");
      setTimeout(() => pinInput.classList.remove("error"), 600);
      pinInput.value = "";
      pinInput.focus();
    }
  }

  function showSuccess(msg) {
    if (!statusMsg) return;
    statusMsg.className = "success-msg";
    statusMsg.textContent = msg;
  }

  // Temporary Unlock (2 minutes)
  async function handleTempUnlock() {
    const pin = (pinInput?.value || "").trim();
    if (!pin) {
      showError("Please enter your Parental PIN / Password.");
      return;
    }

    statusMsg.className = "error-msg";
    statusMsg.textContent = "Verifying PIN…";

    try {
      chrome.runtime.sendMessage(
        { action: "UNLOCK_PARENTAL_TEMPORARY", password: pin, durationSeconds: 120 },
        (response) => {
          if (chrome.runtime.lastError) {
            showError("Communication error: " + chrome.runtime.lastError.message);
            return;
          }
          if (response && response.ok) {
            showSuccess("✓ PIN Verified! Unlocking extension settings for 2 minutes…");
            setTimeout(() => {
              window.location.replace(targetUrl);
            }, 800);
          } else {
            showError(response?.error || "Incorrect Parental PIN. Access denied.");
          }
        }
      );
    } catch (err) {
      showError("Unexpected error: " + (err.message || String(err)));
    }
  }

  // Disable Parental Mode completely
  async function handleDisableMode() {
    const pin = (pinInput?.value || "").trim();
    if (!pin) {
      showError("Please enter your Parental PIN to turn off Parental Mode.");
      return;
    }

    statusMsg.className = "error-msg";
    statusMsg.textContent = "Verifying PIN…";

    try {
      chrome.runtime.sendMessage(
        { action: "PARENTAL_MODE_OFF", password: pin },
        (response) => {
          if (chrome.runtime.lastError) {
            showError("Communication error: " + chrome.runtime.lastError.message);
            return;
          }
          if (response && response.ok) {
            showSuccess("✓ Parental Mode turned off! Redirecting…");
            setTimeout(() => {
              window.location.replace(targetUrl);
            }, 800);
          } else {
            showError(response?.error || "Incorrect Parental PIN. Access denied.");
          }
        }
      );
    } catch (err) {
      showError("Unexpected error: " + (err.message || String(err)));
    }
  }

  // Go Back
  function handleGoBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.replace("https://www.google.com");
    }
  }

  btnUnlockTemp?.addEventListener("click", handleTempUnlock);
  btnDisableMode?.addEventListener("click", handleDisableMode);
  btnGoBack?.addEventListener("click", handleGoBack);

  pinInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleTempUnlock();
  });
})();

