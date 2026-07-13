/**
 * EDN Load Intelligence — prescrição determinística de cargas por tipo de série
 * (aquecimento, feeder, top set, working sets) a partir do histórico real do
 * exercício + recuperação + deload. A carga NUNCA é aleatória.
 */

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export interface SetPerf { weightKg: number; reps: number; rir: number | null; dateMs?: number }

export interface LoadInput {
  history: SetPerf[];          // top sets recentes do exercício (qualquer ordem)
  repsMin: number;
  repsMax: number;
  isCompound: boolean;
  workingSetsCount: number;    // nº de working sets a prescrever
  recoveryCategory: RecoveryCategory;
  deloadActive?: boolean;
}

export interface PrescribedSet { kind: 'aquecimento' | 'feeder' | 'top' | 'working'; weightKg: number; reps: number }
export interface LoadPrescription {
  sets: PrescribedSet[];
  topSet: PrescribedSet;
  strategy: string;
  reason: string;
}

// Arredonda para o incremento de anilha plausível.
export function roundToIncrement(w: number): number {
  if (w <= 0) return 0;
  const step = w >= 20 ? 2.5 : 1;
  return Math.round(w / step) * step;
}
function loadStep(w: number): number { return w >= 100 ? 5 : w >= 40 ? 2.5 : w >= 20 ? 2 : 1; }

export function prescribeLoads(i: LoadInput): LoadPrescription | null {
  const hist = [...i.history].filter(s => s.weightKg > 0).sort((a, b) => (a.dateMs ?? 0) - (b.dateMs ?? 0));
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  const base = last.weightKg;
  const reachedTop = last.reps >= i.repsMax && (last.rir == null || last.rir >= 1);
  const lowRec = i.recoveryCategory === 'low';
  const critical = i.recoveryCategory === 'critical';

  let topW: number, topReps: number, strategy: string, reason: string;
  if (i.deloadActive || critical) {
    topW = roundToIncrement(base * 0.9);
    topReps = i.repsMax;
    strategy = 'Deload estratégico';
    reason = i.deloadActive ? 'Semana de deload — carga reduzida para recuperar.' : 'Recuperação crítica — carga reduzida, foco em técnica.';
  } else if (lowRec) {
    topW = base; topReps = Math.max(i.repsMin, Math.min(i.repsMax, last.reps));
    strategy = 'Consolidação';
    reason = 'Recuperação baixa — manter a carga do último top set.';
  } else if (reachedTop) {
    topW = roundToIncrement(base + loadStep(base)); topReps = i.repsMin;
    strategy = 'Dupla progressão (carga)';
    reason = `No último top você fez ${last.reps} reps (≥ alvo ${i.repsMax})${last.rir != null ? ` com RIR ${last.rir}` : ''} — sobe a carga e recomeça em ${i.repsMin} reps.`;
  } else {
    topW = base; topReps = Math.min(i.repsMax, last.reps + 1);
    strategy = 'Progressão por repetições';
    reason = `Ainda dentro da faixa (${last.reps}/${i.repsMin}-${i.repsMax}) — manter carga e buscar +1 rep.`;
  }

  const clampReps = (r: number) => Math.max(i.repsMin, Math.min(i.repsMax, Math.round(r)));
  const warmupW = roundToIncrement(topW * 0.45);
  const feederW = roundToIncrement(topW * 0.68);
  const workBase = roundToIncrement(topW * (i.isCompound ? 0.88 : 0.9));
  const workReps = clampReps(topReps + 2);
  const nWork = Math.max(0, i.workingSetsCount);

  const sets: PrescribedSet[] = [];
  if (warmupW > 0) sets.push({ kind: 'aquecimento', weightKg: warmupW, reps: i.repsMax });
  if (feederW > 0 && feederW < topW) sets.push({ kind: 'feeder', weightKg: feederW, reps: i.repsMin });
  const topSet: PrescribedSet = { kind: 'top', weightKg: topW, reps: topReps };
  sets.push(topSet);
  for (let k = 0; k < nWork; k++) {
    // última série cai um degrau (fadiga)
    const w = k === nWork - 1 && nWork > 1 ? roundToIncrement(workBase - loadStep(workBase)) : workBase;
    sets.push({ kind: 'working', weightKg: w, reps: workReps });
  }

  topSet.reps = clampReps(topSet.reps);
  return { sets, topSet, strategy, reason };
}

/**
 * Ajuste em tempo real: recalcula o peso dos working sets após o top set real.
 */
export function adjustWorkingAfterTop(topPlanned: PrescribedSet, topActualReps: number, topActualRir: number | null, plannedWorkingKg: number): { weightKg: number; note: string } {
  const short = topActualReps < topPlanned.reps || (topActualRir != null && topActualRir <= 0 && topActualReps <= topPlanned.reps);
  if (short) {
    return { weightKg: roundToIncrement(plannedWorkingKg - loadStep(plannedWorkingKg)), note: 'Top set abaixo do alvo — reduzi o peso dos working sets.' };
  }
  const strong = topActualReps > topPlanned.reps + 1 && (topActualRir == null || topActualRir >= 2);
  if (strong) return { weightKg: plannedWorkingKg, note: 'Top set forte — mantém os working; sobe a carga no próximo treino.' };
  return { weightKg: plannedWorkingKg, note: 'Working sets conforme o plano.' };
}
