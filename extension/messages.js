// Ambient Shield — Message Contract & Boundary Validation (extension/messages.js)
// ─────────────────────────────────────────────────────────────────────────────

export const MESSAGE_ACTIONS = {
  TRUST_AURA: "TRUST_AURA",
  SCAN_FACT: "SCAN_FACT",
  SCAN_POLICY: "SCAN_POLICY",
  SCAN_IMAGE: "SCAN_IMAGE",
  LLM_GENERATE: "LLM_GENERATE",
  GEMINI_GENERATE: "GEMINI_GENERATE", // alias for backward compatibility
  CHECK_LLM_HEALTH: "CHECK_LLM_HEALTH",
  FETCH_IMAGE_BASE64: "FETCH_IMAGE_BASE64",
  OPEN_FACT_CHECK: "OPEN_FACT_CHECK",
  OPEN_IMAGE_SCAN: "OPEN_IMAGE_SCAN",
  PARENTAL_MODE_ON: "PARENTAL_MODE_ON",
  PARENTAL_MODE_OFF: "PARENTAL_MODE_OFF",
  UNLOCK_PARENTAL_TEMPORARY: "UNLOCK_PARENTAL_TEMPORARY",
  VERIFY_PARENTAL_PIN: "VERIFY_PARENTAL_PIN",
  SET_PARENTAL_PIN: "SET_PARENTAL_PIN",
  PING: "PING",
};

/**
 * Validates request payload structure at service worker message boundary.
 */
export function validateMessage(msg) {
  if (!msg || typeof msg !== "object") {
    return { valid: false, error: "Invalid payload: message must be an object." };
  }

  const action = msg.action;
  if (!action || typeof action !== "string") {
    return { valid: false, error: "Invalid payload: missing action string." };
  }

  if (action === MESSAGE_ACTIONS.TRUST_AURA) {
    if (typeof msg.text !== "string") {
      return { valid: false, error: "TRUST_AURA requires text string." };
    }
  }

  if (action === MESSAGE_ACTIONS.SCAN_FACT) {
    if (typeof msg.text !== "string" || !msg.text.trim()) {
      return { valid: false, error: "SCAN_FACT requires non-empty text string." };
    }
  }

  if (action === MESSAGE_ACTIONS.SCAN_POLICY) {
    if (!msg.text && !msg.url && (!Array.isArray(msg.urls) || msg.urls.length === 0)) {
      return { valid: false, error: "SCAN_POLICY requires text, url, or urls." };
    }
  }

  if (action === MESSAGE_ACTIONS.SCAN_IMAGE) {
    if (!msg.imageUrl && !msg.imageData) {
      return { valid: false, error: "SCAN_IMAGE requires imageUrl or imageData." };
    }
  }

  return { valid: true, action };
}
