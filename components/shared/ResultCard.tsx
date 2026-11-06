"use client";

import React from "react";
import type { PolicyResult, RiskLevel } from "@/lib/types";
import RiskBadge from "@/components/shared/RiskBadge";
import RiskMeter from "@/components/shared/RiskMeter";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  Shield,
  Users,
  Zap,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────
function mapLevel(level: RiskLevel): "safe" | "caution" | "danger" {
  return level === "SAFE" ? "safe" : level === "CAUTION" ? "caution" : "danger";
}

// ── Sub-components ───────────────────────────────────────────────────────────
function Section({
  icon,
  title,
  color = "var(--text2)",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color }}>{icon}</span>
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function TagList({ items, color }: { items: string[]; color: string }) {
  if (!items.length)
    return (
      <p className="text-xs italic" style={{ color: "var(--text3)" }}>
        None noted
      </p>
    );
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span
          key={i}
          className="text-xs px-2.5 py-1 rounded-full"
          style={{
            background: `${color}18`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function RedFlagsList({ flags }: { flags: string[] }) {
  if (!flags.length)
    return (
      <p className="text-xs italic" style={{ color: "var(--text3)" }}>
        No red flags detected
      </p>
    );
  return (
    <ul className="space-y-2">
      {flags.map((flag, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <AlertTriangle
            size={13}
            className="shrink-0 mt-0.5"
            style={{ color: "var(--danger)" }}
          />
          <span style={{ color: "var(--text2)" }}>{flag}</span>
        </li>
      ))}
    </ul>
  );
}

function TipsList({ tips }: { tips: string[] }) {
  if (!tips.length)
    return (
      <p className="text-xs italic" style={{ color: "var(--text3)" }}>
        No specific tips
      </p>
    );
  return (
    <ul className="space-y-2">
      {tips.map((tip, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <CheckCircle2
            size={13}
            className="shrink-0 mt-0.5"
            style={{ color: "var(--safe)" }}
          />
          <span style={{ color: "var(--text2)" }}>{tip}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface ResultCardProps {
  type: "policy" | "factcheck" | "image";
  result: PolicyResult; // extend union when other modules ship
  cached: boolean;
  remainingCalls: number;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ResultCard({
  type,
  result,
  cached,
  remainingCalls,
}: ResultCardProps) {
  if (type !== "policy") return null; // other modules will fill this out

  const levelKey = mapLevel(result.riskLevel);

  return (
    <div
      className="rounded-[var(--radius)] overflow-hidden"
      style={{ border: "1px solid var(--border2)", background: "var(--bg2)" }}
    >
      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div
        className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
        style={{
          background: "var(--bg3)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3">
          <Shield size={18} style={{ color: "var(--accent)" }} />
          <span
            className="text-sm font-bold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}
          >
            Analysis Result
          </span>
        </div>
        <div className="flex items-center gap-2">
          {cached && (
            <span
              className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium"
              style={{
                background: "rgba(91,156,246,0.12)",
                color: "var(--accent)",
                border: "1px solid rgba(91,156,246,0.25)",
              }}
            >
              <Zap size={10} />
              Loaded from cache
            </span>
          )}
          <RiskBadge level={levelKey} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Risk meter ─────────────────────────────────────────────────── */}
        <RiskMeter score={result.riskScore} />

        {/* ── Simple summary box ─────────────────────────────────────────── */}
        <div
          className="rounded-xl px-5 py-4"
          style={{
            background: "rgba(91,156,246,0.07)",
            border: "1px solid rgba(91,156,246,0.2)",
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Info size={13} style={{ color: "var(--accent)" }} />
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--accent)" }}
            >
              Plain-English Summary
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {result.simpleSummary}
          </p>
        </div>

        {/* ── Verdict ────────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text3)" }}>
            Verdict
          </p>
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            {result.verdict}
          </p>
        </div>

        <hr style={{ borderColor: "var(--border)" }} />

        {/* ── Three-column tags ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Section
            icon={<Info size={14} />}
            title="What they collect"
            color="var(--caution)"
          >
            <TagList items={result.whatTheyCollect} color="var(--caution)" />
          </Section>

          <Section
            icon={<Users size={14} />}
            title="Who they share with"
            color="var(--danger)"
          >
            <TagList items={result.whoTheyShare} color="var(--danger)" />
          </Section>

          <Section
            icon={<CheckCircle2 size={14} />}
            title="Your rights"
            color="var(--safe)"
          >
            <TagList items={result.yourRights} color="var(--safe)" />
          </Section>
        </div>

        <hr style={{ borderColor: "var(--border)" }} />

        {/* ── Red flags ──────────────────────────────────────────────────── */}
        <Section
          icon={<AlertTriangle size={14} />}
          title="Red Flags"
          color="var(--danger)"
        >
          <RedFlagsList flags={result.redFlags} />
        </Section>

        {/* ── Opt-out tips ─────────────────────────────────────────────────── */}
        <Section
          icon={<Lightbulb size={14} />}
          title="Opt-out Tips"
          color="var(--safe)"
        >
          <TipsList tips={result.optOutTips} />
        </Section>

        {/* ── Footer meta ────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between pt-2 text-xs"
          style={{ color: "var(--text3)", borderTop: "1px solid var(--border)" }}
        >
          <span>Powered by Gemini 2.5 Flash</span>
          <span>{remainingCalls} AI calls remaining today</span>
        </div>
      </div>
    </div>
  );
}
