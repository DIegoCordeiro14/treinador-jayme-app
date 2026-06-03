/**
 * EDN Athlete Engine — V4.0
 * Hub central de inteligência do atleta.
 * Consolida: perfil, bioimpedância, treinos, cardio, nutrição,
 * recuperação e gamificação em uma única visão.
 *
 * Consumido por: Dashboard, Coach EDN, Evolução, Nutrição, Cárdio.
 */

import { computeAthleteState, formatAthleteStateForAI, type AthleteState } from './performance-engine';
import { buildEdnBreakdown, type EdnScoreBreakdown } from './gamification';
import { computeProjections, type ProjectionResult } from './projections';
import { createClient } from '@/lib/supabase/server';

// ── Extended Athlete Intelligence ─────────────────────────────────────────────
export interface AthleteIntelligence {
  state: AthleteState;
  score360: EdnScoreBreakdown;
  projections: ProjectionResult | null;
  briefing: DailyBriefing;
  plateauAnalysis: PlateauAnalysis;
  nextWorkoutRecommendation: string | null;
  aiContext: string; // formatted string for AI consumption
}

export interface DailyBriefing {
  greeting: string;           // "Bom dia, Diego."
  highlights: string[];       // até 3 highlights dinâmicos
  todayFocus: string;         // "Seu próximo treino recomendado é Costas + Bíceps"
  alert: string | null;       // warning urgente (platô, deload, etc.)
}

export interface PlateauAnalysis {
  weightPlateau: { detected: boolean; days: number; deltaKg: number | null };
  strengthPlateau: { detected: boolean; exercisesStagnant: number };
  volumePlateau: { detected: boolean; weeklyVolumeDelta: number | null };
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  recommendation: string | null;
}

// ── Time helpers ───────────────────────────────────────────────────────────────
function greeting(name: string): string {
  const h = new Date().getHours();
  const period = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return `${period}, ${name}.`;
}

// ── Plateau analysis (granular) ───────────────────────────────────────────────
async function analyzePlateau(userId: string, supabase: ReturnType<typeof createClient>): Promise<PlateauAnalysis> {
  const since60d = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const since14d = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  const [{ data: weights }, { data: sessions }] = await Promise.all([
    supabase
      .from('body_measurements')
      .select('date, weight_kg')
      .eq('user_id', userId)
      .gte('date', since60d)
      .order('date', { ascending: true }),
    supabase
      .from('workout_sessions')
      .select('started_at, total_volume_kg')
      .eq('user_id', userId)
      .gte('started_at', since60d)
      .order('started_at', { ascending: true }),
  ]);

  // Weight plateau: max variation in last 14d < 0.5kg
  const recent14dWeights = (weights ?? []).filter(w => w.date >= since14d && w.weight_kg != null);
  let weightDelta: number | null = null;
  let weightPlateauDays = 0;
  if (recent14dWeights.length >= 2) {
    const first = recent14dWeights[0].weight_kg!;
    const last  = recent14dWeights[recent14dWeights.length - 1].weight_kg!;
    weightDelta = parseFloat((last - first).toFixed(2));
    if (Math.abs(weightDelta) < 0.5) {
      weightPlateauDays = Math.round(
        (new Date(recent14dWeights[recent14dWeights.length - 1].date).getTime() -
         new Date(recent14dWeights[0].date).getTime()) / 86400000
      );
    }
  }
  const weightPlateau = { detected: weightPlateauDays >= 10, days: weightPlateauDays, deltaKg: weightDelta };

  // Volume plateau: compare last 2 weeks volume
  const now = Date.now();
  const week1Sessions = (sessions ?? []).filter(s => {
    const t = new Date(s.started_at).getTime();
    return t >= now - 14 * 86400000 && t < now - 7 * 86400000;
  });
  const week2Sessions = (sessions ?? []).filter(s =>
    new Date(s.started_at).getTime() >= now - 7 * 86400000
  );
  const vol1 = week1Sessions.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0);
  const vol2 = week2Sessions.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0);
  const volDelta = vol1 > 0 ? parseFloat((((vol2 - vol1) / vol1) * 100).toFixed(1)) : null;
  const volumePlateau = { detected: volDelta !== null && Math.abs(volDelta) < 3 && vol1 > 0, weeklyVolumeDelta: volDelta };

  // Strength plateau: count exercises with no load increase in 14d
  const { data: progressions } = await supabase
    .from('progressions')
    .select('exercise_id, weight_kg, recorded_at')
    .eq('user_id', userId)
    .gte('recorded_at', since14d)
    .eq('set_type', 'topset')
    .order('recorded_at', { ascending: true });

  let stagnantExercises = 0;
  if (progressions && progressions.length > 0) {
    const byExercise = new Map<string, number[]>();
    for (const p of progressions) {
      const list = byExercise.get(p.exercise_id) ?? [];
      list.push(p.weight_kg);
      byExercise.set(p.exercise_id, list);
    }
    for (const [, loads] of byExercise) {
      if (loads.length >= 2 && Math.max(...loads) - Math.min(...loads) < 2.5) stagnantExercises++;
    }
  }
  const strengthPlateau = { detected: stagnantExercises >= 2, exercisesStagnant: stagnantExercises };

  // Overall severity
  const flags = [weightPlateau.detected, strengthPlateau.detected, volumePlateau.detected].filter(Boolean).length;
  const severity: PlateauAnalysis['severity'] =
    flags === 0 ? 'none' :
    flags === 1 ? 'mild' :
    flags === 2 ? 'moderate' : 'severe';

  let recommendation: string | null = null;
  if (severity === 'severe') {
    recommendation = 'Platô múltiplo detectado. Recomendado: deload de 5-7 dias + refeed calórico + revisão de macros.';
  } else if (weightPlateau.detected) {
    recommendation = `Peso estável há ${weightPlateauDays} dias. Reduza 100-150kcal ou adicione 1 sessão de cárdio Zona 2.`;
  } else if (strengthPlateau.detected) {
    recommendation = `${stagnantExercises} exercícios sem progressão de carga. Aplique deload de volume (50%) esta semana.`;
  } else if (volumePlateau.detected) {
    recommendation = 'Volume de treino estagnado. Adicione 1 série por exercício composto esta semana.';
  }

  return { weightPlateau, strengthPlateau, volumePlateau, severity, recommendation };
}

// ── Daily briefing generator ──────────────────────────────────────────────────
function buildBriefing(params: {
  name: string;
  state: AthleteState;
  plateau: PlateauAnalysis;
  nextDayName: string | null;
  weightTrend: number | null;
}): DailyBriefing {
  const { name, state, plateau, nextDayName, weightTrend } = params;
  const r = state.raw;

  const highlights: string[] = [];

  // Streak / days without workout
  if (r.days_since_last_workout === 0) {
    highlights.push('Você já treinou hoje. Foco na recuperação e hidratação.');
  } else if (r.days_since_last_workout === 1) {
    highlights.push(`Último treino: ontem. Você está no ritmo certo.`);
  } else if (r.days_since_last_workout >= 3) {
    highlights.push(`Você está há ${r.days_since_last_workout} dias sem treinar. Hora de retomar.`);
  }

  // Deficit / weight trend
  if (weightTrend !== null) {
    if (weightTrend < -0.3) {
      highlights.push(`Seu peso caiu ${Math.abs(weightTrend).toFixed(1)}kg nos últimos 14 dias. Déficit adequado.`);
    } else if (weightTrend > 0.3) {
      highlights.push(`Seu peso subiu ${weightTrend.toFixed(1)}kg nos últimos 14 dias.`);
    } else {
      highlights.push('Seu peso está estável nos últimos 14 dias.');
    }
  }

  // Score highlight
  if (state.edn_score >= 80) {
    highlights.push(`Score EDN ${state.edn_score}/100 — excelente consistência esta semana.`);
  } else if (state.edn_score < 50) {
    const weakest = Object.entries({
      Consistência: state.raw.sessions_last_28,
      Nutrição: 100 - state.raw.protein_days_below_target * 15,
      Cárdio: state.cardio_load,
    }).sort((a, b) => a[1] - b[1])[0][0];
    highlights.push(`O fator que mais limita seu Score EDN (${state.edn_score}/100) é: ${weakest}.`);
  }

  // Today focus
  const todayFocus = nextDayName
    ? `Seu próximo treino recomendado é ${nextDayName}.`
    : 'Hoje é dia de descanso ativo — mobilidade e caminhada.';

  // Alert
  let alert: string | null = null;
  if (plateau.severity === 'severe') {
    alert = 'Platô múltiplo detectado. Veja as recomendações em Evolução.';
  } else if (r.days_since_last_workout >= 5) {
    alert = 'Mais de 5 dias sem treinar — cada dia conta para a progressão.';
  }

  return {
    greeting: greeting(name?.split(' ')[0] ?? 'atleta'),
    highlights: highlights.slice(0, 3),
    todayFocus,
    alert,
  };
}

// ── Main export: computeAthleteIntelligence ───────────────────────────────────
export async function computeAthleteIntelligence(userId: string): Promise<AthleteIntelligence> {
  const supabase = createClient();

  // Run in parallel
  const [state, measurements, nextDay] = await Promise.all([
    computeAthleteState(userId),
    supabase
      .from('body_measurements')
      .select('date, weight_kg, body_fat_pct')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(60)
      .then(r => (r.data ?? []).reverse()),
    supabase
      .from('profiles')
      .select('name, weekly_frequency')
      .eq('id', userId)
      .single()
      .then(r => r.data),
  ]);

  const [plateau] = await Promise.all([
    analyzePlateau(userId, supabase),
  ]);

  // EDN Score 360°
  const score360 = buildEdnBreakdown(
    Math.min(100, Math.round((state.raw.sessions_last_28 / Math.max(1, state.raw.planned_sessions_last_28)) * 100)),
    state.progression_score,
    state.nutrition_adherence,
    state.cardio_load,
    state.recovery_score,
  );

  // Projections
  const projections = computeProjections({
    measurements: measurements as any,
    currentBodyFat: state.raw.body_fat_current,
    currentMuscle: state.raw.muscle_current,
    sessionsLast28: state.raw.sessions_last_28,
    plannedSessionsLast28: state.raw.planned_sessions_last_28,
  });

  // Next workout name (simplified: day of week vs plan)
  const nextWorkoutRecommendation: string | null = null; // would need plan data

  // Daily briefing
  const briefing = buildBriefing({
    name: nextDay?.name ?? 'atleta',
    state,
    plateau,
    nextDayName: nextWorkoutRecommendation,
    weightTrend: state.raw.weight_trend_14d,
  });

  // AI context
  const aiContext = [
    formatAthleteStateForAI(state),
    plateau.severity !== 'none' ? `Platô: ${plateau.severity} (${[
      plateau.weightPlateau.detected && `peso estável ${plateau.weightPlateau.days}d`,
      plateau.strengthPlateau.detected && `${plateau.strengthPlateau.exercisesStagnant} exerc. sem progressão`,
      plateau.volumePlateau.detected && `volume estagnado`,
    ].filter(Boolean).join(', ')})` : null,
    projections ? `Projeção 30d: ${projections.projections[0]?.weightKg ?? '?'}kg | Tendência: ${projections.insight}` : null,
  ].filter(Boolean).join('\n');

  return {
    state,
    score360,
    projections,
    briefing,
    plateauAnalysis: plateau,
    nextWorkoutRecommendation,
    aiContext,
  };
}
