import Link from "next/link";
import { Play, Moon, ChevronRight, Dumbbell, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkoutDay, WorkoutPlan } from "@/types";

interface WorkoutTodayCardProps {
  workoutDay: WorkoutDay | null;
  plan: WorkoutPlan | null;
  isRestDay?: boolean;
  /** Informativo do próximo treino agendado, ex.: { weekday: "sexta-feira", name: "Treino C", label: "legs/abs" } */
  nextWorkout?: { weekday: string; name: string; label?: string | null } | null;
  /** Data de "hoje" já formatada no fuso correto (vem do servidor para casar com o Calendário) */
  todayLabel?: string;
  /** Cardio realizado hoje (para não rotular dia de cardio como descanso/musculação) */
  cardioToday?: { count: number; km: number | null; type: string | null; planned?: boolean } | null;
}

function NextWorkoutInfo({ nextWorkout }: { nextWorkout?: { weekday: string; name: string; label?: string | null } | null }) {
  if (!nextWorkout) return null;
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-[#D4853A]/[0.08] border border-[#D4853A]/20 px-3 py-2.5">
      <ChevronRight className="h-3.5 w-3.5 text-[#D4853A] shrink-0" />
      <p className="text-xs text-zinc-400 min-w-0">
        Próximo treino:{" "}
        <span className="font-semibold text-[#D4853A]">{nextWorkout.name}</span>
        {" · "}
        <span className="capitalize text-zinc-300">{nextWorkout.weekday}</span>
        {nextWorkout.label ? <span className="text-zinc-500"> ({nextWorkout.label})</span> : null}
      </p>
    </div>
  );
}

export function WorkoutTodayCard({
  workoutDay,
  plan,
  isRestDay = false,
  nextWorkout = null,
  todayLabel,
  cardioToday = null,
}: WorkoutTodayCardProps) {
  const dateLabel =
    todayLabel ??
    new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });

  if (isRestDay || !workoutDay || !plan) {
    const isCardioDay = !!cardioToday && (cardioToday.count > 0 || cardioToday.planned === true);
    return (
      <div className={`rounded-xl border p-6 ${isCardioDay ? 'border-[#3FA7C4]/30 bg-[#3FA7C4]/[0.05]' : 'border-zinc-800 bg-zinc-900'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isCardioDay ? 'bg-[#3FA7C4]/20 border border-[#3FA7C4]/30' : 'bg-zinc-800'}`}>
            {isCardioDay ? <Activity className="h-5 w-5 text-[#3FA7C4]" /> : <Moon className="h-5 w-5 text-zinc-400" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{isCardioDay ? 'Cardio de Hoje' : 'Treino de Hoje'}</h3>
            <p className="text-xs text-zinc-500">{dateLabel}</p>
          </div>
        </div>
        {isCardioDay ? (
          <div className="text-center py-4">
            {cardioToday!.planned ? (
              <>
                <p className="text-[#8FD0E0] font-medium">{cardioToday!.type ? cardioToday!.type : 'Cardio'} planejado hoje</p>
                <p className="text-xs text-zinc-500 mt-1">Dia de cardio — sem musculação. Registre ao concluir.</p>
                <Link href="/app/cardio">
                  <Button className="w-full mt-4 gap-2" size="sm">
                    <Activity className="h-4 w-4" /> Ir para o Cardio
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-[#8FD0E0] font-medium">{cardioToday!.type ? cardioToday!.type : 'Cardio'} concluído</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {cardioToday!.count > 1 ? `${cardioToday!.count} sessões` : '1 sessão'}{cardioToday!.km ? ` · ${cardioToday!.km} km` : ''} · sem musculação hoje
                </p>
              </>
            )}
          </div>
        ) : (
        <div className="text-center py-4">
          <p className="text-zinc-400 font-medium">Dia de Descanso</p>
          <p className="text-xs text-zinc-600 mt-1">
            Recuperação é parte do treino. Descanse bem!
          </p>
        </div>
        )}
        <NextWorkoutInfo nextWorkout={nextWorkout} />
        <Link href="/app/treinos">
          <Button variant="outline" className="w-full mt-2" size="sm">
            Ver planos de treino
          </Button>
        </Link>
      </div>
    );
  }

  const exerciseCount = workoutDay.workout_exercises?.length ?? 0;

  return (
    <div className="rounded-xl border border-[#D4853A]/30 bg-gradient-card p-6 relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4853A]/5 rounded-full blur-2xl" />

      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#D4853A]/20 border border-[#D4853A]/30">
          <Dumbbell className="h-5 w-5 text-[#D4853A]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Treino de Hoje</h3>
          <p className="text-xs text-zinc-500">{dateLabel}</p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-zinc-100 mb-1">{workoutDay.name}</h2>
      <p className="text-sm text-zinc-400 mb-1">{plan.name}</p>
      <p className="text-xs text-zinc-500 mb-5">
        {exerciseCount} {exerciseCount === 1 ? "exercício" : "exercícios"}
      </p>

      {/* Exercise preview */}
      {workoutDay.workout_exercises && workoutDay.workout_exercises.length > 0 && (
        <div className="space-y-1.5 mb-5">
          {workoutDay.workout_exercises.slice(0, 3).map((we) => (
            <div
              key={we.id}
              className="flex items-center justify-between text-xs py-1.5 px-3 rounded-md bg-zinc-800/60"
            >
              <span className="text-zinc-300 font-medium">{we.exercise.name}</span>
              <span className="text-zinc-500">
                {we.sets}×{we.reps_min}–{we.reps_max}
              </span>
            </div>
          ))}
          {exerciseCount > 3 && (
            <p className="text-xs text-zinc-500 px-3">
              +{exerciseCount - 3} mais exercícios
            </p>
          )}
        </div>
      )}

      <Link href={`/app/treinos/${plan.id}/executar?day=${workoutDay.id}`}>
        <Button className="w-full gap-2">
          <Play className="h-4 w-4" />
          Iniciar Treino
        </Button>
      </Link>
      <NextWorkoutInfo nextWorkout={nextWorkout} />
    </div>
  );
}
