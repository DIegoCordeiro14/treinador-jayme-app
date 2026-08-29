// nutrition-simulation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §14 — Simulações com FAIXAS (incerteza).
//
// Projeta o efeito de ajustes calóricos usando 7700 kcal/kg apenas como
// componente interno simplificado, mas NUNCA exibe previsões excessivamente
// precisas: retorna faixa (min/max), valor esperado e confiança. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

const KCAL_PER_KG = 7700;

export interface SimInput {
  currentWeightKg: number;
  weeklyRateKg: number;          // ritmo atual observado (negativo = perdendo)
  calorieDeltaKcal: number;      // ajuste proposto (ex -150)
  horizonDays: number;           // ex 30
  confidence: number;            // 0..1 (qualidade do ritmo/dados)
}

export interface SimRange { min: number; max: number; }
export interface SimResult {
  expectedWeightKg: number;
  weightRange: SimRange;
  expectedChangeKg: number;
  changeRange: SimRange;
  confidence: number;
  disclaimer: string;
}

export function simulateNutritionChange(i: SimInput): SimResult {
  const weeks = i.horizonDays / 7;
  // efeito do ajuste calórico no ritmo semanal
  const extraWeeklyKg = (i.calorieDeltaKcal * 7) / KCAL_PER_KG;
  const projectedWeeklyRate = i.weeklyRateKg + extraWeeklyKg;
  const expectedChange = Math.round(projectedWeeklyRate * weeks * 10) / 10;
  const expectedWeight = Math.round((i.currentWeightKg + expectedChange) * 10) / 10;

  // banda de incerteza: maior quando menor confiança
  const spread = Math.round((Math.abs(expectedChange) * (0.25 + (1 - i.confidence) * 0.4) + 0.4) * 10) / 10;
  const changeRange: SimRange = { min: Math.round((expectedChange - spread) * 10) / 10, max: Math.round((expectedChange + spread) * 10) / 10 };
  const weightRange: SimRange = { min: Math.round((i.currentWeightKg + changeRange.min) * 10) / 10, max: Math.round((i.currentWeightKg + changeRange.max) * 10) / 10 };

  return {
    expectedWeightKg: expectedWeight,
    weightRange,
    expectedChangeKg: expectedChange,
    changeRange,
    confidence: Math.round(i.confidence * 100) / 100,
    disclaimer: 'Projeção baseada no ritmo histórico e na aderência. Faixa estimada, não garantia.',
  };
}
