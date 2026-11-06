"use client";

/**
 * UrlParamInit — reads ?url=, ?text=, ?image=, ?type= from the query string
 * (injected by context menu / popup "Scan this page" clicks) and fires the
 * onIntent callback so AnalyzeTabs can pre-fill the appropriate analyzer.
 *
 * Must be wrapped in <Suspense> by the caller because useSearchParams()
 * suspends during static-export rendering.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { ScanHistoryItem } from "@/hooks/useSessionHistory";

// Narrow intent type — only what AnalyzeTabs.handleIntent actually needs
export interface TabIntent {
  type: ScanHistoryItem["type"];
  input: string;
}

interface UrlParamInitProps {
  onIntent: (intent: TabIntent) => void;
}

export default function UrlParamInit({ onIntent }: UrlParamInitProps) {
  const params = useSearchParams();

  useEffect(() => {
    const type  = params.get("type");
    const url   = params.get("url");
    const text  = params.get("text");
    const image = params.get("image");

    if (!type) return;

    // Map query-param type → internal tab type
    const tabType: ScanHistoryItem["type"] | null =
      type === "policy" ? "policy"
      : type === "fact"  ? "factcheck"
      : type === "image" ? "image"
      : null;

    if (!tabType) return;

    const input = (url || text || image || "").trim();
    if (!input) return;

    onIntent({ type: tabType, input });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — params are stable on extension pages

  return null;
}
