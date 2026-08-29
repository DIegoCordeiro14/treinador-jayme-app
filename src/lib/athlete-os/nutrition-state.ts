// nutrition-state.ts (athlete-os)
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §15 — Estado nutricional CANÔNICO para o Athlete OS.
//
// Estado único consumido por AthleteState, Dashboard, Coach, Alertas e Autopilot.
// Compõe (não recalcula) os resultados dos motores determinísticos numa foto
// concisa. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import type { NutritionDecision, LimitingFactor } from '../edn/nutrition-decision-engine';

export type CalorieBalance = 'strong_deficit' | 'moderate_deficit' | 'maintenance' | 'moderate_surplus' | 'strong_surplus' | 'unknown';
export type MacroStatus = 'below' | 'adequate' | 'above' | 'unknown';

export interface NutritionStateInput {
  phase: string;
  calorieTarget: number;
  tdee: number;
  proteinAdherence: number | null;    // 0..1
  carbVsDemand: 'below_training_demand' | 'aligned' | 'above' | 'unknown';
  hydrationStatus?: 'ok' | 'low' | 'unknown';
  loggingAdherence: number | null;
  targetAdherence: number | null;
  metabolicConfidence: number | null; // 0..1 (calibração)
  decision: NutritionDecision | null;
}

export interface NutritionState {
  phase: string;
  calorieBalance: CalorieBalance;
  proteinStatus: MacroStatus;
  carbStatus: 'below_training_demand' | 'aligned' | 'above' | 'unknown';
  hydrationStatus: 'ok' | 'low' | 'unknown';
  adherence: number | null;
  metabolicConfidence: number | null;
  primaryRisk: LimitingFactor;
  nextAction: string;
}

function balanceFrom(target: number, tdee: number): CalorieBalance {
  if (!tdee) return 'unknown';
  const pct = (target - tdee) / tdee;
  if (pct <= -0.17) return 'strong_deficit';
  if (pct <= -0.05) return 'moderate_deficit';
  if (pct < 0.05) return 'maintenance';
  if (pct < 0.15) return 'moderate_surplus';
  return 'strong_surplus';
}

function proteinStatusFrom(adh: number | null): MacroStatus {
  if (adh == null) return 'unknown';
  return adh >= 0.8 ? 'adequate' : adh >= 0.5 ? 'below' : 'below';
}

const ACTION_TEXT: Record<string, string> = {
  maintain: 'maintain_calories',
  improve_adherence: 'improve_logging_adherence',
  review_recovery: 'prioritize_recovery',
  recalculate_targets: 'recalculate_energy_targets',
  reduce_deficit: 'reduce_calorie_deficit',
  review_surplus: 'reduce_calorie_surplus',
  collect_more_data: 'collect_more_data',
};

export function buildNutritionState(i: NutritionStateInput): NutritionState {
  const calorieBalance = balanceFrom(i.calorieTarget, i.tdee);
  const proteinStatus = proteinStatusFrom(i.proteinAdherence);
  const primaryRisk = i.decision?.limitingFactor ?? null;

  // ação combina a recomendação da decisão com o timing de carbo quando pertinente
  let nextAction = i.decision ? (ACTION_TEXT[i.decision.recommendedAction] ?? 'maintain_calories') : 'maintain_calories';
  if (i.carbVsDemand === 'below_training_demand' && (i.decision?.recommendedAction === 'maintain' || !i.decision)) {
    nextAction = 'maintain_calories_improve_carb_timing';
  }

  return {
    phase: i.phase,
    calorieBalance,
    proteinStatus,
    carbStatus: i.carbVsDemand,
    hydrationStatus: i.hydrationStatus ?? 'unknown',
    adherence: i.targetAdherence ?? i.loggingAdherence ?? null,
    metabolicConfidence: i.metabolicConfidence,
    primaryRisk,
    nextAction,
  };
}
