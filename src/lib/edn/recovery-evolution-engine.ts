// recovery-evolution-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 (item 13) — Evolução da recuperação + relação com performance.
//
// Tendência de sono, FC repouso, HRV e Recovery Score, e a relação OBSERVADA
// entre recuperação e performance (recovery↓ -> performance↓ ; recovery↑ -> PR).
// Puro/determinístico. Reusa linearTrend do body-metrics-unifier.
// ─────────────────────────────────────────────────────────────────────────────

import { linearTrend } from './body-metrics-unifier';

export interface RecoveryPoint {
  dateISO: string;
  recoveryScore: number | null;   // 0..100
  sleepH: number | null;
  restingHr: number | null;
  hrv: number | null;
}

export interface RecoveryEvolution {
  recoveryTrendPerWeek: number | null;
  sleepTrendPerWeek: number | null;
  restingHrTrendPerWeek: number | null;
  hrvTrendPerWeek: number | null;
  direction: 'improving' | 'declining' | 'stable' | 'unknown';
  performanceLink: 'recovery_limiting' | 'recovery_supporting' | 'neutral' | 'unknown';
  message: string;
}

export function analyzeRecoveryEvolution(
  points: RecoveryPoint[],
  performanceDeltaPct: number | null
): RecoveryEvolution {
  const trend = (f: (p: RecoveryPoint) => number | null) =>
    linearTrend(points.map((p) => ({ dateISO: p.dateISO, value: f(p) }))).slopePerWeek;

  const recoveryTrendPerWeek = trend((p) => p.recoveryScore);
  const sleepTrendPerWeek = trend((p) => p.sleepH);
  const restingHrTrendPerWeek = trend((p) => p.restingHr);
  const hrvTrendPerWeek = trend((p) => p.hrv);

  let direction: RecoveryEvolution['direction'] = 'unknown';
  if (recoveryTrendPerWeek != null) {
    direction = recoveryTrendPerWeek > 1 ? 'improving' : recoveryTrendPerWeek < -1 ? 'declining' : 'stable';
  } else if (hrvTrendPerWeek != null) {
    direction = hrvTrendPerWeek > 0.5 ? 'improving' : hrvTrendPerWeek < -0.5 ? 'declining' : 'stable';
  }

  // relação observada com performance
  let performanceLink: RecoveryEvolution['performanceLink'] = 'unknown';
  if (performanceDeltaPct != null && direction !== 'unknown') {
    if (direction === 'declining' && performanceDeltaPct < 0) performanceLink = 'recovery_limiting';
    else if (direction === 'improving' && performanceDeltaPct > 0) performanceLink = 'recovery_supporting';
    else performanceLink = 'neutral';
  }

  let message: string;
  if (direction === 'declining' && performanceLink === 'recovery_limiting')
    message = 'Sua performance estabilizou/caiu após a queda do Recovery Score — recuperação está limitando o progresso.';
  else if (direction === 'improving' && performanceLink === 'recovery_supporting')
    message = 'Recuperação em alta acompanhada de melhora na performance — janela boa para progredir.';
  else if (direction === 'declining')
    message = 'Recuperação em queda — monitorar antes que limite a performance.';
  else if (direction === 'improving')
    message = 'Recuperação melhorando.';
  else if (direction === 'stable')
    message = 'Recuperação estável.';
  else message = 'Sem dados de recuperação suficientes.';

  return { recoveryTrendPerWeek, sleepTrendPerWeek, restingHrTrendPerWeek, hrvTrendPerWeek, direction, performanceLink, message };
}
