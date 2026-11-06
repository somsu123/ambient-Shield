import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--accent)] text-white",
        secondary:
          "border-transparent bg-[var(--bg3)] text-[var(--text2)]",
        destructive:
          "border-transparent bg-[var(--danger)] text-white",
        outline:
          "border-[var(--border2)] text-[var(--text2)]",
        safe:
          "border-transparent bg-[rgba(62,207,142,0.15)] text-[var(--safe)] border border-[rgba(62,207,142,0.3)]",
        caution:
          "border-transparent bg-[rgba(245,166,35,0.15)] text-[var(--caution)] border border-[rgba(245,166,35,0.3)]",
        danger:
          "border-transparent bg-[rgba(255,77,109,0.15)] text-[var(--danger)] border border-[rgba(255,77,109,0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
