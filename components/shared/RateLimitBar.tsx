"use client";

interface RateLimitBarProps {
  remainingCalls: number;
  /** Total daily budget — default 30 (per-IP daily limit) */
  totalCalls?: number;
}

function getColor(remaining: number): { text: string; bar: string; bg: string; border: string } {
  if (remaining > 10) {
    return {
      text: "var(--safe)",
      bar: "var(--safe)",
      bg: "rgba(62,207,142,0.08)",
      border: "rgba(62,207,142,0.2)",
    };
  }
  if (remaining >= 5) {
    return {
      text: "var(--caution)",
      bar: "var(--caution)",
      bg: "rgba(245,166,35,0.08)",
      border: "rgba(245,166,35,0.2)",
    };
  }
  return {
    text: "var(--danger)",
    bar: "var(--danger)",
    bg: "rgba(255,77,109,0.08)",
    border: "rgba(255,77,109,0.2)",
  };
}

export default function RateLimitBar({
  remainingCalls,
  totalCalls = 30,
}: RateLimitBarProps) {
  const pct = Math.max(0, Math.min(100, (remainingCalls / totalCalls) * 100));
  const colors = getColor(remainingCalls);
  const label =
    remainingCalls === 0
      ? "Daily limit reached — resets in ~24 hours"
      : `${remainingCalls} free AI analyses remaining today`;

  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
      role="status"
      aria-label={label}
    >
      {/* Label */}
      <span
        className="text-xs font-medium shrink-0"
        style={{ color: colors.text }}
      >
        {label}
      </span>

      {/* Progress bar */}
      <div className="flex-1 flex items-center gap-2 sm:justify-end">
        <div
          className="flex-1 sm:max-w-[160px] h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--bg4)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: colors.bar,
              boxShadow: `0 0 6px ${colors.bar}88`,
            }}
          />
        </div>
        <span
          className="text-[10px] font-mono shrink-0"
          style={{ color: "var(--text3)" }}
        >
          {remainingCalls}/{totalCalls}
        </span>
      </div>
    </div>
  );
}
