'use client';

import { useEffect, useState } from 'react';
import { WorkoutTodayCard } from './workout-today-card';
import { selectTodayWorkout, selectNextWorkout, type SimpleDay, type Schedule } from '@/lib/edn/today-workout';
import type { WorkoutPlan, WorkoutDay } from '@/types';

/**
 * Wrapper CLIENTE do card "Treino de Hoje".
 * Calcula o treino do dia usando a DATA LOCAL DO APARELHO (igual ao Calendário),
 * eliminando divergência de fuso entre servidor (UTC) e dispositivo.
 */
export function WorkoutTodayClient({ plan }: { plan: WorkoutPlan | null }) {
  const [workoutDay, setWorkoutDay] = useState<WorkoutDay | null>(null);
  const [nextWorkout, setNextWorkout] = useState<{ weekday: string; name: string; label?: string | null } | null>(null);
  const [todayLabel, setTodayLabel] = useState(() =>
    new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
  );

  useEffect(() => {
    const now = new Date();
    setTodayLabel(now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }));
    const days = ((plan?.workout_days ?? []) as unknown) as SimpleDay[];
    const schedule = ((plan as unknown as { schedule_config?: Schedule | null })?.schedule_config) ?? null;
    const jsDay = now.getDay();
    if (!days.length) { setWorkoutDay(null); setNextWorkout(null); return; }
    const t = selectTodayWorkout(days, schedule, jsDay);
    setWorkoutDay((t as unknown as WorkoutDay) ?? null);
    setNextWorkout(selectNextWorkout(days, schedule, jsDay));
  }, [plan]);

  return (
    <WorkoutTodayCard
      workoutDay={workoutDay}
      plan={plan}
      isRestDay={!workoutDay}
      nextWorkout={nextWorkout}
      todayLabel={todayLabel}
    />
  );
}
