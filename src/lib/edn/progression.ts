/**
 * EDN Progression Engine
 * Based on Jayme De Lamadrid's Escola dos Naturais methodology
 */

export type ProgressionModel = 'linear' | 'volume' | 'reps' | 'density' | 'isometric';
export type SetType = 'warmup' | 'feeder' | 'topset' | 'backoff';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface SetRecord {
  weight_kg: number;
  reps: number;
  rir: number;
  set_type: SetType;
  recorded_at: string;
}

export interface ProgressionRecord {
  exercise_id: string;
  sets: SetRecord[];
  session_date: string;
}

export interface ProgressionSuggestion {
  model: ProgressionModel;
  current_weight: number;
  suggested_weight: number;
  current_reps: number;
  suggested_reps: number;
  current_rir: number;
  suggested_rir: number;
  notes: string;
}

export interface StagnationAnalysis {
  is_stagnated: boolean;
  microcycles_without_progress: number;
  last_progression_date: string | null;
  recommendation: 'deload' | 'change_model' | 'check_nutrition' | 'continue';
  message: string;
}

export interface DeloadRecommendation {
  should_deload: boolean;
  type: 'load_reduction' | 'volume_reduction';
  reduction_pct: number;
  reason: string;
  duration_weeks: number;
}

// ============================================================
// PROGRESSION MODELS
// ============================================================

/**
 * Linear Progression: volume drops as load increases each session
 * Ideal for compound movements and beginners/intermediates
 */
export function linearProgression(
  currentWeight: number,
  currentSets: number,
  targetSets: number,
  incrementKg: number = 2.5
): ProgressionSuggestion {
  const isAtMinSets = currentSets <= Math.ceil(targetSets * 0.6);
  const suggestedWeight = isAtMinSets
    ? currentWeight // reset to base sets with same weight
    : currentWeight;
  const suggestedSets = isAtMinSets
    ? targetSets // back to full sets
    : currentSets - 1; // drop 1 set (linear reduction)

  return {
    model: 'linear',
    current_weight: currentWeight,
    suggested_weight: isAtMinSets ? currentWeight + incrementKg : currentWeight,
    current_reps: 0,
    suggested_reps: 0,
    current_rir: 2,
    suggested_rir: 2,
    notes: isAtMinSets
      ? `Novo ciclo: aumente ${incrementKg}kg e retorne para ${targetSets} séries`
      : `Continue reduzindo séries (${suggestedSets} séries com mesma carga)`,
  };
}

/**
 * Volume Progression: load stays constant, sets increase over time
 */
export function volumeProgression(
  currentWeight: number,
  currentSets: number,
  maxSets: number,
  minSets: number,
  incrementKg: number = 2.5
): ProgressionSuggestion {
  const isAtMax = currentSets >= maxSets;

  return {
    model: 'volume',
    current_weight: currentWeight,
    suggested_weight: isAtMax ? currentWeight + incrementKg : currentWeight,
    current_reps: 0,
    suggested_reps: 0,
    current_rir: 2,
    suggested_rir: 2,
    notes: isAtMax
      ? `Ciclo completo! Aumente ${incrementKg}kg e recomece com ${minSets} séries`
      : `Adicione 1 série (${currentSets + 1} séries com ${currentWeight}kg)`,
  };
}

/**
 * Double Progression (Reps): same load, progress reps to 15, then increase load
 * Ideal for isolation/monoarticular movements
 */
export function doubleProgressionReps(
  currentWeight: number,
  currentReps: number,
  targetMaxReps: number = 15,
  targetMinReps: number = 10,
  incrementKg: number = 2.5
): ProgressionSuggestion {
  const isAtMax = currentReps >= targetMaxReps;

  return {
    model: 'reps',
    current_weight: currentWeight,
    suggested_weight: isAtMax ? currentWeight + incrementKg : currentWeight,
    current_reps: currentReps,
    suggested_reps: isAtMax ? targetMinReps : currentReps + 1,
    current_rir: 2,
    suggested_rir: 2,
    notes: isAtMax
      ? `Chegou em ${targetMaxReps} reps! Suba ${incrementKg}kg e comece com ${targetMinReps} reps`
      : `Tente fazer ${currentReps + 1} reps com ${currentWeight}kg`,
  };
}

/**
 * Density Progression: reduce rest time progressively
 * Use as last resort — shorter rest increases fatigue
 */
export function densityProgression(
  currentWeight: number,
  currentRestSeconds: number,
  minRestSeconds: number = 60
): ProgressionSuggestion {
  const newRest = Math.max(minRestSeconds, currentRestSeconds - 10);

  return {
    model: 'density',
    current_weight: currentWeight,
    suggested_weight: currentWeight,
    current_reps: 0,
    suggested_reps: 0,
    current_rir: 2,
    suggested_rir: 2,
    notes: newRest <= minRestSeconds
      ? `Descanso mínimo atingido (${minRestSeconds}s). Hora de aumentar a carga.`
      : `Reduza o descanso para ${newRest}s (de ${currentRestSeconds}s)`,
  };
}

// ============================================================
// STAGNATION DETECTION
// ============================================================

/**
 * EDN Stagnation Rule: no load/rep increase for 2+ microcycles = stagnated
 */
export function detectStagnation(
  records: ProgressionRecord[],
  microcycleThreshold: number = 2
): StagnationAnalysis {
  if (records.length < 2) {
    return {
      is_stagnated: false,
      microcycles_without_progress: 0,
      last_progression_date: null,
      recommendation: 'continue',
      message: 'Dados insuficientes para análise de progressão.',
    };
  }

  // Sort by date descending
  const sorted = [...records].sort(
    (a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime()
  );

  // Extract top sets only
  const topSets = sorted.map((r) => {
    const tops = r.sets.filter((s) => s.set_type === 'topset');
    if (tops.length === 0) return null;
    return {
      date: r.session_date,
      weight: Math.max(...tops.map((s) => s.weight_kg)),
      reps: Math.max(...tops.map((s) => s.reps)),
      volume: tops.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
    };
  }).filter(Boolean) as { date: string; weight: number; reps: number; volume: number }[];

  if (topSets.length < 2) {
    return {
      is_stagnated: false,
      microcycles_without_progress: 0,
      last_progression_date: null,
      recommendation: 'continue',
      message: 'Poucas sessões com Top Set registradas.',
    };
  }

  // Check for progression in each consecutive pair
  let microcyclesWithoutProgress = 0;
  let lastProgressDate: string | null = null;

  for (let i = 0; i < topSets.length - 1; i++) {
    const current = topSets[i];
    const previous = topSets[i + 1];

    const hadProgress =
      current.weight > previous.weight ||
      (current.weight === previous.weight && current.reps > previous.reps) ||
      current.volume > previous.volume;

    if (hadProgress) {
      lastProgressDate = current.date;
      break;
    } else {
      microcyclesWithoutProgress++;
    }
  }

  const isStagnated = microcyclesWithoutProgress >= microcycleThreshold;

  let recommendation: StagnationAnalysis['recommendation'] = 'continue';
  let message = '';

  if (isStagnated) {
    if (microcyclesWithoutProgress >= 4) {
      recommendation = 'deload';
      message = `Estagnado há ${microcyclesWithoutProgress} microciclos. Deload recomendado antes de retomar a progressão.`;
    } else if (microcyclesWithoutProgress >= 3) {
      recommendation = 'check_nutrition';
      message = `Sem progressão por ${microcyclesWithoutProgress} semanas. Verifique se está em superávit e com proteína suficiente.`;
    } else {
      recommendation = 'change_model';
      message = `Progressão travada por ${microcyclesWithoutProgress} microciclos. Considere mudar o modelo de progressão.`;
    }
  } else {
    message = lastProgressDate
      ? `Última progressão em ${new Date(lastProgressDate).toLocaleDateString('pt-BR')}. Continue!`
      : 'Progredindo normalmente.';
  }

  return {
    is_stagnated: isStagnated,
    microcycles_without_progress: microcyclesWithoutProgress,
    last_progression_date: lastProgressDate,
    recommendation,
    message,
  };
}

// ============================================================
// DELOAD RECOMMENDATION
// ============================================================

/**
 * EDN Deload Protocol:
 * - Beginners: reduce load by 10%, maintain sets/reps
 * - Intermediate/Advanced: reduce volume by 50%, maintain load
 */
export function getDeloadRecommendation(
  level: ExperienceLevel,
  stagnationAnalysis: StagnationAnalysis,
  weeksSinceLastDeload: number = 999
): DeloadRecommendation {
  const DELOAD_INTERVAL_WEEKS = 8; // After every mesocycle

  const shouldDeload =
    stagnationAnalysis.recommendation === 'deload' ||
    weeksSinceLastDeload >= DELOAD_INTERVAL_WEEKS;

  if (!shouldDeload) {
    return {
      should_deload: false,
      type: 'load_reduction',
      reduction_pct: 0,
      reason: '',
      duration_weeks: 0,
    };
  }

  if (level === 'beginner') {
    return {
      should_deload: true,
      type: 'load_reduction',
      reduction_pct: 10,
      reason: stagnationAnalysis.is_stagnated
        ? 'Estagnação detectada — reduzir carga 10% por 1 semana'
        : 'Deload preventivo após mesociclo — reduzir carga 10%',
      duration_weeks: 1,
    };
  }

  return {
    should_deload: true,
    type: 'volume_reduction',
    reduction_pct: 50,
    reason: stagnationAnalysis.is_stagnated
      ? 'Estagnação detectada — reduzir volume 50% por 1 semana'
      : 'Deload preventivo pós-mesociclo — reduzir volume 50%',
    duration_weeks: 1,
  };
}

// ============================================================
// FATIGUE ANALYSIS
// ============================================================

export interface FatigueAnalysis {
  fatigue_score: number; // 0-100
  level: 'low' | 'moderate' | 'high' | 'critical';
  message: string;
  recommendations: string[];
}

export function analyzeFatigue(
  sessionsLast7Days: number,
  targetSessionsPerWeek: number,
  avgRirLast3Sessions: number,
  daysWithoutRest: number
): FatigueAnalysis {
  let score = 0;

  // Overtraining factor
  if (sessionsLast7Days > targetSessionsPerWeek) {
    score += (sessionsLast7Days - targetSessionsPerWeek) * 20;
  }

  // RIR drop (closer to failure = more fatigue accumulated)
  if (avgRirLast3Sessions <= 0) score += 40;
  else if (avgRirLast3Sessions <= 1) score += 25;
  else if (avgRirLast3Sessions <= 2) score += 10;

  // Consecutive days without rest
  if (daysWithoutRest >= 5) score += 30;
  else if (daysWithoutRest >= 3) score += 15;

  score = Math.min(100, score);

  let level: FatigueAnalysis['level'] = 'low';
  let message = '';
  const recommendations: string[] = [];

  if (score >= 75) {
    level = 'critical';
    message = 'Fadiga crítica — risco de lesão e overtraining.';
    recommendations.push('Tome 2-3 dias de descanso completo', 'Faça um deload na próxima semana', 'Priorize sono 7-9h');
  } else if (score >= 50) {
    level = 'high';
    message = 'Fadiga alta — desempenho comprometido.';
    recommendations.push('Adicione um dia de descanso', 'Reduza o volume em 20-30%', 'Verifique qualidade do sono');
  } else if (score >= 25) {
    level = 'moderate';
    message = 'Fadiga moderada — monitore a progressão.';
    recommendations.push('Mantenha os dias de descanso planejados', 'Não adicione volume extra');
  } else {
    level = 'low';
    message = 'Boa recuperação — continue o plano atual.';
  }

  return { fatigue_score: score, level, message, recommendations };
}

// ============================================================
// RIR UTILITIES
// ============================================================

export function getRIRLabel(rir: number): string {
  switch (rir) {
    case 0: return 'Falha (RIR 0)';
    case 1: return 'RIR 1 — 1 rep na reserva';
    case 2: return 'RIR 2 — 2 reps na reserva';
    case 3: return 'RIR 3 — 3 reps na reserva';
    case 4: return 'RIR 4+ — longe da falha';
    default: return `RIR ${rir}`;
  }
}

export function getRIRColor(rir: number): string {
  if (rir === 0) return 'text-red-400';
  if (rir === 1) return 'text-orange-400';
  if (rir === 2) return 'text-yellow-400';
  if (rir === 3) return 'text-green-400';
  return 'text-zinc-400';
}

// ============================================================
// RANKING SCORE (EDN Algorithm)
// 40% Consistency | 30% Progression | 20% Adherence | 10% Participation
// ============================================================

export interface RankingScoreInput {
  actualWorkouts: number;
  targetWorkouts: number;
  exercisesWithProgression: number;
  startedSessions: number;
  completedSessions: number;
  challengesJoined: number;
}

export function calculateRankingScore(input: RankingScoreInput): {
  total: number;
  consistency: number;
  progression: number;
  adherence: number;
  participation: number;
} {
  const consistency = Math.min(100, (input.actualWorkouts / Math.max(1, input.targetWorkouts)) * 100);
  const progression = Math.min(100, input.exercisesWithProgression * 20);
  const adherence = input.startedSessions > 0
    ? (input.completedSessions / input.startedSessions) * 100
    : 0;
  const participation = Math.min(100, input.challengesJoined * 25);

  const total =
    consistency * 0.40 +
    progression * 0.30 +
    adherence * 0.20 +
    participation * 0.10;

  return {
    total: Math.round(total * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    progression: Math.round(progression * 100) / 100,
    adherence: Math.round(adherence * 100) / 100,
    participation: Math.round(participation * 100) / 100,
  };
}

// XP Level calculation (sqrt formula)
export function xpToLevel(totalXp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(totalXp / 100)));
}

export function xpForNextLevel(currentLevel: number): number {
  return (currentLevel + 1) * (currentLevel + 1) * 100;
}

export function xpProgress(totalXp: number): { level: number; current: number; needed: number; pct: number } {
  const level = xpToLevel(totalXp);
  const currentLevelXp = level * level * 100;
  const nextLevelXp = xpForNextLevel(level);
  const current = totalXp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  return { level, current, needed, pct: Math.round((current / needed) * 100) };
}
