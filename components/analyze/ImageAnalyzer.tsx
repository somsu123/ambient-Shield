"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/shared/EmptyState";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Image as ImageIcon,
  Link2, Loader2, ShieldAlert, ShieldCheck, Trash2, Upload, Zap,
} from "lucide-react";
import type { ImageAnalysisResult } from "@/lib/types";
import type { ScanResponse } from "@/types/extension";
import { scanImage } from "@/lib/extension-api";
import { useSessionHistory } from "@/hooks/useSessionHistory";
import type { ScanHistoryItem } from "@/hooks/useSessionHistory";
import { hashKey } from "@/lib/hash";

interface ImageAnalyzerProps {
  onRemainingUpdate?: (n: number) => void;
}

type InputMode = "url" | "file";

interface State {
  mode: InputMode;
  urlValue: string;
  file: File | null;
  filePreview: string | null;
  loading: boolean;
  result: ImageAnalysisResult | null;
  phase: number | null;
  cached: boolean;
  remainingCalls: number;
  error: string | null;
}

const INITIAL: State = {
  mode: "url", urlValue: "", file: null, filePreview: null,
  loading: false, result: null, phase: null, cached: false,
  remainingCalls: 0, error: null,
};

interface CategoryCfg { label: string; icon: string; color: string; bg: string; border: string; }

const CATEGORY_MAP: Record<string, CategoryCfg> = {
  CLEAN:       { label: "Clean / Authentic", icon: "✓", color: "var(--safe)",    bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.25)"  },
  EDUCATIONAL: { label: "Educational",       icon: "✓", color: "var(--safe)",    bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.25)"  },
  DEEPFAKE:    { label: "Manipulated Media", icon: "⚠", color: "var(--caution)", bg: "rgba(234,179,8,0.08)",  border: "rgba(234,179,8,0.25)"  },
  ADULT:       { label: "Restricted Adult",  icon: "✕", color: "var(--danger)",  bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)"  },
  ADULT_AD:    { label: "Restricted Ad",     icon: "✕", color: "var(--danger)",  bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)"  },
  VIOLENCE:    { label: "Flagged Content",   icon: "✕", color: "var(--danger)",  bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)"  },
};

const PHASE_LABEL: Record<number, string> = {
  1: "URL Heuristics",
  2: "Text AI",
  3: "Vision Forensics",
};

export default function ImageAnalyzer({ onRemainingUpdate }: ImageAnalyzerProps) {
  const [state, setState] = useState<State>(INITIAL);
  const buttonCooldown    = useRef(false);
  const dropRef           = useRef<HTMLDivElement>(null);
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const { addHistory }    = useSessionHistory();

  useEffect(() => {
    return () => {
      if (state.filePreview) URL.revokeObjectURL(state.filePreview);
    };
  }, [state.filePreview]);

  const handleFileChange = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (JPG, PNG, WebP, etc.)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setState((s) => {
      if (s.filePreview) URL.revokeObjectURL(s.filePreview);
      return {
        ...s, file,
        filePreview: URL.createObjectURL(file),
        result: null, error: null,
      };
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.style.borderColor = "#ffffff";
  }, []);

  const handleDragLeave = useCallback(() => {
    if (dropRef.current) dropRef.current.style.borderColor = "";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.style.borderColor = "";
    const file = e.dataTransfer.files[0] ?? null;
    handleFileChange(file);
  }, [handleFileChange]);

  const handleScan = useCallback(async () => {
    if (buttonCooldown.current || state.loading) return;

    if (state.mode === "url" && !state.urlValue.trim()) {
      setState((s) => ({ ...s, error: "Please enter an image URL." }));
      return;
    }
    if (state.mode === "file" && !state.file) {
      setState((s) => ({ ...s, error: "Please select an image file." }));
      return;
    }

    buttonCooldown.current = true;
    setTimeout(() => { buttonCooldown.current = false; }, 2_000);
    setState((s) => ({ ...s, loading: true, error: null, result: null, phase: null }));

    try {
      let data: ScanResponse;
      if (state.mode === "file" && state.file) {
        data = await scanImage(undefined, state.file);
      } else {
        data = await scanImage(state.urlValue.trim());
      }

      if (!data.success || !data.result) {
        const msg = data.error ?? "Image scan failed. Please try again.";
        setState((s) => ({
          ...s, loading: false, error: msg,
          remainingCalls: data.remainingCalls ?? s.remainingCalls,
        }));
        toast.error(msg);
        return;
      }

      const result = data.result as ImageAnalysisResult;
      const inputPreview = state.mode === "url"
        ? state.urlValue.trim()
        : state.file?.name ?? "uploaded image";

      const historyItem: ScanHistoryItem = {
        id: hashKey("image", inputPreview),
        type: "image",
        input: inputPreview.slice(0, 80),
        result: data.result,
        timestamp: Date.now(),
        cached: data.cached ?? false,
      };
      addHistory(historyItem);

      const remaining = data.remainingCalls ?? state.remainingCalls;
      onRemainingUpdate?.(remaining);

      setState((s) => ({
        ...s, loading: false, result,
        phase: data.phase ?? null,
        cached: data.cached ?? false,
        remainingCalls: remaining,
        error: null,
      }));

      if (data.cached) toast.success("⚡ Loaded from cache");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error.";
      setState((s) => ({ ...s, loading: false, error: msg }));
      toast.error(msg);
    }
  }, [state, addHistory, onRemainingUpdate]);

  const handleClear = useCallback(() => {
    setState((s) => {
      if (s.filePreview) URL.revokeObjectURL(s.filePreview);
      return INITIAL;
    });
  }, []);

  const cfg = state.result
    ? (CATEGORY_MAP[state.result.category] ?? CATEGORY_MAP.CLEAN)
    : null;

  const confidencePct = state.result
    ? Math.round(state.result.confidence * 100)
    : 0;

  const canScan = !state.loading && !buttonCooldown.current && (
    state.mode === "url" ? state.urlValue.trim().length > 0 : state.file !== null
  );

  return (
    <div className="space-y-6">
      {/* ── Mode toggle ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit bg-zinc-950 border border-zinc-800">
        {(["url", "file"] as InputMode[]).map((m) => (
          <button
            key={m}
            id={`image-mode-${m}`}
            onClick={() => setState((s) => ({ ...s, mode: m, error: null }))}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              state.mode === m
                ? "bg-zinc-850 text-white border border-zinc-700/80 shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {m === "url" ? <Link2 size={13} /> : <Upload size={13} />}
            {m === "url" ? "IMAGE URL" : "UPLOAD FILE"}
          </button>
        ))}
      </div>

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state.mode}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
        >
          {state.mode === "url" ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="image-url-input"
                type="url"
                placeholder="https://example.com/asset-inspection.jpg"
                value={state.urlValue}
                disabled={state.loading}
                onChange={(e) => setState((s) => ({ ...s, urlValue: e.target.value, error: null }))}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                className="flex-1 font-mono text-xs"
              />
              <Button
                id="image-scan-url-btn"
                onClick={handleScan}
                disabled={!canScan}
                className="h-9 px-6 text-xs font-semibold"
              >
                {state.loading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Inspecting…
                  </>
                ) : (
                  "Inspect Media"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                ref={dropRef}
                id="image-dropzone"
                className="relative rounded-xl border-2 border-dashed border-zinc-800 bg-zinc-950/80 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors p-8 min-h-[160px] hover:border-zinc-600"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Click or drag to upload an image"
              >
                {state.filePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={state.filePreview}
                    alt="Preview"
                    className="max-h-48 max-w-full rounded-lg object-contain border border-zinc-800"
                  />
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                      <ImageIcon size={20} />
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-medium text-white block">
                        Select file or drag image here
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500 mt-1 block">
                        PNG, JPG, WEBP, GIF &middot; MAX 10 MB
                      </span>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  id="image-file-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </div>

              {state.file && (
                <div className="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
                  <span>{state.file.name}</span>
                  <span>{(state.file.size / 1024).toFixed(0)} KB</span>
                </div>
              )}

              <Button
                id="image-scan-file-btn"
                onClick={handleScan}
                disabled={!canScan}
                className="h-10 px-6 text-xs font-semibold w-full sm:w-auto"
              >
                {state.loading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Inspecting…
                  </>
                ) : (
                  "Inspect Media"
                )}
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 rounded-lg px-4 py-3 text-xs overflow-hidden bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono"
          >
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {state.error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState
              icon={<Loader2 size={24} className="animate-spin text-white" />}
              title="Running Visual Forensics"
              description="Evaluating file header heuristics, compression anomalies, and local Gemma vision inference."
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result card ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.result && cfg && !state.loading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
              {/* Header */}
              <div
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-850"
                style={{ background: cfg.bg }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl font-mono font-bold" style={{ color: cfg.color }}>{cfg.icon}</span>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider font-semibold" style={{ color: cfg.color }}>
                      {cfg.label}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {state.result.reason}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap font-mono text-[11px]">
                  {state.phase !== null && (
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                      PHASE {state.phase}: {PHASE_LABEL[state.phase] ?? "AI"}
                    </span>
                  )}
                  {state.cached && (
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1">
                      <Zap size={10} /> CACHED
                    </span>
                  )}
                  {state.result.shouldBlock ? (
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold flex items-center gap-1">
                      <ShieldAlert size={11} /> RESTRICTED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1">
                      <ShieldCheck size={11} /> SAFE
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono mb-2">
                    <span className="text-zinc-400">AUTHENTICITY CONFIDENCE</span>
                    <span className="font-semibold text-white">{confidencePct}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden bg-zinc-900 border border-zinc-850">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${confidencePct}%`, background: cfg.color }}
                    />
                  </div>
                </div>

                {state.result.indicators && state.result.indicators.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                      Detected Artifacts &amp; Signals
                    </p>
                    <ul className="space-y-1.5">
                      {state.result.indicators.map((ind, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-400" />
                          <span className="text-zinc-300">{ind}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Footer disclaimer */}
                <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-zinc-900 gap-3 text-[11px] font-mono text-zinc-500">
                  <span>DISCLAIMER: FORENSIC HEURISTICS ARE INDICATIVE &middot; 100% PRIVATE</span>
                  <Button
                    id="image-clear-btn"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-7 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    <Trash2 size={11} /> CLEAR
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!state.result && !state.loading && !state.error && (
        <EmptyState
          icon={<ImageIcon size={20} className="text-zinc-400" />}
          title="Media Inspector Ready"
          description="Enter an image URL or upload an image file. URL heuristics evaluate instantly; multimodal inference executes on-device."
        />
      )}
    </div>
  );
}
