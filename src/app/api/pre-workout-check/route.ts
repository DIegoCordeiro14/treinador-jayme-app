import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeAthleteState } from '@/lib/edn/performance-engine';
import { RECOVERY_CATEGORY_LABELS } from '@/lib/edn/recovery-engine';
import { decide } from '@/lib/edn/decision-engine';
import { recommendSessionAdaptation } from '@/lib/edn/adaptive-session-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/pre-workout-check — V6.5 Pilar 5 (Sistema de Treino Autônomo)
 *
 * Chamado ANTES de iniciar um treino. Analisa recuperação, fadiga, sono,
 * RIR e histórico recente e devolve o ajuste do dia com justificativa:
 *
 *  - progress    → aplicar progressão de carga (~2,5% nos compostos)
 *  - maintain    → treino normal conforme o plano
 *  - reduce_10   → sem técnicas de intensificação, RIR 2-3
 *  - reduce_25   → cortar últimas séries dos isolados (-25% volume)
 *  - rest        → recuperação crítica, descanso recomendado
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const dayId = req.nextUrl.searchParams.get('dayId');

  const state = await computeAthleteState(user.id);
  const rec = state.recovery_state;
  const r = state.raw;

  // ── Sinais integrados (V8): carga de endurance (ACWR) + performance recente ──
  let cardioAcwr: number | null = null;
  try {
    const since = new Date(Date.now() - 28 * 86400000).toISOString();
    const { data: cs } = await supabase.from('cardio_sessions').select('distance_km, performed_at, created_at').eq('user_id', user.id).is('deleted_at', null).gte('performed_at', since);
    if (cs && cs.length) {
      const now = Date.now();
      let acute = 0, chronic = 0;
      for (const c of cs as any[]) {
        const km = Number(c.distance_km) || 0;
        const t = new Date(c.performed_at ?? c.created_at ?? now).getTime();
        chronic += km;
        if (now - t <= 7 * 86400000) acute += km;
      }
      const chronicWeekly = chronic / 4; // média semanal em 28 dias
      if (chronicWeekly > 0) cardioAcwr = Math.round((acute / chronicWeekly) * 100) / 100;
    }
  } catch { /* sem cardio */ }

  // performance recente: top set médio das 2 últimas sessões vs 2 anteriores
  let recentPerformanceDeltaPct: number | null = null;
  try {
    const { data: ss } = await supabase.from('session_sets')
      .select('weight_kg, set_type, session:workout_sessions!inner(started_at, user_id)')
      .eq('session.user_id', user.id).order('id', { ascending: false }).limit(200);
    const bySession = new Map<string, number>();
    for (const x of (ss ?? []) as any[]) {
      const w = Number(x.weight_kg) || 0; if (!w) continue;
      const k = x.session?.started_at ?? ''; if (!k) continue;
      bySession.set(k, Math.max(bySession.get(k) ?? 0, w));
    }
    const tops = [...bySession.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(e => e[1]);
    if (tops.length >= 4) {
      const recent = (tops[0] + tops[1]) / 2, prior = (tops[2] + tops[3]) / 2;
      if (prior > 0) recentPerformanceDeltaPct = Math.round(((recent - prior) / prior) * 1000) / 10;
    }
  } catch { /* sem histórico */ }

  // dia de hoje: músculo primário + se é composto pesado
  let primaryMuscleToday: string | null = null; let todayIsHeavyCompound = false;
  if (dayId) {
    try {
      const { data: exs } = await supabase.from('workout_exercises')
        .select('exercise:exercises(muscle_group, is_compound)').eq('workout_day_id', dayId);
      const counts: Record<string, number> = {}; let compounds = 0;
      for (const e of (exs ?? []) as any[]) {
        const mg = e.exercise?.muscle_group; if (mg) counts[mg] = (counts[mg] ?? 0) + 1;
        if (e.exercise?.is_compound) compounds++;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      primaryMuscleToday = top?.[0] ?? null;
      todayIsHeavyCompound = compounds >= 2 && ['legs', 'back', 'chest', 'quads', 'hamstrings'].includes(primaryMuscleToday ?? '');
    } catch { /* */ }
  }

  const decisions = decide({
    recovery: rec,
    plateauSeverity: 'none', // análise de platô completa fica no athlete-engine
    mainGoal: r.main_goal,
    weightTrend14d: r.weight_trend_14d,
    hasPrLast4Weeks: r.has_pr_last_4_weeks,
    sessionsLast28: r.sessions_last_28,
    plannedSessions28: r.planned_sessions_last_28,
    daysSinceLastWorkout: r.days_since_last_workout,
    cardioKmWeek: r.cardio_km_this_week,
    cardioGoalKm: r.cardio_goal_km,
    proteinDaysBelow: r.protein_days_below_target,
    nutritionLogged: r.nutrition_logged_days > 0,
  });

  // Mapeia categoria de recuperação → ajuste do treino de hoje
  type Adjustment = 'progress' | 'maintain' | 'reduce_10' | 'reduce_25' | 'rest';
  const adjustment: Adjustment =
    r.days_since_last_workout >= 999 ? 'maintain' : // primeiro treino: seguir o plano
    rec.category === 'critical' ? 'rest' :
    rec.category === 'low' ? 'reduce_25' :
    rec.category === 'moderate' ? 'reduce_10' :
    rec.category === 'excellent' ? 'progress' :
    'maintain';

  const messages: Record<Adjustment, string> = {
    progress:  `Recuperação ${RECOVERY_CATEGORY_LABELS[rec.category].toLowerCase()} (${rec.score}/100). Dia ideal para progressão: suba ~2,5% de carga nos compostos principais.`,
    maintain:  r.days_since_last_workout >= 999
      ? 'Primeiro treino: siga o plano como prescrito, com foco total na técnica.'
      : `Recuperação ${RECOVERY_CATEGORY_LABELS[rec.category].toLowerCase()} (${rec.score}/100). Execute o treino conforme o plano.`,
    reduce_10: `Recuperação moderada (${rec.score}/100). Treine normal, mas mantenha RIR 2-3 e evite técnicas de intensificação hoje.`,
    reduce_25: `Recuperação baixa (${rec.score}/100). Reduza o volume em ~25%: mantenha os compostos e corte as últimas séries dos isolados.`,
    rest:      `Recuperação crítica (${rec.score}/100). O Coach recomenda descanso hoje — treinar agora aumenta o risco de regressão e lesão.`,
  };

  const session = recommendSessionAdaptation({
    recoveryScore: rec.score,
    recoveryCategory: rec.category,
    cardioAcwr,
    recentPerformanceDeltaPct,
    todayIsHeavyCompound,
    primaryMuscleToday,
    daysSinceLastWorkout: r.days_since_last_workout,
  });

  return Response.json({
    adjustment,
    message: messages[adjustment],
    session, // V8: adaptação integrada (recuperação + ACWR + performance + demanda do dia)
    signals: { cardioAcwr, recentPerformanceDeltaPct, primaryMuscleToday, todayIsHeavyCompound },
    recovery: rec,
    decisions,
    raw: {
      days_since_last_workout: r.days_since_last_workout,
      avg_rir: r.avg_rir,
      sessions_last_28: r.sessions_last_28,
    },
  });
}
