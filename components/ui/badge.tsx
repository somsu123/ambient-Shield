import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-white",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-white text-black font-semibold",
        secondary:
          "border-zinc-800 bg-zinc-900/80 text-zinc-300",
        destructive:
          "border-red-500/30 bg-red-500/10 text-red-400",
        outline:
          "border-zinc-800 text-zinc-300 bg-transparent",
        safe:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        caution:
          "border-amber-500/30 bg-amber-500/10 text-amber-400",
        danger:
          "border-rose-500/30 bg-rose-500/10 text-rose-400",
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
