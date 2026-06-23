import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeNutritionScore, type NutritionPhase } from '@/lib/edn/nutrition-autopilot';

export const runtime = 'nodejs';
export const maxDuration = 15;

function derivePhase(rawGoal: string | null): NutritionPhase {
  const g = (rawGoal ?? 'hypertrophy').toLowerCase();
  if (g === 'fat_loss' || g === 'weight_loss') return 'cutting';
  if (g === 'definition' || g === 'cutting') return 'definicao';
  if (g === 'mass_gain' || g === 'bulk' || g === 'lean_bulk') return 'lean_bulk';
  if (g === 'recomposition' || g === 'recomp') return 'recomposicao';
  if (g === 'performance' || g === 'endurance') return 'performance';
  if (g === 'maintenance') return 'manutencao';
  return 'hipertrofia';
}

/**
 * GET /api/nutrition-score-history
 * Série semanal do Nutrition Score (últimas ~9 semanas) + janelas 14/30/60d.
 * Tudo determinístico (computeNutritionScore) — sem IA.
 */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const since = new Date(now - 70 * 86400000);

  const [{ data: profile }, { data: weightLogs }, { data: sessions }, { data: foodLogs }] = await Promise.all([
    supabase.from('profiles').select('main_goal, goal, weekly_frequency').eq('id', user.id).maybeSingle(),
    supabase.from('body_weight_logs').select('log_date, weight_kg, body_fat_pct').eq('user_id', user.id).gte('log_date', since.toISOString().slice(0, 10)).order('log_date', { ascending: true }),
    supabase.from('workout_sessions').select('started_at').eq('user_id', user.id).gte('started_at', since.toISOString()),
    supabase.from('food_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', since.toISOString()),
  ]);

  const phase = derivePhase((profile as { main_goal?: string | null; goal?: string | null } | null)?.main_goal ?? (profile as { goal?: string | null } | null)?.goal ?? null);
  const planned = (profile as { weekly_frequency?: number | null } | null)?.weekly_frequency ?? 3;
  const wl = weightLogs ?? [];
  const ss = (sessions ?? []).map((s) => new Date(s.started_at).getTime());
  const fl = (foodLogs ?? []).map((f) => ({ t: new Date(f.logged_at).getTime(), day: f.logged_at.slice(0, 10) }));

  const weightAt = (t: number): number | null => {
    let best: number | null = null;
    for (const w of wl) { if (new Date(w.log_date).getTime() <= t) best = w.weight_kg; else break; }
    return best;
  };
  const bfAt = (t: number): number | null => {
    let best: number | null = null;
    for (const w of wl) {
      const wt = new Date(w.log_date).getTime();
      if (wt <= t && w.body_fat_pct != null) best = w.body_fat_pct;
      else if (wt > t) break;
    }
    return best;
  };
  const scoreForWindow = (endT: number, windowDays: number) => {
    const startT = endT - windowDays * 86400000;
    const wStart = weightAt(startT);
    const wEnd = weightAt(endT);
    const weightTrendKg = wStart != null && wEnd != null ? Math.round((wEnd - wStart) * 10) / 10 : null;
    const bfStart = bfAt(startT);
    const bfEnd = bfAt(endT);
    const bfTrendPct = bfStart != null && bfEnd != null ? Math.round((bfEnd - bfStart) * 10) / 10 : null;
    const sessionsLast7 = ss.filter((t) => t <= endT && t >= endT - 7 * 86400000).length;
    const loggedDays = new Set(fl.filter((f) => f.t <= endT && f.t >= startT).map((f) => f.day)).size;
    return computeNutritionScore({ phase, weightTrendKg, bfTrendPct, sessionsLast7, plannedPerWeek: planned, loggedDays, periodDays: windowDays });
  };

  const series: { week: string; score: number }[] = [];
  for (let i = 8; i >= 0; i--) {
    const endT = now - i * 7 * 86400000;
    const sc = scoreForWindow(endT, 14);
    const d = new Date(endT);
    series.push({ week: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, score: sc.score });
  }

  return Response.json({
    phase,
    series,
    windows: {
      d14: scoreForWindow(now, 14),
      d30: scoreForWindow(now, 30),
      d60: scoreForWindow(now, 60),
    },
  });
}
