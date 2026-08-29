// cardio-plan-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §1 — FONTE ÚNICA de metas de cardio (equivalente ao computeNutritionTargets).
//
// Compõe os motores existentes (cardio-progression-engine, cardio-autopilot,
// endurance-engine) numa decisão ÚNICA: meta semanal, frequência, minutos, km,
// distribuição de intensidade, longão, intervalados, progressão/deload/taper e
// metas ADAPTATIVAS em faixa (mín/ideal/limite). Nenhum outro módulo define metas
// concorrentes. Puro/determinístico. A IA só interpreta o resultado.
// ─────────────────────────────────────────────────────────────────────────────

import { computeCardioPrescription, type CardioAutopilotInput } from './cardio-autopilot';
import { computeCardioEvolution, type CardioRun, type WeekTarget, type RecoveryCategory } from './cardio-progression-engine';

export type CardioModality = 'running' | 'walking' | 'cycling' | 'swimming' | 'hiit' | 'rowing' | 'other';
export type RacePriority = 'hypertrophy_first' | 'race_first' | 'balanced';

export interface CardioPlanInput {
  goal: string | null;                 // objetivo oficial
  modality: CardioModality;
  bodyFatPct: number | null;
  gender: string | null;
  weeksOnPlan: number;
  recoveryCategory: RecoveryCategory;
  daysPerWeekAvailable: number;
  // histórico real
  runs: CardioRun[];                   // corridas com dateMs/km/durationMin/avgHr
  cardioKm7: number;
  cardioSessions7: number;
  // prova
  raceWeeks: number | null;            // semanas até a prova (null se não há)
  // integração com musculação
  strengthPriority: boolean;           // hipertrofia é prioridade?
}

export interface AdaptiveGoal { min: number; ideal: number; safetyLimit: number; }

export interface CardioPlan {
  modality: CardioModality;
  phaseLabel: string;
  phase: 'base' | 'build' | 'peak' | 'taper' | 'maintenance';
  sessionsPerWeek: number;
  minutesPerSession: number;
  intensityDistribution: { z2Pct: number; thresholdPct: number; intervalPct: number };
  weeklyKm: AdaptiveGoal;              // meta adaptativa em faixa
  longRunKm: number | null;
  intervalSession: string | null;
  progression: WeekTarget[];           // próximas 4 semanas (do progression-engine)
  canIncreaseLoad: boolean;
  adjustedForRecovery: boolean;
  racePriority: RacePriority;
  explanation: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function derivePhase(raceWeeks: number | null, weeksOnPlan: number): CardioPlan['phase'] {
  if (raceWeeks != null) {
    if (raceWeeks <= 1) return 'taper';
    if (raceWeeks <= 3) return 'peak';
    if (raceWeeks <= 8) return 'build';
    return 'base';
  }
  return weeksOnPlan >= 8 ? 'maintenance' : 'base';
}

export function buildCardioPlan(i: CardioPlanInput): CardioPlan {
  const explanation: string[] = [];

  // 1) prescrição base (autopilot) — sessões/min/intensidade por objetivo+fase+recuperação
  const presc = computeCardioPrescription({
    mainGoal: i.goal, bodyFatPct: i.bodyFatPct, gender: i.gender,
    weeksOnPlan: i.weeksOnPlan,
    recovery: null,  // recuperação tratada abaixo de forma unificada
    cardioKmThisWeek: i.cardioKm7, cardioSessionsThisWeek: i.cardioSessions7,
  } as CardioAutopilotInput);

  // 2) progressão por histórico (progression-engine) — metas 4 semanas + regra de validação
  const evo = computeCardioEvolution({ runs: i.runs, recoveryCategory: i.recoveryCategory, goal: i.goal });
  const canIncreaseLoad = evo.validateIncrease;

  // 3) prioridade (hipertrofia vs prova) — quem se adapta a quem
  const racePriority: RacePriority = i.raceWeeks != null && i.raceWeeks <= 12
    ? 'race_first'
    : i.strengthPriority ? 'hypertrophy_first' : 'balanced';
  if (racePriority === 'hypertrophy_first') explanation.push('Hipertrofia é prioridade — o cardio se adapta ao treino de força (mínimo efetivo).');
  if (racePriority === 'race_first') explanation.push('Prova próxima é prioridade — a musculação se adapta ao cardio.');

  // 4) recuperação: contém sessões/min e segura a carga
  const recoveryPoor = i.recoveryCategory === 'low' || i.recoveryCategory === 'critical';
  let sessions = clamp(presc.sessionsPerWeek, 1, Math.max(1, i.daysPerWeekAvailable));
  let minutes = presc.minutesPerSession;
  let adjustedForRecovery = presc.adjustedForRecovery;
  if (recoveryPoor) { sessions = Math.max(1, sessions - 1); minutes = Math.max(15, minutes - 10); adjustedForRecovery = true; explanation.push('Recuperação baixa — cardio contido nesta semana.'); }
  if (racePriority === 'hypertrophy_first') { sessions = Math.min(sessions, 3); minutes = Math.min(minutes, 30); }

  const phase = derivePhase(i.raceWeeks, i.weeksOnPlan);

  // 5) meta de km ADAPTATIVA (faixa) a partir do alvo da próxima semana da progressão
  const nextWeekKm = evo.nextTargets[0]?.km ?? presc.weeklyTargetKm;
  const idealKm = Math.round(nextWeekKm);
  const weeklyKm: AdaptiveGoal = {
    ideal: idealKm,
    min: Math.round(idealKm * (recoveryPoor ? 0.75 : 0.85)),
    safetyLimit: Math.round(idealKm * 1.2),  // regra de segurança (não passar +20%)
  };

  // 6) distribuição de intensidade por fase (80/20 base; mais threshold/interval no build/peak)
  let dist = { z2Pct: 80, thresholdPct: 12, intervalPct: 8 };
  if (phase === 'build' || phase === 'peak') dist = { z2Pct: 70, thresholdPct: 18, intervalPct: 12 };
  if (phase === 'taper' || recoveryPoor) dist = { z2Pct: 90, thresholdPct: 7, intervalPct: 3 };

  // 7) longão e intervalado
  const longRunKm = i.modality === 'running' && phase !== 'taper' ? Math.round(idealKm * 0.35) : null;
  const intervalSession = (phase === 'build' || phase === 'peak') && !recoveryPoor
    ? (i.modality === 'running' ? '4–6× 800m a ritmo forte, trote de recuperação' : 'Intervalado moderado conforme modalidade')
    : null;

  explanation.push(`Meta ${weeklyKm.min}–${weeklyKm.safetyLimit} km (ideal ${weeklyKm.ideal}), ${sessions}×${minutes}min, fase ${phase}.`);
  if (!canIncreaseLoad) explanation.push('Sem validação para subir carga — consolidar antes de progredir.');

  return {
    modality: i.modality, phaseLabel: presc.phaseLabel, phase,
    sessionsPerWeek: sessions, minutesPerSession: minutes,
    intensityDistribution: dist, weeklyKm, longRunKm, intervalSession,
    progression: evo.nextTargets, canIncreaseLoad, adjustedForRecovery, racePriority, explanation,
  };
}
