"use client";

import { useEffect, useRef, useState } from "react";

interface CredibilityRingProps {
  score: number; // 0–100
  size?: number;
  strokeWidth?: number;
}

function getColor(score: number): string {
  if (score >= 70) return "var(--safe)";
  if (score >= 40) return "var(--caution)";
  return "var(--danger)";
}

function getLabel(score: number): string {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

const DURATION = 900; // ms

export default function CredibilityRing({
  score,
  size = 120,
  strokeWidth = 9,
}: CredibilityRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const color   = getColor(clamped);
  const label   = getLabel(clamped);

  // SVG geometry
  const center       = size / 2;
  const radius       = center - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  // Animated display values
  const [displayScore, setDisplayScore] = useState(0);
  const [offset,       setOffset]       = useState(circumference);

  // Refs — avoid capturing stale values inside rAF callbacks
  const rafRef   = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset state each time score changes so the animation replays cleanly
    setDisplayScore(0);
    setOffset(circumference);
    startRef.current = null;

    const animate = (ts: number) => {
      // Use strict null check — ts could legitimately be 0 on first frame
      if (startRef.current === null) startRef.current = ts;

      const elapsed  = ts - startRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      setOffset(circumference - eased * (clamped / 100) * circumference);
      setDisplayScore(Math.round(eased * clamped));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startRef.current = null;
    };
  }, [clamped, circumference]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-label={`Credibility score: ${clamped}%`}
          role="img"
        >
          {/* Track ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--bg4)"
            strokeWidth={strokeWidth}
          />
          {/* Animated progress ring — starts at top (rotate -90°) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{
              filter: `drop-shadow(0 0 6px ${color}88)`,
              transition: "stroke 0.3s ease",
            }}
          />
        </svg>

        {/* Center score label — hidden from screen readers (SVG aria-label covers it) */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center select-none"
          aria-hidden={true}
        >
          <span
            className="text-2xl font-bold leading-none"
            style={{ fontFamily: "Syne, sans-serif", color }}
          >
            {displayScore}
            <span className="text-sm font-normal">%</span>
          </span>
        </div>
      </div>

      {/* Credibility label below ring */}
      <div className="text-center">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color }}
        >
          {label} Credibility
        </span>
      </div>
    </div>
  );
}
