// nutrition-training-demand.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §7 — Training Demand evoluído (planejado + real).
//
// Combina o treino PLANEJADO (grupos/exercícios/intensidade prevista) com o REAL
// (volume/duração/RIR/FC/calorias/fadiga) para uma demanda nutricional por grupo,
// nível de energia e prioridade de carbo/recuperação. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

const LARGE_GROUPS = ['legs', 'perna', 'pernas', 'quadriceps', 'posterior', 'back', 'costas', 'glutes', 'gluteo'];
const PUSH_PULL = ['chest', 'peito', 'shoulders', 'ombro', 'biceps', 'triceps', 'arms', 'braco', 'back', 'costas'];

export interface TrainingDemandInput {
  plannedMuscles: string[];
  plannedIntensity?: 'low' | 'moderate' | 'high' | null;
  realVolumeKg?: number | null;
  realDurationMin?: number | null;
  avgRir?: number | null;             // menor = mais intenso
  activityKcal?: number | null;       // do adaptive-energy
  cardioKm?: number | null;
  recoveryScore?: number | null;      // 0..100
}

export type EnergyDemand = 'low' | 'moderate' | 'high' | 'very_high';
export type CarbPriority = 'low' | 'moderate' | 'high';

export interface NutritionTrainingDemand {
  score: number;                      // 0..100
  muscleDemand: Record<string, number>;
  energyDemand: EnergyDemand;
  carbPriority: CarbPriority;
  recoveryPriority: boolean;
  rationale: string[];
}

const norm = (s: string) => s.toLowerCase();

export function computeNutritionTrainingDemand(i: TrainingDemandInput): NutritionTrainingDemand {
  const rationale: string[] = [];
  const muscles = (i.plannedMuscles ?? []).map(norm);
  const muscleDemand: Record<string, number> = {};

  let score = muscles.length === 0 && (i.cardioKm ?? 0) === 0 ? 25 : 45;

  for (const m of muscles) {
    const large = LARGE_GROUPS.some((g) => m.includes(g));
    const pushpull = PUSH_PULL.some((g) => m.includes(g));
    const d = large ? 35 : pushpull ? 18 : 22;
    muscleDemand[m] = d;
    score += d * 0.4;
  }

  // intensidade planejada
  if (i.plannedIntensity === 'high') { score += 12; rationale.push('intensidade planejada alta'); }
  else if (i.plannedIntensity === 'low') score -= 6;

  // real: volume/duração/RIR
  if (i.realVolumeKg && i.realVolumeKg > 8000) { score += 10; rationale.push('volume real alto'); }
  if (i.realDurationMin && i.realDurationMin > 75) score += 6;
  if (i.avgRir != null && i.avgRir <= 1) { score += 8; rationale.push('treino próximo da falha'); }

  // cardio
  if (i.cardioKm && i.cardioKm > 0) { score += Math.min(25, 10 + i.cardioKm * 1.2); rationale.push('cardio na sessão'); }
  // atividade medida
  if (i.activityKcal && i.activityKcal > 600) { score += 8; rationale.push('gasto de atividade elevado'); }

  // recuperação baixa reduz demanda de treino, mas prioriza recuperação nutricional
  const recoveryPriority = i.recoveryScore != null && i.recoveryScore < 45;
  if (recoveryPriority) { score -= 8; rationale.push('recuperação baixa — priorizar recuperação'); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const energyDemand: EnergyDemand = score >= 80 ? 'very_high' : score >= 60 ? 'high' : score >= 35 ? 'moderate' : 'low';
  const hasLarge = muscles.some((m) => LARGE_GROUPS.some((g) => m.includes(g)));
  const carbPriority: CarbPriority = (hasLarge || (i.cardioKm ?? 0) >= 5 || score >= 70) ? 'high' : score >= 45 ? 'moderate' : 'low';

  return { score, muscleDemand, energyDemand, carbPriority, recoveryPriority, rationale };
}
