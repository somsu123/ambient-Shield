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
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ScanHistoryItem } from "@/hooks/useSessionHistory";

// ── Tab definitions ───────────────────────────────────────────────────────────
type TabKey = "policy" | "misinfo" | "deepfake";

interface Tab {
  key: TabKey;
  label: string;
  icon: string;
  comingSoon?: boolean;
}

const TABS: Tab[] = [
  { key: "policy",   label: "Privacy Policy",   icon: "📄" },
  { key: "misinfo",  label: "Fact Check",        icon: "✅" },
  { key: "deepfake", label: "Image Scanner",      icon: "🖼️" },
];

const TAB_META: Record<TabKey, { title: string; description: string }> = {
  policy: {
    title: "Privacy Policy Analyzer",
    description:
      "Paste any privacy policy or enter a URL. We strip HTML, summarize data risks, and flag red flags — in plain English.",
  },
  misinfo: {
    title: "Misinformation Scanner",
    description:
      "Enter a claim or headline to fact-check. AI assesses credibility signals and source reliability.",
  },
  deepfake: {
    title: "Image & Deepfake Scanner",
    description:
      "Upload or link an image to check for AI manipulation, adult content, deepfakes, and violence — in seconds.",
  },
};

const TAB_ORDER = TABS.map((t) => t.key);

// ── Framer Motion variants ────────────────────────────────────────────────────
const panelVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit:   (dir: number) => ({ x: dir < 0 ? 32 : -32, opacity: 0, transition: { duration: 0.18, ease: "easeIn" as const } }),
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AnalyzeTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>("policy");
  const [direction,  setDirection]  = useState(1);
  const [globalRemaining, setGlobalRemaining] = useState(30);

  // Stable refs so child components can call these without re-renders
  const policyRestoreRef   = useRef<((item: ScanHistoryItem) => void) | null>(null);
  const factcheckRestoreRef = useRef<((item: ScanHistoryItem) => void) | null>(null);

  const switchTab = useCallback((key: TabKey) => {
    if (key === activeTab) return;
    const curr = TAB_ORDER.indexOf(activeTab);
    const next = TAB_ORDER.indexOf(key);
    setDirection(next > curr ? 1 : -1);
    setActiveTab(key);
  }, [activeTab]);

  /** Called by child analyzers after each successful scan */
  const handleRemainingUpdate = useCallback((n: number) => {
    setGlobalRemaining(n);
  }, []);

  /** Called by HistoryPanel when user clicks an item */
  const handleRestore = useCallback((item: ScanHistoryItem) => {
    // Switch to the right tab first
    switchTab(item.type === "factcheck" ? "misinfo" : item.type as TabKey);

    // Then call the tab-specific restore handler (registered via ref)
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
    }, 280); // wait for tab transition to settle
  }, [switchTab]);

  /**
   * Called by UrlParamInit when the extension context menu / popup passes
   * ?url=&type=policy (or ?text=&type=fact, ?image=&type=image).
   * Switches to the right tab and pre-fills the input without firing an API call.
   */
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
      {/* ── URL param init (context menu / popup pre-fill) ───────────────────── */}
      <Suspense fallback={null}>
        <UrlParamInit onIntent={handleIntent} />
      </Suspense>

      {/* ── Rate limit bar ──────────────────────────────────────────────────── */}
      <div className="mb-6">
        <RateLimitBar remainingCalls={globalRemaining} />
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 p-1 rounded-[var(--radius)] mb-6 w-fit flex-wrap"
        style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
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
              className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{
                background: isActive ? "var(--bg4)" : "transparent",
                color: isActive ? "var(--text)" : "var(--text2)",
                boxShadow: isActive ? "0 1px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.comingSoon && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                  style={{
                    background: "rgba(91,156,246,0.15)",
                    color: "var(--accent)",
                    border: "1px solid rgba(91,156,246,0.2)",
                  }}
                >
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tool header card ─────────────────────────────────────────────────── */}
      <div
        className="rounded-[var(--radius)] px-6 py-5 mb-6"
        style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
      >
        <h2
          className="text-xl font-bold mb-1"
          style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}
        >
          {meta.title}
        </h2>
        <p className="text-sm" style={{ color: "var(--text2)" }}>
          {meta.description}
        </p>
      </div>

      {/* ── Animated tab panels ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ minHeight: 300 }}>
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

      {/* ── History panel ────────────────────────────────────────────────────── */}
      <HistoryPanel onRestore={handleRestore} />

      {/* ── Back link ────────────────────────────────────────────────────────── */}
      <div className="mt-10 pt-8" style={{ borderTop: "1px solid var(--border)" }}>
        <Button asChild variant="ghost" id="back-home-button">
          <Link href="/">← Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
