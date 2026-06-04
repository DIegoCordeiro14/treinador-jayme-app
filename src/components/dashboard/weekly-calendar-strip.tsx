"use client";

import { cn } from "@/lib/utils";
import { format, startOfWeek, addDays, isToday, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WorkoutSession } from "@/types";

interface WeeklyCalendarStripProps {
  sessions: WorkoutSession[];
}

export function WeeklyCalendarStrip({ sessions }: WeeklyCalendarStripProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function hasWorkoutOnDay(date: Date): boolean {
    return sessions.some((s) => {
      const sessionDate = new Date(s.started_at);
      return isSameDay(sessionDate, date);
    });
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="text-sm font-semibold text-zinc-100 mb-4">
        Semana Atual
      </h3>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, i) => {
          const hasWorkout = hasWorkoutOnDay(day);
          const dayIsToday = isToday(day);
          const isPast = day < today && !dayIsToday;

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="text-[10px] font-medium text-zinc-500 uppercase">
                {format(day, "EEE", { locale: ptBR }).slice(0, 3)}
              </span>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-all",
                  hasWorkout && "bg-green-600/20 border border-green-600/40 text-green-400",
                  !hasWorkout && dayIsToday && "bg-[#D4853A]/20 border border-[#D4853A]/50 text-[#E09B5A] ring-1 ring-[#D4853A]/50",
                  !hasWorkout && isPast && "bg-zinc-800 text-zinc-600",
                  !hasWorkout && !isPast && !dayIsToday && "bg-zinc-800/50 border border-zinc-700/50 text-zinc-500"
                )}
              >
                {format(day, "d")}
              </div>
              <div
                className={cn(
                  "h-1 w-1 rounded-full",
                  hasWorkout ? "bg-green-400" : "bg-transparent"
                )}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-zinc-800">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded bg-green-600/30 border border-green-600/40" />
          <span className="text-[11px] text-zinc-500">Treino feito</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded bg-[#D4853A]/30 border border-[#D4853A]/50" />
          <span className="text-[11px] text-zinc-500">Hoje</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded bg-zinc-800 border border-zinc-700/50" />
          <span className="text-[11px] text-zinc-500">Pendente</span>
        </div>
      </div>
    </div>
  );
}
