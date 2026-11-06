"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function SettingsForm() {
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    // Load existing key from localStorage or use default from extension-api.ts fallback
    const savedKey = localStorage.getItem("geminiKey") || "AIzaSyAUbqSTNbDruoT6i021QBjIeuHezlR92Bs";
    setApiKey(savedKey);
  }, []);

  const handleSave = () => {
    localStorage.setItem("geminiKey", apiKey);
    toast.success("API Key saved successfully!");
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
          Gemini API Key
        </label>
        <p className="text-xs mb-3" style={{ color: "var(--text2)" }}>
          Required for the web-based prototype fallback. The default hackathon key is pre-filled.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full px-4 py-2 rounded-xl text-sm outline-none transition-all duration-200"
          style={{
            background: "var(--bg1)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
          placeholder="AIzaSy..."
        />
      </div>
      <Button onClick={handleSave}>
        Save Settings
      </Button>
    </div>
  );
}
