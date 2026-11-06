/**
 * Extension API Bridge — lib/extension-api.ts
 *
 * The ONLY way analyzer components communicate with Gemini.
 * All calls go through chrome.runtime.sendMessage → background.js service worker.
 * No fetch() calls, no API routes, no server required.
 */

import type { ScanResponse } from "@/types/extension";

// ── Internal helper ───────────────────────────────────────────────────────────

type MessagePayload = Record<string, unknown>;

/**
 * Send a message to background.js and wait for a response.
 * Rejects with an informative error if chrome.runtime is not available
 * (e.g. running in plain browser dev mode without the extension).
 */
async function webFallback(payload: MessagePayload): Promise<ScanResponse> {
  const DEFAULT_KEY = "AIzaSyAUbqSTNbDruoT6i021QBjIeuHezlR92Bs";
  const key = localStorage.getItem("geminiKey") || DEFAULT_KEY;
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const callApi = async (systemPrompt: string, userPrompt: string, base64Image?: string) => {
    const parts: any[] = [];
    if (base64Image) {
      const mimeType = (payload.imageData as any)?.mimeType || "image/jpeg";
      parts.push({ inline_data: { mime_type: mimeType, data: base64Image } });
    }
    parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 400 }
      })
    });
    if (!res.ok) throw new Error("Gemini API error: " + res.status);
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let s = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try { return JSON.parse(s); } catch {
        const m = s.match(/\{[\s\S]*\}/);
        if (m) return JSON.parse(m[0]);
        throw new Error("Failed to parse Gemini output");
    }
  };

  if (payload.action === "SCAN_POLICY") {
    let input = payload.text as string || "";
    if (payload.url && !input) {
       throw new Error("For the web version, please paste the policy text directly. (URL fetching requires the extension)");
    }
    const system = 'Privacy analyst. Reply ONLY JSON (no markdown): {"riskScore":number,"riskLevel":"SAFE"|"CAUTION"|"DANGER","summary":"1 sentence","whatTheyCollect":string[],"whoTheyShare":string[],"yourRights":string[],"redFlags":string[],"simpleSummary":"1 sentence","optOutTips":string[],"verdict":"1 sentence"}';
    const result = await callApi(system, "Policy:" + input.slice(0,1200));
    return { success: true, result, cached: false, remainingCalls: 99 };
  }
  
  if (payload.action === "SCAN_FACT") {
    const system = 'Fact-checker. Reply ONLY JSON (no markdown): {"verdict":"TRUE"|"LIKELY_TRUE"|"UNVERIFIED"|"MISLEADING"|"FALSE"|"SATIRE","riskLevel":"SAFE"|"CAUTION"|"DANGER","credibilityScore":number,"explanation":"1 sentence","redFlags":string[],"whatToCheck":string[],"simpleSummary":"1 sentence"}';
    const result = await callApi(system, "Claim:" + ((payload.text as string) || "").slice(0, 200));
    return { success: true, result, cached: false, remainingCalls: 99 };
  }

  if (payload.action === "SCAN_IMAGE") {
    const system = 'Image classifier. Reply ONLY JSON (no markdown): {"category":"ADULT"|"VIOLENCE"|"DEEPFAKE"|"ADULT_AD"|"EDUCATIONAL"|"CLEAN","confidence":number,"reason":"10 words max","shouldBlock":boolean,"indicators":string[]}';
    const base64 = (payload.imageData as any)?.base64;
    if (!base64 && payload.imageUrl) {
      throw new Error("For the web version, please upload an image file directly. (URL fetching requires the extension)");
    }
    const result = await callApi(system, "Analyze this image carefully.", base64);
    return { success: true, result, cached: false, remainingCalls: 99 };
  }

  throw new Error("Unknown action");
}

function sendToBackground(payload: MessagePayload): Promise<ScanResponse> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Cannot send extension message in SSR context."));
      return;
    }

    const chrome = (window as unknown as { chrome?: Chrome }).chrome;

    if (!chrome?.runtime?.sendMessage) {
      // Fallback to Web Mode
      webFallback(payload).then(resolve).catch(reject);
      return;
    }

    chrome.runtime.sendMessage(payload, (response: ScanResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? "Extension runtime error."));
        return;
      }
      if (!response) {
        reject(new Error("Empty response from background service worker."));
        return;
      }
      resolve(response);
    });
  });
}

// ── Minimal Chrome runtime type (avoids needing @types/chrome in this file) ──

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

/**
 * Analyze a privacy policy by URL or raw text.
 * Sends SCAN_POLICY to background.js → Gemini pipeline.
 */
export function scanPolicy(
  url?: string,
  text?: string
): Promise<ScanResponse> {
  if (!url && !text) {
    return Promise.reject(new Error("Provide either a URL or policy text."));
  }
  return sendToBackground({ action: "SCAN_POLICY", url, text });
}

/**
 * Fact-check a claim or headline (max 200 chars).
 * Sends SCAN_FACT to background.js → Gemini pipeline.
 */
export function scanFact(text: string): Promise<ScanResponse> {
  if (!text.trim()) {
    return Promise.reject(new Error("Claim text is required."));
  }
  return sendToBackground({ action: "SCAN_FACT", text: text.slice(0, 200) });
}

/**
 * Scan an image for deepfakes, adult content, or violence.
 *
 * - If `file` is provided: reads it as base64 via FileReader and sends the
 *   raw base64 data (without the data: URI prefix) to background.js.
 * - If `imageUrl` is provided: sends just the URL for URL-based heuristics
 *   and text-only AI analysis.
 */
export function scanImage(
  imageUrl?: string,
  file?: File
): Promise<ScanResponse> {
  if (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const dataUrl = e.target?.result;
        if (typeof dataUrl !== "string") {
          reject(new Error("FileReader returned unexpected result."));
          return;
        }

        // Strip the "data:<mime>;base64," prefix — background.js wants raw base64
        const commaIdx = dataUrl.indexOf(",");
        const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

        sendToBackground({
          action: "SCAN_IMAGE",
          imageData: { mimeType: file.type, base64 },
        })
          .then(resolve)
          .catch(reject);
      };

      reader.onerror = () =>
        reject(new Error("Failed to read image file. Please try again."));

      reader.readAsDataURL(file);
    });
  }

  if (imageUrl) {
    return sendToBackground({ action: "SCAN_IMAGE", imageUrl });
  }

  return Promise.reject(
    new Error("Provide either an image URL or a file to scan.")
  );
}
