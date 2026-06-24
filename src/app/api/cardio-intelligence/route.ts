import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeRecoveryState } from '@/lib/edn/recovery-engine';
import {
  classifyRunner, computeCardioLoad, computeTrainingZones, analyzeRunPerformance,
  deriveRacePhase, adaptiveWorkout, buildRunnerMoment, type RecoveryCategory, type RunPoint,
} from '@/lib/cardio/endurance-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/cardio-intelligence — Treinador de endurance (determinístico).
 * Retorna nível do corredor, carga, zonas, performance/platô, fase de prova,
 * ajuste adaptativo, recovery e o painel "Meu momento na corrida".
 */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const d90 = new Date(now - 90 * 86400000);

  const [{ data: profile }, { data: runs }, { data: wearable }, { data: sessions7 }] = await Promise.all([
    supabase.from('profiles').select('age, gender, main_goal, athlete_sport, target_race_date, sleep_hours, sleep_quality, stress_level, work_type, weekly_frequency').eq('id', user.id).maybeSingle(),
    supabase.from('cardio_sessions').select('performed_at, created_at, distance_km, duration_min, avg_hr, avg_heart_rate, type').eq('user_id', user.id).gte('created_at', d90.toISOString()).order('created_at', { ascending: true }),
    supabase.from('wearable_metrics').select('hrv_ms, hrv_baseline_ms, resting_hr, sleep_hours, body_battery, training_readiness, recovery_time_hours').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('workout_sessions').select('started_at').eq('user_id', user.id).gte('started_at', new Date(now - 7 * 86400000).toISOString()),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (runs ?? []) as any[];
  const dateMs = (r: any) => new Date(r.performed_at || r.created_at).getTime();
  const km = (since: number) => list.filter((r) => dateMs(r) >= now - since * 86400000).reduce((a, r) => a + (r.distance_km ?? 0), 0);
  const km7 = km(7), km28 = km(28), km90 = km(90);

  // Volume médio semanal e consistência (últimas 8 semanas)
  const weeks = 8;
  let weeksWithRun = 0;
  for (let w = 0; w < weeks; w++) {
    const end = now - w * 7 * 86400000, start = end - 7 * 86400000;
    if (list.some((r) => dateMs(r) <= end && dateMs(r) > start)) weeksWithRun++;
  }
  const weeklyKmAvg = km90 / Math.max(1, Math.min(weeks, Math.ceil(90 / 7)));
  const sessionsPerWeek = list.filter((r) => dateMs(r) >= now - 28 * 86400000).length / 4;
  const longestKm = list.reduce((m, r) => Math.max(m, r.distance_km ?? 0), 0);

  const runner = classifyRunner({ weeklyKmAvg, sessionsPerWeek, weeksConsistent: weeksWithRun, longestKm });
  const load = computeCardioLoad({ km7, km28, km90, sessions7: list.filter((r) => dateMs(r) >= now - 7 * 86400000).length });

  // Recovery (wearable tem prioridade)
  const recovery = computeRecoveryState({
    sleepHours: (profile as any)?.sleep_hours ?? null,
    sleepQuality: (profile as any)?.sleep_quality ?? null,
    stressLevel: (profile as any)?.stress_level ?? null,
    workType: (profile as any)?.work_type ?? null,
    daysSinceLastWorkout: 1,
    avgRir: null,
    sessionsLast7: sessions7?.length ?? 0,
    plannedPerWeek: (profile as any)?.weekly_frequency ?? 3,
    wearable: wearable ? {
      hrvMs: (wearable as any).hrv_ms ?? null,
      hrvBaselineMs: (wearable as any).hrv_baseline_ms ?? null,
      restingHr: (wearable as any).resting_hr ?? null,
      sleepHoursMeasured: (wearable as any).sleep_hours ?? null,
      bodyBattery: (wearable as any).body_battery ?? null,
      trainingReadiness: (wearable as any).training_readiness ?? null,
      recoveryTimeHours: (wearable as any).recovery_time_hours ?? null,
    } : null,
  });
  const recCat = (recovery?.category ?? 'moderate') as RecoveryCategory;

  // Zonas (FC máx do relógio se houver pico recente; senão idade)
  const maxHrSeen = list.reduce((m, r) => Math.max(m, r.avg_hr ?? r.avg_heart_rate ?? 0), 0);
  const zones = computeTrainingZones({
    age: (profile as any)?.age ?? null,
    maxHrMeasured: maxHrSeen > 0 ? Math.round(maxHrSeen / 0.92) : null, // estimativa de máx a partir do maior avg observado
    restingHr: (wearable as any)?.resting_hr ?? null,
  });

  const runPoints: RunPoint[] = list.map((r) => ({ dateMs: dateMs(r), km: r.distance_km ?? 0, durationMin: r.duration_min ?? 0, avgHr: r.avg_hr ?? r.avg_heart_rate ?? null }));
  const performance = analyzeRunPerformance({ runs: runPoints, periodDays: 90 });

  const raceDate = (profile as any)?.target_race_date ? new Date((profile as any).target_race_date) : null;
  const weeksToRace = raceDate && raceDate.getTime() >= now - 86400000 ? Math.max(0, Math.ceil((raceDate.getTime() - now) / (7 * 86400000))) : null;
  const racePhase = deriveRacePhase({ weeksToRace });

  // Próximo treino sugerido (determinístico): base no nível + fase + recuperação
  const baseKm = racePhase.phase === 'base' ? Math.round(weeklyKmAvg / Math.max(1, sessionsPerWeek)) || 5 : Math.round((weeklyKmAvg / Math.max(1, sessionsPerWeek)) || 5);
  const plannedZone = racePhase.phase === 'pico' || racePhase.phase === 'construcao' ? 'Z4' : 'Z2';
  const adaptive = adaptiveWorkout({ plannedKm: baseKm, plannedZone, recoveryCategory: recCat });
  const nextWorkout = adaptive.km != null ? `${adaptive.km}km ${adaptive.zone}${adaptive.adjusted ? ' (ajustado)' : ''}` : 'Descanso';

  const moment = buildRunnerMoment({
    levelLabel: runner.label,
    performanceStatus: performance.status,
    biggestImprovement: performance.biggestImprovement,
    loadRisk: load.risk,
    recoveryCategory: recCat,
    nextWorkout,
  });

  return Response.json({
    runner, load, zones, performance, racePhase, adaptive, recovery: { score: recovery?.score ?? null, category: recCat },
    race: raceDate ? { date: (profile as any).target_race_date, weeks: weeksToRace } : null,
    moment,
    volume: { km7: Math.round(km7 * 10) / 10, km28: Math.round(km28 * 10) / 10, km90: Math.round(km90 * 10) / 10 },
    usedWearable: recovery?.usedWearable ?? false,
  });
}
