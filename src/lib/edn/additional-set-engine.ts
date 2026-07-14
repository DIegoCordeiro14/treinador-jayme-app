/**
 * Additional Set Engine — adição dinâmica de séries durante a execução.
 * Decide se uma série extra é recomendada (volume/MRV/fadiga/recuperação) e
 * sugere carga/reps/RIR por tipo. A IA apenas explica; os números vêm daqui.
 */
import { roundToAvailableLoad } from './load-intelligence';
import { clampRepsToExerciseRange } from './reps-range';

export type AddSetType = 'aquecimento' | 'feeder' | 'top' | 'working' | 'backoff' | 'corrective';
export type WarningLevel = 'none' | 'low' | 'moderate' | 'high';

export interface CompletedSet { kind: string; weightKg: number; reps: number; rir: number | null }

export interface AdditionalSetContext {
  requestedSetType: AddSetType;
  topSetKg: number;
  completedSets: CompletedSet[];
  muscleWeeklySets: number;       // séries efetivas já feitas no músculo na semana
  estimatedMrv: number;           // teto produtivo (séries/semana)
  recoveryScore: number;          // 0–100
  repsMin: number;
  repsMax: number;
  equipmentStep?: number;
}

export interface SuggestedSet { weightKg: number; reps: number; rir: number | null; restSeconds: number }
export interface AdditionalSetDecision {
  allowed: boolean;
  warningLevel: WarningLevel;
  suggested?: SuggestedSet;
  reason: string;
  impactsWeeklyVolume: boolean;
  requiresConfirmation: boolean;
}

const clamp = (r: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(r)));

// Queda de performance entre a 1ª e a última working/top realizada (%).
function performanceDropPct(sets: CompletedSet[]): number | null {
  const effective = sets.filter(s => s.kind === 'working' || s.kind === 'top');
  if (effective.length < 2) return null;
  const first = effective[0], last = effective[effective.length - 1];
  const v1 = first.weightKg * first.reps, v2 = last.weightKg * last.reps;
  if (v1 <= 0) return null;
  return Math.round(((v1 - v2) / v1) * 100); // positivo = caiu
}

export function evaluateAdditionalSet(c: AdditionalSetContext): AdditionalSetDecision {
  const round = (w: number) => roundToAvailableLoad(w, { step: c.equipmentStep });
  const cr = (r: number) => clampRepsToExerciseRange(r, c.repsMin, c.repsMax);
  const lastWork = [...c.completedSets].reverse().find(s => s.kind === 'working' || s.kind === 'top');
  const drop = performanceDropPct(c.completedSets);
  const lowRec = c.recoveryScore < 55;
  const nearMrv = c.muscleWeeklySets >= c.estimatedMrv;

  // Preparatórias e corretiva: não contam no volume produtivo, baixa fadiga.
  if (c.requestedSetType === 'aquecimento') {
    return { allowed: true, warningLevel: 'none', impactsWeeklyVolume: false, requiresConfirmation: false,
      reason: 'Aquecimento extra — preparação, não conta como volume efetivo.',
      suggested: { weightKg: round(c.topSetKg * 0.65), reps: cr(c.repsMax), rir: 5, restSeconds: 60 } };
  }
  if (c.requestedSetType === 'feeder') {
    return { allowed: true, warningLevel: 'none', impactsWeeklyVolume: false, requiresConfirmation: false,
      reason: 'Feeder extra — aproxima da carga principal com baixa fadiga (longe da falha).',
      suggested: { weightKg: round(c.topSetKg * 0.80), reps: cr(c.repsMin), rir: 4, restSeconds: 90 } };
  }
  if (c.requestedSetType === 'corrective') {
    const base = lastWork?.weightKg ?? c.topSetKg * 0.8;
    return { allowed: true, warningLevel: 'low', impactsWeeklyVolume: false, requiresConfirmation: false,
      reason: 'Série corretiva — prioridade em técnica/amplitude; não conta como progressão.',
      suggested: { weightKg: round(base * 0.88), reps: cr(c.repsMax), rir: 3, restSeconds: 90 } };
  }
  if (c.requestedSetType === 'top') {
    return { allowed: true, warningLevel: 'high', impactsWeeklyVolume: true, requiresConfirmation: true,
      reason: 'Repetir o Top Set aumenta muito a fadiga. Só faz sentido após erro técnico/interrupção ou se o plano previr múltiplos top sets — senão prefira Working/Back-off.',
      suggested: { weightKg: round(c.topSetKg), reps: cr(c.repsMin), rir: 2, restSeconds: 180 } };
  }

  // Working / Back-off — validar volume/fadiga.
  let warning: WarningLevel = 'none';
  let allowed = true;
  const reasons: string[] = [];
  if (drop != null && drop >= 20) { warning = 'high'; allowed = false; reasons.push(`desempenho caiu ${drop}% entre as séries — volume produtivo já atingido`); }
  else if (drop != null && drop >= 12) { warning = 'moderate'; reasons.push(`queda de ${drop}% no desempenho`); }
  if (nearMrv) { warning = warning === 'high' ? 'high' : 'moderate'; reasons.push(`próximo do limite semanal (${c.muscleWeeklySets}/${c.estimatedMrv} séries)`); }
  if (lowRec) { warning = warning === 'high' ? 'high' : 'moderate'; reasons.push('recuperação baixa hoje'); }
  if (warning === 'none') reasons.push('desempenho estável e volume dentro da faixa — série extra aceitável');

  const base = lastWork?.weightKg ?? c.topSetKg * 0.85;
  const dropStep = c.requestedSetType === 'backoff' ? 0.03 : 0.0;
  const suggested: SuggestedSet = {
    weightKg: round(base * (1 - dropStep) * (warning === 'high' ? 0.92 : 1)),
    reps: cr(lastWork?.reps ?? c.repsMax),
    rir: 1, restSeconds: c.requestedSetType === 'backoff' ? 120 : 150,
  };

  return {
    allowed,
    warningLevel: warning,
    impactsWeeklyVolume: true,
    requiresConfirmation: warning === 'high' || warning === 'moderate',
    reason: reasons.join('; ') + '.',
    suggested: allowed ? suggested : suggested, // sugere mesmo quando não recomendado (usuário decide)
  };
}
