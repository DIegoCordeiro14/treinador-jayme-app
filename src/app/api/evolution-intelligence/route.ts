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

    const [{ data: profile }, { data: bios }, { data: meas }, { data: wl }, { data: sess }, { data: sets }, { data: food }] =
      await Promise.all([
        supabase.from('profiles').select('main_goal, experience_level, weekly_frequency, sleep_hours, sleep_quality, stress_level').eq('id', user.id).maybeSingle(),
        supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, skeletal_muscle_mass_kg, measured_at').eq('user_id', user.id).gte('measured_at', date90).order('measured_at', { ascending: true }),
        supabase.from('body_measurements').select('weight_kg, body_fat_pct, waist_cm, date').eq('user_id', user.id).gte('date', date90).order('date', { ascending: true }),
        supabase.from('body_weight_logs').select('weight_kg, body_fat_pct, log_date').eq('user_id', user.id).gte('log_date', date90).order('log_date', { ascending: true }),
        supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', user.id).gte('started_at', iso).order('started_at', { ascending: true }),
        supabase.from('session_sets').select('weight_kg, rir, completed, exercise:exercises(muscle_group), session:workout_sessions!inner(started_at, user_id)').eq('session.user_id', user.id).gte('session.started_at', iso),
        supabase.from('food_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', new Date(now - 14 * 86400000).toISOString()),
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
    const mid = Math.floor(unified.length / 2);
    const avg = (arr: (number | null)[]) => { const v = arr.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
    const beforeAfter = unified.length >= 2 ? compareBeforeAfter(Math.round(spanDays / 2), [
      { label: 'Peso', unit: 'kg', before: avg(unified.slice(0, mid).map((u) => u.weightKg)), after: avg(unified.slice(mid).map((u) => u.weightKg)), higherIsBetter: false },
      { label: 'Gordura', unit: '%', before: avg(unified.slice(0, mid).map((u) => u.bodyFatPct)), after: avg(unified.slice(mid).map((u) => u.bodyFatPct)), higherIsBetter: false },
      { label: 'Massa magra', unit: 'kg', before: avg(unified.slice(0, mid).map((u) => u.leanKg)), after: avg(unified.slice(mid).map((u) => u.leanKg)), higherIsBetter: true },
    ]) : null;

    return Response.json({ state, matrix, muscleScores, scenarios, beforeAfter });
  } catch (err) {
    return Response.json({ state: null, error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}
