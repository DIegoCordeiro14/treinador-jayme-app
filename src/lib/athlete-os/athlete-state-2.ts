/**
 * AthleteState 2.0 (V9) — superset canônico. Compõe o AthleteState existente e
 * acrescenta os blocos que faltavam (condições, desconfortos, sono, calendário,
 * prova, aderência, limitador, pontos fortes/fracos, tendências, risco), para que
 * NENHUM módulo precise reconstruir o estado do atleta. Determinístico e puro.
 */
import type { AthleteState } from './athlete-state';
import type { SafetyStatus } from '../edn/physical-condition-engine';

export interface ConditionSnapshot { id: string; region: string; side: string; status: string; restricted: string[]; confirmed: boolean }
export interface DiscomfortSnapshot { region: string; count: number; recommend: boolean }

export type BodyConfidence = 'high' | 'medium' | 'low' | 'unknown';
export interface BodyStateBlock {
  currentWeightKg: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  restingHeartRate: number | null;
  latestMeasurementAt: string | null;
  confidence: BodyConfidence;
  weightSource: string | null;      // proveniência do peso canônico
  weightAgeDays: number | null;     // frescor
}

export interface AthleteStateV2Extras {
  conditions: ConditionSnapshot[];
  discomforts: DiscomfortSnapshot[];
  sleep: { hours: number | null; quality: string | null };
  calendar: { plannedThisWeek: number; doneThisWeek: number; nextWorkoutLabel: string | null };
  race: { date: string | null; weeksAway: number | null; name: string | null };
  adherence: { training: number | null; nutrition: number | null; overall: number | null };
  strengths: string[];
  trends: { strengthPct: number | null; volumePct: number | null; weightKgPerWeek: number | null; cardioAcwr: number | null };
  nutritionToday?: { kcal: number; protein: number; carbs: number; fat: number } | null;
  body?: BodyStateBlock | null;
}

export type SafetyLevel = 'none' | 'watch' | 'intervene' | 'block';

export interface AthleteStateV2 extends AthleteState {
  conditions: ConditionSnapshot[];
  discomforts: DiscomfortSnapshot[];
  sleep: { hours: number | null; quality: string | null };
  calendar: { plannedThisWeek: number; doneThisWeek: number; nextWorkoutLabel: string | null };
  race: { date: string | null; weeksAway: number | null; name: string | null };
  adherence: { training: number | null; nutrition: number | null; overall: number | null };
  strengths: string[];
  limiter: { key: string; label: string; nextAction: string } | null;
  trends: { strengthPct: number | null; volumePct: number | null; weightKgPerWeek: number | null; cardioAcwr: number | null };
  safetyLevel: SafetyLevel;
  nutritionToday: { kcal: number; protein: number; carbs: number; fat: number } | null;
  body: BodyStateBlock | null;
}

/** Deriva o nível de segurança a partir de condições + desconfortos + risco de lesão. */
export function deriveSafetyLevel(extras: Pick<AthleteStateV2Extras, 'conditions' | 'discomforts'>, injuryRisk: string): SafetyLevel {
  const hardCondition = extras.conditions.some(c => c.confirmed && (c.status === 'recovering' || c.status === 'rehab' || c.restricted.length > 0));
  const recurringDiscomfort = extras.discomforts.some(d => d.recommend);
  if (hardCondition || recurringDiscomfort) return 'block';
  if (extras.conditions.some(c => c.confirmed) || injuryRisk === 'high') return 'intervene';
  if (injuryRisk === 'low') return 'watch';
  return 'none';
}

/** Detecta o principal limitador de forma determinística (prioridade: segurança > recuperação > sono > aderência > cardio > força > nutrição). */
export function detectLimiter(base: AthleteState, extras: AthleteStateV2Extras, safety: SafetyLevel): { key: string; label: string; nextAction: string } | null {
  if (safety === 'block') return { key: 'safety', label: 'Segurança física', nextAction: 'Revise as restrições cadastradas antes de progredir; evite os movimentos em conflito.' };
  if (base.recovery.category === 'critical' || base.recovery.category === 'low') return { key: 'recovery', label: 'Recuperação', nextAction: 'Reduza a demanda de hoje e priorize sono; não aprofunde o déficit.' };
  if ((extras.sleep.hours ?? 8) < 6) return { key: 'sleep', label: 'Sono', nextAction: 'Priorize dormir mais; a recuperação e a performance dependem disso.' };
  if ((extras.adherence.nutrition ?? 100) < 60) return { key: 'nutrition_adherence', label: 'Aderência nutricional', nextAction: 'Retome o registro/consistência da dieta para destravar a evolução.' };
  if (extras.trends.cardioAcwr != null && extras.trends.cardioAcwr >= 1.5) return { key: 'cardio_load', label: 'Carga de cardio', nextAction: 'Reduza o volume de endurance nesta semana para não comprometer a recuperação.' };
  if (extras.trends.strengthPct != null && extras.trends.strengthPct <= -3) return { key: 'strength', label: 'Força em queda', nextAction: 'Considere consolidar carga ou um deload — a performance está caindo.' };
  if ((base.nutrition.adherencePct ?? 100) < 70) return { key: 'nutrition', label: 'Nutrição', nextAction: 'Ajuste a aderência aos macros do plano atual.' };
  return null;
}

export function buildAthleteStateV2(base: AthleteState, extras: AthleteStateV2Extras): AthleteStateV2 {
  const safetyLevel = deriveSafetyLevel(extras, base.injuryRisk);
  const limiter = detectLimiter(base, extras, safetyLevel);
  return {
    ...base,
    conditions: extras.conditions,
    discomforts: extras.discomforts,
    sleep: extras.sleep,
    calendar: extras.calendar,
    race: extras.race,
    adherence: extras.adherence,
    strengths: extras.strengths,
    trends: extras.trends,
    limiter,
    safetyLevel,
    nutritionToday: extras.nutritionToday ?? null,
    body: extras.body ?? null,
  };
}

// Re-export para consumidores tiparem sem importar de dois lugares
export type { SafetyStatus };
