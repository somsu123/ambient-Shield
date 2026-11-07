import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
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
        "flex flex-col items-center justify-center text-center py-14 px-8 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60",
        className
      )}
    >
      {/* Icon */}
      <div className="w-12 h-12 rounded-lg flex items-center justify-center text-xl mb-4 bg-zinc-900 border border-zinc-850 select-none">
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white mb-1.5 tracking-tight">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
          {description}
        </p>
      )}

      {/* Optional action slot */}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
