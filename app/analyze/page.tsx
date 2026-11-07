import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AnalyzeTabs from "@/components/analyze/AnalyzeTabs";

export const metadata: Metadata = {
  title: "Analyze & Verify — Ambient Shield",
  description:
    "Zero-cloud analysis console. Evaluate privacy policies, verify job postings, spot misinformation, and inspect media authenticity.",
};

export default function AnalyzePage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        {/* Page header */}
        <div className="mb-8 pb-6 border-b border-zinc-850">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="label-sm text-zinc-500 font-mono text-[11px]">
              ON-DEVICE VERIFICATION CONSOLE
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Analyze &amp; Protect
          </h1>
          <p className="text-xs text-zinc-400 font-mono max-w-xl">
            Direct offline parsing and local Gemma inference. Zero telemetry or personal data ever sent to cloud services.
          </p>
        </div>

        {/* Tab switcher client component */}
        <AnalyzeTabs />
      </main>

      <Footer />
    </div>
  );
}
