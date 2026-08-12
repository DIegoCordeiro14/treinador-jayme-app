import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeExerciseEvolution, computeMuscleGroupEvolution, type ExerciseSessionPoint, type MuscleExerciseEvolution } from '@/lib/edn/exercise-evolution-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/** GET /api/exercise-evolution?days=90 — evolução por exercício e por grupo muscular. */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const days = Math.min(730, Math.max(7, Number(req.nextUrl.searchParams.get('days')) || 90));
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: sets } = await supabase
    .from('session_sets')
    .select('weight_kg, reps_done, rir, completed, exercise:exercises(id, name, muscle_group), session:workout_sessions!inner(started_at, user_id)')
    .eq('session.user_id', user.id)
    .gte('session.started_at', since);

  // Agrupa por exercício → por sessão
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byEx: Record<string, { name: string; muscle: string; sessions: Record<string, { top: number; topReps: number; vol: number; rirs: number[] }> }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (sets ?? []) as any[]) {
    if (s.completed === false || !s.weight_kg || !s.exercise?.id) continue;
    const exId = s.exercise.id;
    const day = s.session?.started_at ?? '';
    if (!byEx[exId]) byEx[exId] = { name: s.exercise.name ?? '', muscle: s.exercise.muscle_group ?? 'outro', sessions: {} };
    const ss = byEx[exId].sessions[day] ?? (byEx[exId].sessions[day] = { top: 0, topReps: 0, vol: 0, rirs: [] });
    const w = s.weight_kg, r = s.reps_done ?? 0;
    ss.vol += w * r;
    if (w > ss.top) { ss.top = w; ss.topReps = r; }
    if (s.rir != null) ss.rirs.push(s.rir);
  }

  const exercises = Object.entries(byEx).map(([exId, d]) => {
    const points: ExerciseSessionPoint[] = Object.entries(d.sessions).map(([day, v]) => ({
      dateMs: new Date(day).getTime(), topSetKg: v.top, topReps: v.topReps, volumeKg: Math.round(v.vol),
      avgRir: v.rirs.length ? v.rirs.reduce((a, b) => a + b, 0) / v.rirs.length : null,
    }));
    return { exerciseId: exId, name: d.name, muscle: d.muscle, evolution: computeExerciseEvolution(points) };
  }).sort((a, b) => (b.evolution.topSetTrendPct ?? -999) - (a.evolution.topSetTrendPct ?? -999));

  // Agrupa por músculo
  const byMuscle: Record<string, MuscleExerciseEvolution[]> = {};
  for (const e of exercises) (byMuscle[e.muscle] ?? (byMuscle[e.muscle] = [])).push({ exerciseId: e.exerciseId, name: e.name, evolution: e.evolution });
  const muscles = Object.entries(byMuscle).map(([m, exs]) => computeMuscleGroupEvolution(m, exs)).sort((a, b) => (a.avgLoadTrendPct ?? 0) - (b.avgLoadTrendPct ?? 0));

  return Response.json({ days, exercises, muscles });
}
