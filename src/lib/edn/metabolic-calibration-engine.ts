// metabolic-calibration-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §5 — Calibração metabólica (TDEE OBSERVADO).
//
// Compara ingestão calórica média × tendência de peso para estimar o TDEE real
// do atleta, com FAIXA e CONFIANÇA. Trabalha com evidência longitudinal e nunca
// trata poucos dias como suficiente. NÃO substitui o TDEE oficial imediatamente:
// só sugere ajuste quando a confiança atinge critérios mínimos determinísticos.
// Puro/determinístico.  (1 kg de peso ≈ 7700 kcal)
// ─────────────────────────────────────────────────────────────────────────────

const KCAL_PER_KG = 7700;

export interface CalibrationInput {
  avgDailyIntakeKcal: number | null;   // ingestão média no período (dias registrados)
  loggedDays: number;                  // nº de dias com registro alimentar
  periodDays: number;                  // span do período
  weightChangeKg: number | null;       // variação de peso no período (negativo=perdeu)
  loggingAdherence: number;            // 0..1
  predictedTdee: number;               // TDEE da fórmula base (autopilot)
}

export type CalibrationTrend = 'higher_than_predicted' | 'lower_than_predicted' | 'consistent' | 'insufficient_data';

export interface MetabolicCalibration {
  estimatedTdee: number | null;
  range: { min: number; max: number } | null;
  confidence: number;                  // 0..1
  dataPoints: number;
  trend: CalibrationTrend;
  applyAdjustment: boolean;            // só true com confiança/critérios mínimos
  suggestedTdee: number | null;       // fórmula base + evidência (blend), se aplicável
  note: string;
}

export function calibrateMetabolism(i: CalibrationInput): MetabolicCalibration {
  const insufficient = (msg: string): MetabolicCalibration => ({
    estimatedTdee: null, range: null, confidence: 0, dataPoints: i.loggedDays,
    trend: 'insufficient_data', applyAdjustment: false, suggestedTdee: null, note: msg,
  });

  if (i.avgDailyIntakeKcal == null || i.weightChangeKg == null) return insufficient('Sem ingestão média ou variação de peso.');
  if (i.loggedDays < 10 || i.periodDays < 14) return insufficient(`Dados insuficientes (${i.loggedDays} dias registrados) — evidência longitudinal ainda fraca.`);
  if (i.loggingAdherence < 0.6) return insufficient('Aderência de registro baixa — ingestão média não confiável.');

  // TDEE observado = ingestão média − (variação de energia armazenada / dia)
  const dailyEnergyDelta = (i.weightChangeKg * KCAL_PER_KG) / i.periodDays; // <0 se perdeu peso
  const estimatedTdee = Math.round(i.avgDailyIntakeKcal - dailyEnergyDelta);

  // confiança cresce com dias registrados, aderência e span; satura
  const confidence = Math.round(Math.min(1,
    0.4 * Math.min(1, i.loggedDays / 21) +
    0.3 * Math.min(1, i.periodDays / 28) +
    0.3 * i.loggingAdherence
  ) * 100) / 100;

  // faixa de incerteza: maior quando menos dados/confiança
  const spread = Math.round(estimatedTdee * (0.06 + (1 - confidence) * 0.1));
  const range = { min: estimatedTdee - spread, max: estimatedTdee + spread };

  const diffPct = (estimatedTdee - i.predictedTdee) / i.predictedTdee;
  const trend: CalibrationTrend = diffPct > 0.06 ? 'higher_than_predicted' : diffPct < -0.06 ? 'lower_than_predicted' : 'consistent';

  // aplica ajuste só com confiança alta E divergência relevante
  const applyAdjustment = confidence >= 0.7 && Math.abs(diffPct) >= 0.06;
  // blend conservador: 60% fórmula base + 40% evidência
  const suggestedTdee = applyAdjustment ? Math.round(i.predictedTdee * 0.6 + estimatedTdee * 0.4) : null;

  const note = applyAdjustment
    ? `TDEE observado ${estimatedTdee} kcal ${trend === 'higher_than_predicted' ? 'acima' : 'abaixo'} do previsto (${i.predictedTdee}). Sugerido ajustar para ${suggestedTdee} kcal.`
    : `TDEE observado ~${estimatedTdee} kcal (confiança ${Math.round(confidence * 100)}%). ${trend === 'consistent' ? 'Coerente com a fórmula.' : 'Coletar mais dados antes de ajustar.'}`;

  return { estimatedTdee, range, confidence, dataPoints: i.loggedDays, trend, applyAdjustment, suggestedTdee, note };
}
