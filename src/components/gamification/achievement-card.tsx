import { cn } from "@/lib/utils";
import { Trophy, Zap, Target, Flame, Star, Award, Calendar, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Achievement } from "@/types";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  trophy: Trophy,
  zap: Zap,
  target: Target,
  flame: Flame,
  star: Star,
  award: Award,
  calendar: Calendar,
  trending: TrendingUp,
};

interface AchievementCardProps {
  achievement: Achievement;
  locked?: boolean;
}

export function AchievementCard({ achievement, locked = false }: AchievementCardProps) {
  const Icon = iconMap[achievement.icon] ?? Trophy;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border p-4 transition-all",
        locked
          ? "border-zinc-800 bg-zinc-900/50 opacity-50"
          : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
          locked ? "bg-zinc-800" : "bg-blue-600/15 border border-blue-600/30"
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6",
            locked ? "text-zinc-600" : "text-blue-400"
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold text-sm", locked ? "text-zinc-600" : "text-zinc-100")}>
          {achievement.title}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">{achievement.description}</p>
        {!locked && (
          <p className="text-[11px] text-blue-400/70 mt-1">
            Conquistado em{" "}
            {format(parseISO(achievement.earned_at), "dd 'de' MMMM 'de' yyyy", {
              locale: ptBR,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
