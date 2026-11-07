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
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-zinc-400">{icon}</span>
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function TagList({ items, variant = "default" }: { items: string[]; variant?: "default" | "danger" }) {
  if (!items || !items.length)
    return (
      <p className="text-xs font-mono italic text-zinc-600">
        None noted
      </p>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className={`text-xs px-2.5 py-0.5 rounded-md font-mono ${
            variant === "danger"
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
              : "bg-zinc-900 text-zinc-300 border border-zinc-800"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function RedFlagsList({ flags }: { flags: string[] }) {
  if (!flags || !flags.length)
    return (
      <p className="text-xs font-mono italic text-zinc-600">
        No critical red flags detected
      </p>
    );
  return (
    <ul className="space-y-2">
      {flags.map((flag, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <AlertTriangle
            size={13}
            className="shrink-0 mt-0.5 text-rose-400"
          />
          <span className="text-zinc-300 leading-relaxed">{flag}</span>
        </li>
      ))}
    </ul>
  );
}

function TipsList({ tips }: { tips: string[] }) {
  if (!tips || !tips.length)
    return (
      <p className="text-xs font-mono italic text-zinc-600">
        No specific opt-out steps required
      </p>
    );
  return (
    <ul className="space-y-2">
      {tips.map((tip, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <CheckCircle2
            size={13}
            className="shrink-0 mt-0.5 text-emerald-400"
          />
          <span className="text-zinc-300 leading-relaxed">{tip}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface ResultCardProps {
  type: "policy" | "factcheck" | "image";
  result: PolicyResult;
  cached: boolean;
  remainingCalls: number;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ResultCard({
  type,
  result,
  cached,
}: ResultCardProps) {
  if (type !== "policy") return null;

  const levelKey = mapLevel(result.riskLevel);
  const summaryText = result.simpleSummary || result.summary || result.verdict;

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 border-b border-zinc-850">
        <div className="flex items-center gap-2.5">
          <Shield size={16} className="text-white" />
          <span className="text-xs font-mono uppercase tracking-wider font-semibold text-white">
            POLICY AUDIT RESULT
          </span>
        </div>
        <div className="flex items-center gap-2">
          {cached && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center gap-1">
              <Zap size={10} />
              CACHED
            </span>
          )}
          <RiskBadge level={levelKey} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Risk meter ─────────────────────────────────────────────────── */}
        <RiskMeter score={result.riskScore} />

        {/* ── Simple summary box ─────────────────────────────────────────── */}
        <div className="rounded-lg p-4 bg-zinc-900/50 border border-zinc-800">
          <div className="flex items-center gap-2 mb-1.5">
            <Info size={13} className="text-white" />
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-300">
              Plain-English Breakdown
            </span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {summaryText}
          </p>
        </div>

        {/* ── Data collected & shared grid ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2 border-t border-zinc-900">
          <Section
            icon={<Shield size={14} />}
            title="Data Collected"
          >
            <TagList items={result.whatTheyCollect || []} />
          </Section>

          <Section
            icon={<Users size={14} />}
            title="Shared With Third Parties"
          >
            <TagList items={result.whoTheyShare || []} />
          </Section>
        </div>

        {/* ── User rights ─────────────────────────────────────────────────── */}
        <div className="pt-2 border-t border-zinc-900">
          <Section
            icon={<CheckCircle2 size={14} />}
            title="User Rights Recognized"
          >
            <TagList items={result.yourRights || []} />
          </Section>
        </div>

        {/* ── Red flags ───────────────────────────────────────────────────── */}
        <div className="pt-2 border-t border-zinc-900">
          <Section
            icon={<AlertTriangle size={14} className="text-rose-400" />}
            title="Flagged Concerns"
          >
            <RedFlagsList flags={result.redFlags || []} />
          </Section>
        </div>

        {/* ── Tips / opt-out ──────────────────────────────────────────────── */}
        <div className="pt-2 border-t border-zinc-900">
          <Section
            icon={<Lightbulb size={14} className="text-emerald-400" />}
            title="Opt-Out & Protection Steps"
          >
            <TipsList tips={result.optOutTips || []} />
          </Section>
        </div>
      </div>
    </div>
  );
}
