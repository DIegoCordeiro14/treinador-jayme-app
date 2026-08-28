// exercise-history-intelligence.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCOS 2 e 3 — Inteligência por exercício + Retenção Inteligente.
//
// A partir do ExerciseSnapshot (histórico real) decide, de forma determinística,
// o que fazer com CADA exercício na próxima geração: progredir, manter, reduzir
// (deload), rotacionar (variação) ou substituir. E se ele deve ser RETIDO no
// próximo plano (Bloco 3): exercícios com boa progressão e familiaridade não são
// trocados só por trocar.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExerciseSnapshot } from './athlete-training-snapshot';

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export type ExerciseAction = 'progress' | 'maintain' | 'reduce' | 'rotate' | 'replace';

export interface ExerciseDecision {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  action: ExerciseAction;
  retain: boolean;      // manter o MESMO exercício no próximo plano?
  priority: number;     // 0..100 — prioridade de manter (para desempate na seleção)
  reason: string;
}

export interface HistoryIntelligenceInput {
  exercises: ExerciseSnapshot[];
  recovery?: RecoveryCategory;
  // limites de estagnação antes de trocar (semanas)
  rotateAfterWeeks?: number;    // default 3
  replaceAfterWeeks?: number;   // default 6
}

const ACTION_RETAIN: Record<ExerciseAction, boolean> = {
  progress: true,
  maintain: true,
  reduce: true,
  rotate: false,
  replace: false,
};

export function decideExercise(
  e: ExerciseSnapshot,
  recovery: RecoveryCategory,
  rotateAfterWeeks: number,
  replaceAfterWeeks: number
): ExerciseDecision {
  let action: ExerciseAction;
  let reason: string;
  let priority: number;

  const recoveryPoor = recovery === 'low' || recovery === 'critical';

  if (e.trend === 'new' || e.familiarity === 'none' || e.familiarity === 'low') {
    // pouca familiaridade: manter para consolidar o padrão motor antes de trocar
    action = 'maintain';
    reason = 'Exercício novo/pouco praticado — manter para consolidar técnica e coletar dados.';
    priority = 70;
  } else if (e.trend === 'progressing') {
    action = 'progress';
    reason = `Progressão consistente (top ${e.recent_top_kg ?? e.best_top_kg}kg) — manter e progredir.`;
    priority = 95;
  } else if (e.trend === 'regressing') {
    // regressão: primeiro alivia; se persistir muito, rotaciona
    if (e.weeks_stagnant >= replaceAfterWeeks) {
      action = 'rotate';
      reason = 'Regressão prolongada mesmo após alívio — rotacionar variação do mesmo padrão.';
      priority = 30;
    } else {
      action = 'reduce';
      reason = 'Queda de desempenho — reduzir carga/volume (mini-deload) antes de trocar.';
      priority = 60;
    }
  } else if (e.trend === 'plateau') {
    if (recoveryPoor) {
      // Bloco 13: antes de trocar, checar recuperação. Se ruim, é fadiga, não o exercício.
      action = 'reduce';
      reason = 'Estagnação com recuperação baixa — tratar como fadiga (deload), não trocar o exercício.';
      priority = 55;
    } else if (e.weeks_stagnant >= replaceAfterWeeks) {
      action = 'replace';
      reason = `Estagnado há ${e.weeks_stagnant} semanas com boa recuperação — substituir por estímulo novo.`;
      priority = 20;
    } else if (e.weeks_stagnant >= rotateAfterWeeks) {
      action = 'rotate';
      reason = `Estagnado há ${e.weeks_stagnant} semanas — rotacionar variação do mesmo padrão.`;
      priority = 35;
    } else {
      action = 'maintain';
      reason = 'Leve estabilização — manter e tentar progressão dupla (reps antes de carga).';
      priority = 65;
    }
  } else {
    // stable
    action = 'maintain';
    reason = 'Desempenho estável — manter e buscar progressão dupla.';
    priority = 75;
  }

  return {
    exercise_id: e.exercise_id,
    exercise_name: e.exercise_name,
    muscle_group: e.muscle_group,
    action,
    retain: ACTION_RETAIN[action],
    priority,
    reason,
  };
}

export function analyzeExerciseHistory(input: HistoryIntelligenceInput): ExerciseDecision[] {
  const recovery = input.recovery ?? 'good';
  const rotateAfterWeeks = input.rotateAfterWeeks ?? 3;
  const replaceAfterWeeks = input.replaceAfterWeeks ?? 6;
  return input.exercises
    .map((e) => decideExercise(e, recovery, rotateAfterWeeks, replaceAfterWeeks))
    .sort((a, b) => b.priority - a.priority);
}

// Bloco 3 — conjunto de exercícios que DEVEM ser retidos no próximo plano.
export function retainedExerciseIds(decisions: ExerciseDecision[]): string[] {
  return decisions.filter((d) => d.retain).map((d) => d.exercise_id);
}

// Exercícios que precisam sair (rotate/replace) — para o motor de rotação.
export function exercisesToSwap(decisions: ExerciseDecision[]): ExerciseDecision[] {
  return decisions.filter((d) => !d.retain);
}
