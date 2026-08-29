// cardio-diagnosis-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §12 — Diagnóstico ÚNICO de cardio.
//
// Substitui os diagnósticos concorrentes (cardio-intelligence determinístico +
// analyze-cardio IA). Decide UM estado com confiança, limitador principal,
// evidências e ação recomendada. A IA recebe só isto para narrar. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type CardioState =
  | 'progressing' | 'plateau' | 'overreaching' | 'undertraining'
  | 'detraining' | 'recovery_limited' | 'efficiency_improving'
  | 'efficiency_declining' | 'insufficient_data';

export type CardioLimiter = 'aerobic_efficiency' | 'volume' | 'recovery' | 'consistency' | 'intensity' | null;

export interface CardioDiagnosisInput {
  runsCount: number;
  periodDays: number;
  paceTrendPct: number | null;      // negativo = mais rápido (melhor)
  hrTrendPct: number | null;        // negativo = menos esforço (melhor)
  volumeTrendPct: number | null;    // km recente vs anterior
  acwr: number | null;              // agudo:crônico
  recoveryScore: number | null;     // 0..100
  sessions7: number;
  plannedSessions: number;
  km7: number;
  km28: number;
  dataConfidence: number | null;    // 0..1
}

export interface CardioRecommendedAction { kind: string; detail: string; }

export interface CardioDiagnosis {
  state: CardioState;
  confidence: number;               // 0..1
  primaryLimiter: CardioLimiter;
  evidence: string[];
  recommendedAction: CardioRecommendedAction;
  headline: string;
}

function conf(i: CardioDiagnosisInput): number {
  const period = Math.min(1, i.periodDays / 28);
  const data = i.dataConfidence ?? Math.min(1, i.runsCount / 8);
  return Math.round((0.5 * period + 0.5 * data) * 100) / 100;
}

export function diagnoseCardio(i: CardioDiagnosisInput): CardioDiagnosis {
  const confidence = conf(i);
  const build = (state: CardioState, limiter: CardioLimiter, evidence: string[], action: CardioRecommendedAction, headline: string): CardioDiagnosis =>
    ({ state, confidence, primaryLimiter: limiter, evidence, recommendedAction: action, headline });

  if (i.runsCount < 3 || i.periodDays < 10) {
    return build('insufficient_data', null, ['histórico curto'],
      { kind: 'collect_more_data', detail: 'Registre mais corridas para um diagnóstico confiável.' },
      'Dados insuficientes para diagnóstico.');
  }

  const recoveryPoor = i.recoveryScore != null && i.recoveryScore < 45;
  const highAcwr = i.acwr != null && i.acwr > 1.5;
  const paceUp = i.paceTrendPct != null && i.paceTrendPct <= -2;   // mais rápido
  const paceDown = i.paceTrendPct != null && i.paceTrendPct >= 3;  // mais lento
  const hrDown = i.hrTrendPct != null && i.hrTrendPct <= -3;       // mais eficiente
  const hrUp = i.hrTrendPct != null && i.hrTrendPct >= 2;
  const volDown = i.volumeTrendPct != null && i.volumeTrendPct <= -25;
  const consistency = i.plannedSessions > 0 ? i.sessions7 / i.plannedSessions : 1;

  // hierarquia de prioridade (uma que casa vence)
  if (highAcwr && (paceDown || recoveryPoor)) {
    return build('overreaching', 'recovery', [`ACWR ${i.acwr} alto`, paceDown ? 'pace piorando' : 'recuperação baixa'],
      { kind: 'reduce_load', detail: 'Reduzir volume/intensidade e priorizar recuperação (deload).' },
      'Sobrecarga (overreaching) — recuar a carga.');
  }
  if (recoveryPoor && (paceDown || hrUp)) {
    return build('recovery_limited', 'recovery', ['recuperação baixa com queda de eficiência'],
      { kind: 'improve_recovery', detail: 'Priorizar sono/recuperação antes de progredir.' },
      'Recuperação limitando a corrida.');
  }
  if (volDown && consistency < 0.5) {
    return build(i.km28 > 0 && i.km7 < i.km28 / 8 ? 'detraining' : 'undertraining', 'consistency',
      ['volume caindo', `consistência ${Math.round(consistency * 100)}%`],
      { kind: 'restore_consistency', detail: 'Retomar a regularidade das sessões antes de aumentar carga.' },
      'Treino insuficiente/destreino.');
  }
  if (paceUp && hrDown) {
    return build('efficiency_improving', null, ['pace melhorando com FC menor'],
      { kind: 'maintain', detail: 'Boa eficiência aeróbica — manter e progredir gradualmente.' },
      'Eficiência aeróbica melhorando.');
  }
  if (paceDown && hrUp) {
    return build('efficiency_declining', 'aerobic_efficiency', ['pace piorando com mais esforço'],
      { kind: 'review', detail: 'Revisar recuperação/nutrição; conter intensidade até estabilizar.' },
      'Eficiência aeróbica em queda.');
  }
  if (paceUp || (i.volumeTrendPct != null && i.volumeTrendPct >= 5)) {
    return build('progressing', null, ['pace/volume evoluindo'],
      { kind: 'maintain', detail: 'Progredindo — seguir a progressão planejada.' },
      'Corrida progredindo.');
  }
  // estagnação
  return build('plateau', i.km7 < i.km28 / 4 ? 'volume' : 'intensity',
    [`sem mudança relevante em ${i.periodDays} dias`],
    { kind: 'vary_stimulus', detail: 'Introduzir variação (intervalados ou aumento gradual de volume).' },
    'Corrida em platô.');
}
