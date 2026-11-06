"use client";

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CredibilityRing from "@/components/shared/CredibilityRing";
import EmptyState from "@/components/shared/EmptyState";
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Copy, Loader2, Search, Trash2, Zap } from "lucide-react";
import type { FactCheckResult, FactCheckVerdict } from "@/lib/types";
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

const VERDICT_MAP: Record<FactCheckVerdict, VerdictConfig> = {
  TRUE:        { icon: "✅", label: "True",        color: "var(--safe)",    bg: "rgba(62,207,142,0.1)",   border: "rgba(62,207,142,0.3)"  },
  LIKELY_TRUE: { icon: "✅", label: "Likely True",  color: "var(--safe)",    bg: "rgba(62,207,142,0.08)",  border: "rgba(62,207,142,0.25)" },
  UNVERIFIED:  { icon: "🔍", label: "Unverified",   color: "var(--accent)",  bg: "rgba(91,156,246,0.1)",   border: "rgba(91,156,246,0.3)"  },
  MISLEADING:  { icon: "⚠️", label: "Misleading",   color: "var(--caution)", bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.3)"  },
  FALSE:       { icon: "🚨", label: "False",         color: "var(--danger)",  bg: "rgba(255,77,109,0.1)",  border: "rgba(255,77,109,0.3)"  },
  SATIRE:      { icon: "😄", label: "Satire",        color: "#a78bfa",        bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.3)" },
};

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
        // Context menu intent — pre-fill text input only, don't show result card
        setState((s) => ({ ...s, text: item.input, result: null, error: null, loading: false }));
        return;
      }

      // Full history restore — show result card
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
      if (data.cached) toast.success("⚡ Loaded from cache — instant result");
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
      toast.success("Copied to clipboard");
    } catch { toast.error("Clipboard unavailable"); }
  }, [state.result]);

  const charCount   = state.text.length;
  const isOverLimit = charCount > 200;
  const canSubmit   = !state.loading && !isOverLimit && state.text.trim().length > 0;
  const verdictCfg  = state.result ? VERDICT_MAP[state.result.verdict] : null;

  return (
    <div className="space-y-6">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="relative">
          <Textarea id="factcheck-text-input" className="min-h-[140px] pr-4"
            placeholder={"Enter a claim to fact-check…\n\nExamples:\n\"The Great Wall of China is visible from space.\"\n\"Vaccines contain microchips.\""}
            value={state.text} disabled={state.loading} maxLength={220}
            onChange={(e) => setState((s) => ({ ...s, text: e.target.value, error: null }))} />
          <span className="absolute bottom-3 right-3 text-[10px] font-mono"
            style={{ color: isOverLimit ? "var(--danger)" : "var(--text3)" }}>
            {charCount}/200
          </span>
        </div>
        <Button id="factcheck-submit-btn" onClick={handleCheck} disabled={!canSubmit} className="w-full sm:w-auto gap-2">
          {state.loading ? <><Loader2 size={14} className="animate-spin" />Checking…</> : <><Search size={14} />Check Facts</>}
        </Button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm overflow-hidden"
            style={{ background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.25)", color: "var(--danger)" }}>
            <AlertCircle size={15} className="shrink-0 mt-0.5" />{state.error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState icon="🔍" title="Analyzing claim…" description="Checking cache first, then querying Gemini if needed." />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.result && !state.loading && verdictCfg && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: "easeOut" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="label-sm">Fact-Check Complete</span>
              <div className="flex items-center gap-2">
                <Button id="factcheck-copy-btn" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                  {state.copied ? <><Check size={13} style={{ color: "var(--safe)" }} />Copied</> : <><Copy size={13} />Copy JSON</>}
                </Button>
                <Button id="factcheck-clear-btn" variant="ghost" size="sm" onClick={handleClear} className="gap-1.5">
                  <Trash2 size={13} />Clear
                </Button>
              </div>
            </div>

            <div className="rounded-[var(--radius)] overflow-hidden" style={{ border: "1px solid var(--border2)", background: "var(--bg2)" }}>
              {/* Header */}
              <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-bold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}>Fact-Check Result</span>
                {state.cached && (
                  <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium"
                    style={{ background: "rgba(91,156,246,0.12)", color: "var(--accent)", border: "1px solid rgba(91,156,246,0.25)" }}>
                    <Zap size={10} />Loaded from cache
                  </span>
                )}
              </div>

              <div className="p-6 space-y-6">
                {/* Verdict + Ring */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  <div className="flex-1 flex flex-col items-center sm:items-start gap-3">
                    <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl"
                      style={{ background: verdictCfg.bg, border: `1px solid ${verdictCfg.border}` }}>
                      <span className="text-3xl leading-none" aria-hidden>{verdictCfg.icon}</span>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: verdictCfg.color, opacity: 0.7 }}>Verdict</p>
                        <p className="text-xl font-extrabold leading-none" style={{ fontFamily: "Syne, sans-serif", color: verdictCfg.color }}>{verdictCfg.label}</p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text2)" }}>{state.result.explanation}</p>
                  </div>
                  <div className="shrink-0"><CredibilityRing score={state.result.credibilityScore} size={120} strokeWidth={10} /></div>
                </div>

                {/* Summary */}
                <div className="rounded-xl px-5 py-4" style={{ background: "rgba(91,156,246,0.07)", border: "1px solid rgba(91,156,246,0.2)" }}>
                  <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "var(--accent)" }}>Plain-English Summary</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{state.result.simpleSummary}</p>
                </div>

                {/* Red flags */}
                {state.result.redFlags.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: "var(--danger)" }}>⚠ Red Flags</p>
                    <ul className="space-y-2">
                      {state.result.redFlags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
                          <span style={{ color: "var(--text2)" }}>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* What to verify */}
                {state.result.whatToCheck.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: "var(--safe)" }}>✓ What to Verify</p>
                    <ul className="space-y-2">
                      {state.result.whatToCheck.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: "var(--safe)" }} />
                          <span style={{ color: "var(--text2)" }}>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 text-xs" style={{ color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
                  <span>Powered by Gemini 2.5 Flash</span>
                  <span>{state.remainingCalls} AI calls remaining today</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!state.result && !state.loading && !state.error && (
        <EmptyState icon="✅" title="No claim analyzed yet"
          description="Enter any factual claim above — news headlines, social media posts, or things you've heard. Cached results return instantly." />
      )}
    </div>
  );
}
