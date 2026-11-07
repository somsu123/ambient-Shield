import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, Shield, Zap, Search, Github, Lock, CheckCircle2, FileText, Image as ImageIcon } from "lucide-react";

const features = [
  {
    id: "privacy-analyzer",
    icon: <FileText size={20} className="text-white" />,
    title: "Privacy Policy Analyzer",
    description:
      "Instant breakdown of data traps, third-party tracking, and hidden liabilities in terms of service without reading legalese.",
    badge: "100% OFFLINE HEURISTICS",
  },
  {
    id: "misinformation-scanner",
    icon: <Search size={20} className="text-white" />,
    title: "Misinformation & Job Scam Scanner",
    description:
      "Evaluates news claims and recruitment notices against multi-source evidence and runs 7 critical verification checks via local Gemma.",
    badge: "MULTI-SOURCE RETRIEVAL",
  },
  {
    id: "deepfake-detector",
    icon: <ImageIcon size={20} className="text-white" />,
    title: "Deepfake & Image Forensics",
    description:
      "Surfaces visual authenticity signals, compression artifacts, and digital manipulation indicators with full privacy preservation.",
    badge: "LOCAL MULTIMODAL",
  },
];

const stats = [
  { value: "0 kB", label: "CLOUD TELEMETRY" },
  { value: "100%", label: "ON-DEVICE INFERENCE" },
  { value: "0", label: "API KEYS REQUIRED" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero ───────────────────────────────── */}
        <section className="relative px-6 pt-24 pb-20 border-b border-zinc-850 overflow-hidden">
          {/* Subtle top spotlight */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-white/[0.04] blur-[100px] pointer-events-none" />

          <div className="relative max-w-4xl mx-auto text-center">
            {/* 21st.dev Badge Chip */}
            <div className="inline-flex items-center gap-2 mb-8">
              <span className="mono-tag text-xs py-1 px-3 bg-zinc-950 border-zinc-800 text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                AUTONOMOUS DIGITAL DEFENSE &middot; ZERO CLOUD EXPOSURE
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.08]">
              Verify anything. <br />
              <span className="text-zinc-500">Leak nothing.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg max-w-2xl mx-auto mb-10 text-zinc-400 font-normal leading-relaxed">
              Ambient Shield runs locally on your device to dismantle predatory privacy policies, verify job offers, expose misinformation, and inspect media authenticity.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" id="hero-cta-button" className="h-11 px-7 text-sm font-semibold">
                <Link href="/analyze" className="flex items-center gap-2">
                  Launch Local Analyzer
                  <ArrowRight size={16} />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                id="hero-learn-more-button"
                className="h-11 px-6 text-sm"
              >
                <Link href="#features">Architecture &amp; Features</Link>
              </Button>
            </div>

            {/* Telemetry Stats */}
            <div className="grid grid-cols-3 max-w-lg mx-auto gap-4 mt-16 pt-8 border-t border-zinc-850">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl font-bold font-mono text-white tracking-tight">
                    {stat.value}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 mt-1 uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ────────────────────────────── */}
        <section id="features" className="max-w-6xl mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4 pb-6 border-b border-zinc-850">
            <div>
              <span className="label-sm text-zinc-500 block mb-2 font-mono">
                [ VERIFICATION SUITE ]
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Engineered for uncompromising fidelity
              </h2>
            </div>
            <p className="text-xs font-mono text-zinc-400 max-w-xs">
              Direct offline parsing, multi-source retrieval, and Gemma evaluation with zero telemetry.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map((feature) => (
              <Card
                key={feature.id}
                className="group flex flex-col justify-between bg-zinc-950/70 border-zinc-850 hover:border-zinc-700 transition-all p-6"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center">
                      {feature.icon}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      {feature.badge}
                    </span>
                  </div>

                  <CardTitle className="text-lg font-semibold text-white mb-2">
                    {feature.title}
                  </CardTitle>

                  <CardDescription className="text-xs text-zinc-400 leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </div>

                <div className="pt-6 mt-6 border-t border-zinc-900">
                  <Link
                    href="/analyze"
                    className="inline-flex items-center gap-1.5 text-xs font-mono uppercase text-zinc-400 hover:text-white transition-colors"
                    id={`feature-link-${feature.id}`}
                  >
                    Run Analyzer
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* ── How It Works ────────────────────────── */}
        <section className="border-y border-zinc-850 bg-zinc-950/50 py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <span className="label-sm text-zinc-500 block mb-2 font-mono">
                [ EXECUTION PIPELINE ]
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                How Ambient Shield processes data
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: "01",
                  title: "Direct Input or Context Menu",
                  desc: "Paste text or right-click any page in Chrome. No login, token authorization, or account setup required.",
                },
                {
                  step: "02",
                  title: "Multi-Source Retrieval & Evidence",
                  desc: "Queries DuckDuckGo Lite, Wikipedia, and Google News without tracking. Drops all non-substantive claims.",
                },
                {
                  step: "03",
                  title: "Local Gemma Judgment",
                  desc: "Gemma model runs on your machine via Ollama. Real-date time paradox checks and verifiable citations are strictly enforced.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-6 rounded-lg bg-black border border-zinc-850 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-xs font-mono font-bold text-zinc-600 block mb-3">
                      STEP {item.step}
                    </span>
                    <h3 className="text-sm font-semibold text-white mb-2">
                      {item.title}
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final Call to Action ───────────────────────────── */}
        <section className="max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="relative rounded-2xl p-10 sm:p-14 border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="max-w-xl mx-auto">
              <span className="mono-tag text-xs mb-4">
                READY TO OPERATE
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
                Complete digital sovereignty
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mb-8 leading-relaxed">
                No credit cards. No cloud logging. Completely open, private, and powered by local open weights.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button asChild size="lg" id="bottom-cta-button" className="h-10 px-6 text-xs font-semibold">
                  <Link href="/analyze" className="flex items-center gap-2">
                    Open Web Dashboard
                    <ArrowRight size={14} />
                  </Link>
                </Button>
                <a
                  href="https://github.com/ambient-shield/ambient-shield"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white px-4 py-2 rounded-md border border-zinc-800 bg-black transition-colors"
                  id="github-link"
                >
                  <Github size={13} />
                  GitHub Repository
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
