/**
 * Cardio Autopilot — EDN V6.5 (Pilar 7)
 * Prescreve e progride o cardio automaticamente a partir de:
 *  - BF% / objetivo (quanto cardio é necessário)
 *  - Semanas de adesão (progressão gradual: 3x20min → 4x25min → 5x35min)
 *  - Recuperação atual (corta cardio quando a prontidão está baixa)
 */

import type { RecoveryState } from './recovery-engine';

export interface CardioAutopilotInput {
  mainGoal: string | null;          // fat_loss | hypertrophy | recomposition | performance
  bodyFatPct: number | null;
  gender: string | null;
  weeksOnPlan: number;              // semanas desde o início do plano ativo (>=0)
  recovery: RecoveryState | null;
  cardioKmThisWeek: number;
  cardioSessionsThisWeek: number;
}

export interface CardioPrescription {
  sessionsPerWeek: number;
  minutesPerSession: number;
  intensity: 'zona2' | 'zona2_3' | 'intervalado_leve';
  weeklyTargetKm: number;
  phaseLabel: string;        // ex: "Fase 2 (semanas 4-7)"
  explanation: string[];     // Camada 2
  adjustedForRecovery: boolean;
}

export function computeCardioPrescription(input: CardioAutopilotInput): CardioPrescription {
  const explanation: string[] = [];
  const isCutting = input.mainGoal === 'fat_loss' || input.mainGoal === 'recomposition';
  const highBf = input.bodyFatPct != null && (input.gender === 'female' ? input.bodyFatPct >= 32 : input.bodyFatPct >= 25);

  // ── 1. Base por objetivo/BF ───────────────────────────────────────────────
  let baseSessions: number;
  let baseMinutes: number;
  if (isCutting || highBf) {
    baseSessions = 3; baseMinutes = 20;
    explanation.push(highBf
      ? `BF ${input.bodyFatPct}% acima da faixa-alvo — cardio entra como acelerador do déficit.`
      : 'Objetivo de emagrecimento/recomposição — cardio regular em Zona 2.');
  } else if (input.mainGoal === 'performance') {
    baseSessions = 3; baseMinutes = 25;
    explanation.push('Objetivo performance — base aeróbica mantida o ano todo.');
  } else {
    baseSessions = 2; baseMinutes = 20;
    explanation.push('Objetivo hipertrofia — cardio mínimo para saúde cardiovascular, sem competir com a recuperação.');
  }

  // ── 2. Progressão por fase (semanas no plano) ─────────────────────────────
  let phaseLabel: string;
  let sessions = baseSessions;
  let minutes = baseMinutes;
  if (input.weeksOnPlan < 4) {
    phaseLabel = 'Fase 1 (semanas 1-3)';
  } else if (input.weeksOnPlan < 8) {
    sessions = baseSessions + 1;
    minutes = baseMinutes + 5;
    phaseLabel = 'Fase 2 (semanas 4-7)';
  } else {
    sessions = baseSessions + 2;
    minutes = baseMinutes + 15;
    phaseLabel = 'Fase 3 (semana 8+)';
  }
  // Hipertrofia nunca passa de 3 sessões — prioridade é o ferro
  if (!isCutting && input.mainGoal !== 'performance') sessions = Math.min(sessions, 3);
  explanation.push(`${phaseLabel}: progressão automática para ${sessions}x${minutes}min.`);

  // ── 3. Ajuste pela recuperação atual ──────────────────────────────────────
  let adjustedForRecovery = false;
  if (input.recovery && (input.recovery.category === 'low' || input.recovery.category === 'critical')) {
    sessions = Math.max(1, sessions - 1);
    minutes = Math.max(15, minutes - 10);
    adjustedForRecovery = true;
    explanation.push(`Recuperação ${input.recovery.category === 'critical' ? 'crítica' : 'baixa'} (${input.recovery.score}/100) — cardio reduzido nesta semana para proteger a musculação.`);
  }

  const intensity: CardioPrescription['intensity'] =
    input.mainGoal === 'performance' && input.weeksOnPlan >= 8 ? 'intervalado_leve' :
    input.weeksOnPlan >= 4 ? 'zona2_3' : 'zona2';

  // ~9km/h caminhada rápida/trote leve → km alvo aproximado
  const weeklyTargetKm = Math.round(sessions * minutes * 0.12);

  return {
    sessionsPerWeek: sessions,
    minutesPerSession: minutes,
    intensity,
    weeklyTargetKm,
    phaseLabel,
    explanation,
    adjustedForRecovery,
  };
}
