import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedAthleteContext } from '@/lib/edn/athlete-context';
import { computeEdn360FromState, detectWeakPoint, type MuscleVolume, type AthleteState } from '@/lib/edn/athlete-intelligence-engine';
import { computeNutritionTargets, computeNutritionScore } from '@/lib/edn/nutrition-autopilot';
import { computeRecoveryState } from '@/lib/edn/recovery-engine';
import { computeCardioLoad, computeCardioScore } from '@/lib/cardio/endurance-engine';
import { buildCoachAlerts } from '@/lib/edn/coach-alert-engine';
import { orchestrate, type AOSFacts } from '@/lib/athlete-os';
import { buildNotifications } from '@/lib/athlete-os/notifications';
import { mergeAthleteState } from '@/lib/athlete-os/athlete-state';
import { detectMesocyclePhase } from '@/lib/edn/training-periodization-engine';
import { canonicalGoal } from '@/lib/edn/goal';

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
    supabase.from('profiles').select('name, weight_kg, height_cm, age, gender, main_goal, aesthetic_goal, athlete_sport, experience_level, target_weight_kg, target_race_date, weekly_frequency, work_type, cardio_frequency, meals_per_day, sleep_hours, sleep_quality, stress_level').eq('id', user.id).maybeSingle(),
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

  // ── Estado consolidado do atleta (motor central) ─────────────────────────
  const sessions7 = sess14.filter((w: any) => new Date(w.started_at).getTime() >= now - 7 * 86400000).length;
  const athleteState: AthleteState = {
    profile: { sex: profile?.gender ?? null, age: profile?.age ?? null, heightCm: profile?.height_cm ?? null, experience: null, mainGoal: profile?.main_goal ?? null, aestheticGoal: null, sport: null },
    bodyComposition: { weightKg: bio?.weight_kg ?? profile?.weight_kg ?? null, bodyFatPct: bio?.body_fat_pct ?? null, leanMassKg: bio?.lean_mass_kg ?? null, tmbKcal: targets?.tmbKcal ?? null },
    trainingState: { score: Math.round((s.consistency + s.progression) / 2), sessionsLast7: sessions7, weeklyVolumeKg: Math.round(sess14.reduce((a: number, w: any) => a + (w.total_volume_kg ?? 0), 0) / 2), consistency: s.consistency, progression: s.progression },
    cardioState: { score: cardioScore, km7: Math.round(kmIn(7) * 10) / 10, km28: Math.round(kmIn(28) * 10) / 10, loadRisk: load.risk },
    nutritionState: { score: nutritionScore, phase: targets?.phaseLabel ?? null, targetKcal: targets?.targetKcal ?? null, adherencePct: Math.round(Math.min(100, (loggedDays / 14) * 100)) },
    recoveryState: { score: recovery?.score ?? s.recovery, category: (recovery?.category ?? 'moderate'), usedWearable: recovery?.usedWearable ?? false },
    wearableState: wm ? { hrvMs: wm.hrv_ms ?? null, sleepHours: wm.sleep_hours ?? null, restingHr: wm.resting_hr ?? null, bodyBattery: wm.body_battery ?? null, trainingReadiness: wm.training_readiness ?? null } : null,
    goalState: { mainGoal: profile?.main_goal ?? null, targetRaceDate: null, weeksToRace: null },
  };
  const edn360 = computeEdn360FromState(athleteState);

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

  // ── Alertas proativos do Coach ────────────────────────────────────────────
  const svOrdered = [...sess14].sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  let strengthTrendPct: number | null = null;
  if (svOrdered.length >= 4) {
    const mid = Math.floor(svOrdered.length / 2);
    const v1 = svOrdered.slice(0, mid).reduce((a: number, b: any) => a + (b.total_volume_kg ?? 0), 0) / Math.max(1, mid);
    const v2 = svOrdered.slice(mid).reduce((a: number, b: any) => a + (b.total_volume_kg ?? 0), 0) / Math.max(1, svOrdered.length - mid);
    if (v1 > 0) strengthTrendPct = Math.round(((v2 - v1) / v1) * 100);
  }
  const hrvDropPct = wm && wm.hrv_ms && wm.hrv_baseline_ms ? Math.round(((wm.hrv_ms - wm.hrv_baseline_ms) / wm.hrv_baseline_ms) * 100) : null;
  const goalIsCut = ['fat_loss', 'definition'].includes(canonicalGoal(profile?.main_goal));
  const alerts = buildCoachAlerts({
    recoveryCategory: (recovery?.category ?? 'moderate') as any,
    hrvDropPct,
    nutritionScore,
    adherencePct: Math.round(Math.min(100, (loggedDays / 14) * 100)),
    weightTrendKg, goalIsCut, strengthTrendPct, volumeTrendPct: strengthTrendPct,
    cardioLoadRisk: load.risk,
    periodDays: 30,
  });

  // ── Athlete Operating System: decisão única coordenada ────────────────────
  const perWeekGain = weightTrendKg != null ? weightTrendKg / (30 / 7) : null;
  const aosFacts: AOSFacts = {
    recoveryCategory: (recovery?.category ?? 'moderate') as any,
    recoveryScore: recovery?.score ?? null,
    hrvDropPct,
    sleepHours: wm?.sleep_hours ?? null,
    injuryRisk: 'none',
    overreaching: (strengthTrendPct != null && strengthTrendPct < -10) && load.risk === 'alto',
    plateau: goalIsCut && weightTrendKg != null && Math.abs(weightTrendKg) < 0.3,
    inDeload: false,
    cardioLoadRisk: load.risk,
    strengthTrendPct,
    weightTrendKg,
    goalIsCut,
    nutritionScore,
    adherencePct: Math.round(Math.min(100, (loggedDays / 14) * 100)),
    weakPointMuscle: weakPoint.weakest?.muscle ?? null,
    prReady: (strengthTrendPct != null && strengthTrendPct >= 3) && (recovery?.category === 'good' || recovery?.category === 'excellent') && !(perWeekGain != null && false),
  };
  const aos = orchestrate(aosFacts);
  const notifications = buildNotifications(aos);

  // ── AthleteState canônico (Bloco 2) — fonte única versionada ──────────────
  const meso = detectMesocyclePhase({ weeksOnPlan: 0, recentVolumeTrendPct: strengthTrendPct, recoveryCategory: (recovery?.category ?? 'moderate') as any, hadPrRecently: (strengthTrendPct ?? 0) >= 3 });
  const state = mergeAthleteState({
    profile: { name: profile?.name ?? null, sex: profile?.gender ?? null, age: profile?.age ?? null, heightCm: profile?.height_cm ?? null, experience: (profile as any)?.experience_level ?? null, sport: (profile as any)?.athlete_sport ?? null },
    goal: { main: profile?.main_goal ?? null, aesthetic: (profile as any)?.aesthetic_goal ?? null, targetWeightKg: (profile as any)?.target_weight_kg ?? null, targetRaceDate: (profile as any)?.target_race_date ?? null },
    bodyComposition: { weightKg: athleteState.bodyComposition.weightKg, bodyFatPct: athleteState.bodyComposition.bodyFatPct, leanKg: athleteState.bodyComposition.leanMassKg, tmbKcal: athleteState.bodyComposition.tmbKcal },
    training: athleteState.trainingState,
    nutrition: athleteState.nutritionState,
    cardio: athleteState.cardioState,
    recovery: athleteState.recoveryState,
    wearable: wm ? { hrvMs: wm.hrv_ms ?? null, hrvBaselineMs: wm.hrv_baseline_ms ?? null, sleepHours: wm.sleep_hours ?? null, restingHr: wm.resting_hr ?? null, bodyBattery: wm.body_battery ?? null, trainingReadiness: wm.training_readiness ?? null } : null,
    edn360: { training: edn360.scores.training, nutrition: edn360.scores.nutrition, cardio: edn360.scores.cardio, recovery: edn360.scores.recovery, overall: edn360.overall },
    weakPoints: weakPoint.weakest ? [weakPoint.weakest.muscle] : [],
    injuryRisk: aosFacts.injuryRisk,
    plateauRisk: aosFacts.plateau,
    mesocycle: meso.label,
    nextBestAction: aos.nextBestAction,
  });

  return Response.json({ edn360, weakPoint, athleteState, state, alerts, aos, notifications, league: s.league, usedWearable: recovery?.usedWearable ?? false });
}
