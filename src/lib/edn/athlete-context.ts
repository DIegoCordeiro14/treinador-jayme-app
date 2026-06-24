/**
 * EDN Athlete Context — V6.0
 * Única fonte de verdade. Nenhum agente consulta tabelas diretamente.
 * Todos os módulos consomem AthleteContext ou sua serialização.
 *
 * V6.0: Adicionados workoutPlans e exerciseLibrary para o Coach EDN
 * ter acesso completo a planos, dias, exercícios e catálogo para
 * sugestões de substituição e modificação de treinos.
 */

import { createClient } from '@/lib/supabase/server';
import { subDays, differenceInDays, parseISO, startOfWeek, format } from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BodyComposition {
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleKg: number | null;
  visceralLevel: number | null;
  waterPct: number | null;
  tmb: number | null;
  bmi: number | null;
  proteinPct: number | null;
  lastMeasuredAt: string | null;
  weightTrend14d: number | null;
  weightTrend7d: number | null;
}

export interface TrainingState {
  sessionsLast28: number;
  plannedSessionsLast28: number;
  adherencePct: number;
  daysSinceLastWorkout: number;
  weeklyVolumeKg: number;
  prevWeekVolumeKg: number;
  volumeDeltaPct: number | null;
  avgRir: number | null;
  hasPrLast4Weeks: boolean;
  plateauDetected: boolean;
  streak: number;
  activePlanName: string | null;
  activePlanGoal: string | null;
  daysPerWeek: number;
  topExercises: { name: string; topSetKg: number }[];
  avgHrRecent: number | null;
}

export interface NutritionState {
  daysLoggedLast14: number;
  adherencePct: number;
  avgCalories: number | null;
  targetCalories: number | null;
  avgProteinG: number | null;
  targetProteinG: number | null;
  proteinGapG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tdee: number | null;
  deficit: number | null;
  weightChangePer14d: number | null;
  plateauCaloric: boolean;
}

export interface CardioState {
  sessionsLast14: number;
  kmLast7d: number;
  kmLast14d: number;
  avgDurationMin: number | null;
  avgIntensity: string | null;
  goalKmWeekly: number;
  adherencePct: number;
  trend: 'increasing' | 'stable' | 'decreasing' | 'none';
}

export interface RecoveryState {
  score: number;
  daysSinceLastWorkout: number;
  avgRir: number | null;
  sleepSignal: 'ok' | 'low' | 'unknown';
  deloadRecommended: boolean;
}

export interface GoalState {
  primary: string;
  aesthetic: string | null;
  weakPoint: string | null;
  targetWeightKg: number | null;
  experience: string;
  daysPerWeek: number;
  gender: 'male' | 'female' | null;
}

export interface ScoreState {
  overall: number;
  training: number;
  nutrition: number;
  cardio: number;
  recovery: number;
  consistency: number;
  progression: number;
  league: string;
}

// ── V6.0: Workout Plans ────────────────────────────────────────────────────────

export interface WorkoutExerciseInPlan {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  equipment: string;
  difficulty: string;
  isCompound: boolean;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  notes: string;
  orderIndex: number;
}

export interface WorkoutDayInPlan {
  id: string;
  name: string;
  orderIndex: number;
  exercises: WorkoutExerciseInPlan[];
}

export interface WorkoutPlanDetail {
  id: string;
  name: string;
  goal: string;
  daysPerWeek: number;
  isActive: boolean;
  days: WorkoutDayInPlan[];
}

// ── V6.0: Exercise Library ─────────────────────────────────────────────────────

export interface ExerciseInLibrary {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: string;
  isCompound: boolean;
  isMetabolic: boolean;
  isIsometric: boolean;
}

// ── Main Context ───────────────────────────────────────────────────────────────

export interface AthleteContext {
  userId: string;
  profile: { name: string; age: number | null };
  bodyComposition: BodyComposition;
  training: TrainingState;
  nutrition: NutritionState;
  cardio: CardioState;
  recovery: RecoveryState;
  goals: GoalState;
  scores: ScoreState;
  // V6.0 additions
  workoutPlans: WorkoutPlanDetail[];
  exerciseLibrary: ExerciseInLibrary[];
  computedAt: string;
}

// ── Serialize options ──────────────────────────────────────────────────────────

export interface SerializeOptions {
  /** Include full workout plans (days + exercises). Default: false */
  includeWorkoutPlans?: boolean;
  /** Include exercise library for substitution suggestions. Default: false */
  includeExerciseLibrary?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: compute TDEE
// ─────────────────────────────────────────────────────────────────────────────
function estimateTdee(tmb: number, weeklyWorkouts: number, weeklyCardioKm: number): number {
  const activityMult = weeklyWorkouts >= 5 ? 1.55 : weeklyWorkouts >= 3 ? 1.45 : 1.35;
  return Math.round(tmb * activityMult + weeklyCardioKm * 60);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main: buildAthleteContext
// ─────────────────────────────────────────────────────────────────────────────
export async function buildAthleteContext(userId: string): Promise<AthleteContext> {
  const supabase = createClient();
  const now = new Date();
  const d7  = subDays(now, 7);
  const d14 = subDays(now, 14);
  const d28 = subDays(now, 28);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const prevWeekStart = subDays(weekStart, 7);

  // ── Parallel fetch de TODOS os dados ──────────────────────────────────────
  const [
    profileResult,
    bioResult,
    weightLogsResult,
    sessions28Result,
    activePlanResult,
    progressions14dResult,
    foodLogs14Result,
    cardio14Result,
    deloadsResult,
    workoutPlansResult,
    exerciseLibraryResult,
  ] = await Promise.allSettled([
    supabase.from('profiles')
      .select('name, age, gender, goal, experience_level, weekly_frequency, target_weight_kg, calorie_target, aesthetic_goal, weak_point, main_goal')
      .eq('id', userId).single(),

    supabase.from('bioimpedance_data')
      .select('weight_kg, body_fat_pct, skeletal_muscle_mass_kg, visceral_fat_level, water_pct, basal_metabolic_rate_kcal, bmi, protein_pct, measured_at')
      .eq('user_id', userId).order('measured_at', { ascending: false }).limit(1).maybeSingle(),

    supabase.from('body_weight_logs')
      .select('weight_kg, log_date')
      .eq('user_id', userId).gte('log_date', format(d14, 'yyyy-MM-dd'))
      .order('log_date', { ascending: true }),

    supabase.from('workout_sessions')
      .select('id, started_at, total_volume_kg, avg_hr, max_hr')
      .eq('user_id', userId).gte('started_at', d28.toISOString())
      .order('started_at', { ascending: false }),

    supabase.from('workout_plans')
      .select('name, goal, days_per_week')
      .eq('user_id', userId).eq('is_active', true).maybeSingle(),

    supabase.from('progressions')
      .select('exercise_id, weight_kg, recorded_at, set_type, rir')
      .eq('user_id', userId).gte('recorded_at', d14.toISOString())
      .order('recorded_at', { ascending: false }),

    supabase.from('food_logs')
      .select('logged_at, calories_kcal, protein_g, carbs_g, fat_g, target_protein_g')
      .eq('user_id', userId).gte('logged_at', format(d14, 'yyyy-MM-dd')),

    supabase.from('cardio_sessions')
      .select('distance_km, duration_min, intensity, performed_at, created_at')
      .eq('user_id', userId).gte('created_at', d14.toISOString())
      .order('created_at', { ascending: false }),

    supabase.from('deloads')
      .select('start_date, is_active').eq('user_id', userId).eq('is_active', true).maybeSingle(),

    // V6.0: Todos os planos do usuário com dias + exercícios + detalhes do exercício
    supabase.from('workout_plans')
      .select(`
        id, name, goal, days_per_week, is_active,
        workout_days(
          id, name, order_index,
          workout_exercises(
            exercise_id, sets, reps_min, reps_max, rest_seconds, notes, order_index,
            exercises(id, name, muscle_group, equipment, difficulty, is_compound, is_isometric)
          )
        )
      `)
      .eq('user_id', userId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false }),

    // V6.0: Biblioteca completa de exercícios públicos
    supabase.from('exercises')
      .select('id, name, muscle_group, equipment, difficulty, is_compound, is_metabolic, is_isometric')
      .eq('is_public', true)
      .order('muscle_group')
      .order('name'),
  ]);

  // ── Extract settled results safely ─────────────────────────────────────────
  const profile    = profileResult.status      === 'fulfilled' ? profileResult.value.data        : null;
  const bio        = bioResult.status          === 'fulfilled' ? bioResult.value.data             : null;
  const weightLogs = weightLogsResult.status   === 'fulfilled' ? weightLogsResult.value.data      : null;
  const sessions28 = sessions28Result.status   === 'fulfilled' ? sessions28Result.value.data      : null;
  const activePlan = activePlanResult.status   === 'fulfilled' ? activePlanResult.value.data      : null;
  const progressions14d = progressions14dResult.status === 'fulfilled' ? progressions14dResult.value.data : null;
  const foodLogs14 = foodLogs14Result.status   === 'fulfilled' ? foodLogs14Result.value.data      : null;
  const cardio14   = cardio14Result.status     === 'fulfilled' ? cardio14Result.value.data        : null;
  const deloads    = deloadsResult.status      === 'fulfilled' ? deloadsResult.value.data         : null;
  const rawPlans   = workoutPlansResult.status === 'fulfilled' ? workoutPlansResult.value.data    : null;
  const rawLibrary = exerciseLibraryResult.status === 'fulfilled' ? exerciseLibraryResult.value.data : null;

  // ── V6.0: Normalize workout plans ─────────────────────────────────────────
  const workoutPlans: WorkoutPlanDetail[] = (rawPlans ?? []).map((plan: any) => ({
    id: plan.id,
    name: plan.name,
    goal: plan.goal,
    daysPerWeek: plan.days_per_week,
    isActive: plan.is_active,
    days: (plan.workout_days ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((day: any) => ({
        id: day.id,
        name: day.name,
        orderIndex: day.order_index,
        exercises: (day.workout_exercises ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((we: any) => ({
            exerciseId: we.exercise_id,
            exerciseName: we.exercises?.name ?? 'Desconhecido',
            muscleGroup: we.exercises?.muscle_group ?? '',
            equipment: we.exercises?.equipment ?? '',
            difficulty: we.exercises?.difficulty ?? 'intermediate',
            isCompound: we.exercises?.is_compound ?? false,
            isIsometric: we.exercises?.is_isometric ?? false,
            sets: we.sets,
            repsMin: we.reps_min,
            repsMax: we.reps_max,
            restSeconds: we.rest_seconds,
            notes: we.notes ?? '',
            orderIndex: we.order_index,
          })),
      })),
  }));

  // ── V6.0: Normalize exercise library ──────────────────────────────────────
  const exerciseLibrary: ExerciseInLibrary[] = (rawLibrary ?? []).map((ex: any) => ({
    id: ex.id,
    name: ex.name,
    muscleGroup: ex.muscle_group,
    equipment: ex.equipment,
    difficulty: ex.difficulty,
    isCompound: ex.is_compound,
    isMetabolic: ex.is_metabolic,
    isIsometric: ex.is_isometric ?? false,
  }));

  // ── Body Composition ──────────────────────────────────────────────────────
  const wLogs = weightLogs ?? [];
  const wLogs7d = wLogs.filter((l: any) => l.log_date >= format(d7, 'yyyy-MM-dd'));
  const currentWeight = wLogs[wLogs.length - 1]?.weight_kg ?? bio?.weight_kg ?? (profile as any)?.weight_kg ?? null;
  const weightTrend14d = wLogs.length >= 2
    ? parseFloat((wLogs[wLogs.length - 1].weight_kg - wLogs[0].weight_kg).toFixed(2))
    : null;
  const weightTrend7d = wLogs7d.length >= 2
    ? parseFloat((wLogs7d[wLogs7d.length - 1].weight_kg - wLogs7d[0].weight_kg).toFixed(2))
    : null;
  const tmb = bio?.basal_metabolic_rate_kcal ?? (currentWeight ? Math.round(currentWeight * ((profile as any)?.gender === 'female' ? 22 : 24)) : null);

  // ── Training ──────────────────────────────────────────────────────────────
  const allSessions = sessions28 ?? [];
  const thisWeekSessions = allSessions.filter((s: any) => new Date(s.started_at) >= weekStart);
  const prevWeekSessions = allSessions.filter((s: any) => new Date(s.started_at) >= prevWeekStart && new Date(s.started_at) < weekStart);
  const weekVol = thisWeekSessions.reduce((s: number, r: any) => s + (r.total_volume_kg ?? 0), 0);
  const prevVol = prevWeekSessions.reduce((s: number, r: any) => s + (r.total_volume_kg ?? 0), 0);
  const volDelta = prevVol > 0 ? parseFloat((((weekVol - prevVol) / prevVol) * 100).toFixed(1)) : null;
  const daysSinceLast = allSessions.length > 0
    ? differenceInDays(now, parseISO(allSessions[0].started_at))
    : 999;
  const daysPerWeekPlan = activePlan?.days_per_week ?? (profile as any)?.weekly_frequency ?? 3;
  const plannedLast28 = daysPerWeekPlan * 4;
  const adherenceTrain = Math.min(100, Math.round((allSessions.length / plannedLast28) * 100));

  // Streak
  let streak = 0;
  const sessionDays = new Set(allSessions.map((s: any) => s.started_at.slice(0, 10)));
  for (let i = 0; i < 28; i++) {
    const d = format(subDays(now, i), 'yyyy-MM-dd');
    if (sessionDays.has(d)) streak++;
    else if (i > 0) break;
  }

  // RIR avg + plateau
  const p14 = progressions14d ?? [];
  const avgRir = p14.length > 0
    ? parseFloat((p14.reduce((s: number, p: any) => s + (p.rir ?? 2), 0) / p14.length).toFixed(1))
    : null;
  const hasPrLast4Weeks = p14.some((p: any) => p.set_type === 'topset');
  const plateauWeight = Math.abs(weightTrend14d ?? 0) < 0.3 && wLogs.length >= 3;

  // Top exercises
  const exMap = new Map<string, number>();
  for (const p of p14) {
    if ((p as any).set_type === 'topset') {
      if (!exMap.has((p as any).exercise_id) || exMap.get((p as any).exercise_id)! < (p as any).weight_kg) {
        exMap.set((p as any).exercise_id, (p as any).weight_kg);
      }
    }
  }
  const topExercises = Array.from(exMap.entries()).slice(0, 3).map(([id, kg]) => ({ name: id, topSetKg: kg }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hrVals = (allSessions as any[]).map(x => Number(x?.avg_hr)).filter(x => Number.isFinite(x) && x > 0);
  const avgHrRecent = hrVals.length ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : null;

  // ── Nutrition ─────────────────────────────────────────────────────────────
  const food = foodLogs14 ?? [];
  const daysLogged = new Set(food.map((l: any) => l.logged_at)).size;
  const nutritionAdherence = Math.min(100, Math.round((daysLogged / 14) * 100));
  const avgCal = food.length > 0 ? Math.round(food.reduce((s: number, l: any) => s + (l.calories_kcal ?? 0), 0) / Math.max(daysLogged, 1)) : null;
  const avgProt = food.length > 0 ? Math.round(food.reduce((s: number, l: any) => s + (l.protein_g ?? 0), 0) / Math.max(daysLogged, 1)) : null;
  const targetProt = currentWeight ? Math.round(currentWeight * 2.0) : null;
  const tdeeEst = tmb ? estimateTdee(tmb, allSessions.length / 4, (cardio14 ?? []).reduce((s: number, c: any) => s + (c.distance_km ?? 0), 0) / 2) : null;
  const primaryGoal = (profile as any)?.main_goal ?? (profile as any)?.goal ?? 'hypertrophy';
  const _cut = primaryGoal === 'fat_loss' || primaryGoal === 'weight_loss';
  const _bulk = primaryGoal === 'hypertrophy' || primaryGoal === 'mass_gain' || primaryGoal === 'lean_bulk';
  const calorieAdj = _cut ? -500 : primaryGoal === 'definition' ? -450 : primaryGoal === 'recomposition' ? -150 : _bulk ? 300 : 0;
  const targetCal = (profile as any)?.calorie_target ?? (tdeeEst ? tdeeEst + calorieAdj : null);

  // ── Cardio ────────────────────────────────────────────────────────────────
  const cardioSessions = cardio14 ?? [];
  const cardio7d = cardioSessions.filter((s: any) => new Date(s.created_at) >= d7);
  const km7d = parseFloat(cardio7d.reduce((s: number, c: any) => s + (c.distance_km ?? 0), 0).toFixed(1));
  const km14d = parseFloat(cardioSessions.reduce((s: number, c: any) => s + (c.distance_km ?? 0), 0).toFixed(1));
  const cardioGoalKm = 20;
  const cardioAdherence = Math.min(100, Math.round((km7d / cardioGoalKm) * 100));
  const avgDurMin = cardioSessions.length > 0
    ? Math.round(cardioSessions.reduce((s: number, c: any) => s + (c.duration_min ?? 30), 0) / cardioSessions.length)
    : null;
  const cardioTrend = cardioSessions.length === 0 ? 'none'
    : km7d > km14d / 2 + 2 ? 'increasing'
    : km7d < km14d / 2 - 2 ? 'decreasing'
    : 'stable';

  // ── Recovery ──────────────────────────────────────────────────────────────
  let recoveryScore = 80;
  if (daysSinceLast === 0) recoveryScore = 60;
  else if (daysSinceLast === 1) recoveryScore = 90;
  else if (daysSinceLast >= 100) recoveryScore = 85;
  else if (daysSinceLast >= 4) recoveryScore = Math.max(40, 90 - (daysSinceLast - 1) * 8);
  if (avgRir !== null && avgRir < 1) recoveryScore = Math.max(40, recoveryScore - 15);
  const deloadRec = (!!deloads) || (allSessions.length > 12 && !hasPrLast4Weeks);

  // ── Scores ────────────────────────────────────────────────────────────────
  const consistencyScore = adherenceTrain;
  const effectiveDays = daysSinceLast >= 100 ? 0 : daysSinceLast;
  const progressionScore = hasPrLast4Weeks ? 85 : Math.max(20, 70 - effectiveDays * 3);
  const nutritionScore   = Math.max(20, nutritionAdherence);
  const cardioScore      = cardioAdherence;
  const overallScore     = Math.round(
    consistencyScore * 0.30 + progressionScore * 0.25 +
    nutritionScore * 0.20 + cardioScore * 0.15 + recoveryScore * 0.10
  );
  const league =
    overallScore >= 95 ? 'elite' : overallScore >= 85 ? 'diamante' :
    overallScore >= 75 ? 'platina' : overallScore >= 60 ? 'ouro' :
    overallScore >= 40 ? 'prata' : 'bronze';

  return {
    userId,
    profile: { name: (profile as any)?.name ?? 'Atleta', age: (profile as any)?.age ?? null },
    bodyComposition: {
      weightKg: currentWeight,
      bodyFatPct: bio?.body_fat_pct ?? null,
      muscleKg: bio?.skeletal_muscle_mass_kg ?? null,
      visceralLevel: bio?.visceral_fat_level ?? null,
      waterPct: bio?.water_pct ?? null,
      tmb,
      bmi: bio?.bmi ?? null,
      proteinPct: bio?.protein_pct ?? null,
      lastMeasuredAt: bio?.measured_at ?? null,
      weightTrend14d,
      weightTrend7d,
    },
    training: {
      sessionsLast28: allSessions.length,
      plannedSessionsLast28: plannedLast28,
      adherencePct: adherenceTrain,
      daysSinceLastWorkout: daysSinceLast,
      weeklyVolumeKg: parseFloat(weekVol.toFixed(1)),
      prevWeekVolumeKg: parseFloat(prevVol.toFixed(1)),
      volumeDeltaPct: volDelta,
      avgRir,
      hasPrLast4Weeks,
      plateauDetected: plateauWeight,
      streak,
      activePlanName: activePlan?.name ?? null,
      activePlanGoal: activePlan?.goal ?? null,
      daysPerWeek: daysPerWeekPlan,
      topExercises,
      avgHrRecent,
    },
    nutrition: {
      daysLoggedLast14: daysLogged,
      adherencePct: nutritionAdherence,
      avgCalories: avgCal,
      targetCalories: targetCal,
      avgProteinG: avgProt,
      targetProteinG: targetProt,
      proteinGapG: avgProt && targetProt ? avgProt - targetProt : null,
      carbsG: food.length > 0 ? Math.round(food.reduce((s: number, l: any) => s + (l.carbs_g ?? 0), 0) / Math.max(daysLogged, 1)) : null,
      fatG: food.length > 0 ? Math.round(food.reduce((s: number, l: any) => s + (l.fat_g ?? 0), 0) / Math.max(daysLogged, 1)) : null,
      tdee: tdeeEst,
      deficit: avgCal && tdeeEst ? avgCal - tdeeEst : null,
      weightChangePer14d: weightTrend14d,
      plateauCaloric: plateauWeight && (avgCal ?? 0) > (tdeeEst ?? 9999),
    },
    cardio: {
      sessionsLast14: cardioSessions.length,
      kmLast7d: km7d,
      kmLast14d: km14d,
      avgDurationMin: avgDurMin,
      avgIntensity: cardioSessions.length > 0 ? (cardioSessions[0].intensity ?? 'moderada') : null,
      goalKmWeekly: cardioGoalKm,
      adherencePct: cardioAdherence,
      trend: cardioTrend as CardioState['trend'],
    },
    recovery: {
      score: recoveryScore,
      daysSinceLastWorkout: daysSinceLast,
      avgRir,
      sleepSignal: avgRir !== null && avgRir < 1 ? 'low' : 'unknown',
      deloadRecommended: deloadRec,
    },
    goals: {
      primary: primaryGoal,
      aesthetic: (profile as any)?.aesthetic_goal ?? null,
      weakPoint: (profile as any)?.weak_point ?? null,
      targetWeightKg: (profile as any)?.target_weight_kg ?? null,
      experience: (profile as any)?.experience_level ?? 'beginner',
      daysPerWeek: daysPerWeekPlan,
      gender: (profile as any)?.gender ?? null,
    },
    scores: {
      overall: overallScore,
      training: progressionScore,
      nutrition: nutritionScore,
      cardio: cardioScore,
      recovery: recoveryScore,
      consistency: consistencyScore,
      progression: progressionScore,
      league,
    },
    workoutPlans,
    exerciseLibrary,
    computedAt: now.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  serializeAthleteContext — compact string para todos os agentes
// ─────────────────────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento',
  definition: 'Definição', strength: 'Força', recomposition: 'Recomposição',
  fat_loss: 'Emagrecimento', performance: 'Performance', health: 'Saúde',
};

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Peito', back: 'Costas', shoulders: 'Ombros',
  biceps: 'Bíceps', triceps: 'Tríceps', legs: 'Pernas',
  glutes: 'Glúteos', abs: 'Abdômen', calves: 'Panturrilha',
  forearms: 'Antebraço', full_body: 'Corpo Todo',
};

export function serializeAthleteContext(ctx: AthleteContext, options: SerializeOptions = {}): string {
  const b = ctx.bodyComposition;
  const t = ctx.training;
  const n = ctx.nutrition;
  const c = ctx.cardio;
  const r = ctx.recovery;
  const g = ctx.goals;
  const s = ctx.scores;

  const lines: (string | null)[] = [
    `=== ATLETA: ${ctx.profile.name} | Score EDN: ${s.overall}/100 (${s.league.toUpperCase()}) ===`,
    ``,
    `[COMPOSIÇÃO CORPORAL]`,
    b.weightKg ? `Peso: ${b.weightKg}kg${b.weightTrend14d !== null ? ` (14d: ${b.weightTrend14d > 0 ? '+' : ''}${b.weightTrend14d}kg)` : ''}` : null,
    b.bodyFatPct ? `Gordura corporal: ${b.bodyFatPct}%${b.bodyFatPct >= 28 ? ' (ALTA)' : b.bodyFatPct >= 20 ? ' (moderada)' : ' (normal)'}` : null,
    b.muscleKg ? `Músculo esquelético: ${b.muscleKg}kg` : null,
    b.tmb ? `TMB: ${b.tmb}kcal | TDEE estimado: ${n.tdee ?? '?'}kcal` : null,
    b.visceralLevel ? `Gordura visceral: nível ${b.visceralLevel}${b.visceralLevel >= 10 ? ' (ALTA — priorizar compostos)' : ''}` : null,
    b.bmi ? `IMC: ${b.bmi}${b.bmi >= 30 ? ' (obeso)' : b.bmi >= 25 ? ' (sobrepeso)' : ''}` : null,
    ``,
    `[TREINO]`,
    `Sessões 28d: ${t.sessionsLast28}/${t.plannedSessionsLast28} (${t.adherencePct}% aderência)`,
    `Último treino: ${t.daysSinceLastWorkout === 0 ? 'hoje' : t.daysSinceLastWorkout >= 100 ? 'nunca (primeiro treino — novo usuário)' : 'há ' + t.daysSinceLastWorkout + ' dia(s)'}`,
    `Volume semana: ${t.weeklyVolumeKg}kg | semana anterior: ${t.prevWeekVolumeKg}kg${t.volumeDeltaPct !== null ? ` (${t.volumeDeltaPct > 0 ? '+' : ''}${t.volumeDeltaPct}%)` : ''}`,
    t.avgRir !== null ? `RIR médio: ${t.avgRir} ${t.avgRir < 1 ? '(MUITO PRÓXIMO DA FALHA)' : ''}` : null,
    t.avgHrRecent !== null ? `FC média recente (relógio): ${t.avgHrRecent} bpm` : null,
    t.plateauDetected ? `⚠️ PLATÔ DE PESO DETECTADO (14d sem variação significativa)` : null,
    t.activePlanName ? `Plano ativo: ${t.activePlanName} (${GOAL_LABELS[t.activePlanGoal ?? ''] ?? t.activePlanGoal ?? ''}, ${t.daysPerWeek}x/sem)` : null,
    ``,
    `[NUTRIÇÃO]`,
    `Registro alimentar: ${n.daysLoggedLast14}/14 dias (${n.adherencePct}%)`,
    n.avgCalories ? `Calorias médias: ${n.avgCalories}kcal | Meta: ${n.targetCalories ?? '?'}kcal | Déficit: ${n.deficit !== null ? (n.deficit < 0 ? n.deficit : '+' + n.deficit) + 'kcal' : '?'}` : 'Sem dados de calorias registrados',
    n.avgProteinG ? `Proteína média: ${n.avgProteinG}g | Meta: ${n.targetProteinG ?? '?'}g${n.proteinGapG !== null && n.proteinGapG < -15 ? ' ⚠️ ABAIXO DA META' : ''}` : 'Sem dados de proteína registrados',
    n.plateauCaloric ? `⚠️ PLATÔ CALÓRICO: peso estável mesmo com déficit adequado` : null,
    ``,
    `[CÁRDIO]`,
    `Sessões 14d: ${c.sessionsLast14} | km 7d: ${c.kmLast7d} | km 14d: ${c.kmLast14d}`,
    `Meta semanal: ${c.goalKmWeekly}km (${c.adherencePct}%) | Tendência: ${c.trend}`,
    ``,
    `[RECUPERAÇÃO]`,
    `Score: ${r.score}/100 | Deload recomendado: ${r.deloadRecommended ? 'SIM' : 'não'}`,
    ``,
    `[OBJETIVOS]`,
    `Principal: ${GOAL_LABELS[g.primary] ?? g.primary}`,
    g.aesthetic ? `Estético: ${g.aesthetic}` : null,
    g.weakPoint ? `Ponto fraco prioritário: ${g.weakPoint}` : null,
    g.targetWeightKg ? `Meta de peso: ${g.targetWeightKg}kg` : null,
    `Experiência: ${g.experience} | ${g.daysPerWeek}x/semana | Gênero: ${g.gender ?? 'não informado'}`,
    ``,
    `[SCORES EDN 360°]`,
    `Consistência: ${s.consistency} | Progressão: ${s.progression} | Nutrição: ${s.nutrition} | Cárdio: ${s.cardio} | Recuperação: ${s.recovery}`,
    `SCORE GERAL: ${s.overall}/100 — Liga ${s.league.toUpperCase()}`,
  ];

  // ── V6.0: Planos de Treino completos ──────────────────────────────────────
  if (options.includeWorkoutPlans && ctx.workoutPlans.length > 0) {
    lines.push(``, `[PLANOS DE TREINO DO USUÁRIO — ${ctx.workoutPlans.length} plano(s)]`);
    lines.push(`INSTRUÇÃO: Use os IDs de exercício abaixo para referenciar substituições e modificações.`);

    for (const plan of ctx.workoutPlans) {
      lines.push(``, `▸ Plano: "${plan.name}"${plan.isActive ? ' [ATIVO]' : ''} | ${plan.daysPerWeek}x/sem | ${GOAL_LABELS[plan.goal] ?? plan.goal} | ID: ${plan.id}`);

      for (const day of plan.days) {
        const exCount = day.exercises.length;
        if (exCount === 0) {
          lines.push(`  ${day.name} | DAY_ID: ${day.id}: (sem exercícios cadastrados)`);
          continue;
        }
        lines.push(`  ${day.name} | DAY_ID: ${day.id}: ${exCount} exercício(s)`);
        for (const ex of day.exercises) {
          const muscle = MUSCLE_LABELS[ex.muscleGroup] ?? ex.muscleGroup;
          const compound = ex.isCompound ? '★' : '○';
          lines.push(
            `    ${ex.orderIndex + 1}. [${ex.exerciseId}] ${ex.exerciseName} ` +
            `[${muscle} · ${ex.equipment}${ex.isCompound ? ' · composto' : ''}] ${compound} ` +
            ((ex as any).isIsometric ? `${ex.sets}×${ex.repsMin}-${ex.repsMax}s sustentação (ISOMÉTRICO — sem carga)` : `${ex.sets}×${ex.repsMin}-${ex.repsMax}rep ${ex.restSeconds}s descanso`) +
            (ex.notes ? ` | "${ex.notes}"` : '')
          );
        }
      }
    }
  }

  // ── V6.0: Biblioteca de exercícios para substituição ──────────────────────
  if (options.includeExerciseLibrary && ctx.exerciseLibrary.length > 0) {
    lines.push(``, `[BIBLIOTECA DE EXERCÍCIOS — ${ctx.exerciseLibrary.length} disponíveis para substituição]`);
    lines.push(`Formato: [ID] Nome (equipment, dificuldade) ★=composto [ISO=tempo]=isométrico (prescrever em segundos, sem carga)`);

    const byMuscle = new Map<string, ExerciseInLibrary[]>();
    for (const ex of ctx.exerciseLibrary) {
      if (!byMuscle.has(ex.muscleGroup)) byMuscle.set(ex.muscleGroup, []);
      byMuscle.get(ex.muscleGroup)!.push(ex);
    }

    for (const [muscle, exercises] of byMuscle) {
      const label = MUSCLE_LABELS[muscle] ?? muscle;
      const items = exercises.map(ex =>
        `[${ex.id}] ${ex.name} (${ex.equipment}, ${ex.difficulty})${ex.isCompound ? '★' : ''}${(ex as any).isIsometric ? ' [ISO=tempo]' : ''}`
      ).join(' | ');
      lines.push(`${label.toUpperCase()}: ${items}`);
    }
  }

  return (lines.filter(l => l !== null) as string[]).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cache (TTL 20min)
// ─────────────────────────────────────────────────────────────────────────────
const ctxCache = new Map<string, { data: AthleteContext; exp: number }>();

export async function getCachedAthleteContext(userId: string, forceRefresh = false): Promise<AthleteContext> {
  const hit = ctxCache.get(userId);
  if (!forceRefresh && hit && Date.now() < hit.exp) return hit.data;
  const ctx = await buildAthleteContext(userId);
  ctxCache.set(userId, { data: ctx, exp: Date.now() + 20 * 60 * 1000 });
  return ctx;
}

export function invalidateAthleteContext(userId: string) {
  ctxCache.delete(userId);
}