"use client";

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ResultCard from "@/components/shared/ResultCard";
import EmptyState from "@/components/shared/EmptyState";
import { Link2, FileText, Loader2, Trash2, Copy, Check, AlertCircle } from "lucide-react";
import type { PolicyResult } from "@/lib/types";
import type { ScanResponse } from "@/types/extension";
import { scanPolicy } from "@/lib/extension-api";
import { hashKey } from "@/lib/hash";
import { useSessionHistory } from "@/hooks/useSessionHistory";
import type { ScanHistoryItem } from "@/hooks/useSessionHistory";

// ── Props ─────────────────────────────────────────────────────────────────────
interface PolicyAnalyzerProps {
  onRemainingUpdate?: (n: number) => void;
  restoreRef?: MutableRefObject<((item: ScanHistoryItem) => void) | null>;
}

// ── Component state ───────────────────────────────────────────────────────────
type InputMode = "text" | "url";

interface State {
  mode: InputMode;
  urlValue: string;
  textValue: string;
  loading: boolean;
  result: PolicyResult | null;
  cached: boolean;
  remainingCalls: number;
  error: string | null;
  copied: boolean;
}

const INITIAL: State = {
  mode: "text", urlValue: "", textValue: "",
  loading: false, result: null, cached: false,
  remainingCalls: 0, error: null, copied: false,
};

export default function PolicyAnalyzer({ onRemainingUpdate, restoreRef }: PolicyAnalyzerProps) {
  const [state, setState] = useState<State>(INITIAL);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonCooldown = useRef(false);
  const { addHistory } = useSessionHistory();

  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Register restore callback so AnalyzeTabs can call it when user clicks history item
  // OR when context menu / popup sends a URL intent (id === '__intent__')
  useEffect(() => {
    if (!restoreRef) return;
    restoreRef.current = (item: ScanHistoryItem) => {
      if (item.type !== "policy") return;

      if (item.id === "__intent__") {
        // Context menu / popup intent — pre-fill input only, don't show result card
        const isUrl = item.input.startsWith("http://") || item.input.startsWith("https://");
        setState((s) => ({
          ...s,
          mode: isUrl ? "url" : "text",
          urlValue: isUrl ? item.input : s.urlValue,
          textValue: isUrl ? s.textValue : item.input,
          result: null, error: null, loading: false,
        }));
        return;
      }

      // Full history restore — show result card
      setState((s) => ({
        ...s,
        result: item.result as PolicyResult,
        cached: true,
        textValue: item.input,
        error: null,
        loading: false,
      }));
    };
    return () => { if (restoreRef) restoreRef.current = null; };
  }, [restoreRef]);

  const setMode = useCallback((mode: InputMode) => {
    setState((s) => ({ ...s, mode, error: null }));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (buttonCooldown.current || state.loading) return;
    const input = state.mode === "url" ? state.urlValue.trim() : state.textValue.trim();
    if (!input) {
      setState((s) => ({ ...s, error: state.mode === "url" ? "Please enter a URL to analyze." : "Please paste some policy text." }));
      return;
    }

    buttonCooldown.current = true;
    debounceRef.current = setTimeout(() => { buttonCooldown.current = false; }, 1_500);
    setState((s) => ({ ...s, loading: true, error: null, result: null }));

    try {
      const urlArg  = state.mode === "url"  ? input : undefined;
      const textArg = state.mode === "text" ? input.slice(0, 7000) : undefined;
      const data: ScanResponse = await scanPolicy(urlArg, textArg);

      if (!data.success || !data.result) {
        const msg = data.error ?? "Analysis failed. Please try again.";
        setState((s) => ({ ...s, loading: false, error: msg, remainingCalls: data.remainingCalls ?? s.remainingCalls }));
        toast.error(msg);
        return;
      }

      // Save to session history
      const historyItem: ScanHistoryItem = {
        id: hashKey("policy", input),
        type: "policy",
        input: input.slice(0, 80),
        result: data.result,
        timestamp: Date.now(),
        cached: data.cached ?? false,
      };
      addHistory(historyItem);

      const remaining = data.remainingCalls ?? state.remainingCalls;
      onRemainingUpdate?.(remaining);

      setState((s) => ({
        ...s, loading: false, result: data.result!,
        cached: data.cached ?? false, remainingCalls: remaining, error: null,
      }));

      if (data.cached) toast.success("⚡ Loaded from cache — instant result");
    } catch {
      const msg = "Network error — please check your connection and try again.";
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

  const charCount  = state.textValue.length;
  const isOverLimit = charCount > 7000;
  const canSubmit  = !state.loading && !buttonCooldown.current &&
    (state.mode === "url" ? state.urlValue.trim().length > 0 : state.textValue.trim().length > 0);

  return (
    <div className="space-y-6">
      {/* ── Input mode toggle ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}>
        {(["text", "url"] as InputMode[]).map((m) => (
          <button key={m} id={`policy-mode-${m}`} onClick={() => setMode(m)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{ background: state.mode === m ? "var(--bg4)" : "transparent", color: state.mode === m ? "var(--text)" : "var(--text2)", boxShadow: state.mode === m ? "0 1px 4px rgba(0,0,0,0.3)" : "none" }}>
            {m === "text" ? <FileText size={14} /> : <Link2 size={14} />}
            {m === "text" ? "Paste Text" : "Enter URL"}
          </button>
        ))}
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div key={state.mode}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {state.mode === "url" ? (
            <div className="flex gap-3">
              <Input id="policy-url-input" type="url" placeholder="https://example.com/privacy"
                value={state.urlValue} disabled={state.loading}
                onChange={(e) => setState((s) => ({ ...s, urlValue: e.target.value, error: null }))}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                className="flex-1" />
              <Button id="policy-analyze-url-btn" onClick={handleAnalyze} disabled={!canSubmit}>
                {state.loading ? <><Loader2 size={14} className="animate-spin" />Analyzing…</> : "Analyze Policy"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Textarea id="policy-text-input" className="min-h-[160px] pr-4"
                  placeholder={"Paste a privacy policy here…\n\ne.g. 'We collect your name, email, location, and device identifiers. We share this data with our advertising partners…'"}
                  value={state.textValue} disabled={state.loading}
                  onChange={(e) => setState((s) => ({ ...s, textValue: e.target.value, error: null }))} />
                <span className="absolute bottom-3 right-3 text-[10px] font-mono"
                  style={{ color: isOverLimit ? "var(--danger)" : "var(--text3)" }}>
                  {charCount}/7000
                </span>
              </div>
              <Button id="policy-analyze-text-btn" onClick={handleAnalyze}
                disabled={!canSubmit || isOverLimit} className="w-full sm:w-auto">
                {state.loading
                  ? <><Loader2 size={14} className="animate-spin" />Analyzing… (or checking cache)</>
                  : "Analyze Policy"}
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
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
            <EmptyState icon="🔍" title="Analyzing policy…" description="Scanning with offline heuristics engine and local Gemma LLM." />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.result && !state.loading && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: "easeOut" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="label-sm">Analysis Complete</span>
              <div className="flex items-center gap-2">
                <Button id="policy-copy-btn" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                  {state.copied ? <><Check size={13} style={{ color: "var(--safe)" }} />Copied</> : <><Copy size={13} />Copy JSON</>}
                </Button>
                <Button id="policy-clear-btn" variant="ghost" size="sm" onClick={handleClear} className="gap-1.5">
                  <Trash2 size={13} />Clear
                </Button>
              </div>
            </div>
            <ResultCard type="policy" result={state.result} cached={state.cached} remainingCalls={state.remainingCalls} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Initial empty state ───────────────────────────────────────────── */}
      {!state.result && !state.loading && !state.error && (
        <EmptyState icon="📄" title="No analysis yet"
          description="Paste a privacy policy or enter a URL above. Cached results return instantly and are free." />
      )}
    </div>
  );
}
