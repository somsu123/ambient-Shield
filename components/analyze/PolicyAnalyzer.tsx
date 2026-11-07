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

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  useEffect(() => {
    if (!restoreRef) return;
    restoreRef.current = (item: ScanHistoryItem) => {
      if (item.type !== "policy") return;

      if (item.id === "__intent__") {
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

      if (data.cached) toast.success("⚡ Loaded from cache");
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
      toast.success("JSON copied");
    } catch { toast.error("Clipboard unavailable"); }
  }, [state.result]);

  const charCount  = state.textValue.length;
  const isOverLimit = charCount > 7000;
  const canSubmit  = !state.loading && !buttonCooldown.current &&
    (state.mode === "url" ? state.urlValue.trim().length > 0 : state.textValue.trim().length > 0);

  return (
    <div className="space-y-6">
      {/* ── Input mode toggle ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit bg-zinc-950 border border-zinc-800">
        {(["text", "url"] as InputMode[]).map((m) => (
          <button
            key={m}
            id={`policy-mode-${m}`}
            onClick={() => setMode(m)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              state.mode === m
                ? "bg-zinc-850 text-white border border-zinc-700/80 shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {m === "text" ? <FileText size={13} /> : <Link2 size={13} />}
            {m === "text" ? "PASTE TEXT" : "ENTER URL"}
          </button>
        ))}
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state.mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {state.mode === "url" ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="policy-url-input"
                type="url"
                placeholder="https://example.com/privacy-policy"
                value={state.urlValue}
                disabled={state.loading}
                onChange={(e) => setState((s) => ({ ...s, urlValue: e.target.value, error: null }))}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                className="flex-1 font-mono text-xs"
              />
              <Button
                id="policy-analyze-url-btn"
                onClick={handleAnalyze}
                disabled={!canSubmit}
                className="h-9 px-6 text-xs font-semibold"
              >
                {state.loading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Fetching &amp; Analyzing…
                  </>
                ) : (
                  "Analyze Policy"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Textarea
                  id="policy-text-input"
                  className="min-h-[160px] pr-4 font-mono text-xs bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:border-white focus-visible:ring-1 focus-visible:ring-white rounded-lg"
                  placeholder={"Paste privacy policy or terms of service text here…\n\ne.g. 'We collect your device IP, telemetry, browsing habits, and share with third-party advertising exchanges…'"}
                  value={state.textValue}
                  disabled={state.loading}
                  onChange={(e) => setState((s) => ({ ...s, textValue: e.target.value, error: null }))}
                />
                <span
                  className="absolute bottom-3 right-3 text-[10px] font-mono"
                  style={{ color: isOverLimit ? "var(--danger)" : "var(--text3)" }}
                >
                  {charCount}/7000
                </span>
              </div>
              <Button
                id="policy-analyze-text-btn"
                onClick={handleAnalyze}
                disabled={!canSubmit || isOverLimit}
                className="h-10 px-6 text-xs font-semibold w-full sm:w-auto"
              >
                {state.loading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Analyzing Offline Regex…
                  </>
                ) : (
                  "Analyze Policy"
                )}
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
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
              title="Parsing Policy Content"
              description="Extracting tracking clauses, data retention policies, and scoring liabilities offline."
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.result && !state.loading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="label-sm font-mono text-zinc-400">ANALYSIS COMPLETE</span>
              <div className="flex items-center gap-2">
                <Button
                  id="policy-copy-btn"
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
                  id="policy-clear-btn"
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
            <ResultCard
              type="policy"
              result={state.result}
              cached={state.cached}
              remainingCalls={state.remainingCalls}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Initial empty state ───────────────────────────────────────────── */}
      {!state.result && !state.loading && !state.error && (
        <EmptyState
          icon={<FileText size={20} className="text-zinc-400" />}
          title="No Policy Evaluated"
          description="Paste a privacy policy or enter a URL above. Cached results return instantaneously with zero telemetry."
        />
      )}
    </div>
  );
}
