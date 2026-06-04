import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeAthleteState } from '@/lib/edn/performance-engine';
import { RECOVERY_CATEGORY_LABELS } from '@/lib/edn/recovery-engine';
import { decide } from '@/lib/edn/decision-engine';

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
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const state = await computeAthleteState(user.id);
  const rec = state.recovery_state;
  const r = state.raw;

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

  return Response.json({
    adjustment,
    message: messages[adjustment],
    recovery: rec,
    decisions,
    raw: {
      days_since_last_workout: r.days_since_last_workout,
      avg_rir: r.avg_rir,
      sessions_last_28: r.sessions_last_28,
    },
  });
}
