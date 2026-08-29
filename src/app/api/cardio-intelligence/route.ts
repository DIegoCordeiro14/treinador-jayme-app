import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeRecoveryState } from '@/lib/edn/recovery-engine';
import {
  classifyRunner, computeCardioLoad, computeTrainingZones, analyzeRunPerformance,
  deriveRacePhase, adaptiveWorkout, buildRunnerMoment, type RecoveryCategory, type RunPoint,
} from '@/lib/cardio/endurance-engine';
import { computeCardioEvolution } from '@/lib/edn/cardio-progression-engine';
import { buildCardioPlan } from '@/lib/edn/cardio-plan-engine';
import { diagnoseCardio } from '@/lib/edn/cardio-diagnosis-engine';
import { normalizeSportType, sportUsesGps } from '@/lib/cardio/sport-types';
import { forecastPerformance } from '@/lib/edn/performance-forecast-engine';
import { computeCardioAdherence } from '@/lib/edn/cardio-adherence-engine';
import { planCardioSafety } from '@/lib/edn/cardio-safety-planner';
import { learnCardioResponse, toCardioProfileRow } from '@/lib/edn/cardio-response-profile';
import { analyzeConcurrent, type SessionSlot } from '@/lib/edn/concurrent-training-engine';
import { computeActivityImpact } from '@/lib/edn/activity-impact-engine';
import { computeFatigueState } from '@/lib/edn/fatigue-state-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/cardio-intelligence — Treinador de endurance (determinístico).
 * Retorna nível do corredor, carga, zonas, performance/platô, fase de prova,
 * ajuste adaptativo, recovery e o painel "Meu momento na corrida".
 */
export async function GET(_req: NextRequest) { try {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const d90 = new Date(now - 90 * 86400000);

  const [{ data: profile }, { data: runs }, { data: wearable }, { data: sessions7 }, { data: pcRows }, { data: activePlan }] = await Promise.all([
    supabase.from('profiles').select('age, gender, main_goal, athlete_sport, target_race_date, sleep_hours, sleep_quality, stress_level, work_type, weekly_frequency').eq('id', user.id).maybeSingle(),
    supabase.from('cardio_sessions').select('performed_at, created_at, distance_km, duration_min, avg_hr, avg_heart_rate, type').eq('user_id', user.id).is('deleted_at', null).gte('created_at', d90.toISOString()).order('created_at', { ascending: true }),
    supabase.from('wearable_metrics').select('hrv_ms, hrv_baseline_ms, resting_hr, sleep_hours, body_battery, training_readiness, recovery_time_hours').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('workout_sessions').select('started_at').eq('user_id', user.id).gte('started_at', new Date(now - 7 * 86400000).toISOString()),
    supabase.from('physical_conditions').select('body_region, status, active').eq('user_id', user.id).eq('active', true),
    supabase.from('workout_plans').select('schedule_config').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
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
  const evolution = computeCardioEvolution({ runs: runPoints.map((r) => ({ dateMs: r.dateMs, km: r.km, durationMin: r.durationMin, avgHr: r.avgHr })), recoveryCategory: recCat, goal: (profile as any)?.main_goal ?? null });

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

  // ── Fonte única de metas (cardio-plan-engine) ──
  const modalityRaw = (profile as any)?.athlete_sport ?? 'running';
  const modNorm = normalizeSportType(modalityRaw);
  const modality = (modNorm === 'corrida' || modNorm === 'trilha') ? 'running' : modNorm === 'ciclismo' || modNorm === 'mtb' ? 'cycling' : modNorm === 'natacao' ? 'swimming' : modNorm === 'caminhada' ? 'walking' : sportUsesGps(modNorm) ? 'running' : 'other';
  const goal = (profile as any)?.main_goal ?? null;
  const strengthPriority = /hyper|hipert|massa|bulk/i.test(String(goal ?? ''));
  const plan = buildCardioPlan({
    goal, modality: modality as any, bodyFatPct: null, gender: (profile as any)?.gender ?? null,
    weeksOnPlan: weeksWithRun, recoveryCategory: recCat, daysPerWeekAvailable: (profile as any)?.weekly_frequency ?? 4,
    runs: runPoints.map((r) => ({ dateMs: r.dateMs, km: r.km, durationMin: r.durationMin, avgHr: r.avgHr })),
    cardioKm7: km7, cardioSessions7: list.filter((r) => dateMs(r) >= now - 7 * 86400000).length,
    raceWeeks: weeksToRace, strengthPriority,
  });

  // ── Diagnóstico único (cardio-diagnosis-engine) ──
  const volTrendPct = (() => {
    const prev28 = km(56) - km28; // 28d anteriores
    if (prev28 <= 0) return null;
    return Math.round(((km28 - prev28) / prev28) * 100);
  })();
  const diagnosis = diagnoseCardio({
    runsCount: list.length, periodDays: 90,
    paceTrendPct: evolution.paceTrendPct, hrTrendPct: evolution.hrTrendPct, volumeTrendPct: volTrendPct,
    acwr: load.acwr, recoveryScore: recovery?.score ?? null,
    sessions7: list.filter((r) => dateMs(r) >= now - 7 * 86400000).length,
    plannedSessions: plan.sessionsPerWeek, km7, km28,
    dataConfidence: Math.min(1, list.length / 8),
  });

  // ── Forecast (cenários) a partir do melhor PR ──
  const bestPr = [...evolution.records].sort((a, b) => b.distanceKm - a.distanceKm)[0] ?? null;
  const targetKm = bestPr ? (bestPr.distanceKm <= 5 ? 10 : bestPr.distanceKm <= 10 ? 21.1 : 42.2) : 10;
  const doneSessions7 = list.filter((r) => dateMs(r) >= now - 7 * 86400000).length;
  const adherence = computeCardioAdherence({
    plannedSessions: plan.sessionsPerWeek, doneSessions: doneSessions7,
    plannedKm: plan.weeklyKm.ideal, doneKm: km7,
  });
  const forecast = bestPr ? forecastPerformance({
    bestDistanceKm: bestPr.distanceKm, bestTimeMin: bestPr.timeMin, targetKm,
    paceTrendPct: evolution.paceTrendPct, efficiencyTrendPct: evolution.hrTrendPct,
    adherence: adherence.overall, recoveryScore: recovery?.score ?? null, weeksToRace: weeksToRace,
  }) : null;

  // ── Safety planner (condições físicas → modalidades) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safety = planCardioSafety(((pcRows ?? []) as any[]).map((c) => ({ bodyRegion: c.body_region, status: c.status, active: c.active !== false })));

  // ── Write path: cardio-response-profile (best-effort, observações mensais) ──
  try {
    // observações: variação de volume mês a mês vs desfecho (melhorou pace / recuperação)
    const obs: { volumeIncreasePct: number; outcome: 'improved' | 'stable' | 'recovery_dropped'; kind: 'volume' }[] = [];
    const byMonth = new Map<string, number>();
    for (const r of list) { const m = new Date(dateMs(r)).toISOString().slice(0, 7); byMonth.set(m, (byMonth.get(m) ?? 0) + (r.distance_km ?? 0)); }
    const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (let k = 1; k < months.length; k++) {
      const prev = months[k - 1][1], cur = months[k][1];
      if (prev <= 0) continue;
      const inc = Math.round(((cur - prev) / prev) * 100);
      if (inc <= 0) continue;
      const outcome: 'improved' | 'stable' | 'recovery_dropped' = recCat === 'low' || recCat === 'critical' ? 'recovery_dropped' : (evolution.efficiency === 'melhorando' ? 'improved' : 'stable');
      obs.push({ volumeIncreasePct: inc, outcome, kind: 'volume' });
    }
    if (obs.length >= 3) {
      const prof = learnCardioResponse({ observations: obs });
      await supabase.from('cardio_response_profiles').upsert(toCardioProfileRow(user.id, prof), { onConflict: 'user_id' });
    }
  } catch { /* persistência aditiva */ }

  // ── Concurrent training (força × endurance) a partir do plano ativo ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sched: any = (activePlan as any)?.schedule_config ?? null;
  const slots: SessionSlot[] = [];
  if (sched?.pattern?.length) {
    for (const ednDay of sched.pattern as number[]) {
      const weekday = ednDay === 7 ? 0 : ednDay; // EDN 1-7 (seg-dom) → JS 0-6 (dom=0)
      const label = String(sched.day_assignments?.[String(ednDay)] ?? '').toLowerCase();
      const kind: SessionSlot['kind'] = /perna|leg|quadr|posterior|gluteo|panturr/.test(label) ? 'strength_legs' : 'strength_upper';
      slots.push({ weekday, kind, intensity: 'high' });
    }
  }
  // dias de cardio planejado (rest_days) como corrida leve/intervalado conforme fase
  if (sched?.cardio) {
    const cardioKind: SessionSlot['kind'] = plan.intervalSession ? 'run_interval' : 'run_easy';
    // aproxima cardio nos dias sem musculação
    for (let d = 0; d < 7; d++) if (!slots.some((sl) => sl.weekday === d)) { slots.push({ weekday: d, kind: cardioKind }); break; }
  }
  const strengthPri = plan.racePriority;
  const concurrent = slots.length ? analyzeConcurrent({ sessions: slots, priority: strengthPri as any, doms: false }) : null;

  // ── Activity impact da atividade mais recente ──
  const lastRun = list.length ? list[list.length - 1] : null;
  const activityImpact = lastRun ? computeActivityImpact({
    kind: 'running', durationMin: lastRun.duration_min ?? 0, distanceKm: lastRun.distance_km ?? null,
    avgHrPctMax: (lastRun.avg_hr ?? lastRun.avg_heart_rate) && zones ? Math.min(1, (lastRun.avg_hr ?? lastRun.avg_heart_rate) / (zones.maxHr || 190)) : null,
  }) : null;

  // ── Estado de fadiga por região (decaimento) + persistência do sinal ──
  const fatigueActivities = list.filter((r) => dateMs(r) >= now - 5 * 86400000).map((r) => ({
    dateMs: dateMs(r),
    kind: 'running' as const,
    durationMin: r.duration_min ?? 0,
    distanceKm: r.distance_km ?? null,
    avgHrPctMax: (r.avg_hr ?? r.avg_heart_rate) && zones ? Math.min(1, (r.avg_hr ?? r.avg_heart_rate) / (zones.maxHr || 190)) : null,
  }));
  const fatigueState = computeFatigueState(fatigueActivities, now);
  try {
    await supabase.from('activity_fatigue_signals').upsert({
      user_id: user.id, as_of_date: new Date(now).toISOString().slice(0, 10),
      lower_body_fatigue: fatigueState.lowerBodyFatigue, upper_body_fatigue: fatigueState.upperBodyFatigue,
      central_fatigue: fatigueState.centralFatigue, dominant_region: fatigueState.dominantRegion, source: 'cardio_activity',
    }, { onConflict: 'user_id,as_of_date' });
  } catch { /* aditivo */ }

  return Response.json({
    plan, diagnosis, forecast, adherence, safety, concurrent, activityImpact, fatigueState,
    runner, load, zones, performance, evolution, racePhase, adaptive, recovery: { score: recovery?.score ?? null, category: recCat },
    race: raceDate ? { date: (profile as any).target_race_date, weeks: weeksToRace } : null,
    moment,
    volume: { km7: Math.round(km7 * 10) / 10, km28: Math.round(km28 * 10) / 10, km90: Math.round(km90 * 10) / 10 },
    usedWearable: recovery?.usedWearable ?? false,
  });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro interno', plan: null, diagnosis: null }, { status: 200 });
  }
}
