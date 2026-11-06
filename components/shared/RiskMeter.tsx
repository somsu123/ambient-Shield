import { cn } from "@/lib/utils";

interface RiskMeterProps {
  /** Score from 0 to 10 */
  score: number;
  className?: string;
  showLabel?: boolean;
}

function getRiskColor(score: number): string {
  if (score <= 3) return "var(--safe)";
  if (score <= 6) return "var(--caution)";
  return "var(--danger)";
}

function getRiskLabel(score: number): string {
  if (score <= 3) return "Low Risk";
  if (score <= 6) return "Moderate Risk";
  return "High Risk";
}

export default function RiskMeter({
  score,
  className,
  showLabel = true,
}: RiskMeterProps) {
  const clamped = Math.max(0, Math.min(10, score));
  const pct = (clamped / 10) * 100;
  const color = getRiskColor(clamped);
  const label = getRiskLabel(clamped);

  return (
    <div className={cn("w-full space-y-2", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: "var(--text2)" }}>Risk Score</span>
          <span className="font-semibold" style={{ color }}>
            {clamped.toFixed(1)} / 10 &mdash; {label}
          </span>
        </div>
      )}
      {/* Track */}
      <div
        className="relative w-full h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg4)" }}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-label={`Risk score: ${clamped} out of 10`}
      >
        {/* Gradient fill */}
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, var(--safe) 0%, var(--caution) 50%, var(--danger) 100%)`,
            clipPath: `inset(0 ${100 - pct}% 0 0)`,
          }}
        />
        {/* Thumb dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all duration-700 ease-out"
          style={{
            left: `calc(${pct}% - 6px)`,
            borderColor: color,
            background: "var(--bg)",
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>

      {/* Tick marks */}
      <div className="flex justify-between px-0.5">
        {[0, 2, 4, 6, 8, 10].map((tick) => (
          <span key={tick} className="text-[10px]" style={{ color: "var(--text3)" }}>
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}
