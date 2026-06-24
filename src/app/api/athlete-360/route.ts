import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedAthleteContext } from '@/lib/edn/athlete-context';
import { computeEdn360, detectWeakPoint, type MuscleVolume } from '@/lib/edn/athlete-intelligence-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/athlete-360 — Central do Atleta (determinístico).
 * EDN 360 Score (treino/nutrição/recuperação/cardio) + principal limitador +
 * próxima ação + Weak Point Engine (evolução por grupo muscular).
 */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Scores já calculados pelos sub-motores (fonte única).
  const ctx = await getCachedAthleteContext(user.id);
  const s = ctx.scores;
  const edn360 = computeEdn360({
    training: Math.round((s.consistency + s.progression) / 2),
    nutrition: s.nutrition,
    recovery: s.recovery,
    cardio: s.cardio,
  });

  // ── Weak Point: volume por grupo muscular, 30d recente vs 30–60d anterior ──
  const now = Date.now();
  const d60 = new Date(now - 60 * 86400000);
  const { data: sets } = await supabase
    .from('session_sets')
    .select('weight_kg, reps_done, completed, session:workout_sessions!inner(started_at, user_id), exercise:exercises(muscle_group)')
    .eq('session.user_id', user.id)
    .gte('session.started_at', d60.toISOString());

  const acc: Record<string, { recent: number; prior: number; sessionsSet: Set<string> }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (sets ?? []) as any[]) {
    if (row.completed === false) continue;
    const mg = row.exercise?.muscle_group;
    const startedAt = row.session?.started_at;
    if (!mg || !startedAt) continue;
    const vol = (row.weight_kg ?? 0) * (row.reps_done ?? 0);
    const t = new Date(startedAt).getTime();
    const recent = t >= now - 30 * 86400000;
    if (!acc[mg]) acc[mg] = { recent: 0, prior: 0, sessionsSet: new Set() };
    if (recent) { acc[mg].recent += vol; acc[mg].sessionsSet.add(startedAt.slice(0, 10)); }
    else acc[mg].prior += vol;
  }
  const muscles: MuscleVolume[] = Object.entries(acc).map(([muscle, v]) => ({
    muscle, recentVolume: Math.round(v.recent), priorVolume: Math.round(v.prior), sessions: v.sessionsSet.size,
  }));
  const weakPoint = detectWeakPoint(muscles);

  return Response.json({ edn360, weakPoint, league: s.league });
}
