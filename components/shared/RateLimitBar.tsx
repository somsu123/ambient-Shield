"use client";

interface RateLimitBarProps {
  remainingCalls: number;
  totalCalls?: number;
}

export default function RateLimitBar({
  remainingCalls,
  totalCalls = 30,
}: RateLimitBarProps) {
  const pct = Math.max(0, Math.min(100, (remainingCalls / totalCalls) * 100));
  const isLow = remainingCalls < 5;

  return (
    <div
      className="rounded-lg px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-zinc-950 border border-zinc-800 text-xs font-mono"
      role="status"
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${isLow ? "bg-amber-400" : "bg-emerald-400"}`} />
        <span className="text-zinc-300">
          QUOTA: <strong className="text-white">{remainingCalls}/{totalCalls}</strong> SCANS REMAINING TODAY
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-24 h-1.5 bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isLow ? "bg-amber-500" : "bg-white"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-zinc-500">100% PRIVATE</span>
      </div>
    </div>
  );
}
