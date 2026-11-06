import { NextResponse } from "next/server";

// Static GET — fully compatible with output:'export'.
// No dynamic headers or runtime features used.

export async function GET() {
  return NextResponse.json({ status: "ok", version: "1.0.0", mode: "extension" });
}
