// fueling-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §6 — Estratégia DENTRO do dia (fueling).
//
// O autopilot calcula o dia; este motor organiza a distribuição de energia/carbo/
// proteína ao redor do treino, definindo refeições prioritárias e a estratégia de
// timing conforme demanda/fase/recuperação e a ROTINA REAL de refeições. Puro/
// determinístico. A IA só transforma isto em texto e sugestões de alimentos.
// ─────────────────────────────────────────────────────────────────────────────

import type { CarbPriority } from './nutrition-training-demand';

export interface MealSlot { key: string; label: string; time: string; } // time HH:MM

export interface FuelingInput {
  workoutTime: string | null;         // HH:MM
  carbPriority: CarbPriority;
  energyDemand: 'low' | 'moderate' | 'high' | 'very_high';
  recoveryPriority: boolean;
  phase: string;                      // NutritionPhase
  isEndurance: boolean;
  meals: MealSlot[];                  // rotina REAL do atleta (ordenada por horário)
  totalCarbsG: number;
  totalProteinG: number;
}

export type TimingStrategy = 'standard' | 'performance' | 'recovery' | 'endurance';

export interface MealFueling { key: string; label: string; time: string; role: string; carbsG: number; proteinG: number; }

export interface FuelingResult {
  priorityMeals: string[];            // keys
  mealPlan: MealFueling[];
  mealTimingStrategy: TimingStrategy;
  rationale: string[];
}

function toMin(hhmm: string): number { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); }

export function computeFueling(i: FuelingInput): FuelingResult {
  const rationale: string[] = [];
  const meals = [...(i.meals ?? [])].sort((a, b) => toMin(a.time) - toMin(b.time));
  if (meals.length === 0) {
    return { priorityMeals: [], mealPlan: [], mealTimingStrategy: 'standard', rationale: ['Sem rotina de refeições registrada.'] };
  }

  const strategy: TimingStrategy = i.recoveryPriority ? 'recovery'
    : i.isEndurance ? 'endurance'
    : (i.energyDemand === 'high' || i.energyDemand === 'very_high') ? 'performance'
    : 'standard';

  // identifica refeição pré e pós treino a partir do horário do treino
  const wt = i.workoutTime ? toMin(i.workoutTime) : null;
  const priorityMeals: string[] = [];
  let preKey: string | null = null; let postKey: string | null = null;
  if (wt != null) {
    // pré = última refeição antes do treino; pós = primeira depois
    const before = meals.filter((m) => toMin(m.time) <= wt);
    const after = meals.filter((m) => toMin(m.time) > wt);
    preKey = before.length ? before[before.length - 1].key : null;
    postKey = after.length ? after[0].key : null;
    if (preKey) priorityMeals.push(preKey);
    if (postKey) priorityMeals.push(postKey);
    rationale.push(`Treino às ${i.workoutTime}: priorizar energia no pré e recuperação no pós.`);
  } else {
    rationale.push('Sem horário de treino — distribuição equilibrada.');
  }

  // distribuição de carbo: concentra em torno do treino quando carbPriority alto
  const nMeals = meals.length;
  const mealPlan: MealFueling[] = meals.map((m) => {
    let carbShare = 1 / nMeals;
    let proteinShare = 1 / nMeals;
    let role = 'distribuição';
    if (m.key === preKey) { carbShare *= i.carbPriority === 'high' ? 1.8 : 1.3; role = 'pré-treino (energia)'; }
    else if (m.key === postKey) { carbShare *= i.carbPriority === 'high' ? 1.6 : 1.2; proteinShare *= 1.3; role = 'pós-treino (recuperação)'; }
    return { key: m.key, label: m.label, time: m.time, role, carbsG: carbShare, proteinG: proteinShare };
  });

  // normaliza os shares para bater com os totais do dia
  const sumC = mealPlan.reduce((a, x) => a + x.carbsG, 0);
  const sumP = mealPlan.reduce((a, x) => a + x.proteinG, 0);
  for (const mp of mealPlan) {
    mp.carbsG = Math.round((mp.carbsG / sumC) * i.totalCarbsG);
    mp.proteinG = Math.round((mp.proteinG / sumP) * i.totalProteinG);
  }

  if (i.carbPriority === 'high') rationale.push('Alta demanda de carbo — concentrar carboidratos ao redor do treino.');
  if (strategy === 'recovery') rationale.push('Recuperação em foco — reforçar proteína e carbo pós-treino, conter intensidade.');
  if (strategy === 'endurance') rationale.push('Endurance — priorizar disponibilidade de carboidrato pré/durante/pós.');

  return { priorityMeals, mealPlan, mealTimingStrategy: strategy, rationale };
}
