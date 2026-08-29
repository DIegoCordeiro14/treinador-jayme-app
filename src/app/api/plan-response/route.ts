import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyPlanResponse } from '@/lib/edn/plan-response-engine';
import { analyzeAdherence } from '@/lib/edn/adherence-engine';
import { halvesDelta } from '@/lib/edn/body-metrics-unifier';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/plan-response — avalia o BLOCO do plano ativo e classifica a resposta
 * (HIGHLY_EFFECTIVE..EXCESSIVE_FATIGUE). Determinístico. Registra a classificação
 * em athlete_decisions (engine plan-response) para retroalimentar a próxima geração.
 * GET = avaliar (dry-run); POST = avaliar + persistir a decisão.
 */
async function evaluate(userId: string, supabase: ReturnType<typeof createClient>) {
  const now = Date.now();
  // plano ativo + início do bloco
  const { data: plan } = await supabase.from('workout_plans')
    .select('id, created_at, days_per_week').eq('user_id', userId).eq('is_active', true)
    .order('created_at', { ascending: false }).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = plan as any;
  const blockStartIso = p?.created_at ?? new Date(now - 28 * 86400000).toISOString();

  const [{ data: sess }, { data: sets }] = await Promise.all([
    supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', userId).gte('started_at', blockStartIso).order('started_at', { ascending: true }),
    supabase.from('session_sets').select('weight_kg, rir, completed, session:workout_sessions!inner(started_at, user_id)').eq('session.user_id', userId).gte('session.started_at', blockStartIso),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const S = (sess ?? []) as any[]; const SS = (sets ?? []) as any[];

  // força: top-set/sessão, delta por metades (%)
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

  // RIR trend (média por dia, delta por metades)
  const dailyRir = days.map((d) => { const a = rirByDay.get(d) ?? []; return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }).filter((x) => !Number.isNaN(x));
  const avgRirTrend = dailyRir.length >= 2 ? halvesDelta(dailyRir) : null;

  // aderência: sessões feitas vs planejadas no bloco
  const weeks = Math.max(1, (now - new Date(blockStartIso).getTime()) / (7 * 86400000));
  const planned = Math.round((p?.days_per_week ?? 4) * weeks);
  const adherence = analyzeAdherence({ sessionsPlanned: planned, sessionsCompleted: S.length, avgPlannedDurationMin: null, avgRealDurationMin: null });

  const classification = classifyPlanResponse({
    strengthDeltaPct,
    volumeToleratedRate: adherence.completionRate,   // proxy: quanto do plano foi cumprido
    avgRirTrend,
    recoveryTrend: 'unknown',
    adherenceRate: adherence.completionRate,
    bodyProgress: 'unknown',
  });

  return {
    planId: p?.id ?? null,
    blockStart: blockStartIso,
    sessionsCompleted: S.length,
    sessionsPlanned: planned,
    strengthDeltaPct,
    adherenceRate: adherence.completionRate,
    classification: classification.classification,
    nextGenerationHint: classification.nextGenerationHint,
    score: classification.score,
  };
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await evaluate(user.id, supabase);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await evaluate(user.id, supabase);
    // registra a classificação do bloco para retroalimentar a próxima geração
    try {
      await supabase.from('athlete_decisions').insert({
        user_id: user.id, trigger: 'block_end', engine: 'plan-response', domain: 'training',
        decision: result.classification, applied: true, outcome: result.classification,
        outcome_at: new Date().toISOString(),
        inputs: { strengthDeltaPct: result.strengthDeltaPct, adherenceRate: result.adherenceRate, score: result.score },
      });
    } catch { /* não bloqueia */ }
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}
