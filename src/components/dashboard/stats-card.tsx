import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReactNode } from "react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: number;
    label: string;
    positive: boolean;
  };
  color?: "blue" | "green" | "orange" | "purple" | "red";
  className?: string;
}

const colorMap = {
  blue: "bg-[#D4853A]/10 text-[#D4853A] border-[#D4853A]/20",
  green: "bg-green-600/10 text-green-400 border-green-600/20",
  orange: "bg-orange-600/10 text-orange-400 border-orange-600/20",
  purple: "bg-purple-600/10 text-purple-400 border-purple-600/20",
  red: "bg-red-600/10 text-red-400 border-red-600/20",
};

export function StatsCard({
  label,
  value,
  icon,
  trend,
  color = "blue",
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          {label}
        </span>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border",
            colorMap[color]
          )}
        >
          {icon}
        </div>
      </div>

      <div>
        <p className="text-2xl font-bold text-zinc-100">{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {trend.value > 0 ? (
              <TrendingUp className="h-3 w-3 text-green-400" />
            ) : trend.value < 0 ? (
              <TrendingDown className="h-3 w-3 text-red-400" />
            ) : (
              <Minus className="h-3 w-3 text-zinc-500" />
            )}
            <span
              className={cn(
                "text-xs font-medium",
                trend.positive
                  ? "text-green-400"
                  : trend.value === 0
                  ? "text-zinc-500"
                  : "text-red-400"
              )}
            >
              {trend.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
