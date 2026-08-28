// evolution-signal-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 (itens 2 e 3) — Tendência vs Ruído + Data Confidence Score.
//
// Peso e bioimpedância oscilam por água, glicogênio, sódio, horário, inflamação.
// Este motor separa MUDANÇA REAL de RUÍDO fisiológico e atribui uma CONFIANÇA
// (0-100) a cada métrica, para o app nunca "reagir" a poucos dias de flutuação.
// Puro/determinístico. Reusa linearTrend do body-metrics-unifier.
// ─────────────────────────────────────────────────────────────────────────────

import { linearTrend, type TrendResult } from './body-metrics-unifier';

export type SignalClass = 'confirmed' | 'possible' | 'noise';

export interface MetricNoiseProfile {
  // magnitude de flutuação "normal" de curto prazo, na unidade da métrica
  dailyNoise: number;   // desvio típico dia-a-dia
  minPointsConfirm: number;
}

// Perfis de ruído por métrica (heurística conservadora, público natural).
export const NOISE_PROFILES: Record<string, MetricNoiseProfile> = {
  weightKg: { dailyNoise: 0.6, minPointsConfirm: 6 },   // ±0.6kg é água/glicogênio
  bodyFatPct: { dailyNoise: 0.5, minPointsConfirm: 5 }, // bioimpedância é ruidosa
  leanKg: { dailyNoise: 0.4, minPointsConfirm: 5 },
  muscleKg: { dailyNoise: 0.3, minPointsConfirm: 5 },
  waistCm: { dailyNoise: 0.5, minPointsConfirm: 4 },
  volumeKg: { dailyNoise: 0, minPointsConfirm: 3 },     // treino é medido, não ruidoso
  topSetKg: { dailyNoise: 0, minPointsConfirm: 3 },
};

const DEFAULT_PROFILE: MetricNoiseProfile = { dailyNoise: 0.5, minPointsConfirm: 5 };

export interface SignalResult {
  metric: string;
  classification: SignalClass;
  changeOverSpan: number | null;    // variação total estimada (slope*span)
  changePerWeek: number | null;
  confidence: number;               // 0..100
  nPoints: number;
  spanDays: number;
  reason: string;
}

// Data Confidence: mais pontos + maior span + melhor ajuste (r²) + coerência
// com o ruído esperado => mais confiança.
export function dataConfidence(trend: TrendResult, profile: MetricNoiseProfile): number {
  if (trend.nPoints < 2) return 0;
  const pointScore = Math.min(1, trend.nPoints / (profile.minPointsConfirm * 1.5)); // satura
  const spanScore = Math.min(1, trend.spanDays / 21);   // ~3 semanas = ideal
  const fitScore = trend.rSquared ?? 0;
  const raw = 0.45 * pointScore + 0.25 * spanScore + 0.30 * fitScore;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

export function classifySignal(
  metric: string,
  series: { dateISO: string; value: number | null }[]
): SignalResult {
  const profile = NOISE_PROFILES[metric] ?? DEFAULT_PROFILE;
  const trend = linearTrend(series);
  const confidence = dataConfidence(trend, profile);

  if (trend.nPoints < 2 || trend.slopePerWeek == null) {
    return {
      metric, classification: 'noise', changeOverSpan: null, changePerWeek: null,
      confidence, nPoints: trend.nPoints, spanDays: trend.spanDays,
      reason: 'Dados insuficientes para distinguir tendência de ruído.',
    };
  }

  const changeOverSpan = Math.round(trend.slopePerDay! * trend.spanDays * 1000) / 1000;
  const magnitude = Math.abs(changeOverSpan);
  // banda de ruído: quanto a métrica pode variar sem significar mudança real
  const noiseBand = profile.dailyNoise * 1.5;

  let classification: SignalClass;
  let reason: string;

  const enoughPoints = trend.nPoints >= profile.minPointsConfirm;
  const goodFit = (trend.rSquared ?? 0) >= 0.5;

  if (magnitude <= noiseBand) {
    classification = 'noise';
    reason = `Variação (${changeOverSpan}) dentro da faixa de ruído fisiológico (±${noiseBand.toFixed(1)}). Provável água/glicogênio.`;
  } else if (enoughPoints && goodFit && confidence >= 55) {
    classification = 'confirmed';
    reason = `Tendência consistente ao longo de ${trend.spanDays} dias (${trend.nPoints} pontos, ajuste r²=${trend.rSquared}).`;
  } else {
    classification = 'possible';
    reason = `Mudança acima do ruído, mas ainda sem confirmação (pontos/ajuste insuficientes). Coletar mais dados.`;
  }

  return {
    metric, classification, changeOverSpan, changePerWeek: trend.slopePerWeek,
    confidence, nPoints: trend.nPoints, spanDays: trend.spanDays, reason,
  };
}

// Confiança agregada da análise nutricional a partir da cobertura de registros.
export function adherenceConfidence(daysLogged: number, windowDays: number): {
  confidence: number; note: string;
} {
  const cov = windowDays > 0 ? daysLogged / windowDays : 0;
  const confidence = Math.round(Math.min(1, cov) * 100);
  let note: string;
  if (cov >= 0.7) note = 'Registro nutricional robusto.';
  else if (cov >= 0.4) note = `Registro parcial (${daysLogged}/${windowDays} dias) — confiança moderada.`;
  else note = `Baixa confiabilidade: apenas ${daysLogged} dos últimos ${windowDays} dias têm registro.`;
  return { confidence, note };
}
