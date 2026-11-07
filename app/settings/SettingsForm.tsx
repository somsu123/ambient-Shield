"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const DEFAULT_GROQ_KEY = "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";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

export default function SettingsForm() {
  const [provider, setProvider] = useState("groq");
  const [groqApiKey, setGroqApiKey] = useState(DEFAULT_GROQ_KEY);
  const [groqModel, setGroqModel] = useState(DEFAULT_GROQ_MODEL);
  const [ollamaHost, setOllamaHost] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("gemma3:4b");
  const [timeoutSec, setTimeoutSec] = useState("30");
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
          ["llmProvider", "groqApiKey", "groqModel", "ollamaHost", "ollamaModel", "llmTimeoutMs", "localOnlyMode", "llmDebug"],
          (res) => {
            if (res.llmProvider) setProvider(String(res.llmProvider));
            if (res.groqApiKey) setGroqApiKey(String(res.groqApiKey));
            if (res.groqModel) setGroqModel(String(res.groqModel));
            if (res.ollamaHost) setOllamaHost(String(res.ollamaHost));
            if (res.ollamaModel) setOllamaModel(String(res.ollamaModel));
            if (res.llmTimeoutMs) setTimeoutSec(String(Math.round(Number(res.llmTimeoutMs) / 1000)));
            if (typeof res.localOnlyMode === "boolean") setLocalOnlyMode(res.localOnlyMode);
            if (typeof res.llmDebug === "boolean") setDebugLog(res.llmDebug);
          }
        );
      } else {
        const p = localStorage.getItem("llmProvider");
        const gak = localStorage.getItem("groqApiKey");
        const gm = localStorage.getItem("groqModel");
        const h = localStorage.getItem("ollamaHost");
        const m = localStorage.getItem("ollamaModel");
        const t = localStorage.getItem("llmTimeoutSec");
        const l = localStorage.getItem("localOnlyMode");
        const d = localStorage.getItem("llmDebug");
        if (p) setProvider(p);
        if (gak) setGroqApiKey(gak);
        if (gm) setGroqModel(gm);
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
      if (provider === "groq") {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${groqApiKey.trim()}` },
          signal: ctrl.signal,
        });
        clearTimeout(tid);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          setHealthStatus({
            tested: true,
            ok: false,
            message: `Groq error (HTTP ${res.status}): ${errText || res.statusText}`,
          });
          return;
        }

        const data = await res.json();
        const models = (data.data || []).map((x: { id: string }) => x.id);
        const hasModel = models.includes(groqModel.trim());

        setHealthStatus({
          tested: true,
          ok: true,
          models: models.slice(0, 10),
          message: hasModel
            ? `Groq Cloud active. Model "${groqModel}" verified ready.`
            : `Groq Cloud active. Note: model "${groqModel}" might not be in default list.`,
        });
        return;
      }

      // Ollama check
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setHealthStatus({
        tested: true,
        ok: false,
        message: `Connection failed: ${msg}`,
      });
    } finally {
      setChecking(false);
    }
  };

  const handleSave = () => {
    const timeoutMs = Math.max(5000, Math.min(180000, (parseInt(timeoutSec) || 30) * 1000));
    const config = {
      llmProvider: provider,
      groqApiKey: groqApiKey.trim(),
      groqModel: groqModel.trim(),
      ollamaHost: ollamaHost.trim(),
      ollamaModel: ollamaModel.trim(),
      llmTimeoutMs: timeoutMs,
      localOnlyMode,
      llmDebug: debugLog,
    };

    if (typeof window !== "undefined") {
      localStorage.setItem("llmProvider", provider);
      localStorage.setItem("groqApiKey", groqApiKey.trim());
      localStorage.setItem("groqModel", groqModel.trim());
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

    toast.success("Configuration saved successfully.");
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wider text-white mb-1">
          Inference Engine &amp; AI Provider
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Configure Groq Cloud API for ultra-fast verification or Ollama for 100% on-device private inference.
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
            <option value="groq">Groq Cloud API (Ultra-Fast ~150ms · Recommended)</option>
            <option value="ollama">Ollama (100% Local Daemon at localhost:11434)</option>
            <option value="offscreen">In-Browser Offscreen Fallback (Local stub)</option>
          </select>
        </div>

        {provider === "groq" ? (
          <>
            <div>
              <label className="block text-zinc-300 mb-1.5 font-sans font-medium text-xs">
                Groq API Key
              </label>
              <input
                type="password"
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white outline-none focus:border-zinc-500 transition-colors font-mono"
                placeholder="gsk_..."
              />
              <p className="text-[11px] text-zinc-500 mt-1 font-sans">
                Active key configured for high-speed Fact &amp; Job verification.
              </p>
            </div>

            <div>
              <label className="block text-zinc-300 mb-1.5 font-sans font-medium text-xs">
                Groq Model
              </label>
              <input
                type="text"
                value={groqModel}
                onChange={(e) => setGroqModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white outline-none focus:border-zinc-500 transition-colors"
                placeholder="qwen/qwen3.8-27b"
              />
              <p className="text-[11px] text-zinc-500 mt-1 font-sans">
                Recommended: <code className="text-zinc-400">qwen/qwen3.8-27b</code> or <code className="text-zinc-400">openai/gpt-oss-120b</code>.
              </p>
            </div>
          </>
        ) : (
          <>
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
                Ollama Model Identifier
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
          </>
        )}

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
              Testing {provider === "groq" ? "Groq API…" : "Ollama…"}
            </>
          ) : (
            `Ping ${provider === "groq" ? "Groq Cloud" : "Ollama"}`
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
            {healthStatus.ok ? "✓ CONNECTION VERIFIED" : "✕ CONNECTION NOTICE"}
          </div>
          <div>{healthStatus.message}</div>
          {healthStatus.models && healthStatus.models.length > 0 && (
            <div className="mt-1.5 text-[11px] opacity-80">
              Available Models: {healthStatus.models.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
