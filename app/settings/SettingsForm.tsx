"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function SettingsForm() {
  const [provider, setProvider] = useState("ollama");
  const [ollamaHost, setOllamaHost] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("gemma3:4b");
  const [timeoutSec, setTimeoutSec] = useState("45");
  const [localOnlyMode, setLocalOnlyMode] = useState(false);
  const [debugLog, setDebugLog] = useState(false);
  const [checking, setChecking] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    tested: boolean;
    ok: boolean;
    message: string;
    models?: string[];
  }>({ tested: false, ok: false, message: "" });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const g = window as unknown as { chrome?: { storage?: { local?: { get: (keys: string[], cb: (res: Record<string, unknown>) => void) => void } } } };
      if (g.chrome?.storage?.local) {
        g.chrome.storage.local.get(
          ["llmProvider", "ollamaHost", "ollamaModel", "llmTimeoutMs", "localOnlyMode", "llmDebug"],
          (res) => {
            if (res.llmProvider) setProvider(String(res.llmProvider));
            if (res.ollamaHost) setOllamaHost(String(res.ollamaHost));
            if (res.ollamaModel) setOllamaModel(String(res.ollamaModel));
            if (res.llmTimeoutMs) setTimeoutSec(String(Math.round(Number(res.llmTimeoutMs) / 1000)));
            if (typeof res.localOnlyMode === "boolean") setLocalOnlyMode(res.localOnlyMode);
            if (typeof res.llmDebug === "boolean") setDebugLog(res.llmDebug);
          }
        );
      } else {
        const p = localStorage.getItem("llmProvider");
        const h = localStorage.getItem("ollamaHost");
        const m = localStorage.getItem("ollamaModel");
        const t = localStorage.getItem("llmTimeoutSec");
        const l = localStorage.getItem("localOnlyMode");
        const d = localStorage.getItem("llmDebug");
        if (p) setProvider(p);
        if (h) setOllamaHost(h);
        if (m) setOllamaModel(m);
        if (t) setTimeoutSec(t);
        if (l) setLocalOnlyMode(l === "true");
        if (d) setDebugLog(d === "true");
      }
    }
  }, []);

  const runHealthCheck = async () => {
    setChecking(true);
    setHealthStatus({ tested: false, ok: false, message: "Testing connection..." });

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${ollamaHost.replace(/\/+$/, "")}/api/tags`, { signal: ctrl.signal });
      clearTimeout(tid);

      if (!res.ok) {
        setHealthStatus({
          tested: true,
          ok: false,
          message: `Ollama reachable but returned HTTP ${res.status}.`,
        });
        return;
      }

      const data = await res.json();
      const models = (data.models || []).map((x: { name?: string; model?: string }) => x.name || x.model || "");
      const hasModel = models.some((name: string) => name === ollamaModel || name.startsWith(`${ollamaModel}:`));

      if (!hasModel) {
        setHealthStatus({
          tested: true,
          ok: false,
          models,
          message: `Ollama daemon running, but model "${ollamaModel}" not found. Run: ollama pull ${ollamaModel}`,
        });
      } else {
        setHealthStatus({
          tested: true,
          ok: true,
          models,
          message: `Ollama active. Model "${ollamaModel}" verified ready for inference.`,
        });
      }
    } catch {
      setHealthStatus({
        tested: true,
        ok: false,
        message: `Unable to connect to Ollama at ${ollamaHost}. Ensure daemon is running and CORS is enabled via OLLAMA_ORIGINS="*".`,
      });
    } finally {
      setChecking(false);
    }
  };

  const handleSave = () => {
    const timeoutMs = Math.max(5000, Math.min(180000, (parseInt(timeoutSec) || 45) * 1000));
    const config = {
      llmProvider: provider,
      ollamaHost: ollamaHost.trim(),
      ollamaModel: ollamaModel.trim(),
      llmTimeoutMs: timeoutMs,
      localOnlyMode,
      llmDebug: debugLog,
    };

    if (typeof window !== "undefined") {
      localStorage.setItem("llmProvider", provider);
      localStorage.setItem("ollamaHost", ollamaHost.trim());
      localStorage.setItem("ollamaModel", ollamaModel.trim());
      localStorage.setItem("llmTimeoutSec", timeoutSec);
      localStorage.setItem("localOnlyMode", String(localOnlyMode));
      localStorage.setItem("llmDebug", String(debugLog));

      const g = window as unknown as { chrome?: { storage?: { local?: { set: (obj: Record<string, unknown>, cb: () => void) => void } } } };
      if (g.chrome?.storage?.local) {
        g.chrome.storage.local.set(config, () => {
          toast.success("Settings saved to Extension and local storage.");
        });
        return;
      }
    }

    toast.success("Local settings saved successfully.");
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wider text-white mb-1">
          Local Inference Engine (100% On-Device)
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Ambient Shield uses zero cloud tokens or external keys. All model inference executes privately on your hardware via Ollama.
        </p>
      </div>

      <div className="space-y-4 font-mono text-xs">
        <div>
          <label className="block text-zinc-300 mb-1.5 font-sans font-medium text-xs">
            Inference Provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white outline-none focus:border-zinc-500 transition-colors"
          >
            <option value="ollama">Ollama (Daemon at localhost:11434)</option>
            <option value="offscreen">In-Browser Offscreen Fallback (Local stub)</option>
          </select>
        </div>

        <div>
          <label className="block text-zinc-300 mb-1.5 font-sans font-medium text-xs">
            Ollama Endpoint
          </label>
          <input
            type="text"
            value={ollamaHost}
            onChange={(e) => setOllamaHost(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white outline-none focus:border-zinc-500 transition-colors"
            placeholder="http://localhost:11434"
          />
        </div>

        <div>
          <label className="block text-zinc-300 mb-1.5 font-sans font-medium text-xs">
            Model Identifier
          </label>
          <input
            type="text"
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white outline-none focus:border-zinc-500 transition-colors"
            placeholder="gemma3:4b"
          />
          <p className="text-[11px] text-zinc-500 mt-1 font-sans">
            Recommended: <code className="text-zinc-400">gemma3:4b</code> (default) or <code className="text-zinc-400">gemma2:2b</code> (low VRAM).
          </p>
        </div>

        <div>
          <label className="block text-zinc-300 mb-1.5 font-sans font-medium text-xs">
            Inference Timeout (Seconds)
          </label>
          <input
            type="number"
            min="5"
            max="180"
            value={timeoutSec}
            onChange={(e) => setTimeoutSec(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white outline-none focus:border-zinc-500 transition-colors"
          />
        </div>

        <div className="pt-3 border-t border-zinc-850 space-y-2.5 font-sans">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={localOnlyMode}
              onChange={(e) => setLocalOnlyMode(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-800 accent-white"
            />
            <span className="text-xs text-zinc-300">
              Strict Offline-Only Mode (Disable outbound retrieval queries)
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={debugLog}
              onChange={(e) => setDebugLog(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-800 accent-white"
            />
            <span className="text-xs text-zinc-300">
              Enable Verbose Debug Logs in DevTools Console
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={handleSave} className="h-9 px-5 text-xs font-semibold">
          Save Configuration
        </Button>
        <button
          type="button"
          onClick={runHealthCheck}
          disabled={checking}
          className="h-9 px-4 rounded-lg text-xs font-mono border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-850 transition-colors flex items-center gap-2"
        >
          {checking ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Pinging Ollama…
            </>
          ) : (
            "Ping Connection"
          )}
        </button>
      </div>

      {healthStatus.tested && (
        <div
          className={`p-3 rounded-lg border text-xs font-mono leading-relaxed ${
            healthStatus.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          <div className="font-semibold mb-1">
            {healthStatus.ok ? "✓ DAEMON HEALTHY" : "✕ CONNECTION NOTICE"}
          </div>
          <div>{healthStatus.message}</div>
          {healthStatus.models && healthStatus.models.length > 0 && (
            <div className="mt-1.5 text-[11px] opacity-80">
              Installed Models: {healthStatus.models.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
