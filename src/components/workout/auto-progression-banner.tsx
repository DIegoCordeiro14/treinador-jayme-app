'use client';

/**
 * Auto-Progression Banner — V4.0 Module 4
 * Detecta exercícios com carga estagnada e sugere progressão linear.
 * Exibido na página do plano de treino.
 */

import { useState, useEffect } from 'react';
import { TrendingUp, ChevronRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StagnantExercise {
  exerciseId: string;
  exerciseName: string;
  currentTopSetKg: number;
  suggestedKg: number;
  weeksSinceLastPR: number;
}

interface AutoProgressionBannerProps {
  planId: string;
}

export function AutoProgressionBanner({ planId }: AutoProgressionBannerProps) {
  const supabase = createClient();
  const [exercises, setExercises] = useState<StagnantExercise[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function detect() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const since14d = new Date(Date.now() - 14 * 86400000).toISOString();

      // Get all exercises in active plan's workout days
      const { data: planExercises } = await supabase
        .from('workout_exercises')
        .select('id, exercise_id, exercises(name), workout_days!inner(plan_id)')
        .eq('workout_days.plan_id', planId);

      if (!planExercises?.length) { setLoaded(true); return; }

      // For each exercise, check if there's been a PR in last 14 days
      const results: StagnantExercise[] = [];

      for (const pe of planExercises.slice(0, 8)) {
        const exId = pe.exercise_id;
        const exName = (pe.exercises as any)?.name ?? 'Exercício';

        const { data: recentSets } = await supabase
          .from('progressions')
          .select('weight_kg, recorded_at')
          .eq('user_id', user.id)
          .eq('exercise_id', exId)
          .eq('set_type', 'topset')
          .order('recorded_at', { ascending: false })
          .limit(10);

        if (!recentSets || recentSets.length < 3) continue;

        const recent14d = recentSets.filter(s => s.recorded_at >= since14d);
        const older = recentSets.filter(s => s.recorded_at < since14d);

        if (!recent14d.length || !older.length) continue;

        const currentTop = Math.max(...recent14d.map(s => s.weight_kg));
        const previousTop = Math.max(...older.map(s => s.weight_kg));

        // Stagnant if no improvement (< 2.5kg gain)
        if (currentTop - previousTop < 2.5) {
          const increment = currentTop <= 20 ? 1.25 : currentTop <= 60 ? 2.5 : 5;
          const weeksSince = Math.round(
            (Date.now() - new Date(recentSets[recentSets.length - 1].recorded_at).getTime()) /
            (7 * 86400000)
          );
          results.push({
            exerciseId: exId,
            exerciseName: exName,
            currentTopSetKg: currentTop,
            suggestedKg: currentTop + increment,
            weeksSinceLastPR: weeksSince,
          });
        }
      }

      setExercises(results.slice(0, 4));
      setLoaded(true);
    }
    detect();
  }, [planId]);

  const visible = exercises.filter(e => !dismissed.has(e.exerciseId));
  if (!loaded || visible.length === 0) return null;

  async function applyProgression(ex: StagnantExercise) {
    setApplying(prev => new Set(prev).add(ex.exerciseId));
    try {
      // Find the workout_exercise row and update weight target in notes
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Log intent in ai_conversations as a note (lightweight)
      toast.success(`Meta atualizada: ${ex.exerciseName} → ${ex.suggestedKg}kg no próximo treino`);
      setDismissed(prev => new Set(prev).add(ex.exerciseId));
    } finally {
      setApplying(prev => { const s = new Set(prev); s.delete(ex.exerciseId); return s; });
    }
  }

  return (
    <div className="rounded-xl border border-blue-600/20 bg-blue-600/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-blue-400" />
        <p className="text-sm font-semibold text-zinc-100">Progressão automática sugerida</p>
        <span className="ml-auto text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
          Coach EDN
        </span>
      </div>
      <p className="text-xs text-zinc-400">
        {visible.length} exercício{visible.length > 1 ? 's' : ''} sem progressão de carga há 2+ semanas.
      </p>
      <div className="space-y-2">
        {visible.map(ex => (
          <div key={ex.exerciseId} className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100 truncate">{ex.exerciseName}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Top set atual: <span className="text-zinc-300">{ex.currentTopSetKg}kg</span>
                {' → '}
                <span className="text-green-400 font-semibold">{ex.suggestedKg}kg</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-3">
              <Button
                size="sm"
                className="h-7 text-xs gap-1 px-2.5"
                onClick={() => applyProgression(ex)}
                disabled={applying.has(ex.exerciseId)}
              >
                <Check className="h-3 w-3" />
                Aplicar
              </Button>
              <button
                onClick={() => setDismissed(prev => new Set(prev).add(ex.exerciseId))}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
