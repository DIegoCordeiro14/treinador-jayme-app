import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildEvolutionState } from '@/lib/edn/evolution-intelligence-engine';
import { unifyBodyMetrics, seriesOf, halvesDelta, linearTrend, spanDaysOf } from '@/lib/edn/body-metrics-unifier';
import type { RawBodyPoint } from '@/lib/edn/body-metrics-unifier';
import { classifyMatrix } from '@/lib/edn/performance-composition-matrix';
import { scoreAllMuscles, type MuscleDevInput } from '@/lib/edn/muscle-development-score';
import { planMuscleVolume } from '@/lib/edn/muscle-volume-intelligence';
import { projectScenarios } from '@/lib/edn/body-projection-scenarios';
import { compareBeforeAfter } from '@/lib/edn/before-after-engine';
import { buildEvolutionReport } from '@/lib/edn/athlete-evolution-report';
import { buildTimeline, groupTimelineByMonth, type TimelineKind } from '@/lib/edn/evolution-timeline-engine';
import { summarizeDecisions, type DecisionOutcome } from '@/lib/edn/decision-outcome-engine';
import { buildEvolutionMemory } from '@/lib/edn/athlete-evolution-memory';
import { analyzeRecoveryEvolution, type RecoveryEvolution, type RecoveryPoint } from '@/lib/edn/recovery-evolution-engine';
import { analyzeCorrelation, CORRELATION_SPECS, type PairedSample } from '@/lib/edn/evolution-correlation-engine';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * GET /api/evolution-intelligence — Evolution Intelligence (Fases 1-3).
 * Retorna EvolutionState + matriz + muscle scores + cenários + before/after,
 * tudo determinístico. Aditivo. try/catch com fallback seguro.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    const iso = new Date(now - 90 * 86400000).toISOString();
    const date90 = iso.slice(0, 10);

    const [{ data: profile }, { data: bios }, { data: meas }, { data: wl }, { data: sess }, { data: sets }, { data: food }, { data: tl }, { data: dec }, { data: recs }, { data: cardio }] =
      await Promise.all([
        supabase.from('profiles').select('main_goal, experience_level, weekly_frequency, sleep_hours, sleep_quality, stress_level').eq('id', user.id).maybeSingle(),
        supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, skeletal_muscle_mass_kg, measured_at').eq('user_id', user.id).gte('measured_at', date90).order('measured_at', { ascending: true }),
        supabase.from('body_measurements').select('weight_kg, body_fat_pct, waist_cm, date').eq('user_id', user.id).gte('date', date90).order('date', { ascending: true }),
        supabase.from('body_weight_logs').select('weight_kg, body_fat_pct, log_date').eq('user_id', user.id).gte('log_date', date90).order('log_date', { ascending: true }),
        supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', user.id).gte('started_at', iso).order('started_at', { ascending: true }),
        supabase.from('session_sets').select('weight_kg, rir, completed, exercise:exercises(muscle_group), session:workout_sessions!inner(started_at, user_id)').eq('session.user_id', user.id).gte('session.started_at', iso),
        supabase.from('food_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', new Date(now - 14 * 86400000).toISOString()),
        supabase.from('athlete_timeline').select('kind, title, detail, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(40),
        supabase.from('athlete_decisions').select('id, decision, domain, applied, outcome, baseline_metrics, outcome_metrics, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
        supabase.from('recovery_logs').select('log_date, sleep_hours, hrv_ms, resting_hr, recovery_score').eq('user_id', user.id).gte('log_date', date90).order('log_date', { ascending: true }),
        supabase.from('cardio_sessions').select('duration_min, created_at').eq('user_id', user.id).is('deleted_at', null).gte('created_at', iso),
      ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (bios ?? []) as any[]; const M = (meas ?? []) as any[]; const W = (wl ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const S = (sess ?? []) as any[]; const SS = (sets ?? []) as any[]; const F = (food ?? []) as any[];

    const bodyPoints: RawBodyPoint[] = [
      ...B.map((r) => ({ dateISO: String(r.measured_at), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, leanKg: r.lean_mass_kg ?? null, muscleKg: r.skeletal_muscle_mass_kg ?? null, source: 'bioimpedance' as const })),
      ...M.map((r) => ({ dateISO: String(r.date), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, waistCm: r.waist_cm ?? null, source: 'measurement' as const })),
      ...W.map((r) => ({ dateISO: String(r.log_date), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, source: 'weight_log' as const })),
    ];
    const unified = unifyBodyMetrics(bodyPoints);
    const weightSeries = seriesOf(unified, 'weightKg');
    const weightTrend = linearTrend(weightSeries);
    const weightDelta = halvesDelta(weightSeries.map((p) => p.value));
    const bfDelta = halvesDelta(seriesOf(unified, 'bodyFatPct').map((p) => p.value));
    const leanDelta = halvesDelta(seriesOf(unified, 'leanKg').map((p) => p.value));

    // ── volume delta (%) ──
    const volVals = S.map((r) => r.total_volume_kg ?? 0);
    const volDeltaAbs = halvesDelta(volVals);
    const volBase = volVals.length ? volVals.slice(0, Math.max(1, Math.floor(volVals.length / 2))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(volVals.length / 2)) : 0;
    const volumeDeltaPct = volDeltaAbs != null && volBase > 0 ? Math.round((volDeltaAbs / volBase) * 100) : null;

    // ── força: top-set/sessão, delta por metades (%) ──
    const topBySession = new Map<string, number>();
    for (const s of SS) {
      if (s.completed === false) continue;
      const day = s.session?.started_at?.slice(0, 10); const w = s.weight_kg ?? 0;
      if (!day || w <= 0) continue;
      topBySession.set(day, Math.max(topBySession.get(day) ?? 0, w));
    }
    const topVals = [...topBySession.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    const strDeltaAbs = halvesDelta(topVals);
    const strBase = topVals.length ? topVals.slice(0, Math.max(1, Math.floor(topVals.length / 2))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(topVals.length / 2)) : 0;
    const strengthDeltaPct = strDeltaAbs != null && strBase > 0 ? Math.round((strDeltaAbs / strBase) * 1000) / 10 : null;

    // ── recuperação (proxy sono+estresse) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (profile ?? {}) as any;
    let recoveryScore: number | null = null; let recoveryLabel: string | null = null;
    if (p.sleep_hours != null || p.stress_level != null || p.sleep_quality != null) {
      let r = 60;
      if (p.sleep_hours != null) { if (p.sleep_hours >= 7) r += 20; else if (p.sleep_hours < 6) r -= 20; }
      if (p.sleep_quality) { if (/bo[am]|good|otim/i.test(String(p.sleep_quality))) r += 10; else if (/ruim|poor|mau/i.test(String(p.sleep_quality))) r -= 10; }
      if (p.stress_level) { if (/alto|high/i.test(String(p.stress_level))) r -= 15; else if (/baixo|low/i.test(String(p.stress_level))) r += 10; }
      recoveryScore = Math.max(0, Math.min(100, r));
      recoveryLabel = recoveryScore >= 70 ? 'boa' : recoveryScore >= 45 ? 'moderada' : 'baixa';
    }

    // Recuperação REAL (recovery_logs) sobrepõe o proxy quando disponível.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const REC = (recs ?? []) as any[];
    const recoveryPoints: RecoveryPoint[] = REC.map((r) => ({
      dateISO: String(r.log_date), recoveryScore: r.recovery_score ?? null,
      sleepH: r.sleep_hours ?? null, restingHr: r.resting_hr ?? null, hrv: r.hrv_ms ?? null,
    }));
    const lastRec = REC.filter((r) => r.recovery_score != null).slice(-1)[0];
    if (lastRec) {
      recoveryScore = Number(lastRec.recovery_score);
      recoveryLabel = recoveryScore >= 70 ? 'boa' : recoveryScore >= 45 ? 'moderada' : 'baixa';
    }

    const spanDays = Math.max(28, spanDaysOf(unified));
    const weeklyFreq = Number(p.weekly_frequency ?? 0);
    const sessionsPlanned = weeklyFreq > 0 ? Math.round(weeklyFreq * (Math.min(spanDays, 90) / 7)) : 0;
    const daysLogged = new Set(F.map((r) => String(r.logged_at).slice(0, 10))).size;

    const state = buildEvolutionState({
      goalRaw: p.main_goal ?? null, bodyPoints, strengthDeltaPct, volumeDeltaPct,
      sessionsDone: S.length, sessionsPlanned, recoveryScore, recoveryLabel,
      daysLogged, logWindowDays: 14,
    });

    // ── Matriz Performance × Composição ──
    const compositionDelta = (bfDelta != null ? -bfDelta : 0) + (leanDelta != null ? leanDelta : 0);
    const matrix = classifyMatrix({
      compositionDelta: (bfDelta == null && leanDelta == null) ? null : compositionDelta,
      performanceDelta: strengthDeltaPct,
      recoveryScore, inDeficit: state.goal === 'cutting',
      sleepShort: p.sleep_hours != null && p.sleep_hours < 6,
      volumeHigh: volumeDeltaPct != null && volumeDeltaPct > 20,
    });

    // ── Muscle Development Score por grupo ──
    const experience = /adv|avanç/i.test(String(p.experience_level)) ? 'advanced' : /inter/i.test(String(p.experience_level)) ? 'intermediate' : 'beginner';
    const spanWeeks = Math.max(1, spanDays / 7);
    const byMuscle = new Map<string, { sets: number; days: Set<string>; rirs: number[]; topByDay: Map<string, number> }>();
    for (const s of SS) {
      if (s.completed === false) continue;
      const mg = s.exercise?.muscle_group; const day = s.session?.started_at?.slice(0, 10);
      if (!mg || !day) continue;
      const e = byMuscle.get(mg) ?? { sets: 0, days: new Set<string>(), rirs: [], topByDay: new Map<string, number>() };
      e.sets += 1; e.days.add(day);
      if (s.rir != null) e.rirs.push(Number(s.rir));
      const w = s.weight_kg ?? 0; if (w > 0) e.topByDay.set(day, Math.max(e.topByDay.get(day) ?? 0, w));
      byMuscle.set(mg, e);
    }
    const volumePlan = planMuscleVolume({
      muscles: [...byMuscle.entries()].map(([mg, e]) => ({ muscle_group: mg, weekly_sets: e.sets / spanWeeks, sessions_per_week: e.days.size / spanWeeks })),
      experience: experience as 'beginner' | 'intermediate' | 'advanced',
      recovery: (recoveryLabel === 'baixa' ? 'low' : recoveryLabel === 'moderada' ? 'moderate' : 'good') as 'low' | 'moderate' | 'good',
    });
    const targetByMuscle = Object.fromEntries(volumePlan.map((v) => [v.muscle_group, v.target_weekly_sets]));
    const muscleInputs: MuscleDevInput[] = [...byMuscle.entries()].map(([mg, e]) => {
      const tops = [...e.topByDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
      const d = halvesDelta(tops);
      const base = tops.length ? tops.slice(0, Math.max(1, Math.floor(tops.length / 2))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(tops.length / 2)) : 0;
      const loadProg = d != null && base > 0 ? Math.round((d / base) * 1000) / 10 : null;
      return {
        muscle_group: mg, weekly_sets: Math.round((e.sets / spanWeeks) * 10) / 10,
        target_weekly_sets: targetByMuscle[mg] ?? 12,
        load_progression_pct: loadProg, reps_trend_pct: null,
        avg_rir: e.rirs.length ? Math.round((e.rirs.reduce((a, b) => a + b, 0) / e.rirs.length) * 10) / 10 : null,
        frequency_per_week: Math.round((e.days.size / spanWeeks) * 10) / 10,
        recovery_ok: recoveryScore == null || recoveryScore >= 45,
      };
    });
    const muscleScores = scoreAllMuscles(muscleInputs);

    // ── Cenários de projeção ──
    const currentWeightKg = weightSeries.length ? weightSeries[weightSeries.length - 1].value : null;
    const scenarios = currentWeightKg != null ? projectScenarios({
      currentWeightKg,
      currentBfPct: unified.length ? unified[unified.length - 1].bodyFatPct : null,
      currentLeanKg: unified.length ? unified[unified.length - 1].leanKg : null,
      weeklyWeightDeltaKg: weightTrend.slopePerWeek ?? 0,
      adherencePct: Math.round(Math.min(100, (daysLogged / 14) * 100)),
      confidence: weightTrend.rSquared ?? 0.7,
    }) : null;

    // ── Before/After (últimos ~45d vs anteriores) ──
    // "Antes vs Depois": PRIMEIRO valor real do período vs ÚLTIMO (mais recente).
    // O "Depois" é o valor atual — coerente com o peso/BF exibidos nas demais abas
    // (antes usávamos média das metades, o que fazia "Depois" divergir do atual).
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const firstLast = (metric: 'weightKg' | 'bodyFatPct' | 'leanKg'): { before: number | null; after: number | null } => {
      const vals = seriesOf(unified, metric).map((pt) => pt.value).filter((v): v is number => v != null);
      if (vals.length === 0) return { before: null, after: null };
      return { before: round1(vals[0]), after: round1(vals[vals.length - 1]) };
    };
    const wBA = firstLast('weightKg'); const bfBA = firstLast('bodyFatPct'); const lnBA = firstLast('leanKg');
    const beforeAfter = unified.length >= 2 ? compareBeforeAfter(Math.round(spanDays), [
      { label: 'Peso', unit: 'kg', before: wBA.before, after: wBA.after, higherIsBetter: false },
      { label: 'Gordura', unit: '%', before: bfBA.before, after: bfBA.after, higherIsBetter: false },
      { label: 'Massa magra', unit: 'kg', before: lnBA.before, after: lnBA.after, higherIsBetter: true },
    ]) : null;

    // ── Decisões → resultados (mapeia outcome textual em verdict) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DEC = (dec ?? []) as any[];
    const mapVerdict = (o: string | null, applied: boolean): DecisionOutcome['verdict'] => {
      const t = (o ?? '').toLowerCase();
      if (/positiv|melhor|sucesso|good|efic/.test(t)) return 'positive';
      if (/negativ|pior|falh|bad|inefic/.test(t)) return 'negative';
      if (!o) return applied ? 'pending' : 'neutral';
      return 'neutral';
    };
    const decisionOutcomes: DecisionOutcome[] = DEC.map((d) => {
      const om = d.outcome_metrics ?? null;
      if (om) {
        // Resultado QUANTITATIVO a partir dos deltas medidos.
        const parts: number[] = [];
        if (om.strengthDeltaPct != null) parts.push(Number(om.strengthDeltaPct));
        if (om.recoveryDeltaPct != null) parts.push(Number(om.recoveryDeltaPct));
        if (om.bodyFatDeltaPct != null) parts.push(-Number(om.bodyFatDeltaPct) * 5);
        if (om.leanDeltaKg != null) parts.push(Number(om.leanDeltaKg) * 10);
        const scoreDelta = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10 : 0;
        const verdict: DecisionOutcome['verdict'] = scoreDelta >= 3 ? 'positive' : scoreDelta <= -3 ? 'negative' : 'neutral';
        return { id: d.id, decision: d.decision ?? 'Decisão', verdict, scoreDelta,
          summary: `${verdict === 'positive' ? 'Decisão positiva' : verdict === 'negative' ? 'Decisão negativa' : 'Resultado neutro'} (índice ${scoreDelta > 0 ? '+' : ''}${scoreDelta}): ${d.decision ?? ''}`.trim() };
      }
      const verdict = mapVerdict(d.outcome, d.applied !== false);
      return { id: d.id, decision: d.decision ?? 'Decisão', verdict, scoreDelta: 0,
        summary: `${verdict === 'positive' ? 'Decisão positiva' : verdict === 'negative' ? 'Decisão negativa' : verdict === 'pending' ? 'Aguardando resultado' : 'Resultado neutro'}: ${d.decision ?? ''}`.trim() };
    });
    const decisionStats = summarizeDecisions(decisionOutcomes);
    const memory = buildEvolutionMemory({
      decisions: DEC.map((d, i) => ({ action: String(d.domain ?? d.decision ?? 'decisao'), outcome: decisionOutcomes[i] })),
      responses: [],
    });

    // ── Timeline (athlete_timeline) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TL = (tl ?? []) as any[];
    const KIND_MAP: Record<string, TimelineKind> = { pr: 'pr', body: 'body_change', recovery: 'recovery_drop', deload: 'deload', decision: 'decision', plateau: 'plateau', milestone: 'milestone' };
    const timelineEvents = buildTimeline(TL.map((e) => ({
      dateISO: String(e.created_at).slice(0, 10),
      kind: (KIND_MAP[String(e.kind ?? '').toLowerCase()] ?? 'milestone') as TimelineKind,
      title: e.title ?? '', detail: e.detail ?? undefined,
    })));
    const timeline = groupTimelineByMonth(timelineEvents);

    // ── Recuperação: REAL (recovery_logs) ou proxy do perfil ──
    let recoveryEvo: RecoveryEvolution;
    if (recoveryPoints.length >= 2) {
      recoveryEvo = analyzeRecoveryEvolution(recoveryPoints, strengthDeltaPct);
    } else {
      recoveryEvo = {
        recoveryTrendPerWeek: null, sleepTrendPerWeek: null, restingHrTrendPerWeek: null, hrvTrendPerWeek: null,
        direction: recoveryLabel === 'baixa' ? 'declining' : recoveryLabel === 'boa' ? 'improving' : 'stable',
        performanceLink: 'unknown',
        message: recoveryLabel ? `Recuperação estimada: ${recoveryLabel} (sono/estresse do perfil).` : 'Sem dados de recuperação.',
      };
    }

    // ── Correlações observadas (só quando há dados pareados suficientes) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CARD = (cardio ?? []) as any[];
    const correlations: ReturnType<typeof analyzeCorrelation>[] = [];
    // sono (dia) x performance da sessão (top-set daquele dia)
    const sleepByDay = new Map<string, number>();
    for (const r of REC) if (r.sleep_hours != null) sleepByDay.set(String(r.log_date), Number(r.sleep_hours));
    const sleepPerf: PairedSample[] = [...topBySession.entries()]
      .filter(([day]) => sleepByDay.has(day))
      .map(([day, top]) => ({ x: sleepByDay.get(day)!, y: top }));
    if (sleepPerf.length >= 6) correlations.push(analyzeCorrelation(CORRELATION_SPECS.sleep_performance, sleepPerf));
    // cardio semanal x recovery score semanal
    const weekKey = (iso2: string) => { const d = new Date(iso2); const on = new Date(d); on.setDate(d.getDate() - d.getDay()); return on.toISOString().slice(0, 10); };
    const cardioByWeek = new Map<string, number>();
    for (const c of CARD) { const w = weekKey(String(c.created_at)); cardioByWeek.set(w, (cardioByWeek.get(w) ?? 0) + Number(c.duration_min ?? 0)); }
    const recByWeek = new Map<string, number[]>();
    for (const r of REC) if (r.recovery_score != null) { const w = weekKey(String(r.log_date)); const a = recByWeek.get(w) ?? []; a.push(Number(r.recovery_score)); recByWeek.set(w, a); }
    const cardioRec: PairedSample[] = [...cardioByWeek.entries()]
      .filter(([w]) => recByWeek.has(w))
      .map(([w, min]) => ({ x: min, y: recByWeek.get(w)!.reduce((a, b) => a + b, 0) / recByWeek.get(w)!.length }));
    if (cardioRec.length >= 6) correlations.push(analyzeCorrelation(CORRELATION_SPECS.cardio_recovery, cardioRec));

    // ── Relatório mensal (assembler determinístico) ──
    const report = beforeAfter ? buildEvolutionReport({
      periodLabel: `Últimos ${Math.round(spanDays)} dias`,
      state, beforeAfter, muscleScores, matrix, recovery: recoveryEvo,
      decisions: decisionOutcomes, decisionStats,
    }) : null;

    return Response.json({ state, matrix, muscleScores, scenarios, beforeAfter, report, timeline, decisions: decisionOutcomes, decisionStats, memory, recovery: recoveryEvo, correlations });
  } catch (err) {
    return Response.json({ state: null, error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}
