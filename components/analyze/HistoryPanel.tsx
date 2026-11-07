"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Clock, Trash2, X, FileText, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionHistory, type ScanHistoryItem } from "@/hooks/useSessionHistory";

interface HistoryPanelProps {
  onRestore: (item: ScanHistoryItem) => void;
}

const TYPE_META: Record<
  ScanHistoryItem["type"],
  { icon: React.ReactNode; label: string }
> = {
  policy:    { icon: <FileText size={13} className="text-white" />, label: "POLICY" },
  factcheck: { icon: <CheckCircle2 size={13} className="text-white" />, label: "FACT & JOB" },
  image:     { icon: <ImageIcon size={13} className="text-white" />, label: "MEDIA" },
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

function getResultBadge(item: ScanHistoryItem): { label: string; colorClass: string } | null {
  const r = item.result as Record<string, unknown>;
  if (item.type === "policy" && typeof r.riskLevel === "string") {
    const isSafe = r.riskLevel === "SAFE";
    const isDanger = r.riskLevel === "DANGER";
    return {
      label: r.riskLevel as string,
      colorClass: isSafe
        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
        : isDanger
        ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
        : "text-amber-400 border-amber-500/30 bg-amber-500/10",
    };
  }
  if (item.type === "factcheck" && typeof r.verdict === "string") {
    const v = (r.verdict as string).toUpperCase();
    const isPass = v.includes("TRUE") || v.includes("SUPPORTED") || v.includes("LEGITIMATE");
    const isFail = v.includes("FALSE") || v.includes("CONTRADICTED") || v.includes("SCAM");
    return {
      label: r.verdict as string,
      colorClass: isPass
        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
        : isFail
        ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
        : "text-amber-400 border-amber-500/30 bg-amber-500/10",
    };
  }
  if (item.type === "image" && typeof r.category === "string") {
    const cat = r.category as string;
    const isClean = cat === "CLEAN" || cat === "EDUCATIONAL";
    return {
      label: cat,
      colorClass: isClean
        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
        : "text-amber-400 border-amber-500/30 bg-amber-500/10",
    };
  }
  return null;
}

export default function HistoryPanel({ onRestore }: HistoryPanelProps) {
  const { history, deleteHistoryItem, clearHistory } = useSessionHistory();
  const [open, setOpen] = useState(false);

  if (history.length === 0 && !open) return null;

  return (
    <div className="rounded-xl overflow-hidden mt-8 border border-zinc-800 bg-zinc-950">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <button
        id="history-panel-toggle"
        className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-zinc-900/50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <Clock size={14} className="text-zinc-400" />
          <span className="text-xs font-semibold text-white tracking-tight">
            Session History Log
          </span>
          {history.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              {history.length}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp size={14} className="text-zinc-500" />
        ) : (
          <ChevronDown size={14} className="text-zinc-500" />
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
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-zinc-850">
              {history.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs font-mono text-zinc-500">
                  NO PREVIOUS QUERIES IN CURRENT WORKSPACE SESSION.
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-zinc-900 font-mono text-xs">
                    {history.map((item) => {
                      const meta = TYPE_META[item.type];
                      const badge = getResultBadge(item);
                      return (
                        <li key={item.id}>
                          <div className="flex items-center gap-3 px-5 py-3 group hover:bg-zinc-900/40 transition-colors">
                            <span className="p-1 rounded bg-zinc-900 border border-zinc-800 shrink-0">
                              {meta.icon}
                            </span>

                            <button
                              className="flex-1 text-left min-w-0"
                              onClick={() => onRestore(item)}
                              title="Click to restore this result"
                              id={`history-item-${item.id}`}
                            >
                              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-mono font-semibold tracking-wider text-zinc-400">
                                  {meta.label}
                                </span>
                                {badge && (
                                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${badge.colorClass}`}>
                                    {badge.label}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-300 truncate max-w-md font-sans">
                                {item.input || "—"}
                              </p>
                            </button>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[10px] text-zinc-600 hidden sm:block">
                                {relativeTime(item.timestamp)}
                              </span>
                              <button
                                onClick={() => deleteHistoryItem(item.id)}
                                className="p-1 rounded transition-colors text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                                title="Delete entry"
                                aria-label="Delete scan"
                                id={`history-delete-${item.id}`}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex items-center justify-between px-5 py-2.5 border-t border-zinc-900 bg-zinc-950 text-[11px] font-mono text-zinc-500">
                    <span>ON-DEVICE STORAGE ONLY</span>
                    <Button
                      id="history-clear-all"
                      variant="ghost"
                      size="sm"
                      onClick={clearHistory}
                      className="h-6 text-xs font-mono text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1"
                    >
                      <Trash2 size={11} />
                      PURGE LOG
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
