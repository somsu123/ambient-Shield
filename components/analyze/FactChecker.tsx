"use client";

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CredibilityRing from "@/components/shared/CredibilityRing";
import EmptyState from "@/components/shared/EmptyState";
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Copy, Loader2, Search, Trash2, Zap } from "lucide-react";
import type { FactCheckResult } from "@/lib/types";
import type { ScanResponse } from "@/types/extension";
import { scanFact } from "@/lib/extension-api";
import { hashKey } from "@/lib/hash";
import { useSessionHistory } from "@/hooks/useSessionHistory";
import type { ScanHistoryItem } from "@/hooks/useSessionHistory";

// ── Props ─────────────────────────────────────────────────────────────────────
interface FactCheckerProps {
  onRemainingUpdate?: (n: number) => void;
  restoreRef?: MutableRefObject<((item: ScanHistoryItem) => void) | null>;
}

// ── Verdict config ────────────────────────────────────────────────────────────
interface VerdictConfig { icon: string; label: string; color: string; bg: string; border: string; }

function getVerdictConfig(verdictStr: string): VerdictConfig {
  const v = (verdictStr || "").toUpperCase();
  if (v.includes("TRUE") || v.includes("SUPPORTED") || v.includes("LEGITIMATE")) {
    return { icon: "✓", label: verdictStr || "Supported by sources", color: "var(--safe)", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)" };
  }
  if (v.includes("FALSE") || v.includes("CONTRADICTED") || v.includes("SCAM")) {
    return { icon: "✕", label: verdictStr || "Contradicted by sources", color: "var(--danger)", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)" };
  }
  return { icon: "?", label: verdictStr || "Unverified / Needs Direct Check", color: "var(--caution)", bg: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.25)" };
}

// ── Component state ───────────────────────────────────────────────────────────
interface State {
  text: string; loading: boolean; result: FactCheckResult | null;
  cached: boolean; remainingCalls: number; error: string | null; copied: boolean;
}
const INITIAL: State = { text: "", loading: false, result: null, cached: false, remainingCalls: 0, error: null, copied: false };

export default function FactChecker({ onRemainingUpdate, restoreRef }: FactCheckerProps) {
  const [state, setState] = useState<State>(INITIAL);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonCooldown = useRef(false);
  const { addHistory } = useSessionHistory();

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Register restore callback
  useEffect(() => {
    if (!restoreRef) return;
    restoreRef.current = (item: ScanHistoryItem) => {
      if (item.type !== "factcheck") return;

      if (item.id === "__intent__") {
        setState((s) => ({ ...s, text: item.input, result: null, error: null, loading: false }));
        return;
      }

      setState((s) => ({
        ...s,
        text: item.input,
        result: item.result as FactCheckResult,
        cached: true, loading: false, error: null,
      }));
    };
    return () => { if (restoreRef) restoreRef.current = null; };
  }, [restoreRef]);

  const handleCheck = useCallback(async () => {
    if (buttonCooldown.current || state.loading) return;
    const text = state.text.trim();
    if (!text) { setState((s) => ({ ...s, error: "Please enter a claim to fact-check." })); return; }

    buttonCooldown.current = true;
    debounceRef.current = setTimeout(() => { buttonCooldown.current = false; }, 1_500);
    setState((s) => ({ ...s, loading: true, error: null, result: null }));

    try {
      const data: ScanResponse = await scanFact(text);

      if (!data.success || !data.result) {
        const msg = data.error ?? "Fact-check failed. Please try again.";
        setState((s) => ({ ...s, loading: false, error: msg, remainingCalls: data.remainingCalls ?? s.remainingCalls }));
        toast.error(msg);
        return;
      }

      const historyItem: ScanHistoryItem = {
        id: hashKey("factcheck", text),
        type: "factcheck",
        input: text.slice(0, 80),
        result: data.result,
        timestamp: Date.now(),
        cached: data.cached ?? false,
      };
      addHistory(historyItem);

      const remaining = data.remainingCalls ?? state.remainingCalls;
      onRemainingUpdate?.(remaining);

      setState((s) => ({ ...s, loading: false, result: data.result!, cached: data.cached ?? false, remainingCalls: remaining, error: null }));
      if (data.cached) toast.success("⚡ Loaded from cache");
    } catch {
      const msg = "Network error — please check your connection.";
      setState((s) => ({ ...s, loading: false, error: msg }));
      toast.error(msg);
    }
  }, [state, addHistory, onRemainingUpdate]);

  const handleClear = useCallback(() => setState(INITIAL), []);

  const handleCopy = useCallback(async () => {
    if (!state.result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.result, null, 2));
      setState((s) => ({ ...s, copied: true }));
      setTimeout(() => setState((s) => ({ ...s, copied: false })), 2_000);
      toast.success("JSON copied");
    } catch { toast.error("Clipboard unavailable"); }
  }, [state.result]);

  const charCount   = state.text.length;
  const isOverLimit = charCount > 5000;
  const canSubmit   = !state.loading && !isOverLimit && state.text.trim().length > 0;
  const verdictCfg  = state.result ? getVerdictConfig(String(state.result.verdict)) : null;

  return (
    <div className="space-y-6">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="relative">
          <Textarea
            id="factcheck-text-input"
            className="min-h-[140px] pr-4 font-mono text-xs bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:border-white focus-visible:ring-1 focus-visible:ring-white rounded-lg"
            placeholder={"Paste a claim, news headline, or job notice to verify…\n\nExamples:\n\"HIRING FRESHERS | HETERO | SANATH NAGAR, HYDERABAD\"\n\"The Great Wall of China is visible from space with the naked eye.\""}
            value={state.text}
            disabled={state.loading}
            maxLength={5200}
            onChange={(e) => setState((s) => ({ ...s, text: e.target.value, error: null }))}
          />
          <span
            className="absolute bottom-3 right-3 text-[10px] font-mono"
            style={{ color: isOverLimit ? "var(--danger)" : "var(--text3)" }}
          >
            {charCount}/5000
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Button
            id="factcheck-submit-btn"
            onClick={handleCheck}
            disabled={!canSubmit}
            className="h-10 px-6 text-xs font-semibold"
          >
            {state.loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Executing Pipeline…
              </>
            ) : (
              <>
                <Search size={13} />
                Scan &amp; Verify
              </>
            )}
          </Button>

          <span className="text-[11px] font-mono text-zinc-500">
            AUTO-CLASSIFIES JOB VS CLAIM &middot; 100% PRIVATE
          </span>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 rounded-lg px-4 py-3 text-xs overflow-hidden bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono"
          >
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {state.error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState
              icon={<Loader2 size={24} className="animate-spin text-white" />}
              title="Executing Multi-Source Verification Pipeline"
              description="Extracting entities, searching DDG Lite & Wikipedia, reading citations, and prompting local Gemma model."
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.result && !state.loading && verdictCfg && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="label-sm font-mono text-zinc-400">AUDIT VERDICT COMPLETE</span>
              <div className="flex items-center gap-2">
                <Button
                  id="factcheck-copy-btn"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 text-xs font-mono"
                >
                  {state.copied ? (
                    <>
                      <Check size={11} className="text-emerald-400" />
                      COPIED
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      COPY JSON
                    </>
                  )}
                </Button>
                <Button
                  id="factcheck-clear-btn"
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="h-7 text-xs font-mono text-zinc-500 hover:text-white"
                >
                  <Trash2 size={11} />
                  CLEAR
                </Button>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
              {/* Header */}
              <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 border-b border-zinc-850">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold text-white">
                  VERIFICATION RESULT
                </span>
                {state.cached && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center gap-1">
                    <Zap size={10} />
                    CACHED
                  </span>
                )}
              </div>

              <div className="p-6 space-y-6">
                {/* Verdict + Ring */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 pb-6 border-b border-zinc-900">
                  <div className="flex-1 flex flex-col items-center sm:items-start gap-3">
                    <div
                      className="inline-flex items-center gap-3 px-4 py-2.5 rounded-lg"
                      style={{ background: verdictCfg.bg, border: `1px solid ${verdictCfg.border}` }}
                    >
                      <span className="text-xl font-bold font-mono" style={{ color: verdictCfg.color }}>
                        {verdictCfg.icon}
                      </span>
                      <div>
                        <p className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">
                          VERDICT STATUS
                        </p>
                        <p className="text-base font-bold tracking-tight" style={{ color: verdictCfg.color }}>
                          {verdictCfg.label}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed max-w-lg">
                      {state.result.explanation}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <CredibilityRing score={state.result.credibilityScore} size={110} strokeWidth={8} />
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-lg p-4 bg-zinc-900/40 border border-zinc-800">
                  <p className="text-[10px] uppercase font-mono tracking-widest font-semibold text-zinc-400 mb-1">
                    Executive Summary
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {state.result.simpleSummary}
                  </p>
                </div>

                {/* Red flags */}
                {state.result.redFlags && state.result.redFlags.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-mono tracking-widest font-semibold text-rose-400">
                      ⚠ Identified Risk Signals
                    </p>
                    <ul className="space-y-1.5">
                      {state.result.redFlags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-rose-400" />
                          <span className="text-zinc-300 leading-relaxed">{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Job Checklist (if job) */}
                {Boolean((state.result as any).checklist) && (
                  <div className="space-y-3 pt-2 border-t border-zinc-900">
                    <p className="text-[10px] uppercase font-mono tracking-widest font-semibold text-zinc-400">
                      📋 7-Point Legitimacy Checklist
                    </p>
                    <div className="space-y-2">
                      {Object.values(
                        (state.result as any).checklist as Record<
                          string,
                          { label: string; status: string; detail: string; url?: string }
                        >
                      ).map((c, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-white">{c.label}</p>
                            <p className="text-zinc-400 mt-0.5 leading-relaxed">{c.detail}</p>
                            {c.url && (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-mono text-zinc-300 hover:text-white underline mt-1 inline-block"
                              >
                                View Evidence Source ↗
                              </a>
                            )}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                              c.status === "pass"
                                ? "text-emerald-400 bg-emerald-950/40 border border-emerald-500/30"
                                : c.status === "fail"
                                ? "text-rose-400 bg-rose-950/40 border border-rose-500/30"
                                : "text-zinc-400 bg-zinc-900 border border-zinc-800"
                            }`}
                          >
                            {c.status === "pass" ? "✓ PASS" : c.status === "fail" ? "✕ RISK" : "? UNVERIFIED"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Job Actionable Advice */}
                {Boolean((state.result as any).advice && (state.result as any).advice.length > 0) && (
                  <div className="rounded-lg p-4 border border-zinc-800 bg-zinc-900/30 text-xs">
                    <p className="text-[10px] uppercase font-mono tracking-widest font-semibold text-zinc-300 mb-2">
                      Actionable Safeguards
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                      {((state.result as any).advice as string[]).map((tip, i) => (
                        <li key={i} className="leading-relaxed">{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Verified Citations */}
                {Boolean((state.result as any).citations && (state.result as any).citations.length > 0) && (
                  <div className="space-y-3 pt-2 border-t border-zinc-900">
                    <p className="text-[10px] uppercase font-mono tracking-widest font-semibold text-zinc-400">
                      Exact Substring Citations
                    </p>
                    <div className="space-y-2">
                      {((state.result as any).citations as Array<{ url: string; quote: string; source?: string }>).map((c, i) => (
                        <div key={i} className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs font-mono">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-white">{c.source || "External Source"}</span>
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 hover:text-white underline">
                              Direct Link ↗
                            </a>
                          </div>
                          <p className="text-zinc-400 border-l border-zinc-700 pl-2 mt-1 italic">&ldquo;{c.quote}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 text-[11px] font-mono text-zinc-600 border-t border-zinc-900">
                  <span>LOCAL GEMMA &middot; 0% TELEMETRY</span>
                  <span>100% PRIVATE ON-DEVICE</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!state.result && !state.loading && !state.error && (
        <EmptyState
          icon={<Search size={20} className="text-zinc-400" />}
          title="Scanner Ready"
          description="Enter a hiring notice, social headline, or claim to initiate multi-source verification and local Gemma analysis."
        />
      )}
    </div>
  );
}
