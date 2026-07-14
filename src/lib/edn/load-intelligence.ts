/**
 * EDN Load Intelligence — prescrição determinística de cargas por tipo de série
 * (aquecimento, feeder, top set, working sets) a partir do histórico real do
 * exercício + recuperação + deload. A carga NUNCA é aleatória.
 */

import { clampRepsToExerciseRange } from './reps-range';

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
  warmupSetsCount?: number;      // aquecimentos (default: 2 se carga pesada, senão 1)
  feederSetsCount?: number;      // feeders (default: 2 se pesada, senão 1)
  equipmentStep?: number;        // menor incremento do equipamento (kg)
  experience?: string;           // beginner | intermediate | advanced
}

export interface PrescribedSet {
  kind: 'aquecimento' | 'feeder' | 'top' | 'working';
  weightKg: number;
  reps: number;
  targetRir?: number | null;
  pctOfTop?: number | null;      // % do Top Set (aquecimentos/feeders/working)
  reason?: string;
  confidence?: number;           // 0–100
}
export interface LoadPrescription {
  sets: PrescribedSet[];
  topSet: PrescribedSet;
  strategy: string;
  reason: string;
  confidence?: number;
}

// Arredonda para o incremento de anilha plausível.
export function roundToIncrement(w: number): number {
  if (w <= 0) return 0;
  const step = w >= 20 ? 2.5 : 1;
  return Math.round(w / step) * step;
}
function loadStep(w: number): number { return w >= 100 ? 5 : w >= 40 ? 2.5 : w >= 20 ? 2 : 1; }

// Arredonda respeitando o incremento real do equipamento (barra/halter/máquina/polia).
export function roundToAvailableLoad(target: number, options?: { step?: number; available?: number[] }): number {
  if (target <= 0) return 0;
  if (options?.available && options.available.length) {
    return options.available.reduce((best, w) => Math.abs(w - target) < Math.abs(best - target) ? w : best, options.available[0]);
  }
  const step = options?.step && options.step > 0 ? options.step : (target >= 20 ? 2.5 : 1);
  return Math.round(target / step) * step;
}

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

  const clampReps = (r: number) => clampRepsToExerciseRange(r, i.repsMin, i.repsMax);
  const round = (w: number) => roundToAvailableLoad(w, { step: i.equipmentStep });
  const heavy = topW >= 60 || i.isCompound;
  const overallConf = Math.max(40, Math.min(100, 55 + Math.min(hist.length, 8) * 5 - (lowRec || critical ? 8 : 0)));

  // Nº de aquecimentos/feeders — proporcional à carga/complexidade
  const nWarm = i.warmupSetsCount ?? (heavy ? 2 : 1);
  const nFeed = i.feederSetsCount ?? (topW >= 80 && i.isCompound ? 2 : 1);
  const nWork = Math.max(0, i.workingSetsCount);

  const sets: PrescribedSet[] = [];

  // ── Aquecimentos: escada 40% → 60% (reps decrescentes, RIR alto) ──────────
  const warmPcts = nWarm >= 3 ? [0.40, 0.55, 0.65] : nWarm === 2 ? [0.42, 0.58] : [0.5];
  const midReps = clampReps(Math.round((i.repsMin + i.repsMax) / 2));
  const warmReps = nWarm >= 3 ? [i.repsMax, midReps, i.repsMin] : nWarm === 2 ? [i.repsMax, midReps] : [i.repsMax];
  for (let k = 0; k < nWarm; k++) {
    const pct = warmPcts[k];
    const w = round(topW * pct);
    if (w <= 0) continue;
    sets.push({ kind: 'aquecimento', weightKg: w, reps: clampReps(warmReps[k] ?? i.repsMax), targetRir: 5, pctOfTop: Math.round(pct * 100),
      reason: 'Aquecimento — preparar articulações e SNC sem fadiga.', confidence: overallConf });
  }

  // ── Feeders: 68% → 82% (poucas reps, RIR 4+) ──────────────────────────────
  const feedPcts = nFeed >= 2 ? [0.68, 0.82] : [0.72];
  for (let k = 0; k < nFeed; k++) {
    const pct = feedPcts[k];
    const w = round(topW * pct);
    if (w <= 0 || w >= topW) continue;
    sets.push({ kind: 'feeder', weightKg: w, reps: clampReps(i.repsMin), targetRir: 4, pctOfTop: Math.round(pct * 100),
      reason: 'Feeder — aproximar da carga principal com baixa fadiga.', confidence: overallConf });
  }

  // ── Top Set (âncora) ──────────────────────────────────────────────────────
  const topSet: PrescribedSet = { kind: 'top', weightKg: topW, reps: clampReps(topReps), targetRir: 2, pctOfTop: 100, reason, confidence: overallConf };
  sets.push(topSet);

  // ── Working / Back-off: 88–92% do top, degrau leve a cada série (fadiga) ───
  const workReps = clampReps(topReps + 2);
  const startPct = i.isCompound ? 0.90 : 0.92;
  const recDrop = critical ? 0.15 : lowRec ? 0.10 : 0; // recuperação baixa reduz working
  for (let k = 0; k < nWork; k++) {
    const pct = Math.max(0.75, startPct - k * 0.03 - recDrop);
    const w = round(topW * pct);
    sets.push({ kind: 'working', weightKg: w, reps: clampReps(workReps + (k === nWork - 1 ? 1 : 0)), targetRir: k === nWork - 1 ? 1 : 2, pctOfTop: Math.round(pct * 100),
      reason: k === nWork - 1 ? 'Última série — manter esforço com técnica; base para progredir.' : 'Working Set — estímulo principal derivado do Top Set e da queda média de performance.',
      confidence: overallConf - 3 });
  }

  return { sets, topSet, strategy, reason, confidence: overallConf } as LoadPrescription;
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

/**
 * Progressão da ÚLTIMA série (Bloco 8) — a última série não é descartável.
 * Compara a última série atual vs a anterior (reps/RIR/carga) e pontua o progresso
 * mesmo sem aumento de carga (ex.: mesma carga, +1 rep ou +1 RIR = progresso).
 */
export function lastSetPerformanceScore(prev: SetPerf | null, cur: SetPerf): { score: number; note: string } {
  if (!prev) return { score: 50, note: 'Primeira referência para a última série.' };
  let score = 50;
  if (cur.weightKg > prev.weightKg) score += 25;
  else if (cur.weightKg < prev.weightKg) score -= 15;
  if (cur.reps > prev.reps) score += 15;
  else if (cur.reps < prev.reps) score -= 15;
  const rc = cur.rir, rp = prev.rir;
  if (rc != null && rp != null) { if (rc > rp) score += 10; else if (rc < rp) score -= 5; }
  score = Math.max(0, Math.min(100, score));
  const note = score >= 60
    ? 'Última série evoluiu (carga, reps ou RIR) — progresso real, mesmo sem subir carga.'
    : score >= 45 ? 'Última série estável.' : 'Última série caiu — atenção à fadiga acumulada.';
  return { score, note };
}
