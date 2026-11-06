import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AnalyzeTabs from "@/components/analyze/AnalyzeTabs";

export const metadata: Metadata = {
  title: "Analyze | Ambient Shield",
  description:
    "Analyze privacy policies, detect misinformation, and identify deepfakes — free, no account required.",
};

export default function AnalyzePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        {/* Page header */}
        <div className="mb-10">
          <span className="label-sm block mb-3">Ambient Shield Tools</span>
          <h1
            className="text-4xl font-extrabold mb-3"
            style={{
              fontFamily: "Syne, sans-serif",
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}
          >
            Analyze &amp; Protect
          </h1>
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Select a tool below. No account needed — results are never stored on
            our servers.
          </p>
        </div>

        {/* Tab switcher is a client component — page itself stays a Server Component */}
        <AnalyzeTabs />
      </main>

      <Footer />
    </div>
  );
}
