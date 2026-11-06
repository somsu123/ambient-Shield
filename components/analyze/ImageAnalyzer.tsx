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

// ── Props ─────────────────────────────────────────────────────────────────────
interface ImageAnalyzerProps {
  onRemainingUpdate?: (n: number) => void;
}

// ── State ─────────────────────────────────────────────────────────────────────
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

// ── Category config ────────────────────────────────────────────────────────────
interface CategoryCfg { label: string; icon: string; color: string; bg: string; border: string; }

const CATEGORY_MAP: Record<string, CategoryCfg> = {
  CLEAN:       { label: "Clean",         icon: "✅", color: "var(--safe)",    bg: "rgba(62,207,142,0.08)",  border: "rgba(62,207,142,0.25)"  },
  EDUCATIONAL: { label: "Educational",   icon: "📚", color: "var(--safe)",    bg: "rgba(62,207,142,0.08)",  border: "rgba(62,207,142,0.25)"  },
  DEEPFAKE:    { label: "Deepfake",      icon: "🎭", color: "var(--caution)", bg: "rgba(245,166,35,0.08)",  border: "rgba(245,166,35,0.25)"  },
  ADULT:       { label: "Adult Content", icon: "🔞", color: "var(--danger)",  bg: "rgba(255,77,109,0.08)",  border: "rgba(255,77,109,0.25)"  },
  ADULT_AD:    { label: "Adult Ad",      icon: "🔞", color: "var(--danger)",  bg: "rgba(255,77,109,0.08)",  border: "rgba(255,77,109,0.25)"  },
  VIOLENCE:    { label: "Violence",      icon: "⚠️", color: "var(--danger)",  bg: "rgba(255,77,109,0.08)",  border: "rgba(255,77,109,0.25)"  },
};

const PHASE_LABEL: Record<number, string> = {
  1: "URL Heuristics",
  2: "Text AI",
  3: "Vision AI",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function ImageAnalyzer({ onRemainingUpdate }: ImageAnalyzerProps) {
  const [state, setState] = useState<State>(INITIAL);
  const buttonCooldown    = useRef(false);
  const dropRef           = useRef<HTMLDivElement>(null);
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const { addHistory }    = useSessionHistory();

  // Revoke preview URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (state.filePreview) URL.revokeObjectURL(state.filePreview);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Revoke old preview
    setState((s) => {
      if (s.filePreview) URL.revokeObjectURL(s.filePreview);
      return {
        ...s, file,
        filePreview: URL.createObjectURL(file),
        result: null, error: null,
      };
    });
  }, []);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.style && (dropRef.current.style.borderColor = "var(--accent)");
  }, []);

  const handleDragLeave = useCallback(() => {
    dropRef.current?.style && (dropRef.current.style.borderColor = "");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.style && (dropRef.current.style.borderColor = "");
    const file = e.dataTransfer.files[0] ?? null;
    handleFileChange(file);
  }, [handleFileChange]);

  const handleScan = useCallback(async () => {
    if (buttonCooldown.current || state.loading) return;

    // Validate input
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

      // Save to history
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

      if (data.cached) toast.success("⚡ Loaded from cache — instant result");
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : "Unexpected error. Please try again.";
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
      <div
        className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}
      >
        {(["url", "file"] as InputMode[]).map((m) => (
          <button
            key={m}
            id={`image-mode-${m}`}
            onClick={() => setState((s) => ({ ...s, mode: m, error: null }))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: state.mode === m ? "var(--bg4)" : "transparent",
              color: state.mode === m ? "var(--text)" : "var(--text2)",
              boxShadow: state.mode === m ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
            }}
          >
            {m === "url" ? <Link2 size={14} /> : <Upload size={14} />}
            {m === "url" ? "Image URL" : "Upload File"}
          </button>
        ))}
      </div>

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state.mode}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
        >
          {state.mode === "url" ? (
            <div className="flex gap-3">
              <Input
                id="image-url-input"
                type="url"
                placeholder="https://example.com/image.jpg"
                value={state.urlValue}
                disabled={state.loading}
                onChange={(e) => setState((s) => ({ ...s, urlValue: e.target.value, error: null }))}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                className="flex-1"
              />
              <Button id="image-scan-url-btn" onClick={handleScan} disabled={!canScan}>
                {state.loading
                  ? <><Loader2 size={14} className="animate-spin" />Scanning…</>
                  : "Scan Image"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Drop zone */}
              <div
                ref={dropRef}
                id="image-dropzone"
                className="relative rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 min-h-[160px]"
                style={{
                  border: "2px dashed var(--border2)",
                  background: "var(--bg3)",
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Click or drag to upload an image"
              >
                {state.filePreview ? (
                  // Preview
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={state.filePreview}
                    alt="Preview"
                    className="max-h-40 max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <ImageIcon size={32} style={{ color: "var(--text3)" }} />
                    <span className="text-sm" style={{ color: "var(--text2)" }}>
                      Click to choose or drag an image here
                    </span>
                    <span className="text-xs" style={{ color: "var(--text3)" }}>
                      JPG, PNG, WebP — max 10 MB
                    </span>
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
                <p className="text-xs" style={{ color: "var(--text3)" }}>
                  {state.file.name} — {(state.file.size / 1024).toFixed(0)} KB
                </p>
              )}

              <Button
                id="image-scan-file-btn"
                onClick={handleScan}
                disabled={!canScan}
                className="w-full sm:w-auto"
              >
                {state.loading
                  ? <><Loader2 size={14} className="animate-spin" />Scanning…</>
                  : "Scan Image"}
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
            className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm overflow-hidden"
            style={{ background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.25)", color: "var(--danger)" }}
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5" />{state.error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState icon="🔍" title="Scanning image…" description="Running heuristics, then AI analysis if needed." />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result card ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.result && cfg && !state.loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {/* Header */}
            <div
              className="rounded-t-[var(--radius)] px-6 py-4 flex flex-wrap items-center justify-between gap-3"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderBottom: "none" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cfg.icon}</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: cfg.color, fontFamily: "Syne, sans-serif" }}>
                    {cfg.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text3)" }}>
                    {state.result.reason}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Phase badge */}
                {state.phase !== null && (
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1"
                    style={{
                      background: "rgba(91,156,246,0.12)",
                      color: "var(--accent)",
                      border: "1px solid rgba(91,156,246,0.25)",
                    }}
                  >
                    Phase {state.phase}: {PHASE_LABEL[state.phase] ?? "AI"}
                  </span>
                )}
                {/* Cached badge */}
                {state.cached && (
                  <span
                    className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium"
                    style={{
                      background: "rgba(91,156,246,0.12)",
                      color: "var(--accent)",
                      border: "1px solid rgba(91,156,246,0.25)",
                    }}
                  >
                    <Zap size={10} /> Cached
                  </span>
                )}
                {/* Block / Safe badge */}
                {state.result.shouldBlock ? (
                  <span
                    className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-semibold"
                    style={{ background: "rgba(255,77,109,0.15)", color: "var(--danger)", border: "1px solid rgba(255,77,109,0.3)" }}
                  >
                    <ShieldAlert size={11} /> Should Block
                  </span>
                ) : (
                  <span
                    className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-semibold"
                    style={{ background: "rgba(62,207,142,0.12)", color: "var(--safe)", border: "1px solid rgba(62,207,142,0.25)" }}
                  >
                    <ShieldCheck size={11} /> Safe to View
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div
              className="rounded-b-[var(--radius)] p-6 space-y-5"
              style={{ border: `1px solid ${cfg.border}`, background: "var(--bg2)" }}
            >
              {/* Confidence bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span style={{ color: "var(--text2)" }}>Confidence</span>
                  <span className="font-semibold" style={{ color: cfg.color }}>{confidencePct}%</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--bg4)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${confidencePct}%`, background: cfg.color, boxShadow: `0 0 8px ${cfg.color}88` }}
                  />
                </div>
              </div>

              {/* Indicators */}
              {state.result.indicators.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text3)" }}>
                    Detected signals
                  </p>
                  <ul className="space-y-1.5">
                    {state.result.indicators.map((ind, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: cfg.color }} />
                        <span style={{ color: "var(--text2)" }}>{ind}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!state.result.shouldBlock && state.result.indicators.length === 0 && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--safe)" }}>
                  <CheckCircle2 size={14} />
                  <span>No suspicious signals detected.</span>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 text-xs" style={{ color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
                <span>Forensic Heuristics + Local Gemma Vision (Indicative)</span>
                <div className="flex items-center gap-3">
                  <span>100% Private (On-Device)</span>
                  <Button id="image-clear-btn" variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 h-7 text-xs">
                    <Trash2 size={11} /> Clear
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
          icon="🖼️"
          title="No image scanned yet"
          description="Enter an image URL or upload a file. Heuristics run instantly — AI only triggers on ambiguous results."
        />
      )}
    </div>
  );
}
