import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-blue-600 text-white",
        secondary:
          "border-transparent bg-zinc-800 text-zinc-300",
        outline:
          "border-zinc-700 text-zinc-300 bg-transparent",
        destructive:
          "border-transparent bg-red-600/20 text-red-400 border-red-500/30",
        success:
          "border-transparent bg-green-600/20 text-green-400 border-green-500/30",
        warning:
          "border-transparent bg-yellow-600/20 text-yellow-400 border-yellow-500/30",
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
