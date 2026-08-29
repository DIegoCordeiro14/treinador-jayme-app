// nutrition-condition-adjust.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §16 — Condições físicas → estratégia nutricional (conservador).
//
// Quando há redução importante de treino por condição física, o gasto cai e a
// recuperação precisa de prioridade: o sistema pode reduzir a agressividade do
// déficit e priorizar recuperação. NUNCA prescreve nutrição clínica, afirma que
// alimento acelera recuperação, nem substitui médico/nutricionista. Puro.
// ─────────────────────────────────────────────────────────────────────────────

export interface PhysicalConditionLite {
  status: string;              // ex: injury | rehab | recovery | acute | active
  active: boolean;
  bodyRegion?: string | null;
}

export interface ConditionNutritionAdjustment {
  trainingReduced: boolean;
  reduceDeficit: boolean;
  prioritizeRecovery: boolean;
  recoveryScorePenalty: number;   // 0..30 (subtrai do recovery score p/ a decisão)
  note: string;
}

const REDUCING_STATUS = /injur|lesa|lesã|rehab|reabil|recover|recupera|acute|agud|restri/i;

export function conditionNutritionAdjustment(conditions: PhysicalConditionLite[]): ConditionNutritionAdjustment {
  const active = (conditions ?? []).filter((c) => c.active);
  const reducing = active.filter((c) => REDUCING_STATUS.test(String(c.status ?? '')));

  if (reducing.length === 0) {
    return { trainingReduced: false, reduceDeficit: false, prioritizeRecovery: false, recoveryScorePenalty: 0,
      note: 'Sem condições físicas que reduzam o treino.' };
  }

  const severe = reducing.length >= 2;
  return {
    trainingReduced: true,
    reduceDeficit: true,
    prioritizeRecovery: true,
    recoveryScorePenalty: severe ? 20 : 12,
    note: `Condição física ativa (${reducing.map((c) => c.bodyRegion ?? c.status).slice(0, 3).join(', ')}) reduz o treino — conter a agressividade do déficit e priorizar recuperação. Não é orientação clínica; consulte um profissional de saúde.`,
  };
}
