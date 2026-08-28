// evolution-intelligence-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 (item 1, núcleo) — Evolution Intelligence Engine.
//
// Compõe os motores da Fase 1 num ESTADO ÚNICO (EvolutionState) que todas as abas
// e o Coach consomem, para mostrarem a MESMA interpretação. Responde:
//   O que mudou? É real ou ruído? É progresso para o objetivo? O que limita?
// 100% determinístico e PURO — recebe dados já buscados pela rota.
// ─────────────────────────────────────────────────────────────────────────────

import {
  unifyBodyMetrics, seriesOf, halvesDelta, spanDaysOf, linearTrend,
  type RawBodyPoint, type UnifiedBodyPoint,
} from './body-metrics-unifier';
import { classifySignal, adherenceConfidence, type SignalResult } from './evolution-signal-engine';
import { detectRecomposition, detectPlateau, type RecompResult, type PlateauResult } from './recomposition-plateau-engine';
import { computeGoalProgress, normalizeGoal, type Goal, type GoalProgressResult } from './goal-progress-engine';

export interface EvolutionInput {
  goalRaw: string | null;
  bodyPoints: RawBodyPoint[];        // já vindo das 3 tabelas
  // performance agregada (do exercise-evolution / volume-analysis)
  strengthDeltaPct: number | null;
  volumeDeltaPct: number | null;
  cardioDeltaPct?: number | null;
  // consistência / recuperação
  sessionsDone: number;
  sessionsPlanned: number;
  recoveryScore: number | null;      // 0..100
  recoveryLabel?: string | null;     // ex 'moderada'
  // nutrição
  daysLogged: number;
  logWindowDays: number;
}

export interface EvolutionMetricState {
  key: string;
  label: string;
  changePerWeek: number | null;
  signal: SignalResult['classification'];
  confidence: number;
  direction: 'up' | 'down' | 'flat';
}

export interface EvolutionState {
  goal: Goal;
  periodDays: number;
  headline: string;                  // "Recomposição corporal positiva..."
  status: 'positive' | 'attention' | 'insufficient';
  metrics: EvolutionMetricState[];
  recomposition: RecompResult;
  plateau: PlateauResult;
  goalProgress: GoalProgressResult;
  whatChanged: string[];             // bullets "o que mudou"
  topAdvance: string;
  topLimiter: string;
  dataConfidence: { body: number; nutrition: number; nutritionNote: string };
}

function directionOf(v: number | null): 'up' | 'down' | 'flat' {
  if (v == null || Math.abs(v) < 1e-6) return 'flat';
  return v > 0 ? 'up' : 'down';
}

export function buildEvolutionState(input: EvolutionInput): EvolutionState {
  const goal = normalizeGoal(input.goalRaw);
  const unified: UnifiedBodyPoint[] = unifyBodyMetrics(input.bodyPoints);
  const periodDays = spanDaysOf(unified);

  // sinais por métrica corporal
  const weightSig = classifySignal('weightKg', seriesOf(unified, 'weightKg'));
  const bfSig = classifySignal('bodyFatPct', seriesOf(unified, 'bodyFatPct'));
  const leanSig = classifySignal('leanKg', seriesOf(unified, 'leanKg'));
  const waistSig = classifySignal('waistCm', seriesOf(unified, 'waistCm'));

  // deltas robustos (média de metades) para recomposição/objetivo
  const weightDelta = halvesDelta(seriesOf(unified, 'weightKg').map((p) => p.value));
  const bfDelta = halvesDelta(seriesOf(unified, 'bodyFatPct').map((p) => p.value));
  const leanDelta = halvesDelta(seriesOf(unified, 'leanKg').map((p) => p.value));
  const waistDelta = halvesDelta(seriesOf(unified, 'waistCm').map((p) => p.value));

  const recomposition = detectRecomposition({
    weightDeltaKg: weightDelta, bodyFatDeltaPct: bfDelta, leanDeltaKg: leanDelta,
    strengthDeltaPct: input.strengthDeltaPct, waistDeltaCm: waistDelta, periodDays,
  });

  const plateau = detectPlateau({
    periodDays, weightDeltaKg: weightDelta, bodyFatDeltaPct: bfDelta,
    waistDeltaCm: waistDelta, strengthDeltaPct: input.strengthDeltaPct, volumeDeltaPct: input.volumeDeltaPct,
  });

  const goalProgress = computeGoalProgress({
    goal, weightDeltaKg: weightDelta, bodyFatDeltaPct: bfDelta, leanDeltaKg: leanDelta,
    strengthDeltaPct: input.strengthDeltaPct, volumeDeltaPct: input.volumeDeltaPct,
    cardioDeltaPct: input.cardioDeltaPct ?? null,
    sessionsDone: input.sessionsDone, sessionsPlanned: input.sessionsPlanned,
    recoveryScore: input.recoveryScore,
  });

  const bodyConfidence = Math.round(
    ([weightSig, bfSig].reduce((a, s) => a + s.confidence, 0)) / 2
  );
  const adh = adherenceConfidence(input.daysLogged, input.logWindowDays);

  const metrics: EvolutionMetricState[] = [
    metricState('weightKg', 'Peso', weightSig),
    metricState('bodyFatPct', 'Gordura', bfSig),
    metricState('leanKg', 'Massa magra', leanSig),
    metricState('waistCm', 'Cintura', waistSig),
    { key: 'strength', label: 'Força', changePerWeek: null, signal: input.strengthDeltaPct != null ? 'confirmed' : 'noise', confidence: input.strengthDeltaPct != null ? 80 : 0, direction: directionOf(input.strengthDeltaPct) },
    { key: 'volume', label: 'Volume', changePerWeek: null, signal: input.volumeDeltaPct != null ? 'confirmed' : 'noise', confidence: input.volumeDeltaPct != null ? 90 : 0, direction: directionOf(input.volumeDeltaPct) },
  ];

  // "o que mudou" — só sinais confirmados/possíveis relevantes
  const whatChanged: string[] = [];
  const push = (label: string, sig: SignalResult) => {
    if (sig.classification === 'noise') return;
    const arrow = directionOf(sig.changePerWeek) === 'up' ? '↑' : directionOf(sig.changePerWeek) === 'down' ? '↓' : '→';
    const tag = sig.classification === 'possible' ? ' (possível)' : '';
    whatChanged.push(`${label} ${arrow}${tag}`);
  };
  push('Peso', weightSig); push('Gordura', bfSig); push('Massa magra', leanSig); push('Cintura', waistSig);
  if (input.strengthDeltaPct != null && Math.abs(input.strengthDeltaPct) >= 2)
    whatChanged.push(`Força ${input.strengthDeltaPct > 0 ? '↑' : '↓'} ${Math.abs(Math.round(input.strengthDeltaPct))}%`);
  if (input.recoveryLabel) whatChanged.push(`Recuperação ${input.recoveryLabel}`);

  // status geral + headline
  let status: EvolutionState['status'];
  let headline: string;
  if (unified.length < 2 && input.strengthDeltaPct == null) {
    status = 'insufficient';
    headline = 'Dados insuficientes para uma leitura de evolução — registre peso/medidas e treinos.';
  } else if (recomposition.verdict === 'recomposition') {
    status = 'positive';
    headline = recomposition.message;
    if (input.recoveryScore != null && input.recoveryScore < 45)
      headline += ' Atenção: a recuperação começa a limitar a progressão.';
  } else if (recomposition.verdict === 'muscle_loss' || goalProgress.score < 45) {
    status = 'attention';
    headline = recomposition.verdict === 'muscle_loss' ? recomposition.message : goalProgress.summary;
  } else {
    status = 'positive';
    headline = goalProgress.summary;
  }

  return {
    goal, periodDays, headline, status, metrics,
    recomposition, plateau, goalProgress, whatChanged,
    topAdvance: goalProgress.topAdvance, topLimiter: goalProgress.topLimiter,
    dataConfidence: { body: bodyConfidence, nutrition: adh.confidence, nutritionNote: adh.note },
  };
}

function metricState(key: string, label: string, sig: SignalResult): EvolutionMetricState {
  return {
    key, label,
    changePerWeek: sig.changePerWeek,
    signal: sig.classification,
    confidence: sig.confidence,
    direction: directionOf(sig.changePerWeek),
  };
}
