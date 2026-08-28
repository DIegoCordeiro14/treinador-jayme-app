// athlete-training-snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 1 — Snapshot longitudinal do atleta para GERAÇÃO de treino.
//
// Motor 100% determinístico e PURO (sem I/O). Recebe linhas já buscadas pela
// rota /api/generate-workout e consolida tudo o que a próxima geração precisa
// "saber" sobre o atleta: perfil, histórico real por exercício e por grupo,
// volume recente, recuperação, interferência de cardio, condições físicas e o
// plano atual. Não inventa nada — apenas agrega e classifica sinais existentes.
// ─────────────────────────────────────────────────────────────────────────────

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type SexType = 'male' | 'female';

export interface SnapshotProfile {
  sex: SexType;
  experience: ExperienceLevel;
  objective: string;
  aesthetic_goal?: string | null;
  days_per_week: number;
  available_equipment?: string[];
  age?: number | null;
  weight_kg?: number | null;
}

export interface SnapshotSetRow {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  performed_at: string;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  is_working_set?: boolean;
}

export interface SnapshotConditionRestriction {
  muscle_group?: string | null;
  exercise_id?: string | null;
  severity: 'avoid' | 'caution';
  reason: string;
}

export interface SnapshotCurrentPlanExercise {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  sets: number;
}

export interface SnapshotRecovery {
  category: 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
  sleep_h?: number | null;
  soreness_0_10?: number | null;
}

export interface SnapshotCardio {
  sessions_last_7d: number;
  minutes_last_7d: number;
  interfering_muscles: string[];
}

export interface SnapshotInput {
  profile: SnapshotProfile;
  sets: SnapshotSetRow[];
  currentPlan?: SnapshotCurrentPlanExercise[];
  recovery?: SnapshotRecovery;
  cardio?: SnapshotCardio;
  restrictions?: SnapshotConditionRestriction[];
  nowMs?: number;
}

export type ExerciseTrend = 'progressing' | 'stable' | 'plateau' | 'regressing' | 'new';

export interface ExerciseSnapshot {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  sessions: number;
  familiarity: 'none' | 'low' | 'medium' | 'high';
  last_performed_days_ago: number | null;
  best_top_kg: number | null;
  recent_top_kg: number | null;
  avg_rir: number | null;
  trend: ExerciseTrend;
  weeks_stagnant: number;
}

export interface MuscleSnapshot {
  muscle_group: string;
  weekly_sets: number;
  sessions_per_week: number;
  last_trained_days_ago: number | null;
  distinct_exercises: number;
}

export interface AthleteTrainingSnapshot {
  generatedAtMs: number;
  windowDays: number;
  profile: SnapshotProfile;
  hasHistory: boolean;
  totalWorkingSets: number;
  distinctSessions: number;
  perExercise: ExerciseSnapshot[];
  perMuscle: MuscleSnapshot[];
  recovery: SnapshotRecovery;
  cardio: SnapshotCardio;
  restrictions: SnapshotConditionRestriction[];
  currentPlanExerciseIds: string[];
  cardioInterferenceMuscles: string[];
  summaryBullets: string[];
}

const WINDOW_DAYS = 90;
const MS_DAY = 86_400_000;

function daysAgo(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((nowMs - t) / MS_DAY));
}

function familiarityFromSessions(sessions: number): ExerciseSnapshot['familiarity'] {
  if (sessions <= 0) return 'none';
  if (sessions <= 2) return 'low';
  if (sessions <= 5) return 'medium';
  return 'high';
}

function daysAgoBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / MS_DAY));
}

function trendFromTops(sortedByDateAsc: SnapshotSetRow[]): { trend: ExerciseTrend; weeksStagnant: number } {
  const working = sortedByDateAsc.filter((s) => s.is_working_set !== false && (s.weight_kg ?? 0) > 0);
  if (working.length === 0) return { trend: 'new', weeksStagnant: 0 };

  const byDay = new Map<string, number>();
  for (const s of working) {
    const day = s.performed_at.slice(0, 10);
    const kg = s.weight_kg ?? 0;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, kg));
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (days.length < 2) return { trend: 'new', weeksStagnant: 0 };

  const firstHalf = days.slice(0, Math.floor(days.length / 2));
  const secondHalf = days.slice(Math.floor(days.length / 2));
  const avg = (arr: [string, number][]) => arr.reduce((a, [, v]) => a + v, 0) / arr.length;
  const before = avg(firstHalf);
  const after = avg(secondHalf);
  const delta = after - before;
  const pct = before > 0 ? delta / before : 0;

  const bestKg = Math.max(...days.map(([, v]) => v));
  const firstPeakIdx = days.map(([, v]) => v).indexOf(bestKg);
  const daysSincePeak = daysAgoBetween(days[firstPeakIdx][0], days[days.length - 1][0]);
  const weeksStagnant = Math.floor(daysSincePeak / 7);

  let trend: ExerciseTrend;
  if (pct >= 0.03) trend = 'progressing';
  else if (pct <= -0.05) trend = 'regressing';
  else if (weeksStagnant >= 3) trend = 'plateau';
  else trend = 'stable';

  return { trend, weeksStagnant };
}

export function buildAthleteTrainingSnapshot(input: SnapshotInput): AthleteTrainingSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const cutoff = nowMs - WINDOW_DAYS * MS_DAY;

  const sets = (input.sets ?? []).filter((s) => {
    const t = new Date(s.performed_at).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
  const working = sets.filter((s) => s.is_working_set !== false);

  const byExercise = new Map<string, SnapshotSetRow[]>();
  for (const s of sets) {
    const arr = byExercise.get(s.exercise_id) ?? [];
    arr.push(s);
    byExercise.set(s.exercise_id, arr);
  }

  const perExercise: ExerciseSnapshot[] = [];
  for (const [id, rows] of byExercise) {
    const asc = [...rows].sort((a, b) => a.performed_at.localeCompare(b.performed_at));
    const w = asc.filter((s) => s.is_working_set !== false && (s.weight_kg ?? 0) > 0);
    const sessionDays = new Set(asc.map((s) => s.performed_at.slice(0, 10)));
    const recentDays = [...new Set(w.map((s) => s.performed_at.slice(0, 10)))].sort().slice(-3);
    const recentTop = w
      .filter((s) => recentDays.includes(s.performed_at.slice(0, 10)))
      .reduce<number | null>((m, s) => Math.max(m ?? 0, s.weight_kg ?? 0), null);
    const bestTop = w.reduce<number | null>((m, s) => Math.max(m ?? 0, s.weight_kg ?? 0), null);
    const rirs = asc.map((s) => s.rir).filter((r): r is number => r != null);
    const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
    const { trend, weeksStagnant } = trendFromTops(asc);
    const last = asc[asc.length - 1];

    perExercise.push({
      exercise_id: id,
      exercise_name: rows[0].exercise_name,
      muscle_group: rows[0].muscle_group,
      sessions: sessionDays.size,
      familiarity: familiarityFromSessions(sessionDays.size),
      last_performed_days_ago: last ? daysAgo(last.performed_at, nowMs) : null,
      best_top_kg: bestTop,
      recent_top_kg: recentTop,
      avg_rir: avgRir != null ? Math.round(avgRir * 10) / 10 : null,
      trend,
      weeks_stagnant: weeksStagnant,
    });
  }
  perExercise.sort((a, b) => b.sessions - a.sessions);

  const weeksInWindow = WINDOW_DAYS / 7;
  const byMuscle = new Map<string, SnapshotSetRow[]>();
  for (const s of sets) {
    const arr = byMuscle.get(s.muscle_group) ?? [];
    arr.push(s);
    byMuscle.set(s.muscle_group, arr);
  }
  const perMuscle: MuscleSnapshot[] = [];
  for (const [mg, rows] of byMuscle) {
    const w = rows.filter((s) => s.is_working_set !== false);
    const days = new Set(rows.map((s) => s.performed_at.slice(0, 10)));
    const last = [...rows].sort((a, b) => b.performed_at.localeCompare(a.performed_at))[0];
    perMuscle.push({
      muscle_group: mg,
      weekly_sets: Math.round((w.length / weeksInWindow) * 10) / 10,
      sessions_per_week: Math.round((days.size / weeksInWindow) * 10) / 10,
      last_trained_days_ago: last ? daysAgo(last.performed_at, nowMs) : null,
      distinct_exercises: new Set(rows.map((s) => s.exercise_id)).size,
    });
  }
  perMuscle.sort((a, b) => b.weekly_sets - a.weekly_sets);

  const recovery: SnapshotRecovery = input.recovery ?? { category: 'good' };
  const cardio: SnapshotCardio = input.cardio ?? {
    sessions_last_7d: 0,
    minutes_last_7d: 0,
    interfering_muscles: [],
  };

  // Grupos que o cardio pode interferir. Mantemos a lista crua porque o
  // gerador (Etapa 3/6) cruza com os grupos DO PLANO que será montado, não
  // só com o histórico. Aqui só normalizamos duplicatas.
  const cardioInterferenceMuscles = [...new Set(cardio.interfering_muscles ?? [])];

  const distinctSessions = new Set(sets.map((s) => s.performed_at.slice(0, 10))).size;

  const bullets: string[] = [];
  if (working.length === 0) {
    bullets.push('Sem histórico de treino registrado — primeira geração baseada no perfil.');
  } else {
    bullets.push(
      `${distinctSessions} sessões e ${working.length} séries de trabalho nos últimos ${WINDOW_DAYS} dias.`
    );
    const plateaus = perExercise.filter((e) => e.trend === 'plateau' || e.trend === 'regressing');
    if (plateaus.length) {
      bullets.push(
        `Estagnação/regressão em: ${plateaus.slice(0, 4).map((e) => e.exercise_name).join(', ')}.`
      );
    }
    const progressing = perExercise.filter((e) => e.trend === 'progressing');
    if (progressing.length) {
      bullets.push(
        `Progredindo bem em: ${progressing.slice(0, 4).map((e) => e.exercise_name).join(', ')}.`
      );
    }
  }
  if (recovery.category === 'low' || recovery.category === 'critical') {
    bullets.push(`Recuperação ${recovery.category} — volume/intensidade devem ser contidos.`);
  }
  if (cardioInterferenceMuscles.length) {
    bullets.push(`Cardio recente pode interferir em: ${cardioInterferenceMuscles.join(', ')}.`);
  }
  if (input.restrictions?.length) {
    bullets.push(
      `${input.restrictions.length} restrição(ões) física(s) ativa(s) — respeitadas antes da seleção.`
    );
  }

  return {
    generatedAtMs: nowMs,
    windowDays: WINDOW_DAYS,
    profile: input.profile,
    hasHistory: working.length > 0,
    totalWorkingSets: working.length,
    distinctSessions,
    perExercise,
    perMuscle,
    recovery,
    cardio,
    restrictions: input.restrictions ?? [],
    currentPlanExerciseIds: (input.currentPlan ?? []).map((p) => p.exercise_id),
    cardioInterferenceMuscles,
    summaryBullets: bullets,
  };
}
