import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeProgress, projectAthlete } from '@/lib/edn/progress-intelligence-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/progress-intelligence — "Estado atual do atleta" (Evolução).
 * Interpreta evolução corporal + treino e projeta 30/60/90 dias. Determinístico.
 */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const d60 = new Date(now - 60 * 86400000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: profile }, { data: bios }, { data: wl }, { data: sess }, { data: food }] = await Promise.all([
    supabase.from('profiles').select('main_goal').eq('id', user.id).maybeSingle(),
    supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, measured_at').eq('user_id', user.id).gte('measured_at', d60.toISOString()).order('measured_at', { ascending: true }),
    supabase.from('body_weight_logs').select('log_date, weight_kg').eq('user_id', user.id).gte('log_date', new Date(now - 30 * 86400000).toISOString().slice(0, 10)).order('log_date', { ascending: true }),
    supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', user.id).gte('started_at', d60.toISOString()).order('started_at', { ascending: true }),
    supabase.from('food_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', new Date(now - 14 * 86400000).toISOString()),
  ]);

  const B = bios ?? []; const W = wl ?? []; const S = sess ?? []; const F = food ?? [];
  const goal = (profile as { main_goal?: string | null } | null)?.main_goal ?? null;

  // Tendências (primeiro vs último do período)
  const bfTrendPct = B.length >= 2 && B[0].body_fat_pct != null && B[B.length - 1].body_fat_pct != null ? Math.round((B[B.length - 1].body_fat_pct - B[0].body_fat_pct) * 10) / 10 : null;
  const leanTrendKg = B.length >= 2 && B[0].lean_mass_kg != null && B[B.length - 1].lean_mass_kg != null ? Math.round((B[B.length - 1].lean_mass_kg - B[0].lean_mass_kg) * 10) / 10 : null;
  // peso: usa weight logs (30d) ou bioimpedância
  const weightSeries = W.length >= 2 ? W.map((r) => r.weight_kg) : B.map((r) => r.weight_kg).filter((v): v is number => v != null);
  const weightTrendKg = weightSeries.length >= 2 ? Math.round((weightSeries[weightSeries.length - 1] - weightSeries[0]) * 10) / 10 : null;

  // volume: 1ª metade vs 2ª metade
  let volumeTrendPct: number | null = null;
  if (S.length >= 4) {
    const mid = Math.floor(S.length / 2);
    const v1 = S.slice(0, mid).reduce((a, b) => a + (b.total_volume_kg ?? 0), 0) / Math.max(1, mid);
    const v2 = S.slice(mid).reduce((a, b) => a + (b.total_volume_kg ?? 0), 0) / Math.max(1, S.length - mid);
    if (v1 > 0) volumeTrendPct = Math.round(((v2 - v1) / v1) * 100);
  }

  const diagnosis = analyzeProgress({ weightTrendKg, bfTrendPct, leanTrendKg, volumeTrendPct, goal, periodDays: 30 });

  // Projeção do atleta
  const currentWeightKg = weightSeries[weightSeries.length - 1] ?? B[B.length - 1]?.weight_kg ?? null;
  const weeklyWeightDeltaKg = weightTrendKg != null ? Math.round((weightTrendKg / (30 / 7)) * 100) / 100 : 0;
  const loggedDays = new Set(F.map((r) => r.logged_at.slice(0, 10))).size;
  const projection = currentWeightKg ? projectAthlete({
    currentWeightKg, currentBfPct: B[B.length - 1]?.body_fat_pct ?? null, currentLeanKg: B[B.length - 1]?.lean_mass_kg ?? null,
    weeklyWeightDeltaKg, adherencePct: Math.round(Math.min(100, (loggedDays / 14) * 100)),
  }) : [];

  return Response.json({ diagnosis, projection, trends: { weightTrendKg, bfTrendPct, leanTrendKg, volumeTrendPct } });
}
