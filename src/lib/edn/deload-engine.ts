/**
 * Motor determinístico de DELOAD.
 *
 * Lê o histórico REAL de treino (carga, reps, RIR por série) e produz, por exercício,
 * a prescrição de deload: reduzir volume (~40% das séries) e carga (~10–15% do top set
 * recente), mantendo as reps dentro da faixa. Também detecta quando o deload é indicado
 * (fadiga/estagnação) a partir do próprio histórico — a IA NÃO precisa receber números.
 */
import { clampRepsToExerciseRange } from './reps-range';

export interface DeloadSetRecord {
  performedAt: string;      // ISO
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  setType?: string | null;  // 'top' | 'working' | ...
  completed?: boolean;
}

export interface DeloadConfig {
  loadDropPct?: number;     // fração de redução de carga (default 0.12)
  setFactor?: number;       // fração de séries mantidas (default 0.6)
  equipmentStep?: number;   // passo de arredondamento de carga (default 2.5)
}

export interface ExerciseDeload {
  fromTopKg: number | null;
  deloadLoadKg: number | null;
  currentSets: number;
  deloadSets: number;
  deloadReps: number | null;
  reason: string;
  confidence: number;       // 0..1 (mais histórico → maior)
}

function round(target: number, step: number): number {
  if (!(step > 0)) return Math.round(target);
  return Math.round(target / step) * step;
}

/** Top set recente = maior carga por sessão, média das sessões mais recentes. */
export function recentTopKg(records: DeloadSetRecord[], sessions = 3): number | null {
  const valid = records.filter(r => r.completed !== false && r.weightKg != null && r.weightKg > 0);
  if (!valid.length) return null;
  const bySession = new Map<string, number>();
  for (const r of valid) {
    const key = r.performedAt || 'unknown';
    const top = r.setType === 'top' ? r.weightKg! : (bySession.get(key) ?? 0);
    const cur = bySession.get(key) ?? 0;
    bySession.set(key, Math.max(cur, r.weightKg!, top));
  }
  const tops = [...bySession.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const recent = tops.slice(-sessions);
  if (!recent.length) return null;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** Reps típicas recentes das working sets (para manter dentro da faixa no deload). */
function typicalReps(records: DeloadSetRecord[]): number | null {
  const reps = records.filter(r => r.completed !== false && r.reps != null && r.reps! > 0).map(r => r.reps!);
  if (!reps.length) return null;
  return Math.round(reps.slice(-10).reduce((a, b) => a + b, 0) / reps.slice(-10).length);
}

/**
 * Sinal de que o deload é indicado só pelo histórico: estagnação de carga por
 * 3+ sessões e/ou RIR consistentemente baixo (≤1) — fadiga acumulada.
 */
export function deloadSignal(records: DeloadSetRecord[]): { recommended: boolean; reason: string } {
  const bySession = new Map<string, { top: number; minRir: number | null }>();
  for (const r of records) {
    if (r.completed === false || r.weightKg == null) continue;
    const k = r.performedAt || 'unknown';
    const e = bySession.get(k) ?? { top: 0, minRir: null };
    e.top = Math.max(e.top, r.weightKg);
    if (r.rir != null) e.minRir = e.minRir == null ? r.rir : Math.min(e.minRir, r.rir);
    bySession.set(k, e);
  }
  const sessions = [...bySession.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  if (sessions.length < 3) return { recommended: false, reason: 'Histórico insuficiente para indicar deload.' };
  const last3 = sessions.slice(-3);
  const stagnant = last3.every(s => Math.abs(s.top - last3[0].top) < 0.001);
  const lowRir = last3.every(s => s.minRir != null && s.minRir <= 1);
  if (stagnant && lowRir) return { recommended: true, reason: 'Carga estagnada há 3+ sessões com RIR baixo — fadiga acumulada.' };
  if (stagnant) return { recommended: true, reason: 'Carga estagnada há 3+ sessões — deload ajuda a destravar.' };
  if (lowRir) return { recommended: true, reason: 'RIR consistentemente baixo — sinal de fadiga; deload recomendado.' };
  return { recommended: false, reason: 'Sem sinais claros de fadiga no histórico.' };
}

/** Prescrição de deload de UM exercício a partir do histórico. */
export function computeExerciseDeload(records: DeloadSetRecord[], currentSets: number, repsMin: number, repsMax: number, cfg: DeloadConfig = {}): ExerciseDeload {
  const loadDrop = cfg.loadDropPct ?? 0.12;
  const setFactor = cfg.setFactor ?? 0.6;
  const step = cfg.equipmentStep ?? 2.5;
  const fromTopKg = recentTopKg(records);
  const deloadLoadKg = fromTopKg != null ? Math.max(step, round(fromTopKg * (1 - loadDrop), step)) : null;
  const deloadSets = Math.max(1, Math.round((currentSets || 3) * setFactor));
  const baseReps = typicalReps(records) ?? Math.round((repsMin + repsMax) / 2);
  const deloadReps = clampRepsToExerciseRange(baseReps, repsMin, repsMax);
  const nSessions = new Set(records.filter(r => r.weightKg != null).map(r => r.performedAt)).size;
  const confidence = Math.min(1, nSessions / 4);
  const reason = fromTopKg != null
    ? `Deload: carga ${Math.round((loadDrop) * 100)}% abaixo do top recente (${Math.round(fromTopKg)}kg → ${deloadLoadKg}kg), ${deloadSets} séries (de ${currentSets}).`
    : `Deload: sem histórico de carga — reduzindo volume para ${deloadSets} séries (de ${currentSets}).`;
  return { fromTopKg, deloadLoadKg, currentSets: currentSets || 3, deloadSets, deloadReps, reason, confidence };
}
