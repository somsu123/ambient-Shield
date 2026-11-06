import { NextResponse } from "next/server";

// ── Deprecated API Route ──────────────────────────────────────────────────────
// This endpoint is no longer used. All privacy policy analysis is handled by
// the Chrome Extension background service worker via chrome.runtime.sendMessage.
//
// The GET stub is retained only for Next.js static export compatibility.
// With output:'export', POST handlers are unsupported and would break the build.

export async function GET() {
  return NextResponse.json({
    deprecated: true,
    message:
      "This API route is inactive. " +
      "Policy analysis runs via the extension background.js service worker.",
    bridge: "chrome.runtime.sendMessage({ action: 'SCAN_POLICY', ... })",
  });
}
