import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeAllVolume, type MuscleWeekVolume } from '@/lib/edn/volume-analysis';

export const runtime = 'nodejs';
export const maxDuration = 15;

/** GET /api/volume-analysis — séries/semana por grupo muscular (semana atual vs anterior) + veredito. */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const since = new Date(now - 14 * 86400000);
  const { data: sets } = await supabase
    .from('session_sets')
    .select('completed, session:workout_sessions!inner(started_at, user_id), exercise:exercises(muscle_group)')
    .eq('session.user_id', user.id)
    .gte('session.started_at', since.toISOString());

  const acc: Record<string, { thisW: number; prevW: number; daysThis: Set<string> }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (sets ?? []) as any[]) {
    if (row.completed === false) continue;
    const mg = row.exercise?.muscle_group; const st = row.session?.started_at;
    if (!mg || !st) continue;
    const t = new Date(st).getTime();
    const thisWeek = t >= now - 7 * 86400000;
    if (!acc[mg]) acc[mg] = { thisW: 0, prevW: 0, daysThis: new Set() };
    if (thisWeek) { acc[mg].thisW += 1; acc[mg].daysThis.add(st.slice(0, 10)); } else acc[mg].prevW += 1;
  }
  const muscles: MuscleWeekVolume[] = Object.entries(acc).map(([muscle, v]) => ({
    muscle, setsThisWeek: v.thisW, setsPrevWeek: v.prevW || null, frequency: v.daysThis.size, perfTrendPct: null,
  }));
  return Response.json({ verdicts: analyzeAllVolume(muscles) });
}
