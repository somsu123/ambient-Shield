/**
 * Extension API Bridge — lib/extension-api.ts
 *
 * The unified bridge for analyzer components.
 * In extension context: sends message to background.js service worker.
 * In web dev / standalone mode: communicates with local Ollama engine (zero cloud API keys).
 */

import type { ScanResponse } from "@/types/extension";
import { callLocalLLM, callLocalLLMMultimodal } from "@/lib/ai";

type MessagePayload = Record<string, unknown>;

/**
 * Web fallback when running outside extension context.
 * Queries local Ollama daemon without any external API keys.
 */
async function webFallback(payload: MessagePayload): Promise<ScanResponse> {
  const host = typeof window !== "undefined"
    ? localStorage.getItem("ollamaHost") || "http://localhost:11434"
    : "http://localhost:11434";
  const model = typeof window !== "undefined"
    ? localStorage.getItem("ollamaModel") || "gemma3:4b"
    : "gemma3:4b";

  try {
    if (payload.action === "SCAN_POLICY") {
      const input = (payload.text as string) || "";
      if (payload.url && !input) {
        throw new Error("For web standalone mode, please paste policy text directly.");
      }
      const system = `You are a privacy analyst. Reply ONLY JSON: {"riskScore":number,"riskLevel":"SAFE"|"CAUTION"|"DANGER","summary":"1 sentence","whatTheyCollect":string[],"whoTheyShare":string[],"yourRights":string[],"redFlags":string[],"simpleSummary":"1 sentence","optOutTips":string[],"verdict":"1 sentence"}`;
      const result = await callLocalLLM(system, `Analyze Policy:\n${input.slice(0, 3000)}`, { host, model });
      return { success: true, result, cached: false, remainingCalls: 999 };
    }

    if (payload.action === "SCAN_FACT") {
      const text = (payload.text as string) || "";
      const isJob = /hiring|internship|walk-?in|freshers?|apply|stipend|vacancy|recruitment/i.test(text);
      if (isJob) {
        const system = `You are a job legitimacy analyst running locally. Analyze the job posting text for legitimacy and scam patterns (registration fees, free-mail contacts, vague requirements). Reply ONLY valid JSON with keys: {"type":"job","verdict":"Likely legitimate"|"Unverified"|"High scam risk","riskLevel":"SAFE"|"CAUTION"|"DANGER","credibilityScore":number,"explanation":"1 sentence","redFlags":string[],"advice":string[],"checklist":{"companyWebsite":{"label":"Company Website","status":"pass"|"fail"|"unknown","detail":"summary"},"careersListing":{"label":"Careers Portal","status":"pass"|"fail"|"unknown","detail":"summary"},"contactValidity":{"label":"Contact Validity","status":"pass"|"fail"|"unknown","detail":"summary"},"feeCheck":{"label":"Fees & Deposits","status":"pass"|"fail"|"unknown","detail":"summary"}}}`;
        const result = await callLocalLLM(system, `Analyze Job Notice:\n${text}`, { host, model });
        return { success: true, result, cached: false, remainingCalls: 999 };
      }
      const system = `You are a forensic fact-checking engine. Reply ONLY JSON: {"type":"claim","verdict":"supported"|"contradicted"|"insufficient","confidence":number,"reasoning":"1 sentence","citations":[{"url":string,"quote":string}]}`;
      const result = await callLocalLLM(system, `Claim to evaluate: "${text}"`, { host, model });
      return { success: true, result, cached: false, remainingCalls: 999 };
    }

    if (payload.action === "SCAN_IMAGE") {
      const base64 = (payload.imageData as { base64?: string })?.base64;
      const system = `You are an image forensic assistant. Deepfake detection is indicative, not conclusive. Reply ONLY JSON: {"category":"CLEAN"|"SUSPICIOUS"|"POTENTIAL_AI_GENERATED"|"ADULT"|"VIOLENCE","confidence":number,"reason":"10 words max","shouldBlock":boolean,"indicators":string[],"disclaimer":"Visual inspection is indicative, not forensically conclusive."}`;
      const result = await callLocalLLMMultimodal(
        system,
        "Inspect image indicators.",
        base64,
        { host, model }
      );
      return { success: true, result, cached: false, remainingCalls: 999 };
    }

    throw new Error(`Unknown action: ${payload.action}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      result: null,
      remainingCalls: 999,
      error: `Local LLM failed (${msg}). Ensure Ollama is running with model "${model}".`,
    };
  }
}

function sendToBackground(payload: MessagePayload): Promise<ScanResponse> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ success: false, error: "Cannot execute in SSR context." });
      return;
    }

    const chromeObj = (window as unknown as { chrome?: Chrome }).chrome;

    if (!chromeObj?.runtime?.sendMessage) {
      // Fallback to Web Mode (direct local Ollama)
      webFallback(payload).then(resolve).catch((err) => {
        resolve({ success: false, error: err?.message || "Web fallback failed." });
      });
      return;
    }

    try {
      chromeObj.runtime.sendMessage(payload, (response: ScanResponse) => {
        if (chromeObj.runtime.lastError) {
          // If extension service worker communication failed, try web fallback
          webFallback(payload).then(resolve).catch(() => {
            resolve({
              success: false,
              error: chromeObj.runtime.lastError?.message ?? "Extension runtime error.",
            });
          });
          return;
        }
        if (!response) {
          resolve({ success: false, error: "Empty response from background service worker." });
          return;
        }
        resolve(response);
      });
    } catch (e: unknown) {
      webFallback(payload).then(resolve).catch(() => {
        resolve({ success: false, error: (e as Error)?.message || "Extension message failed" });
      });
    }
  });
}

interface Chrome {
  runtime: {
    sendMessage: (
      message: unknown,
      callback: (response: ScanResponse) => void
    ) => void;
    lastError?: { message?: string };
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scanPolicy(url?: string, text?: string): Promise<ScanResponse> {
  if (!url && !text) {
    return Promise.resolve({ success: false, error: "Provide either a URL or policy text." });
  }
  return sendToBackground({ action: "SCAN_POLICY", url, text });
}

export function scanFact(text: string): Promise<ScanResponse> {
  if (!text.trim()) {
    return Promise.resolve({ success: false, error: "Claim text is required." });
  }
  return sendToBackground({ action: "SCAN_FACT", text: text.slice(0, 300) });
}

export function scanImage(imageUrl?: string, file?: File): Promise<ScanResponse> {
  if (file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result;
        if (typeof dataUrl !== "string") {
          resolve({ success: false, error: "FileReader returned invalid result." });
          return;
        }
        const commaIdx = dataUrl.indexOf(",");
        const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

        sendToBackground({
          action: "SCAN_IMAGE",
          imageData: { mimeType: file.type || "image/jpeg", base64 },
          filename: file.name,
          fileSize: file.size,
        }).then(resolve);
      };

      reader.onerror = () => {
        resolve({ success: false, error: "Failed to read image file." });
      };

      reader.readAsDataURL(file);
    });
  }

  if (imageUrl) {
    return sendToBackground({ action: "SCAN_IMAGE", imageUrl });
  }

  return Promise.resolve({
    success: false,
    error: "Provide either an image URL or an image file.",
  });
}
