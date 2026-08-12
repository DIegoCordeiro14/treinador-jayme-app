/**
 * Exercise Evolution Engine — evolução por EXERCÍCIO e por GRUPO MUSCULAR.
 * A partir do histórico de séries, calcula tendências (top set, volume, reps, RIR)
 * e o status (progressing/stable/plateau/regressing). Alimenta a aba Evolução e o
 * Weak Point Engine. 100% determinístico — a IA só interpreta.
 */

export interface ExerciseSessionPoint {
  dateMs: number;
  topSetKg: number;      // maior carga da sessão
  topReps: number;
  volumeKg: number;      // soma carga×reps
  avgRir: number | null;
}

export type EvolutionStatus = 'progressing' | 'stable' | 'plateau' | 'regressing' | 'insufficient';

export interface ExerciseEvolution {
  status: EvolutionStatus;
  topSetTrendPct: number | null;      // variação de carga no período
  volumeTrendPct: number | null;
  repTrend: 'up' | 'stable' | 'down' | null;
  rirTrend: 'up' | 'stable' | 'down' | null;
  progressionRatePctPerMonth: number | null;
  current: { topSetKg: number; topReps: number } | null;
  past: { topSetKg: number; topReps: number; dateMs: number } | null;
  sessions: number;
  periodDays: number;
}

const pct = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null;
function trend(recent: number | null, older: number | null): 'up' | 'stable' | 'down' | null {
  if (recent == null || older == null) return null;
  const d = older !== 0 ? (recent - older) / Math.abs(older) : 0;
  return d > 0.03 ? 'up' : d < -0.03 ? 'down' : 'stable';
}

export function computeExerciseEvolution(pointsIn: ExerciseSessionPoint[]): ExerciseEvolution {
  const points = [...pointsIn].filter(p => p.topSetKg > 0).sort((a, b) => a.dateMs - b.dateMs);
  if (points.length < 2) {
    return { status: 'insufficient', topSetTrendPct: null, volumeTrendPct: null, repTrend: null, rirTrend: null, progressionRatePctPerMonth: null, current: points[0] ? { topSetKg: points[0].topSetKg, topReps: points[0].topReps } : null, past: null, sessions: points.length, periodDays: 0 };
  }
  const first = points[0], last = points[points.length - 1];
  const periodDays = Math.max(1, Math.round((last.dateMs - first.dateMs) / 86400000));
  const mid = Math.floor(points.length / 2);
  const avg = (arr: ExerciseSessionPoint[], sel: (p: ExerciseSessionPoint) => number) => arr.reduce((a, p) => a + sel(p), 0) / arr.length;
  const topRecent = avg(points.slice(mid), p => p.topSetKg), topOlder = avg(points.slice(0, mid), p => p.topSetKg);
  const volRecent = avg(points.slice(mid), p => p.volumeKg), volOlder = avg(points.slice(0, mid), p => p.volumeKg);
  const repRecent = avg(points.slice(mid), p => p.topReps), repOlder = avg(points.slice(0, mid), p => p.topReps);
  const rirPts = points.filter(p => p.avgRir != null);
  const rirRecent = rirPts.length >= 2 ? avg(rirPts.slice(Math.floor(rirPts.length / 2)), p => p.avgRir as number) : null;
  const rirOlder = rirPts.length >= 2 ? avg(rirPts.slice(0, Math.floor(rirPts.length / 2)), p => p.avgRir as number) : null;

  const topSetTrendPct = pct(last.topSetKg, first.topSetKg);
  const volumeTrendPct = pct(volRecent, volOlder);
  // ritmo de progressão de carga por mês (extrapolado do período)
  const progressionRatePctPerMonth = topSetTrendPct != null ? Math.round((topSetTrendPct / periodDays) * 30 * 10) / 10 : null;

  let status: EvolutionStatus;
  const topDeltaPct = pct(topRecent, topOlder) ?? 0;
  if (topDeltaPct >= 2 || (volumeTrendPct ?? 0) >= 5) status = 'progressing';
  else if (topDeltaPct <= -3) status = 'regressing';
  else if (periodDays >= 28 && Math.abs(topDeltaPct) < 1.5 && Math.abs(volumeTrendPct ?? 0) < 3) status = 'plateau';
  else status = 'stable';

  return {
    status, topSetTrendPct, volumeTrendPct,
    repTrend: trend(repRecent, repOlder), rirTrend: trend(rirRecent, rirOlder),
    progressionRatePctPerMonth,
    current: { topSetKg: last.topSetKg, topReps: last.topReps },
    past: { topSetKg: first.topSetKg, topReps: first.topReps, dateMs: first.dateMs },
    sessions: points.length, periodDays,
  };
}

// ── Evolução por grupo muscular ──────────────────────────────────────────────
export interface MuscleExerciseEvolution { exerciseId: string; name: string; evolution: ExerciseEvolution }
export interface MuscleGroupEvolution {
  muscle: string;
  weeklyVolumeTrendPct: number | null;
  avgLoadTrendPct: number | null;
  exercisesProgressing: number;
  exercisesTotal: number;
  status: 'boa_evolucao' | 'estavel' | 'atencao';
  weakPointSignal: boolean;
}

export function computeMuscleGroupEvolution(muscle: string, exercises: MuscleExerciseEvolution[]): MuscleGroupEvolution {
  const valid = exercises.filter(e => e.evolution.status !== 'insufficient');
  const progressing = valid.filter(e => e.evolution.status === 'progressing').length;
  const loadTrends = valid.map(e => e.evolution.topSetTrendPct).filter((v): v is number => v != null);
  const volTrends = valid.map(e => e.evolution.volumeTrendPct).filter((v): v is number => v != null);
  const avgLoad = loadTrends.length ? Math.round((loadTrends.reduce((a, b) => a + b, 0) / loadTrends.length) * 10) / 10 : null;
  const avgVol = volTrends.length ? Math.round((volTrends.reduce((a, b) => a + b, 0) / volTrends.length) * 10) / 10 : null;
  const total = valid.length;
  // Ponto fraco não é só volume: progressão baixa + maioria estagnada.
  const stagnantRatio = total > 0 ? (total - progressing) / total : 0;
  const weakPointSignal = total >= 2 && (avgLoad ?? 0) < 1.5 && stagnantRatio >= 0.6;
  const status: MuscleGroupEvolution['status'] = weakPointSignal ? 'atencao' : (progressing / Math.max(1, total)) >= 0.5 ? 'boa_evolucao' : 'estavel';
  return { muscle, weeklyVolumeTrendPct: avgVol, avgLoadTrendPct: avgLoad, exercisesProgressing: progressing, exercisesTotal: total, status, weakPointSignal };
}
