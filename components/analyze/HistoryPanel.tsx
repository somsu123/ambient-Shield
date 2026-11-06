"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionHistory, type ScanHistoryItem } from "@/hooks/useSessionHistory";

// ── Props ────────────────────────────────────────────────────────────────────
interface HistoryPanelProps {
  /** Called when the user clicks a history item to restore it */
  onRestore: (item: ScanHistoryItem) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_META: Record<
  ScanHistoryItem["type"],
  { icon: string; label: string; color: string }
> = {
  policy:    { icon: "📄", label: "Privacy Policy", color: "var(--accent)" },
  factcheck: { icon: "✅", label: "Fact Check",     color: "var(--safe)"   },
  image:     { icon: "🖼️", label: "Image Scan",     color: "var(--caution)"},
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1_000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (s < 60)  return `${s}s ago`;
  if (m < 60)  return `${m}m ago`;
  if (h < 24)  return `${h}h ago`;
  return `${d}d ago`;
}

/** Extract a human-readable verdict/risk badge label from a result object */
function getResultBadge(item: ScanHistoryItem): { label: string; color: string } | null {
  const r = item.result as Record<string, unknown>;
  if (item.type === "policy" && typeof r.riskLevel === "string") {
    const colors: Record<string, string> = { SAFE: "var(--safe)", CAUTION: "var(--caution)", DANGER: "var(--danger)" };
    return { label: r.riskLevel as string, color: colors[r.riskLevel as string] ?? "var(--text2)" };
  }
  if (item.type === "factcheck" && typeof r.verdict === "string") {
    const colors: Record<string, string> = { TRUE: "var(--safe)", LIKELY_TRUE: "var(--safe)", UNVERIFIED: "var(--accent)", MISLEADING: "var(--caution)", FALSE: "var(--danger)", SATIRE: "#a78bfa" };
    const labels: Record<string, string> = { TRUE: "True", LIKELY_TRUE: "Likely True", UNVERIFIED: "Unverified", MISLEADING: "Misleading", FALSE: "False", SATIRE: "Satire" };
    return { label: labels[r.verdict as string] ?? (r.verdict as string), color: colors[r.verdict as string] ?? "var(--text2)" };
  }
  if (item.type === "image" && typeof r.category === "string") {
    const colors: Record<string, string> = { CLEAN: "var(--safe)", EDUCATIONAL: "var(--safe)", ADULT: "var(--danger)", VIOLENCE: "var(--danger)", DEEPFAKE: "var(--caution)", ADULT_AD: "var(--danger)" };
    return { label: r.category as string, color: colors[r.category as string] ?? "var(--text2)" };
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HistoryPanel({ onRestore }: HistoryPanelProps) {
  const { history, deleteHistoryItem, clearHistory } = useSessionHistory();
  const [open, setOpen] = useState(false);

  if (history.length === 0 && !open) return null;

  return (
    <div
      className="rounded-[var(--radius)] overflow-hidden mt-8"
      style={{ border: "1px solid var(--border)", background: "var(--bg2)" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <button
        id="history-panel-toggle"
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors duration-150 hover:bg-[var(--bg3)]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <Clock size={15} style={{ color: "var(--accent)" }} />
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}
          >
            Recent Scans
          </span>
          {history.length > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(91,156,246,0.15)",
                color: "var(--accent)",
                border: "1px solid rgba(91,156,246,0.25)",
              }}
            >
              {history.length}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp size={15} style={{ color: "var(--text3)" }} />
        ) : (
          <ChevronDown size={15} style={{ color: "var(--text3)" }} />
        )}
      </button>

      {/* ── Expandable body ─────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="history-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {history.length === 0 ? (
                /* ── Empty state ──────────────────────────────────────────── */
                <div className="px-5 py-10 text-center">
                  <p className="text-sm" style={{ color: "var(--text3)" }}>
                    No recent scans. Results will appear here after your first analysis.
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Item list ─────────────────────────────────────────── */}
                  <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {history.map((item) => {
                      const meta = TYPE_META[item.type];
                      const badge = getResultBadge(item);
                      return (
                        <li key={item.id}>
                          <div className="flex items-center gap-3 px-5 py-3 group hover:bg-[var(--bg3)] transition-colors duration-150">
                            {/* Type icon */}
                            <span className="text-xl shrink-0 select-none" aria-hidden>
                              {meta.icon}
                            </span>

                            {/* Main content — clickable restore area */}
                            <button
                              className="flex-1 text-left min-w-0"
                              onClick={() => onRestore(item)}
                              title="Click to restore this result"
                              id={`history-item-${item.id}`}
                            >
                              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                <span
                                  className="text-[10px] font-semibold uppercase tracking-wider"
                                  style={{ color: meta.color }}
                                >
                                  {meta.label}
                                </span>
                                {badge && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{
                                      background: `${badge.color}18`,
                                      color: badge.color,
                                      border: `1px solid ${badge.color}40`,
                                    }}
                                  >
                                    {badge.label}
                                  </span>
                                )}
                              </div>
                              <p
                                className="text-xs truncate"
                                style={{ color: "var(--text2)", maxWidth: 420 }}
                              >
                                {item.input || "—"}
                              </p>
                            </button>

                            {/* Timestamp + delete */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className="text-[10px] hidden sm:block"
                                style={{ color: "var(--text3)" }}
                              >
                                {relativeTime(item.timestamp)}
                              </span>
                              <button
                                onClick={() => deleteHistoryItem(item.id)}
                                className="p-1.5 rounded-lg transition-colors duration-150 opacity-0 group-hover:opacity-100"
                                style={{ color: "var(--text3)" }}
                                title="Delete this entry"
                                aria-label="Delete scan"
                                id={`history-delete-${item.id}`}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* ── Footer ───────────────────────────────────────────── */}
                  <div
                    className="flex items-center justify-between px-5 py-3"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <span className="text-xs" style={{ color: "var(--text3)" }}>
                      Auto-clears after 24 hours
                    </span>
                    <Button
                      id="history-clear-all"
                      variant="ghost"
                      size="sm"
                      onClick={clearHistory}
                      className="gap-1.5 text-xs"
                      style={{ color: "var(--danger)" }}
                    >
                      <Trash2 size={12} />
                      Clear History
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
