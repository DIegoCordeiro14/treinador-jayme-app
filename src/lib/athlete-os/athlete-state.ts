/**
 * AthleteState canônico — AOS Bloco 2
 * Objeto único e VERSIONADO com o estado completo do atleta. É montado uma vez
 * (a partir dos motores determinísticos já computados) e passa a ser a fonte
 * padrão consumida pelas telas/decisões, evitando dezenas de consultas soltas.
 */
import type { AthleteDecision } from './index';

export interface AthleteState {
  version: number;
  computedAt: string;

  profile: { name: string | null; sex: string | null; age: number | null; heightCm: number | null; experience: string | null; sport: string | null };
  goal: { main: string | null; aesthetic: string | null; targetWeightKg: number | null; targetRaceDate: string | null };
  bodyComposition: { weightKg: number | null; bodyFatPct: number | null; leanKg: number | null; tmbKcal: number | null };

  training: { score: number; sessionsLast7: number; weeklyVolumeKg: number | null; consistency: number; progression: number };
  nutrition: { score: number; phase: string | null; targetKcal: number | null; adherencePct: number | null };
  cardio: { score: number; km7: number; km28: number; loadRisk: string | null };
  recovery: { score: number | null; category: string; usedWearable: boolean };
  wearable: { hrvMs: number | null; hrvBaselineMs: number | null; sleepHours: number | null; restingHr: number | null; bodyBattery: number | null; trainingReadiness: number | null } | null;

  currentMesocycle: string | null;
  fatigue: 'baixa' | 'moderada' | 'alta' | 'critica';
  readiness: number | null;           // 0–100
  weakPoints: string[];
  injuryRisk: 'none' | 'low' | 'high';
  plateauRisk: boolean;

  scores: { training: number; nutrition: number; cardio: number; recovery: number; overall: number };

  nextBestAction: { action: string; confidence: number; reason: string; domain: string } | null;
  lastDecision: string | null;
  confidence: number | null;
}

export interface MergeInput {
  profile: AthleteState['profile'];
  goal: AthleteState['goal'];
  bodyComposition: AthleteState['bodyComposition'];
  training: AthleteState['training'];
  nutrition: AthleteState['nutrition'];
  cardio: AthleteState['cardio'];
  recovery: AthleteState['recovery'];
  wearable: AthleteState['wearable'];
  edn360: { training: number; nutrition: number; cardio: number; recovery: number; overall: number };
  weakPoints: string[];
  injuryRisk: 'none' | 'low' | 'high';
  plateauRisk: boolean;
  mesocycle: string | null;
  nextBestAction: AthleteDecision | null;
}

function fatigueFrom(recoveryCategory: string): AthleteState['fatigue'] {
  if (recoveryCategory === 'critical') return 'critica';
  if (recoveryCategory === 'low') return 'alta';
  if (recoveryCategory === 'moderate') return 'moderada';
  return 'baixa';
}

// Versão determinística (muda quando qualquer campo relevante muda).
export function stateVersion(parts: MergeInput): number {
  const key = JSON.stringify([
    parts.goal.main, parts.bodyComposition.weightKg, parts.bodyComposition.bodyFatPct,
    parts.edn360.overall, parts.recovery.category, parts.nutrition.phase, parts.cardio.loadRisk,
    parts.weakPoints, parts.injuryRisk, parts.plateauRisk, parts.mesocycle,
    parts.nextBestAction?.action ?? null,
  ]);
  let h = 0;
  for (let i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i)) | 0; }
  return h >>> 0;
}

export function mergeAthleteState(p: MergeInput): AthleteState {
  const readiness = p.recovery.score;
  return {
    version: stateVersion(p),
    computedAt: new Date().toISOString(),
    profile: p.profile,
    goal: p.goal,
    bodyComposition: p.bodyComposition,
    training: p.training,
    nutrition: p.nutrition,
    cardio: p.cardio,
    recovery: p.recovery,
    wearable: p.wearable,
    currentMesocycle: p.mesocycle,
    fatigue: fatigueFrom(p.recovery.category),
    readiness,
    weakPoints: p.weakPoints,
    injuryRisk: p.injuryRisk,
    plateauRisk: p.plateauRisk,
    scores: p.edn360,
    nextBestAction: p.nextBestAction ? { action: p.nextBestAction.action, confidence: p.nextBestAction.confidence, reason: p.nextBestAction.reason, domain: p.nextBestAction.domain } : null,
    lastDecision: p.nextBestAction?.action ?? null,
    confidence: p.nextBestAction?.confidence ?? null,
  };
}
