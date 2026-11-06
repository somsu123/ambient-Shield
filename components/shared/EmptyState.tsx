import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function EmptyState({
  icon = "🔍",
  title,
  description,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-8 rounded-[var(--radius)]",
        className
      )}
      style={{
        border: "1px dashed var(--border2)",
        background: "rgba(14,21,32,0.5)",
      }}
    >
      {/* Icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5 select-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(91,156,246,0.08), rgba(58,123,213,0.04))",
          border: "1px solid var(--border)",
        }}
      >
        {icon}
      </div>

      {/* Title */}
      <h3
        className="text-base font-semibold mb-2"
        style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm max-w-xs leading-relaxed" style={{ color: "var(--text2)" }}>
          {description}
        </p>
      )}

      {/* Optional action slot */}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
