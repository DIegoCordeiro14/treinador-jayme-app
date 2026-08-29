// plan-response-evaluation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Avaliador de bloco compartilhado (rota do usuário + cron semanal).
// Recebe um client Supabase já autenticado/service e um userId. Sem estado.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyPlanResponse } from './plan-response-engine';
import { analyzeAdherence } from './adherence-engine';
import { halvesDelta } from './body-metrics-unifier';

export interface BlockEvaluation {
  planId: string | null;
  blockStart: string;
  sessionsCompleted: number;
  sessionsPlanned: number;
  strengthDeltaPct: number | null;
  adherenceRate: number;
  classification: string;
  nextGenerationHint: string;
  score: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function evaluateBlock(supabase: any, userId: string): Promise<BlockEvaluation> {
  const now = Date.now();
  const { data: plan } = await supabase.from('workout_plans')
    .select('id, created_at, days_per_week').eq('user_id', userId).eq('is_active', true)
    .order('created_at', { ascending: false }).maybeSingle();
  const p = plan as { id?: string; created_at?: string; days_per_week?: number } | null;
  const blockStartIso = p?.created_at ?? new Date(now - 28 * 86400000).toISOString();

  const [{ data: sess }, { data: sets }] = await Promise.all([
    supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', userId).gte('started_at', blockStartIso).order('started_at', { ascending: true }),
    supabase.from('session_sets').select('weight_kg, rir, completed, session:workout_sessions!inner(started_at, user_id)').eq('session.user_id', userId).gte('session.started_at', blockStartIso),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const S = (sess ?? []) as any[]; const SS = (sets ?? []) as any[];

  const topByDay = new Map<string, number>();
  const rirByDay = new Map<string, number[]>();
  for (const s of SS) {
    if (s.completed === false) continue;
    const day = s.session?.started_at?.slice(0, 10); const w = s.weight_kg ?? 0;
    if (!day) continue;
    if (w > 0) topByDay.set(day, Math.max(topByDay.get(day) ?? 0, w));
    if (s.rir != null) { const a = rirByDay.get(day) ?? []; a.push(Number(s.rir)); rirByDay.set(day, a); }
  }
  const days = [...topByDay.keys()].sort();
  const tops = days.map((d) => topByDay.get(d)!);
  const strDelta = halvesDelta(tops);
  const strBase = tops.length ? tops.slice(0, Math.max(1, Math.floor(tops.length / 2))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(tops.length / 2)) : 0;
  const strengthDeltaPct = strDelta != null && strBase > 0 ? Math.round((strDelta / strBase) * 1000) / 10 : null;

  const dailyRir = days.map((d) => { const a = rirByDay.get(d) ?? []; return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }).filter((x) => !Number.isNaN(x));
  const avgRirTrend = dailyRir.length >= 2 ? halvesDelta(dailyRir) : null;

  const weeks = Math.max(1, (now - new Date(blockStartIso).getTime()) / (7 * 86400000));
  const planned = Math.round((p?.days_per_week ?? 4) * weeks);
  const adherence = analyzeAdherence({ sessionsPlanned: planned, sessionsCompleted: S.length, avgPlannedDurationMin: null, avgRealDurationMin: null });

  const classification = classifyPlanResponse({
    strengthDeltaPct,
    volumeToleratedRate: adherence.completionRate,
    avgRirTrend,
    recoveryTrend: 'unknown',
    adherenceRate: adherence.completionRate,
    bodyProgress: 'unknown',
  });

  return {
    planId: p?.id ?? null, blockStart: blockStartIso,
    sessionsCompleted: S.length, sessionsPlanned: planned,
    strengthDeltaPct, adherenceRate: adherence.completionRate,
    classification: classification.classification,
    nextGenerationHint: classification.nextGenerationHint,
    score: classification.score,
  };
}
