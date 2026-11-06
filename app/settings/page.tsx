import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import SettingsForm from "@/app/settings/SettingsForm";

export const metadata: Metadata = {
  title: "Settings | Ambient Shield",
  description: "Configure your API keys and preferences for Ambient Shield.",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        <div className="mb-10">
          <span className="label-sm block mb-3">Configuration</span>
          <h1
            className="text-4xl font-extrabold mb-3"
            style={{
              fontFamily: "Syne, sans-serif",
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}
          >
            Settings
          </h1>
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Configure Ambient Shield for the web prototype.
          </p>
        </div>

        <div
          className="rounded-[var(--radius)] p-6"
          style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
        >
          <SettingsForm />
        </div>
      </main>

      <Footer />
    </div>
  );
}
