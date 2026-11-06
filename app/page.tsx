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
import { ArrowRight, ShieldCheck, Zap, ScanSearch, Github } from "lucide-react";

const features = [
  {
    id: "privacy-analyzer",
    icon: "📄",
    lucideIcon: null,
    title: "Privacy Policy Analyzer",
    description:
      "Understand what apps really collect. Paste any privacy policy and get a plain-English breakdown of data risks, tracking, and red flags — in seconds.",
    badge: "Policy Scanner",
    badgeColor: "var(--accent)",
  },
  {
    id: "misinformation-scanner",
    icon: "✅",
    lucideIcon: null,
    title: "Misinformation Scanner",
    description:
      "Fact-check claims instantly. Analyze text or headlines for accuracy signals, source reliability, and misinformation patterns before you share.",
    badge: "Fact Checker",
    badgeColor: "var(--safe)",
  },
  {
    id: "deepfake-detector",
    icon: "🖼️",
    lucideIcon: null,
    title: "Deepfake Detector",
    description:
      "Spot manipulated images. Upload or link any image and our AI will surface authenticity signals, metadata anomalies, and manipulation probability.",
    badge: "Image AI",
    badgeColor: "var(--caution)",
  },
];

const stats = [
  { value: "100%", label: "Free forever" },
  { value: "0", label: "Accounts needed" },
  { value: "0kb", label: "Data we store" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero ───────────────────────────────── */}
        <section
          className="relative overflow-hidden"
          style={{ padding: "100px 24px 80px" }}
        >
          {/* Background glows */}
          <div
            className="glow-blob animate-glow-pulse"
            style={{
              width: 600,
              height: 600,
              background: "var(--accent)",
              top: -200,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          />
          <div
            className="glow-blob"
            style={{
              width: 300,
              height: 300,
              background: "var(--safe)",
              top: 100,
              right: "10%",
              opacity: 0.07,
            }}
          />

          <div className="relative max-w-4xl mx-auto text-center">
            {/* Label chip */}
            <div className="inline-flex items-center gap-2 mb-8">
              <span
                className="label-sm"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "100px",
                  border: "1px solid rgba(91,156,246,0.25)",
                  background: "rgba(91,156,246,0.08)",
                  color: "var(--accent)",
                }}
              >
                <ShieldCheck size={12} strokeWidth={2.5} />
                Your Quiet Digital Protector
              </span>
            </div>

            {/* Main heading */}
            <h1
              className="text-5xl sm:text-6xl md:text-7xl font-extrabold mb-6 leading-tight"
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              <span style={{ color: "var(--text)" }}>Ambient</span>{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent) 0%, #a5c8ff 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Shield
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
              style={{ color: "var(--text2)" }}
            >
              Your quiet digital protector against privacy traps and digital
              deception. Analyze policies, detect misinformation, and spot
              deepfakes — all in one place.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="xl" id="hero-cta-button">
                <Link href="/analyze" className="flex items-center gap-2">
                  Start Protecting Yourself
                  <ArrowRight size={18} />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                id="hero-learn-more-button"
              >
                <Link href="#features">See What We Detect</Link>
              </Button>
            </div>

            {/* Trust stats */}
            <div className="flex flex-wrap items-center justify-center gap-8 mt-14">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div
                    className="text-2xl font-bold"
                    style={{
                      fontFamily: "Syne, sans-serif",
                      color: "var(--accent)",
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text3)" }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ────────────────────────────── */}
        <section
          id="features"
          className="max-w-6xl mx-auto px-6 py-20"
        >
          {/* Section header */}
          <div className="text-center mb-14">
            <span className="label-sm block mb-3">Three Shields</span>
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}
            >
              Everything you need to stay protected
            </h2>
            <p
              className="mt-4 text-sm max-w-lg mx-auto"
              style={{ color: "var(--text2)" }}
            >
              Paste text, upload images, or link URLs. Ambient Shield does the
              heavy lifting — no tech knowledge required.
            </p>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card
                key={feature.id}
                className="group flex flex-col"
                style={{
                  animationDelay: `${i * 100}ms`,
                }}
              >
                <CardHeader>
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 select-none transition-transform duration-200 group-hover:scale-110"
                    style={{
                      background: "var(--bg3)",
                      border: "1px solid var(--border2)",
                    }}
                  >
                    {feature.icon}
                  </div>
                  {/* Badge */}
                  <span
                    className="label-sm mb-1"
                    style={{ color: feature.badgeColor }}
                  >
                    {feature.badge}
                  </span>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
                <CardFooter>
                  <Link
                    href="/analyze"
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-all duration-200 group/link"
                    style={{ color: "var(--accent)" }}
                    id={`feature-link-${feature.id}`}
                  >
                    Try it
                    <ArrowRight
                      size={14}
                      className="transition-transform duration-200 group-hover/link:translate-x-1"
                    />
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────── */}
        <section
          className="py-20 px-6"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, var(--bg2) 30%, var(--bg2) 70%, transparent 100%)",
          }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span className="label-sm block mb-3">Simple by design</span>
              <h2
                className="text-3xl font-bold"
                style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}
              >
                Zero friction. Maximum clarity.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  icon: <ScanSearch size={22} style={{ color: "var(--accent)" }} />,
                  title: "Paste Content or URL",
                  desc: "Drop in a privacy policy, a suspicious claim, or a link to an image you want checked.",
                },
                {
                  step: "02",
                  icon: <Zap size={22} style={{ color: "var(--caution)" }} />,
                  title: "Instant Cache or AI",
                  desc: "Identical inputs return cached results instantly — zero API cost. New inputs go to Gemini 2.5 Flash.",
                },
                {
                  step: "03",
                  icon: <ShieldCheck size={22} style={{ color: "var(--safe)" }} />,
                  title: "Clear, Calm Results",
                  desc: "Get a risk score and plain-English explanation. No jargon, no noise, no account needed.",
                },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{
                      background: "var(--bg3)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {item.icon}
                  </div>
                  <span
                    className="label-sm block mb-2"
                    style={{ color: "var(--text3)" }}
                  >
                    Step {item.step}
                  </span>
                  <h3
                    className="text-base font-bold mb-2"
                    style={{
                      fontFamily: "Syne, sans-serif",
                      color: "var(--text)",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm" style={{ color: "var(--text2)" }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────── */}
        <section className="max-w-3xl mx-auto px-6 py-24 text-center">
          <div
            className="relative rounded-2xl px-8 py-14 overflow-hidden"
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--border2)",
              boxShadow: "0 0 80px rgba(91,156,246,0.06)",
            }}
          >
            {/* Glow */}
            <div
              className="glow-blob animate-glow-pulse"
              style={{
                width: 400,
                height: 300,
                background: "var(--accent2)",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                opacity: 0.1,
              }}
            />
            <div className="relative">
              <span className="label-sm block mb-4">Ready when you are</span>
              <h2
                className="text-3xl sm:text-4xl font-extrabold mb-4"
                style={{
                  fontFamily: "Syne, sans-serif",
                  color: "var(--text)",
                }}
              >
                Your digital safety matters
              </h2>
              <p
                className="text-sm mb-8 max-w-md mx-auto"
                style={{ color: "var(--text2)" }}
              >
                No account. No credit card. No data stored. Just powerful,
                free tools to keep you protected online.
              </p>
              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                {[
                  { icon: "🔒", text: "No signup" },
                  { icon: "🗑️", text: "No data stored" },
                  { icon: "✨", text: "Free to use" },
                ].map((badge) => (
                  <span
                    key={badge.text}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
                    style={{
                      background: "var(--bg3)",
                      border: "1px solid var(--border2)",
                      color: "var(--text2)",
                    }}
                  >
                    <span>{badge.icon}</span>
                    {badge.text}
                  </span>
                ))}
              </div>

              <Button asChild size="xl" id="bottom-cta-button">
                <Link href="/analyze" className="flex items-center gap-2">
                  Start Protecting Yourself
                  <ArrowRight size={18} />
                </Link>
              </Button>

              {/* GitHub link */}
              <div className="mt-6">
                <a
                  href="https://github.com/ambient-shield/ambient-shield"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs transition-colors duration-200"
                  style={{ color: "var(--text3)" }}
                  id="github-link"
                >
                  <Github size={13} />
                  View on GitHub
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
