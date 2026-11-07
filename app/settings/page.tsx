import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import SettingsForm from "@/app/settings/SettingsForm";

export const metadata: Metadata = {
  title: "Settings — Ambient Shield",
  description: "Configure local Ollama inference, model endpoints, and system parameters.",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12">
        <div className="mb-8 pb-6 border-b border-zinc-850">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span className="label-sm text-zinc-500 font-mono text-[11px]">
              ENGINE &amp; ENVIRONMENT CONFIGURATION
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            System Settings
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Control local model inference, daemon endpoints, timeouts, and privacy modes.
          </p>
        </div>

        <div className="rounded-xl p-6 sm:p-8 border border-zinc-800 bg-zinc-950">
          <SettingsForm />
        </div>
      </main>

      <Footer />
    </div>
  );
}
