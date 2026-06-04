import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReactNode } from "react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: number; label: string; positive: boolean; };
  color?: "blue" | "green" | "orange" | "purple" | "red";
  className?: string;
  progress?: number; // 0-100 for progress bar
  hint?: string;
}

const accentMap = {
  blue:   { bar: "bg-[#D4853A]",     text: "text-[#D4853A]",   border: "border-l-[#D4853A]" },
  orange: { bar: "bg-[#D4853A]",     text: "text-[#D4853A]",   border: "border-l-[#D4853A]" },
  green:  { bar: "bg-[#5A8A6A]",     text: "text-[#5A8A6A]",   border: "border-l-[#5A8A6A]" },
  purple: { bar: "bg-purple-500/70", text: "text-purple-400",   border: "border-l-purple-500/70" },
  red:    { bar: "bg-[#8B5A5A]",     text: "text-[#8B5A5A]",   border: "border-l-[#8B5A5A]" },
};

export function StatsCard({ label, value, icon, trend, color = "blue", className, progress, hint }: StatsCardProps) {
  const accent = accentMap[color];
  return (
    <div className={cn(
      "rounded-xl card-gradient border-l-[3px] p-5 flex flex-col gap-3 hover:brightness-110 transition-all duration-200 overflow-hidden",
      accent.border,
      className
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]", accent.text)}>
          {icon}
        </div>
      </div>

      <div>
        <p className={cn("text-3xl font-black italic tracking-tight leading-none", accent.text)}>{value}</p>
        {hint && <p className="text-[11px] text-zinc-600 mt-1.5">{hint}</p>}
        {trend && (
          <div className="flex items-center gap-1 mt-1.5">
            {trend.value > 0 ? <TrendingUp className="h-3 w-3 text-[#5A8A6A]" /> :
             trend.value < 0 ? <TrendingDown className="h-3 w-3 text-[#8B5A5A]" /> :
             <Minus className="h-3 w-3 text-zinc-500" />}
            <span className={cn("text-xs font-medium", trend.positive ? "text-[#5A8A6A]" : trend.value === 0 ? "text-zinc-500" : "text-[#8B5A5A]")}>
              {trend.label}
            </span>
          </div>
        )}
      </div>

      {progress !== undefined && (
        <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden mt-1">
          <div className={cn("h-full rounded-full transition-all duration-500", accent.bar)} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
    </div>
  );
}
