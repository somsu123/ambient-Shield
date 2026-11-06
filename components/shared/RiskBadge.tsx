import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, XCircle } from "lucide-react";

export type RiskLevel = "safe" | "caution" | "danger";

interface RiskBadgeProps {
  level: RiskLevel;
  label?: string;
  className?: string;
}

const config: Record<
  RiskLevel,
  {
    icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
    defaultLabel: string;
    variant: "safe" | "caution" | "danger";
  }
> = {
  safe: {
    icon: ShieldCheck,
    defaultLabel: "Safe",
    variant: "safe",
  },
  caution: {
    icon: AlertTriangle,
    defaultLabel: "Caution",
    variant: "caution",
  },
  danger: {
    icon: XCircle,
    defaultLabel: "High Risk",
    variant: "danger",
  },
};

export default function RiskBadge({
  level,
  label,
  className,
}: RiskBadgeProps) {
  const { icon: Icon, defaultLabel, variant } = config[level];

  return (
    <Badge
      variant={variant}
      className={cn("flex items-center gap-1.5 font-semibold text-xs", className)}
    >
      <Icon size={11} strokeWidth={2.5} />
      <span>{label ?? defaultLabel}</span>
    </Badge>
  );
}
