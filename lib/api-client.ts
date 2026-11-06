/**
 * lib/api-client.ts
 *
 * Unified API client — transparent dual-mode:
 *   • Chrome Extension context  → chrome.runtime.sendMessage to background.js
 *   • Browser / dev server      → fetch('/api/scan/...') as normal Next.js API call
 *
 * Import this instead of fetch() in all analyzer components.
 * Zero changes needed to the component logic.
 */

import type { AnalysisResponse, PolicyResult, FactCheckResult } from "@/lib/types";

// ── Chrome extension detection ───────────────────────────────────────────────

type ChromeRuntimeGlobal = {
  chrome?: {
    runtime?: {
      sendMessage?: (
        msg: unknown,
        cb: (response: unknown) => void
      ) => void;
      lastError?: { message?: string };
    };
  };
};

function isExtensionContext(): boolean {
  if (typeof window === "undefined") return false; // SSR guard
  const g = window as unknown as ChromeRuntimeGlobal;
  return typeof g.chrome?.runtime?.sendMessage === "function";
}

// ── Message bridge ────────────────────────────────────────────────────────────

function sendToBackground<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const g = window as unknown as ChromeRuntimeGlobal;

    if (!g.chrome?.runtime?.sendMessage) {
      reject(new Error("chrome.runtime.sendMessage not available"));
      return;
    }

    g.chrome.runtime.sendMessage(payload, (response: unknown) => {
      const lastError = g.chrome?.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message ?? "Extension communication error"));
        return;
      }
      resolve(response as T);
    });
  });
}

// ── API call wrapper (fetch fallback) ─────────────────────────────────────────

async function apiFetch<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Analyze a privacy policy by URL or raw text */
export async function scanPolicy(
  payload: { url?: string; text?: string }
): Promise<AnalysisResponse<PolicyResult>> {
  if (isExtensionContext()) {
    return sendToBackground<AnalysisResponse<PolicyResult>>({
      action: "SCAN_POLICY",
      ...payload,
    });
  }
  return apiFetch<AnalysisResponse<PolicyResult>>("/api/scan/policy", payload);
}

/** Fact-check a claim */
export async function scanFact(
  payload: { text: string }
): Promise<AnalysisResponse<FactCheckResult>> {
  if (isExtensionContext()) {
    return sendToBackground<AnalysisResponse<FactCheckResult>>({
      action: "SCAN_FACT",
      ...payload,
    });
  }
  return apiFetch<AnalysisResponse<FactCheckResult>>("/api/scan/factcheck", payload);
}

/** Scan an image by URL */
export async function scanImage(payload: {
  imageUrl?: string;
  imageData?: { base64: string; mimeType: string };
}): Promise<AnalysisResponse<Record<string, unknown>>> {
  if (isExtensionContext()) {
    return sendToBackground<AnalysisResponse<Record<string, unknown>>>({
      action: "SCAN_IMAGE",
      ...payload,
    });
  }
  // In dev/server mode, send as JSON with URL only (no binary)
  return apiFetch<AnalysisResponse<Record<string, unknown>>>(
    "/api/scan/image",
    { imageUrl: payload.imageUrl }
  );
}
