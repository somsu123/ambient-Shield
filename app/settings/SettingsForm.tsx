"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
          message: `Ollama is running, but model "${ollamaModel}" is missing. Run: ollama pull ${ollamaModel}`,
        });
      } else {
        setHealthStatus({
          tested: true,
          ok: true,
          models,
          message: `Successfully connected to Ollama with model "${ollamaModel}".`,
        });
      }
    } catch {
      setHealthStatus({
        tested: true,
        ok: false,
        message: `Unable to connect to Ollama at ${ollamaHost}. Ensure Ollama is started with OLLAMA_ORIGINS="*"`,
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
          toast.success("Settings saved to Extension & Local Storage!");
        });
        return;
      }
    }

    toast.success("Local settings saved successfully!");
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text)" }}>
          Local AI Provider (100% Private)
        </h3>
        <p className="text-xs" style={{ color: "var(--text2)" }}>
          Ambient Shield runs entirely on your local machine using Gemma. No external API keys or cloud tokens are ever used.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
            Inference Engine
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-4 py-2 rounded-xl text-sm outline-none transition-all duration-200"
            style={{
              background: "var(--bg1)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="ollama">Ollama (Local daemon at localhost:11434)</option>
            <option value="offscreen">In-Browser WebLLM (Offscreen fallback stub)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
            Ollama Endpoint
          </label>
          <input
            type="text"
            value={ollamaHost}
            onChange={(e) => setOllamaHost(e.target.value)}
            className="w-full px-4 py-2 rounded-xl text-sm outline-none transition-all duration-200 font-mono"
            style={{
              background: "var(--bg1)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
            placeholder="http://localhost:11434"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
            Model Name
          </label>
          <input
            type="text"
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
            className="w-full px-4 py-2 rounded-xl text-sm outline-none transition-all duration-200 font-mono"
            style={{
              background: "var(--bg1)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
            placeholder="gemma3:4b"
          />
          <p className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
            Recommended: <code className="text-[11px]">gemma3:4b</code> (text & reasoning) or <code className="text-[11px]">gemma2:2b</code> (lightweight).
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
            Timeout (seconds)
          </label>
          <input
            type="number"
            min="5"
            max="180"
            value={timeoutSec}
            onChange={(e) => setTimeoutSec(e.target.value)}
            className="w-full px-4 py-2 rounded-xl text-sm outline-none transition-all duration-200"
            style={{
              background: "var(--bg1)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          />
        </div>

        <div className="pt-2 border-t border-[var(--border)] space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={localOnlyMode}
              onChange={(e) => setLocalOnlyMode(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
              Strict Local-Only Mode (Disable outbound search queries)
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={debugLog}
              onChange={(e) => setDebugLog(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
              Enable Detailed Debug Logging in Console
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={handleSave}>
          Save Settings
        </Button>
        <button
          type="button"
          onClick={runHealthCheck}
          disabled={checking}
          className="px-4 py-2 rounded-xl text-sm border font-medium transition-all"
          style={{
            borderColor: "var(--border2)",
            color: "var(--text)",
            background: "var(--bg3)",
          }}
        >
          {checking ? "Checking Ollama..." : "Test Ollama Connection"}
        </button>
      </div>

      {healthStatus.tested && (
        <div
          className="p-3 rounded-xl border text-xs leading-relaxed"
          style={{
            background: healthStatus.ok ? "rgba(62, 207, 142, 0.1)" : "rgba(255, 77, 109, 0.1)",
            borderColor: healthStatus.ok ? "rgba(62, 207, 142, 0.3)" : "rgba(255, 77, 109, 0.3)",
            color: healthStatus.ok ? "var(--safe)" : "var(--danger)",
          }}
        >
          <div className="font-semibold mb-1">
            {healthStatus.ok ? "✓ Engine Healthy" : "⚠ Provider Notice"}
          </div>
          <div>{healthStatus.message}</div>
          {healthStatus.models && healthStatus.models.length > 0 && (
            <div className="mt-2 text-[11px] opacity-80">
              Installed Ollama models: {healthStatus.models.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
