/**
 * Decision Engine — EDN V6.5 (Pilar 4)
 * O cérebro do Coach EDN: transforma interpretação em DECISÃO.
 *
 * Fluxo: DADOS → INTERPRETAÇÃO (recovery/plateau/scores) → DECISÃO → AÇÃO
 * Cada decisão carrega uma justificativa (Camada 3 — o Coach explica o porquê).
 */

import type { RecoveryState } from './recovery-engine';

export type DecisionAction =
  | 'increase_load'
  | 'reduce_volume'
  | 'apply_deload'
  | 'replace_workout'
  | 'increase_cardio'
  | 'reduce_cardio'
  | 'increase_calories'
  | 'reduce_calories'
  | 'schedule_rest_day'
  | 'suggest_pr'
  | 'adjust_macros';

export interface Decision {
  action: DecisionAction;
  label: string;        // ação curta exibida ao usuário
  reason: string;       // justificativa (Camada 2 → 3)
  magnitudePct?: number; // ex: reduce_volume 20 = -20%
  priority: 1 | 2 | 3;  // 1 = urgente
}

export interface DecisionInput {
  recovery: RecoveryState;
  plateauSeverity: 'none' | 'mild' | 'moderate' | 'severe';
  mainGoal: string | null;          // fat_loss | hypertrophy | recomposition | performance
  weightTrend14d: number | null;    // kg (negativo = perda)
  hasPrLast4Weeks: boolean;
  sessionsLast28: number;
  plannedSessions28: number;
  daysSinceLastWorkout: number;
  cardioKmWeek: number;
  cardioGoalKm: number;
  proteinDaysBelow: number;
  nutritionLogged: boolean;
}

export function decide(input: DecisionInput): Decision[] {
  const d: Decision[] = [];
  const rec = input.recovery;
  const isCutting = input.mainGoal === 'fat_loss' || input.mainGoal === 'recomposition';
  const isBulking = input.mainGoal === 'hypertrophy';
  const neverTrained = input.daysSinceLastWorkout >= 999;

  // ── Novo usuário: a primeira decisão é começar ────────────────────────────
  if (neverTrained) {
    return [{
      action: 'replace_workout',
      label: 'Registrar o primeiro treino',
      reason: 'Sem dados de treino o Coach não tem o que ajustar. Execute o Treino A do seu plano para iniciar a coleta de dados e a progressão.',
      priority: 1,
    }];
  }

  // ── 1. Recuperação dita o treino de hoje (Pilar 5) ────────────────────────
  if (rec.category === 'critical') {
    d.push({
      action: 'schedule_rest_day',
      label: 'Dia de descanso hoje',
      reason: `Recuperação crítica (${rec.score}/100). Treinar agora aumenta risco de regressão e lesão. ${rec.factors[0] ?? ''}`.trim(),
      priority: 1,
    });
  } else if (rec.category === 'low') {
    d.push({
      action: 'reduce_volume',
      label: 'Reduzir volume do próximo treino em 25%',
      magnitudePct: 25,
      reason: `Recuperação baixa (${rec.score}/100). Mantenha os compostos e corte as últimas séries dos isolados.`,
      priority: 1,
    });
  } else if (rec.category === 'moderate') {
    d.push({
      action: 'reduce_volume',
      label: 'Treino normal, sem buscar falha',
      magnitudePct: 10,
      reason: `Recuperação moderada (${rec.score}/100). Trabalhe com RIR 2-3 e evite técnicas de intensificação hoje.`,
      priority: 2,
    });
  } else if (rec.category === 'excellent' && input.plateauSeverity !== 'severe') {
    d.push({
      action: 'increase_load',
      label: 'Aplicar progressão de carga hoje',
      magnitudePct: 2.5,
      reason: `Recuperação excelente (${rec.score}/100). Janela ideal para subir ~2,5% nos compostos principais.`,
      priority: 1,
    });
    if (!input.hasPrLast4Weeks && input.sessionsLast28 >= 4) {
      d.push({
        action: 'suggest_pr',
        label: 'Tentar um PR no exercício principal',
        reason: 'Recuperação no pico e nenhum PR registrado em 28 dias — condição perfeita para testar um recorde com técnica sólida.',
        priority: 2,
      });
    }
  }

  // ── 2. Platô (do athlete-engine) ──────────────────────────────────────────
  if (input.plateauSeverity === 'severe') {
    d.push({
      action: 'apply_deload',
      label: 'Aplicar Deload (5-7 dias a 50% do volume)',
      reason: 'Platô múltiplo detectado: peso, força e volume estagnados. O deload restaura a sensibilidade do organismo aos estímulos.',
      priority: 1,
    });
    d.push({
      action: 'adjust_macros',
      label: 'Revisar macros com refeed de 24h',
      reason: 'Estagnação prolongada costuma ter componente metabólico — um refeed de carboidratos ajuda a destravar.',
      priority: 2,
    });
  } else if (input.plateauSeverity === 'moderate' && isCutting) {
    d.push({
      action: 'reduce_calories',
      label: 'Reduzir 100-150 kcal/dia',
      reason: 'Peso estagnado em fase de emagrecimento — pequeno ajuste no déficit reativa a perda sem sacrificar treino.',
      priority: 2,
    });
  }

  // ── 3. Tendência de peso vs objetivo ──────────────────────────────────────
  if (input.weightTrend14d !== null) {
    if (isCutting && input.weightTrend14d > 0.3) {
      d.push({
        action: 'reduce_calories',
        label: 'Ajustar calorias para baixo',
        reason: `Peso subiu ${input.weightTrend14d.toFixed(1)}kg em 14 dias durante o emagrecimento — o déficit atual não está real.`,
        priority: 2,
      });
    } else if (isBulking && input.weightTrend14d < -0.5) {
      d.push({
        action: 'increase_calories',
        label: 'Aumentar 200-300 kcal/dia',
        reason: `Peso caiu ${Math.abs(input.weightTrend14d).toFixed(1)}kg em 14 dias durante a hipertrofia — superávit insuficiente para construir massa.`,
        priority: 2,
      });
    } else if (isCutting && input.weightTrend14d < -1.5) {
      d.push({
        action: 'increase_calories',
        label: 'Frear o déficit (+100-150 kcal)',
        reason: `Perda de ${Math.abs(input.weightTrend14d).toFixed(1)}kg em 14 dias é rápida demais para um natural — risco de perder massa magra.`,
        priority: 2,
      });
    }
  }

  // ── 4. Cardio ─────────────────────────────────────────────────────────────
  if (input.cardioKmWeek > input.cardioGoalKm * 1.1) {
    d.push({
      action: 'reduce_cardio',
      label: 'Reduzir o volume de cardio',
      reason: `${input.cardioKmWeek.toFixed(1)}km esta semana (meta ${input.cardioGoalKm}km) — excesso de cardio compete com a recuperação da musculação.`,
      priority: 3,
    });
  } else if (isCutting && input.cardioKmWeek < input.cardioGoalKm * 0.4 && rec.category !== 'low' && rec.category !== 'critical') {
    d.push({
      action: 'increase_cardio',
      label: 'Adicionar 1 sessão de cardio Zona 2',
      reason: `Apenas ${input.cardioKmWeek.toFixed(1)}km de ${input.cardioGoalKm}km semanais — cardio leve acelera o déficit sem prejudicar a força.`,
      priority: 3,
    });
  }

  // ── 5. Nutrição ───────────────────────────────────────────────────────────
  if (!input.nutritionLogged) {
    d.push({
      action: 'adjust_macros',
      label: 'Registrar refeições no app',
      reason: 'Sem registro de nutrição o Coach não consegue calibrar calorias e proteína — o pilar mais determinante do resultado.',
      priority: 3,
    });
  } else if (input.proteinDaysBelow >= 3) {
    d.push({
      action: 'adjust_macros',
      label: 'Subir a proteína diária',
      reason: `Proteína abaixo de 80% da meta em ${input.proteinDaysBelow} dias recentes — adicione uma fonte proteica por refeição.`,
      priority: 2,
    });
  }

  // ── 6. Aderência ──────────────────────────────────────────────────────────
  if (input.plannedSessions28 > 0 && input.sessionsLast28 < input.plannedSessions28 * 0.5 && input.sessionsLast28 > 0) {
    d.push({
      action: 'replace_workout',
      label: 'Revisar a frequência do plano',
      reason: `${input.sessionsLast28} de ${input.plannedSessions28} treinos em 28 dias — um plano com menos dias e aderência total rende mais que um plano ideal pela metade.`,
      priority: 2,
    });
  }

  // Ordena por prioridade e limita a 4 decisões
  return d.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

// ── Resumo textual para IA / briefing (Camada 3) ──────────────────────────────
export function formatDecisionsForAI(decisions: Decision[]): string {
  if (decisions.length === 0) return 'Nenhum ajuste necessário — plano atual mantido.';
  return 'Decisões do Coach EDN:\n' + decisions
    .map((x, i) => `${i + 1}. [P${x.priority}] ${x.label} — ${x.reason}`)
    .join('\n');
}
