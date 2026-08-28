// athlete-evolution-report.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 (itens 12 e 19) — Athlete Evolution Report (mensal).
//
// Assembler DETERMINÍSTICO que reúne os motores da Evolução num relatório
// estruturado com todos os NÚMEROS prontos. A IA (fora daqui) apenas redige a
// interpretação em linguagem de coach; os valores nunca vêm da IA.
// ─────────────────────────────────────────────────────────────────────────────

import type { EvolutionState } from './evolution-intelligence-engine';
import type { MuscleDevScore } from './muscle-development-score';
import type { MatrixResult } from './performance-composition-matrix';
import type { BeforeAfterResult } from './before-after-engine';
import type { RecoveryEvolution } from './recovery-evolution-engine';
import type { DecisionOutcome, DecisionStats } from './decision-outcome-engine';

export interface EvolutionReportInput {
  periodLabel: string;                 // "Últimos 30 dias"
  state: EvolutionState;
  beforeAfter: BeforeAfterResult;
  muscleScores: MuscleDevScore[];
  matrix: MatrixResult;
  recovery: RecoveryEvolution;
  decisions: DecisionOutcome[];
  decisionStats: DecisionStats;
}

export interface EvolutionReport {
  periodLabel: string;
  sections: {
    body: { headline: string; confidence: number; recomposition: string };
    performance: { matrix: string; topAdvance: string };
    muscles: { weakest: string[]; strongest: string[] };
    cardiovascular: { note: string };
    recovery: { direction: string; message: string };
    nutrition: { confidence: number; note: string };
    decisions: { successRate: number; highlights: string[] };
  };
  mainAdvance: string;
  mainLimiter: string;
  nextMonthStrategy: string;
  goalProgressScore: number;
}

export function buildEvolutionReport(i: EvolutionReportInput): EvolutionReport {
  const weakest = [...i.muscleScores].sort((a, b) => a.score - b.score).slice(0, 2).map((m) => m.muscle_group);
  const strongest = [...i.muscleScores].sort((a, b) => b.score - a.score).slice(0, 2).map((m) => m.muscle_group);

  const highlights = i.decisions
    .filter((d) => d.verdict === 'positive' || d.verdict === 'negative')
    .slice(0, 3)
    .map((d) => d.summary);

  // estratégia do próximo mês (determinística, a partir do limitador)
  const limiter = i.state.topLimiter;
  let strategy: string;
  if (i.state.plateau.isPlateau) strategy = 'Quebrar o platô: ajustar calorias/volume ou aplicar deload antes de progredir.';
  else if (limiter === 'Recuperação') strategy = 'Priorizar recuperação (sono/estresse) e conter volume nos grupos mais fatigados.';
  else if (limiter === 'Consistência') strategy = 'Elevar a aderência às sessões planejadas antes de aumentar volume.';
  else if (limiter === 'Performance') strategy = 'Focar progressão de carga/volume nos exercícios estagnados e reforçar o ponto fraco.';
  else strategy = `Manter a estratégia atual e progredir volume nos grupos com melhor resposta. Reforçar: ${weakest.join(', ')}.`;

  return {
    periodLabel: i.periodLabel,
    sections: {
      body: { headline: i.state.headline, confidence: i.state.dataConfidence.body, recomposition: i.state.recomposition.message },
      performance: { matrix: `${i.matrix.emoji} ${i.matrix.title}: ${i.matrix.message}`, topAdvance: i.state.topAdvance },
      muscles: { weakest, strongest },
      cardiovascular: { note: 'Ver evolução de cardio na aba correspondente.' },
      recovery: { direction: i.recovery.direction, message: i.recovery.message },
      nutrition: { confidence: i.state.dataConfidence.nutrition, note: i.state.dataConfidence.nutritionNote },
      decisions: { successRate: i.decisionStats.successRate, highlights },
    },
    mainAdvance: i.state.topAdvance,
    mainLimiter: i.state.topLimiter,
    nextMonthStrategy: strategy,
    goalProgressScore: i.state.goalProgress.score,
  };
}
