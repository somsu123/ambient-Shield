"use client";

import { useState, useCallback, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import PolicyAnalyzer from "@/components/analyze/PolicyAnalyzer";
import FactChecker from "@/components/analyze/FactChecker";
import ImageAnalyzer from "@/components/analyze/ImageAnalyzer";
import HistoryPanel from "@/components/analyze/HistoryPanel";
import UrlParamInit from "@/components/analyze/UrlParamInit";
import type { TabIntent } from "@/components/analyze/UrlParamInit";
import RateLimitBar from "@/components/shared/RateLimitBar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileText, CheckCircle2, Image as ImageIcon, ArrowLeft, Shield } from "lucide-react";
import type { ScanHistoryItem } from "@/hooks/useSessionHistory";

// ── Tab definitions ───────────────────────────────────────────────────────────
type TabKey = "policy" | "misinfo" | "deepfake";

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  tag: string;
}

const TABS: Tab[] = [
  { key: "policy",   label: "Privacy Policy", icon: <FileText size={14} />, tag: "OFFLINE REGEX" },
  { key: "misinfo",  label: "Fact & Job Scanner", icon: <CheckCircle2 size={14} />, tag: "MULTI-SOURCE" },
  { key: "deepfake", label: "Media Forensics", icon: <ImageIcon size={14} />, tag: "VISION HEURISTICS" },
];

const TAB_META: Record<TabKey, { title: string; description: string }> = {
  policy: {
    title: "Privacy Policy Analyzer",
    description:
      "Strips legal jargon and surfaces telemetry traps, third-party trackers, and data retention windows using 100% offline regex.",
  },
  misinfo: {
    title: "Misinformation & Job Legitimacy Scanner",
    description:
      "Auto-detects hiring notices vs social claims. Runs 7 critical job checks, cross-examines live web sources, and verifies citations via Gemma.",
  },
  deepfake: {
    title: "Deepfake & Image Forensics",
    description:
      "Analyzes image compression artifacts, URL heuristics, and visual anomalies with explicit non-conclusive safety disclosures.",
  },
};

const TAB_ORDER = TABS.map((t) => t.key);

// ── Framer Motion variants ────────────────────────────────────────────────────
const panelVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 16 : -16, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.2, ease: "easeOut" as const } },
  exit:   (dir: number) => ({ x: dir < 0 ? 16 : -16, opacity: 0, transition: { duration: 0.15, ease: "easeIn" as const } }),
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AnalyzeTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>("policy");
  const [direction,  setDirection]  = useState(1);
  const [globalRemaining, setGlobalRemaining] = useState(30);

  const policyRestoreRef   = useRef<((item: ScanHistoryItem) => void) | null>(null);
  const factcheckRestoreRef = useRef<((item: ScanHistoryItem) => void) | null>(null);

  const switchTab = useCallback((key: TabKey) => {
    if (key === activeTab) return;
    const curr = TAB_ORDER.indexOf(activeTab);
    const next = TAB_ORDER.indexOf(key);
    setDirection(next > curr ? 1 : -1);
    setActiveTab(key);
  }, [activeTab]);

  const handleRemainingUpdate = useCallback((n: number) => {
    setGlobalRemaining(n);
  }, []);

  const handleRestore = useCallback((item: ScanHistoryItem) => {
    switchTab(item.type === "factcheck" ? "misinfo" : item.type as TabKey);

    setTimeout(() => {
      if (item.type === "policy" && policyRestoreRef.current) {
        policyRestoreRef.current(item);
        toast.success("Restored from history", { description: item.input.slice(0, 60) });
      } else if (item.type === "factcheck" && factcheckRestoreRef.current) {
        factcheckRestoreRef.current(item);
        toast.success("Restored from history", { description: item.input.slice(0, 60) });
      } else {
        toast.info("Switch to the correct tab and rerun to view this result.");
      }
    }, 280);
  }, [switchTab]);

  const handleIntent = useCallback(
    (intent: TabIntent) => {
      const tabKey: TabKey =
        intent.type === "factcheck" ? "misinfo" : (intent.type as TabKey);
      switchTab(tabKey);

      setTimeout(() => {
        const synthetic: ScanHistoryItem = {
          id: "__intent__",
          type: intent.type,
          input: intent.input,
          result: {},
          timestamp: Date.now(),
          cached: false,
        };
        if (intent.type === "policy" && policyRestoreRef.current) {
          policyRestoreRef.current(synthetic);
        } else if (intent.type === "factcheck" && factcheckRestoreRef.current) {
          factcheckRestoreRef.current(synthetic);
        }
        toast.info(
          intent.type === "policy"
            ? "URL loaded — click Analyze Policy to scan."
            : intent.type === "factcheck"
            ? "Text loaded — click Check Facts to verify."
            : "Image loaded — ready to scan."
        );
      }, 300);
    },
    [switchTab]
  );

  const meta = TAB_META[activeTab];

  return (
    <div>
      <Suspense fallback={null}>
        <UrlParamInit onIntent={handleIntent} />
      </Suspense>

      {/* Quota Bar */}
      <div className="mb-6">
        <RateLimitBar remainingCalls={globalRemaining} />
      </div>

      {/* 21st.dev Tab Switcher Capsule */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg mb-6 w-full sm:w-fit flex-wrap bg-zinc-950 border border-zinc-800"
        role="tablist"
        aria-label="Analysis tools"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`tab-btn-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.key}`}
              onClick={() => switchTab(tab.key)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? "bg-zinc-850 text-white border border-zinc-700/80 shadow-sm"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-900/60"
              }`}
            >
              <span className={isActive ? "text-white" : "text-zinc-500"}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              <span className="hidden md:inline-block text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                {tab.tag}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Descriptor Strip */}
      <div className="rounded-xl px-5 py-4 mb-6 border border-zinc-850 bg-zinc-950/70">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={14} className="text-zinc-400" />
          <h2 className="text-sm font-semibold tracking-tight text-white">
            {meta.title}
          </h2>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
          {meta.description}
        </p>
      </div>

      {/* Tool Panels */}
      <div className="relative overflow-hidden" style={{ minHeight: 320 }}>
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={activeTab}
            custom={direction}
            variants={panelVariants}
            initial="enter"
            animate="center"
            exit="exit"
            id={`tabpanel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-btn-${activeTab}`}
          >
            {activeTab === "policy" && (
              <PolicyAnalyzer
                onRemainingUpdate={handleRemainingUpdate}
                restoreRef={policyRestoreRef}
              />
            )}
            {activeTab === "misinfo" && (
              <FactChecker
                onRemainingUpdate={handleRemainingUpdate}
                restoreRef={factcheckRestoreRef}
              />
            )}
            {activeTab === "deepfake" && (
              <ImageAnalyzer onRemainingUpdate={handleRemainingUpdate} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* History Panel */}
      <HistoryPanel onRestore={handleRestore} />

      {/* Navigation Return */}
      <div className="mt-10 pt-6 border-t border-zinc-850">
        <Button asChild variant="ghost" size="sm" id="back-home-button" className="text-xs font-mono text-zinc-400 hover:text-white">
          <Link href="/" className="flex items-center gap-1.5">
            <ArrowLeft size={12} />
            RETURN TO ROOT
          </Link>
        </Button>
      </div>
    </div>
  );
}
