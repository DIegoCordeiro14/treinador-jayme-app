// performance-forecast-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §13 — Performance Forecast (projeção com CENÁRIOS).
//
// Projeta o tempo provável numa distância combinando: melhor tempo atual (Riegel),
// tendência recente de pace, eficiência pace/FC, volume, aderência e recuperação.
// Retorna cenários conservador/provável/otimista + confiança. Nunca precisão falsa.
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface ForecastInput {
  bestDistanceKm: number;          // melhor distância base
  bestTimeMin: number;             // tempo dessa distância (min)
  targetKm: number;
  paceTrendPct: number | null;     // negativo = melhorando
  efficiencyTrendPct: number | null; // FC trend (negativo = mais eficiente)
  adherence: number | null;        // 0..100
  recoveryScore: number | null;    // 0..100
  weeksToRace: number | null;
}

export interface ForecastScenarios {
  conservativeMin: number;
  expectedMin: number;
  optimisticMin: number;
  confidence: 'low' | 'moderate' | 'high';
  disclaimer: string;
}

const RIEGEL = 1.06;

function fmtToMin(x: number) { return Math.round(x * 100) / 100; }

export function forecastPerformance(i: ForecastInput): ForecastScenarios | null {
  if (i.bestDistanceKm <= 0 || i.bestTimeMin <= 0 || i.targetKm <= 0) return null;

  // 1) Riegel base
  const riegel = i.bestTimeMin * Math.pow(i.targetKm / i.bestDistanceKm, RIEGEL);

  // 2) ajuste pela tendência de pace (melhora se treino evolui, atenuado)
  const paceAdj = i.paceTrendPct != null ? 1 + (i.paceTrendPct / 100) * 0.5 : 1; // -2% pace => -1% tempo
  const effAdj = i.efficiencyTrendPct != null && i.efficiencyTrendPct < 0 ? 0.99 : 1; // mais eficiente => leve bônus
  const expected = riegel * paceAdj * effAdj;

  // 3) incerteza: menor com boa aderência/recuperação e prova próxima
  const adh = (i.adherence ?? 60) / 100;
  const rec = (i.recoveryScore ?? 60) / 100;
  const proximity = i.weeksToRace != null ? Math.max(0.3, 1 - i.weeksToRace / 16) : 0.5;
  const certainty = Math.max(0, Math.min(1, 0.4 * adh + 0.3 * rec + 0.3 * proximity));
  const spreadPct = 0.02 + (1 - certainty) * 0.06; // 2%–8%

  const confidence: ForecastScenarios['confidence'] = certainty >= 0.7 ? 'high' : certainty >= 0.45 ? 'moderate' : 'low';

  return {
    conservativeMin: fmtToMin(expected * (1 + spreadPct)),
    expectedMin: fmtToMin(expected),
    optimisticMin: fmtToMin(expected * (1 - spreadPct)),
    confidence,
    disclaimer: 'Projeção baseada no histórico, tendência e aderência. Faixa estimada, não garantia.',
  };
}
