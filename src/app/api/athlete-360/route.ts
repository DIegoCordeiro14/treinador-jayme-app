import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedAthleteContext } from '@/lib/edn/athlete-context';
import { computeEdn360, detectWeakPoint, type MuscleVolume } from '@/lib/edn/athlete-intelligence-engine';
import { computeNutritionTargets, computeNutritionScore } from '@/lib/edn/nutrition-autopilot';
import { computeRecoveryState } from '@/lib/edn/recovery-engine';
import { computeCardioLoad, computeCardioScore } from '@/lib/cardio/endurance-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/athlete-360 — Central do Atleta (determinístico).
 * EDN 360 com scores FRESCOS dos motores (nutrição, cardio, recuperação) +
 * principal limitador + próxima ação + Weak Point Engine.
 */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const d60 = new Date(now - 60 * 86400000);

  const ctx = await getCachedAthleteContext(user.id);
  const s = ctx.scores;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pr, bioR, wlR, sess14R, foodR, cardio28R, wmR, setsR] = await Promise.all([
    supabase.from('profiles').select('weight_kg, height_cm, age, gender, main_goal, weekly_frequency, work_type, cardio_frequency, meals_per_day, sleep_hours, sleep_quality, stress_level').eq('id', user.id).maybeSingle(),
    supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, basal_metabolic_rate_kcal, measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('body_weight_logs').select('log_date, weight_kg, body_fat_pct').eq('user_id', user.id).gte('log_date', new Date(now - 30 * 86400000).toISOString().slice(0, 10)).order('log_date', { ascending: true }),
    supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', user.id).gte('started_at', new Date(now - 14 * 86400000).toISOString()),
    supabase.from('food_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', new Date(now - 14 * 86400000).toISOString()),
    supabase.from('cardio_sessions').select('distance_km, created_at, performed_at').eq('user_id', user.id).gte('created_at', new Date(now - 28 * 86400000).toISOString()),
    supabase.from('wearable_metrics').select('hrv_ms, hrv_baseline_ms, resting_hr, sleep_hours, body_battery, training_readiness, recovery_time_hours').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('session_sets').select('weight_kg, reps_done, completed, session:workout_sessions!inner(started_at, user_id), exercise:exercises(muscle_group)').eq('session.user_id', user.id).gte('session.started_at', d60.toISOString()),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = pr.data; const bio: any = bioR.data; const wm: any = wmR.data;
  const wl = wlR.data ?? []; const sess14 = sess14R.data ?? []; const food = foodR.data ?? [];
  const cardio28 = cardio28R.data ?? [];

  // ── Nutrição fresca ───────────────────────────────────────────────────────
  const targets = computeNutritionTargets({
    bio: bio ?? null,
    training: { sessionsLast7: sess14.filter((w: any) => new Date(w.started_at).getTime() >= now - 7 * 86400000).length, weeklyVolumeKg: sess14.reduce((a: number, w: any) => a + (w.total_volume_kg ?? 0), 0) / 2, cardioKmThisWeek: cardio28.filter((c: any) => new Date(c.created_at).getTime() >= now - 7 * 86400000).reduce((a: number, c: any) => a + (c.distance_km ?? 0), 0) },
    profile: { weight_kg: profile?.weight_kg ?? null, height_cm: profile?.height_cm ?? null, age: profile?.age ?? null, gender: profile?.gender ?? null, main_goal: profile?.main_goal ?? null, weekly_frequency: profile?.weekly_frequency ?? null, work_type: profile?.work_type ?? null, cardio_frequency: profile?.cardio_frequency ?? null, meals_per_day: profile?.meals_per_day ?? null },
  });
  const weightTrendKg = wl.length >= 2 ? Math.round((wl[wl.length - 1].weight_kg - wl[0].weight_kg) * 10) / 10 : null;
  const loggedDays = new Set(food.map((r: any) => r.logged_at.slice(0, 10))).size;
  const nutritionScore = targets ? computeNutritionScore({
    phase: targets.phase, weightTrendKg, bfTrendPct: null,
    sessionsLast7: sess14.filter((w: any) => new Date(w.started_at).getTime() >= now - 7 * 86400000).length,
    plannedPerWeek: profile?.weekly_frequency ?? null, loggedDays, periodDays: 14,
  }).score : s.nutrition;

  // ── Recuperação fresca (wearable) ─────────────────────────────────────────
  const recovery = computeRecoveryState({
    sleepHours: profile?.sleep_hours ?? null, sleepQuality: profile?.sleep_quality ?? null,
    stressLevel: profile?.stress_level ?? null, workType: profile?.work_type ?? null,
    daysSinceLastWorkout: 1, avgRir: null,
    sessionsLast7: sess14.filter((w: any) => new Date(w.started_at).getTime() >= now - 7 * 86400000).length,
    plannedPerWeek: profile?.weekly_frequency ?? 3,
    wearable: wm ? { hrvMs: wm.hrv_ms ?? null, hrvBaselineMs: wm.hrv_baseline_ms ?? null, restingHr: wm.resting_hr ?? null, sleepHoursMeasured: wm.sleep_hours ?? null, bodyBattery: wm.body_battery ?? null, trainingReadiness: wm.training_readiness ?? null, recoveryTimeHours: wm.recovery_time_hours ?? null } : null,
  });

  // ── Cardio fresco ─────────────────────────────────────────────────────────
  const kmIn = (d: number) => cardio28.filter((c: any) => new Date(c.performed_at || c.created_at).getTime() >= now - d * 86400000).reduce((a: number, c: any) => a + (c.distance_km ?? 0), 0);
  const load = computeCardioLoad({ km7: kmIn(7), km28: kmIn(28), km90: kmIn(28), sessions7: cardio28.filter((c: any) => new Date(c.performed_at || c.created_at).getTime() >= now - 7 * 86400000).length });
  const cardioScore = computeCardioScore({ cardioSessions7: cardio28.filter((c: any) => new Date(c.performed_at || c.created_at).getTime() >= now - 7 * 86400000).length, loadRisk: load.risk });

  const edn360 = computeEdn360({
    training: Math.round((s.consistency + s.progression) / 2),
    nutrition: nutritionScore,
    recovery: recovery?.score ?? s.recovery,
    cardio: cardioScore,
  });

  // ── Weak Point ────────────────────────────────────────────────────────────
  const acc: Record<string, { recent: number; prior: number; days: Set<string> }> = {};
  for (const row of (setsR.data ?? []) as any[]) {
    if (row.completed === false) continue;
    const mg = row.exercise?.muscle_group; const startedAt = row.session?.started_at;
    if (!mg || !startedAt) continue;
    const vol = (row.weight_kg ?? 0) * (row.reps_done ?? 0);
    const recent = new Date(startedAt).getTime() >= now - 30 * 86400000;
    if (!acc[mg]) acc[mg] = { recent: 0, prior: 0, days: new Set() };
    if (recent) { acc[mg].recent += vol; acc[mg].days.add(startedAt.slice(0, 10)); } else acc[mg].prior += vol;
  }
  const muscles: MuscleVolume[] = Object.entries(acc).map(([muscle, v]) => ({ muscle, recentVolume: Math.round(v.recent), priorVolume: Math.round(v.prior), sessions: v.days.size }));
  const weakPoint = detectWeakPoint(muscles);

  return Response.json({ edn360, weakPoint, league: s.league, usedWearable: recovery?.usedWearable ?? false });
}
