'use client';

import { useEffect, useState } from 'react';
import { WorkoutTodayCard } from './workout-today-card';
import { selectTodayWorkout, selectNextWorkout, type SimpleDay, type Schedule } from '@/lib/edn/today-workout';
import type { WorkoutPlan, WorkoutDay } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';

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
  const [cardioToday, setCardioToday] = useState<{ count: number; km: number | null; type: string | null; planned: boolean } | null>(null);

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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const dateStr = format(new Date(), 'yyyy-MM-dd');
        const { data } = await supabase.from('cardio_sessions')
          .select('type, distance_km')
          .eq('user_id', user.id).is('deleted_at', null)
          .gte('performed_at', dateStr).lte('performed_at', dateStr + 'T23:59:59');
        if (!alive) return;
        const rows = (data ?? []) as { type: string | null; distance_km: number | null }[];
        if (rows.length) {
          const km = rows.reduce((a, r) => a + (r.distance_km ?? 0), 0);
          setCardioToday({ count: rows.length, km: km > 0 ? Math.round(km * 10) / 10 : null, type: rows[0].type ?? null, planned: false });
          return;
        }
        // Sem cardio feito hoje: verifica se há cardio PLANEJADO para hoje
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = (plan as any)?.schedule_config as { start_date?: string; pattern?: number[]; cardio?: { training_days?: { type?: string; duration_min?: number }; rest_days?: { type?: string; duration_min?: number } } | null } | null;
        if (cfg?.cardio) {
          const meaningful = (c?: { type?: string; duration_min?: number } | null) => {
            const t = String(c?.type ?? '').toLowerCase();
            if (!t || /nenhum|none|sem\s|descanso|repouso|off/.test(t)) return false;
            return (c?.duration_min ?? 0) > 0;
          };
          const ednDay = new Date().getDay() === 0 ? 7 : new Date().getDay();
          const isWorkout = (cfg.pattern ?? []).includes(ednDay);
          const c = isWorkout ? cfg.cardio.training_days : cfg.cardio.rest_days;
          if (meaningful(c)) { setCardioToday({ count: 0, km: null, type: c!.type ?? null, planned: true }); return; }
        }
        setCardioToday(null);
      } catch { /* silencioso */ }
    })();
    return () => { alive = false; };
  }, [plan]);

  return (
    <WorkoutTodayCard
      workoutDay={workoutDay}
      plan={plan}
      isRestDay={!workoutDay}
      nextWorkout={nextWorkout}
      todayLabel={todayLabel}
      cardioToday={cardioToday}
    />
  );
}
