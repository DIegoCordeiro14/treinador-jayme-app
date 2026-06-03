/**
 * EDN Athlete Context — V5.0
 * Única fonte de verdade. Nenhum agente consulta tabelas diretamente.
 * Todos os módulos consomem AthleteContext ou sua serialização.
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
  weightTrend14d: number | null; // kg, negative = losing
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
}

export interface NutritionState {
  daysLoggedLast14: number;
  adherencePct: number;
  avgCalories: number | null;
  targetCalories: number | null;
  avgProteinG: number | null;
  targetProteinG: number | null;
  proteinGapG: number | null; // negative = below target
  carbsG: number | null;
  fatG: number | null;
  tdee: number | null;
  deficit: number | null; // negative = deficit
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
  score: number; // 0-100
  daysSinceLastWorkout: number;
  avgRir: number | null;
  sleepSignal: 'ok' | 'low' | 'unknown'; // derived from RIR patterns
  deloadRecommended: boolean;
}

export interface GoalState {
  primary: string; // hypertrophy | weight_loss | definition | strength | recomposition
  aesthetic: string | null; // peitoral | costas | glúteos, etc.
  weakPoint: string | null;
  targetWeightKg: number | null;
  experience: string; // beginner | intermediate | advanced
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
  computedAt: string;
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

  // ── Parallel fetch of ALL data ──────────────────────────────────────────────
  const [
    { data: profile },
    { data: bio },
    { data: weightLogs },
    { data: sessions28 },
    { data: activePlan },
    { data: progressions14d },
    { data: foodLogs14 },
    { data: cardio14 },
    { data: deloads },
  ] = await Promise.all([
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
      .select('id, started_at, total_volume_kg')
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
  ]);

  // ── Body Composition ─────────────────────────────────────────────────────────
  const wLogs = weightLogs ?? [];
  const wLogs7d = wLogs.filter(l => l.log_date >= format(d7, 'yyyy-MM-dd'));
  const currentWeight = wLogs[wLogs.length - 1]?.weight_kg ?? bio?.weight_kg ?? (profile as any)?.weight_kg ?? null;
  const weightTrend14d = wLogs.length >= 2
    ? parseFloat((wLogs[wLogs.length - 1].weight_kg - wLogs[0].weight_kg).toFixed(2))
    : null;
  const weightTrend7d = wLogs7d.length >= 2
    ? parseFloat((wLogs7d[wLogs7d.length - 1].weight_kg - wLogs7d[0].weight_kg).toFixed(2))
    : null;
  const tmb = bio?.basal_metabolic_rate_kcal ?? (currentWeight ? Math.round(currentWeight * ((profile as any)?.gender === 'female' ? 22 : 24)) : null);

  // ── Training ─────────────────────────────────────────────────────────────────
  const allSessions = sessions28 ?? [];
  const thisWeekSessions = allSessions.filter(s => new Date(s.started_at) >= weekStart);
  const prevWeekSessions = allSessions.filter(s => new Date(s.started_at) >= prevWeekStart && new Date(s.started_at) < weekStart);
  const weekVol = thisWeekSessions.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0);
  const prevVol = prevWeekSessions.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0);
  const volDelta = prevVol > 0 ? parseFloat((((weekVol - prevVol) / prevVol) * 100).toFixed(1)) : null;
  const daysSinceLast = allSessions.length > 0
    ? differenceInDays(now, parseISO(allSessions[0].started_at))
    : 999;
  const daysPerWeekPlan = activePlan?.days_per_week ?? (profile as any)?.weekly_frequency ?? 3;
  const plannedLast28 = daysPerWeekPlan * 4;
  const adherenceTrain = Math.min(100, Math.round((allSessions.length / plannedLast28) * 100));

  // Streak
  let streak = 0;
  const sessionDays = new Set(allSessions.map(s => s.started_at.slice(0, 10)));
  for (let i = 0; i < 28; i++) {
    const d = format(subDays(now, i), 'yyyy-MM-dd');
    if (sessionDays.has(d)) streak++;
    else if (i > 0) break;
  }

  // RIR avg + plateau
  const p14 = progressions14d ?? [];
  const avgRir = p14.length > 0
    ? parseFloat((p14.reduce((s, p) => s + (p.rir ?? 2), 0) / p14.length).toFixed(1))
    : null;
  const topSets28d = allSessions.slice(0, 4).flatMap(() => []); // simplified
  const hasPrLast4Weeks = p14.some(p => p.set_type === 'topset');
  const plateauWeight = Math.abs(weightTrend14d ?? 0) < 0.3 && wLogs.length >= 3;

  // Top exercises
  const exMap = new Map<string, number>();
  for (const p of p14) {
    if (p.set_type === 'topset') {
      if (!exMap.has(p.exercise_id) || exMap.get(p.exercise_id)! < p.weight_kg) {
        exMap.set(p.exercise_id, p.weight_kg);
      }
    }
  }
  const topExercises = Array.from(exMap.entries()).slice(0, 3).map(([id, kg]) => ({ name: id, topSetKg: kg }));

  // ── Nutrition ─────────────────────────────────────────────────────────────────
  const food = foodLogs14 ?? [];
  const daysLogged = new Set(food.map(l => l.logged_at)).size;
  const nutritionAdherence = Math.min(100, Math.round((daysLogged / 14) * 100));
  const avgCal = food.length > 0 ? Math.round(food.reduce((s, l) => s + (l.calories_kcal ?? 0), 0) / Math.max(daysLogged, 1)) : null;
  const avgProt = food.length > 0 ? Math.round(food.reduce((s, l) => s + (l.protein_g ?? 0), 0) / Math.max(daysLogged, 1)) : null;
  const targetProt = currentWeight ? Math.round(currentWeight * 2.0) : null;
  const tdeeEst = tmb ? estimateTdee(tmb, allSessions.length / 4, (cardio14 ?? []).reduce((s, c) => s + (c.distance_km ?? 0), 0) / 2) : null;
  const primaryGoal = (profile as any)?.main_goal ?? (profile as any)?.goal ?? 'hypertrophy';
  const calorieAdj = primaryGoal === 'weight_loss' ? -500 : primaryGoal === 'definition' ? -250 : primaryGoal === 'hypertrophy' ? 300 : 0;
  const targetCal = (profile as any)?.calorie_target ?? (tdeeEst ? tdeeEst + calorieAdj : null);

  // ── Cardio ────────────────────────────────────────────────────────────────────
  const cardioSessions = cardio14 ?? [];
  const cardio7d = cardioSessions.filter(s => new Date(s.created_at) >= d7);
  const km7d = parseFloat(cardio7d.reduce((s, c) => s + (c.distance_km ?? 0), 0).toFixed(1));
  const km14d = parseFloat(cardioSessions.reduce((s, c) => s + (c.distance_km ?? 0), 0).toFixed(1));
  const cardioGoalKm = 20;
  const cardioAdherence = Math.min(100, Math.round((km7d / cardioGoalKm) * 100));
  const avgDurMin = cardioSessions.length > 0
    ? Math.round(cardioSessions.reduce((s, c) => s + (c.duration_min ?? 30), 0) / cardioSessions.length)
    : null;
  const cardioTrend = cardioSessions.length === 0 ? 'none'
    : km7d > km14d / 2 + 2 ? 'increasing'
    : km7d < km14d / 2 - 2 ? 'decreasing'
    : 'stable';

  // ── Recovery ──────────────────────────────────────────────────────────────────
  let recoveryScore = 80;
  if (daysSinceLast === 0) recoveryScore = 60;
  else if (daysSinceLast === 1) recoveryScore = 90;
  else if (daysSinceLast >= 4) recoveryScore = Math.max(40, 90 - (daysSinceLast - 1) * 8);
  if (avgRir !== null && avgRir < 1) recoveryScore = Math.max(40, recoveryScore - 15);
  const deloadRec = (!!deloads) || (allSessions.length > 12 && !hasPrLast4Weeks);

  // ── Scores ───────────────────────────────────────────────────────────────────
  const consistencyScore = adherenceTrain;
  const progressionScore = hasPrLast4Weeks ? 85 : Math.max(20, 70 - daysSinceLast * 3);
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
    },
    nutrition: {
      daysLoggedLast14: daysLogged,
      adherencePct: nutritionAdherence,
      avgCalories: avgCal,
      targetCalories: targetCal,
      avgProteinG: avgProt,
      targetProteinG: targetProt,
      proteinGapG: avgProt && targetProt ? avgProt - targetProt : null,
      carbsG: food.length > 0 ? Math.round(food.reduce((s, l) => s + (l.carbs_g ?? 0), 0) / Math.max(daysLogged, 1)) : null,
      fatG: food.length > 0 ? Math.round(food.reduce((s, l) => s + (l.fat_g ?? 0), 0) / Math.max(daysLogged, 1)) : null,
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
    computedAt: now.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  serializeAthleteContext — compact string for all agents
// ─────────────────────────────────────────────────────────────────────────────
export function serializeAthleteContext(ctx: AthleteContext): string {
  const b = ctx.bodyComposition;
  const t = ctx.training;
  const n = ctx.nutrition;
  const c = ctx.cardio;
  const r = ctx.recovery;
  const g = ctx.goals;
  const s = ctx.scores;

  const goalMap: Record<string, string> = {
    hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento',
    definition: 'Definição', strength: 'Força', recomposition: 'Recomposição',
  };

  const lines = [
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
    `Último treino: há ${t.daysSinceLastWorkout === 0 ? 'hoje' : t.daysSinceLastWorkout + ' dia(s)'}`,
    `Volume semana: ${t.weeklyVolumeKg}kg | semana anterior: ${t.prevWeekVolumeKg}kg${t.volumeDeltaPct !== null ? ` (${t.volumeDeltaPct > 0 ? '+' : ''}${t.volumeDeltaPct}%)` : ''}`,
    t.avgRir !== null ? `RIR médio: ${t.avgRir} ${t.avgRir < 1 ? '(MUITO PRÓXIMO DA FALHA)' : ''}` : null,
    t.plateauDetected ? `⚠️ PLATÔ DE PESO DETECTADO (14d sem variação significativa)` : null,
    t.activePlanName ? `Plano ativo: ${t.activePlanName} (${goalMap[t.activePlanGoal ?? ''] ?? t.activePlanGoal ?? ''}, ${t.daysPerWeek}x/sem)` : null,
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
    `Principal: ${goalMap[g.primary] ?? g.primary}`,
    g.aesthetic ? `Estético: ${g.aesthetic}` : null,
    g.weakPoint ? `Ponto fraco prioritário: ${g.weakPoint}` : null,
    g.targetWeightKg ? `Meta de peso: ${g.targetWeightKg}kg` : null,
    `Experiência: ${g.experience} | ${g.daysPerWeek}x/semana | Gênero: ${g.gender ?? 'não informado'}`,
    ``,
    `[SCORES EDN 360°]`,
    `Consistência: ${s.consistency} | Progressão: ${s.progression} | Nutrição: ${s.nutrition} | Cárdio: ${s.cardio} | Recuperação: ${s.recovery}`,
    `SCORE GERAL: ${s.overall}/100 — Liga ${s.league.toUpperCase()}`,
  ].filter(Boolean) as string[];

  return lines.join('\n');
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
