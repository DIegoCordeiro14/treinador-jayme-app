import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedAthleteContext } from '@/lib/edn/athlete-context';
import { computeEdn360FromState, detectWeakPoint, type MuscleVolume, type AthleteState } from '@/lib/edn/athlete-intelligence-engine';
import { computeNutritionTargets, computeNutritionScore } from '@/lib/edn/nutrition-autopilot';
import { computeRecoveryState } from '@/lib/edn/recovery-engine';
import { recommendSessionAdaptation } from '@/lib/edn/adaptive-session-engine';
import { buildAthleteStateV2 } from '@/lib/athlete-os/athlete-state-2';
import { computeAlerts } from '@/lib/edn/alert-severity';
import { detectRecurringDiscomfort } from '@/lib/edn/physical-condition-engine';
import { computeCardioLoad, computeCardioScore } from '@/lib/cardio/endurance-engine';
import { buildCoachAlerts } from '@/lib/edn/coach-alert-engine';
import { orchestrate, type AOSFacts } from '@/lib/athlete-os';
import { buildNotifications } from '@/lib/athlete-os/notifications';
import { mergeAthleteState } from '@/lib/athlete-os/athlete-state';
import { persistStateSnapshot } from '@/lib/athlete-os/telemetry';
import { deriveAosFacts } from '@/lib/edn/aos-facts-engine';
import { computeDataHealth } from '@/lib/edn/data-health-engine';
import { computeNextBestAction } from '@/lib/edn/next-best-action-engine';
import { resolveMeasurement, type Measurement } from '@/lib/athlete-data';
import { detectMesocyclePhase } from '@/lib/edn/training-periodization-engine';
import { canonicalGoal } from '@/lib/edn/goal';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/athlete-360 — Central do Atleta (determinístico).
 * EDN 360 com scores FRESCOS dos motores (nutrição, cardio, recuperação) +
 * principal limitador + próxima ação + Weak Point Engine.
 */
// Núcleo compartilhado. persist=false → READ ONLY (GET, §22). persist=true →
// grava o snapshot diário longitudinal (POST, disparado por eventos/ações).
async function computeAthlete360(persist: boolean) {
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
    supabase.from('cardio_sessions').select('distance_km, created_at, performed_at').eq('user_id', user.id).is('deleted_at', null).gte('created_at', new Date(now - 28 * 86400000).toISOString()),
    supabase.from('wearable_metrics').select('hrv_ms, hrv_baseline_ms, resting_hr, sleep_hours, body_battery, training_readiness, recovery_time_hours').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('session_sets').select('weight_kg, reps_done, completed, session:workout_sessions!inner(started_at, user_id), exercise:exercises(muscle_group)').eq('session.user_id', user.id).gte('session.started_at', d60.toISOString()),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = pr.data; const bio: any = bioR.data; const wm: any = wmR.data;
  const wl = wlR.data ?? []; const sess14 = sess14R.data ?? []; const food = foodR.data ?? [];
  const cardio28 = cardio28R.data ?? [];

  // ── Peso canônico (Athlete Data Hub, §11) ─────────────────────────────────
  // Resolve entre bioimpedância, weight logs e perfil — recência > confiança.
  const weightFacts: Measurement[] = [];
  if (bio?.weight_kg != null) weightFacts.push({ metric: 'weight', value: bio.weight_kg, source: 'bioimpedance', measuredAt: bio.measured_at ?? null });
  for (const w of (wl as any[])) if (w?.weight_kg != null) weightFacts.push({ metric: 'weight', value: w.weight_kg, source: 'evolution', measuredAt: w.log_date ?? w.created_at ?? null });
  if (profile?.weight_kg != null) weightFacts.push({ metric: 'weight', value: profile.weight_kg, source: 'profile', measuredAt: null });
  const canonicalWeight = resolveMeasurement('weight', weightFacts, now);
  const compFacts: Measurement[] = [];
  if (bio?.body_fat_pct != null) compFacts.push({ metric: 'bodyFat', value: bio.body_fat_pct, source: 'bioimpedance', measuredAt: bio.measured_at ?? null });
  if (bio?.lean_mass_kg != null) compFacts.push({ metric: 'leanMass', value: bio.lean_mass_kg, source: 'bioimpedance', measuredAt: bio.measured_at ?? null });
  if (wm?.resting_hr != null) compFacts.push({ metric: 'restingHeartRate', value: wm.resting_hr, source: 'wearable', measuredAt: wm.recorded_at ?? wm.created_at ?? null });
  const rBodyFat = resolveMeasurement('bodyFat', compFacts, now);
  const rLean = resolveMeasurement('leanMass', compFacts, now);
  const rRhr = resolveMeasurement('restingHeartRate', compFacts, now);
  const bodyBlock = {
    currentWeightKg: canonicalWeight?.value ?? null,
    bodyFatPct: rBodyFat?.value ?? null,
    leanMassKg: rLean?.value ?? null,
    muscleMassKg: null as number | null,
    restingHeartRate: rRhr?.value ?? null,
    latestMeasurementAt: canonicalWeight?.measuredAt ?? rBodyFat?.measuredAt ?? null,
    confidence: (canonicalWeight?.confidence ?? 'unknown') as 'high' | 'medium' | 'low' | 'unknown',
    weightSource: canonicalWeight?.source ?? null,
    weightAgeDays: canonicalWeight?.ageDays ?? null,
  };

  // ── Nutrição fresca ───────────────────────────────────────────────────────
  const targets = computeNutritionTargets({
    canonicalWeightKg: canonicalWeight?.value ?? null,
    weightIsAssumed: canonicalWeight?.source === 'profile',
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

  // ── Condições físicas / desconforto (segurança física no topo da hierarquia) ─
  let pcRows: any[] = []; let dlRows: any[] = [];
  try {
    const [{ data: pcd }, { data: dld }] = await Promise.all([
      supabase.from('physical_conditions').select('id, body_region, side, status, restricted_movements, user_confirmed').eq('user_id', user.id).eq('active', true),
      supabase.from('workout_discomfort_logs').select('body_region, severity, created_at').eq('user_id', user.id).gte('created_at', new Date(now - 60 * 86400000).toISOString()),
    ]);
    pcRows = (pcd ?? []) as any[]; dlRows = (dld ?? []) as any[];
  } catch { /* tabelas podem faltar */ }
  let nutritionToday: { kcal: number; protein: number; carbs: number; fat: number } | null = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: fl } = await supabase.from('food_logs').select('calories_kcal, protein_g, carbs_g, fat_g').eq('user_id', user.id).eq('log_date', today);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (fl ?? []) as any[];
    if (rows.length) nutritionToday = {
      kcal: Math.round(rows.reduce((a, r) => a + (r.calories_kcal ?? 0), 0)),
      protein: Math.round(rows.reduce((a, r) => a + (r.protein_g ?? 0), 0)),
      carbs: Math.round(rows.reduce((a, r) => a + (r.carbs_g ?? 0), 0)),
      fat: Math.round(rows.reduce((a, r) => a + (r.fat_g ?? 0), 0)),
    };
  } catch { /* food_logs pode faltar */ }
  const conditionSnaps = pcRows.map((c) => ({ id: c.id, region: c.body_region, side: c.side, status: c.status, restricted: c.restricted_movements ?? [], confirmed: c.user_confirmed !== false }));
  const discomfortSignals = detectRecurringDiscomfort(dlRows.map((x) => ({ bodyRegion: x.body_region, severity: x.severity, createdAt: x.created_at })));
  const physicalRestricted = conditionSnaps.some((c) => c.confirmed && (c.status === 'recovering' || c.status === 'rehab' || (c.restricted?.length ?? 0) > 0));
  const recurringDiscomfort = discomfortSignals.some((d) => d.recommend);
  const restrictedRegions = Array.from(new Set(conditionSnaps.filter((c) => c.confirmed).map((c) => c.region)));

  // ── Fatos REAIS para o AOS (substitui hardcoded) ──
  let planCreatedAtISO: string | null = null;
  try {
    const { data: ap } = await supabase.from('workout_plans').select('created_at').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    planCreatedAtISO = (ap as any)?.created_at ?? null;
  } catch { /* opcional */ }
  const severeConditions = conditionSnaps.filter((c) => c.confirmed && /injur|lesa|lesã|acute|agud|fratura/i.test(String(c.status ?? ''))).length;
  const realFacts = deriveAosFacts({
    activePhysicalConditions: conditionSnaps.filter((c) => c.confirmed).length,
    severePhysicalConditions: severeConditions,
    recurringDiscomfort,
    recoveryCategory: (recovery?.category ?? 'moderate') as any,
    deloadSignalActive: false,
    planCreatedAtISO,
    declaredExperience: (profile as any)?.experience_level ?? null,
    advancedPerformanceSignals: (strengthTrendPct ?? 0) >= 3 ? 5 : 0,
    nowMs: now,
  });

  // ── Athlete Operating System: decisão única coordenada ────────────────────
  const perWeekGain = weightTrendKg != null ? weightTrendKg / (30 / 7) : null;
  const aosFacts: AOSFacts = {
    recoveryCategory: (recovery?.category ?? 'moderate') as any,
    recoveryScore: recovery?.score ?? null,
    hrvDropPct,
    sleepHours: wm?.sleep_hours ?? null,
    injuryRisk: realFacts.injuryRisk === 'moderate' ? 'high' : realFacts.injuryRisk,
    physicalRestricted,
    recurringDiscomfort,
    restrictedRegions,
    overreaching: (strengthTrendPct != null && strengthTrendPct < -10) && load.risk === 'alto',
    plateau: goalIsCut && weightTrendKg != null && Math.abs(weightTrendKg) < 0.3,
    inDeload: realFacts.inDeload,
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

  // ── Adaptação da sessão de hoje (V8): cruza recuperação + ACWR + performance ─
  const km7v = kmIn(7); const km28v = kmIn(28); const chronicWeekly = km28v / 4;
  const cardioAcwr = chronicWeekly > 0 ? Math.round((km7v / chronicWeekly) * 100) / 100 : null;
  const session = recommendSessionAdaptation({
    recoveryScore: recovery?.score ?? s.recovery,
    recoveryCategory: (recovery?.category ?? 'moderate') as any,
    cardioAcwr,
    recentPerformanceDeltaPct: strengthTrendPct,
    todayIsHeavyCompound: false,
    primaryMuscleToday: null,
    daysSinceLastWorkout: sessions7 > 0 ? 1 : 3,
  });

  // ── AthleteState canônico (Bloco 2) — fonte única versionada ──────────────
  const meso = detectMesocyclePhase({ weeksOnPlan: realFacts.weeksOnPlan, recentVolumeTrendPct: strengthTrendPct, recoveryCategory: (recovery?.category ?? 'moderate') as any, hadPrRecently: (strengthTrendPct ?? 0) >= 3 });
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

  if (persist) await persistStateSnapshot(supabase, user.id, state);
  // ── AthleteState 2.0 (fonte única) ────────────────────────────────────────
  let stateV2 = null;
  try {
    const discomforts = discomfortSignals.map((d) => ({ region: d.region, count: d.count, recommend: d.recommend }));
    stateV2 = buildAthleteStateV2(state, {
      conditions: conditionSnaps, discomforts,
      sleep: { hours: wm?.sleep_hours ?? null, quality: profile?.sleep_quality ?? null },
      calendar: { plannedThisWeek: profile?.weekly_frequency ?? 0, doneThisWeek: sessions7, nextWorkoutLabel: null },
      race: { date: (profile as any)?.target_race_date ?? null, weeksAway: null, name: null },
      adherence: { training: state.training?.consistency ?? null, nutrition: nutritionScore, overall: edn360.overall },
      strengths: weakPoint.strongest ? [weakPoint.strongest.muscle] : [],
      trends: { strengthPct: strengthTrendPct, volumePct: strengthTrendPct, weightKgPerWeek: perWeekGain, cardioAcwr },
      nutritionToday,
      body: bodyBlock,
    });
  } catch { /* fonte única best-effort */ }

  const alertsUnified = computeAlerts({
    safetyLevel: (stateV2?.safetyLevel ?? 'none') as any,
    recoveryCategory: (recovery?.category ?? 'moderate') as any,
    cardioLoadRisk: load.risk,
    nutritionAdherencePct: nutritionScore,
    strengthTrendPct,
  });
  // ── Data Health Score ──
  const lastWorkoutAgeDays = sess14 && sess14.length ? Math.floor((now - new Date(sess14[sess14.length - 1].started_at ?? sess14[0].started_at).getTime()) / 86400000) : null;
  const weightAgeDays = weightTrendKg != null && wl && wl.length ? Math.floor((now - new Date((wl[wl.length - 1] as any).log_date ?? now).getTime()) / 86400000) : null;
  const bioAgeDays = bio?.measured_at ? Math.floor((now - new Date(bio.measured_at).getTime()) / 86400000) : null;
  const dataHealth = computeDataHealth({
    profileCompletionPct: (profile as any)?.profile_completion_pct ?? null,
    weightAgeDays, bioAgeDays, lastWorkoutAgeDays,
    nutritionLoggedDays14: loggedDays,
    wearableConnected: !!wm,
  });

  // ── Next Best Action priorizado ──
  const proteinTarget = targets ? targets.proteinG : null;
  const proteinBelowTarget = !!(proteinTarget && nutritionToday && nutritionToday.protein < proteinTarget * 0.85);
  const trainedTodayFlag = !!(sess14 && sess14.some((x: any) => new Date(x.started_at).toISOString().slice(0,10) === new Date().toISOString().slice(0,10)));
  const nextBestAction = computeNextBestAction({
    injuryRisk: realFacts.injuryRisk,
    recoveryScore: recovery?.score ?? null,
    proteinBelowTarget,
    trainedToday: trainedTodayFlag,
    hasWorkoutToday: !!session && !aosFacts.plateau ? true : !!session,
    cardioPlannedToday: false,
    weightStaleDays: weightAgeDays,
    acwrHigh: load.risk === 'alto',
    plateau: aosFacts.plateau,
  });

  // ── Snapshot diário longitudinal (apenas em POST; GET é read-only, §22) ──
  if (persist) try {
    await supabase.from('athlete_daily_snapshots').upsert({
      user_id: user.id, as_of_date: new Date().toISOString().slice(0, 10),
      weight_kg: (bio?.weight_kg ?? profile?.weight_kg ?? null),
      edn_score: Math.round((edn360 as any)?.overall ?? s.overall ?? 0),
      recovery_score: recovery?.score ?? null,
      training_score: Math.round(((s.consistency ?? 0) + (s.progression ?? 0)) / 2),
      nutrition_score: nutritionScore ?? null,
      cardio_score: null,
      data_health_score: dataHealth.score,
    }, { onConflict: 'user_id,as_of_date' });
  } catch { /* aditivo */ }

  // AthleteState único: stateV2 é o superset canônico (estende o AthleteState base
  // e carrega body/recovery/nutrition/cardio + condições/limitador/segurança).
  // athleteState e state permanecem apenas como variáveis internas (alimentam
  // edn360 e a composição do stateV2); não são mais expostos para evitar três
  // contratos concorrentes no cliente.
  return Response.json({ edn360, weakPoint, stateV2, alertsUnified, alerts, aos, notifications, session, league: s.league, usedWearable: recovery?.usedWearable ?? false, aosFactsReal: realFacts, dataHealth, nextBestAction });
}

// GET é somente leitura — NUNCA persiste snapshot como efeito colateral (§22).
export async function GET(_req: NextRequest) {
  return computeAthlete360(false);
}

// POST recomputa e persiste o snapshot diário. Chamado por handlers de evento,
// ações POST e jobs de background — não durante leituras.
export async function POST(_req: NextRequest) {
  return computeAthlete360(true);
}
