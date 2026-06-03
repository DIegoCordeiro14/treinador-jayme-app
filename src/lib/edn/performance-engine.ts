/**
 * Performance Engine — EDN V3
 * Motor central que cruza treino, nutrição, cárdio e evolução
 * para gerar o estado atual do atleta (AthleteState).
 *
 * Consumido por: Dashboard, IA, Nutrição, Evolução, Gamificação.
 */

import { createClient } from '@/lib/supabase/server';
import { subDays, differenceInDays, parseISO, startOfWeek } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Alert {
  type: 'danger' | 'warning' | 'info';
  category: 'nutrition' | 'training' | 'cardio' | 'recovery';
  message: string;
}

export interface AthleteState {
  // Scores 0–100
  recovery_score: number;
  progression_score: number;
  nutrition_adherence: number;
  cardio_load: number;
  edn_score: number;

  // Liga
  league: 'bronze' | 'prata' | 'ouro' | 'platina' | 'diamante' | 'elite';

  // Insights
  recommendations: string[];   // até 3 ações prioritárias
  alerts: Alert[];

  // Dados brutos para contexto da IA
  raw: {
    sessions_last_28: number;
    planned_sessions_last_28: number;
    has_pr_last_4_weeks: boolean;
    protein_days_below_target: number;
    cardio_km_this_week: number;
    cardio_goal_km: number;
    avg_rir: number | null;
    weight_trend_14d: number | null;   // kg, negativo = perda
    body_fat_current: number | null;
    muscle_current: number | null;
    plateau_detected: boolean;
    days_since_last_workout: number;
  };
}

// ── League helper ─────────────────────────────────────────────────────────────
function scoreToLeague(score: number): AthleteState['league'] {
  if (score >= 95) return 'elite';
  if (score >= 85) return 'diamante';
  if (score >= 75) return 'platina';
  if (score >= 60) return 'ouro';
  if (score >= 40) return 'prata';
  return 'bronze';
}

// ── Main engine ───────────────────────────────────────────────────────────────
export async function computeAthleteState(userId: string): Promise<AthleteState> {
  const supabase = createClient();
  const now = new Date();
  const d28 = subDays(now, 28);
  const d14 = subDays(now, 14);
  const d7  = subDays(now, 7);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [
    { data: sessions },
    { data: plan },
    { data: sessionSets },
    { data: personalRecords },
    { data: foodLogs },
    { data: cardioSessions },
    { data: bioList },
    { data: weightLogs },
  ] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id, started_at, total_volume_kg')
      .eq('user_id', userId)
      .gte('started_at', d28.toISOString())
      .order('started_at', { ascending: false }),
    supabase
      .from('workout_plans')
      .select('days_per_week')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('session_sets')
      .select('weight_kg, reps_done, rir, set_type, exercise_id')
      .in('session_id', []), // filled below after sessions
    supabase
      .from('personal_records')
      .select('achieved_at')
      .eq('user_id', userId)
      .gte('achieved_at', subDays(now, 28).toISOString())
      .limit(1),
    supabase
      .from('food_logs')
      .select('logged_at, protein_g, target_protein_g')
      .eq('user_id', userId)
      .gte('logged_at', d28.toISOString()),
    supabase
      .from('cardio_sessions')
      .select('distance_km, duration_min, intensity, performed_at, created_at')
      .eq('user_id', userId)
      .gte('created_at', weekStart.toISOString()),
    supabase
      .from('bioimpedance_data')
      .select('weight_kg, body_fat_pct, skeletal_muscle_mass_kg, measured_at')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(5),
    supabase
      .from('body_weight_logs')
      .select('weight_kg, log_date')
      .eq('user_id', userId)
      .gte('log_date', d14.toISOString())
      .order('log_date', { ascending: true }),
  ]);

  // ── 1. Consistency score (30%) ───────────────────────────────────────────
  const sessionsCount = sessions?.length ?? 0;
  const daysPerWeek   = plan?.days_per_week ?? 3;
  const plannedSessions = Math.round((daysPerWeek / 7) * 28);
  const consistencyPct = plannedSessions > 0
    ? Math.min(100, Math.round((sessionsCount / plannedSessions) * 100))
    : 50;

  // Days since last workout
  const lastSession = sessions?.[0];
  const daysSinceLastWorkout = lastSession
    ? differenceInDays(now, parseISO(lastSession.started_at))
    : 999;

  // ── 2. Progression score (25%) ───────────────────────────────────────────
  const hasPrLast4Weeks = (personalRecords?.length ?? 0) > 0;
  const progressionScore = hasPrLast4Weeks ? 85 : Math.max(20, 85 - daysSinceLastWorkout * 3);

  // Avg RIR from last 7 days sessions
  const recentSessionIds = sessions
    ?.filter(s => new Date(s.started_at) >= d7)
    .map(s => s.id) ?? [];
  let avgRir: number | null = null;
  if (recentSessionIds.length > 0) {
    const { data: recentSets } = await supabase
      .from('session_sets')
      .select('rir')
      .in('session_id', recentSessionIds)
      .eq('set_type', 'top')
      .not('rir', 'is', null);
    if (recentSets && recentSets.length > 0) {
      avgRir = recentSets.reduce((s, r) => s + (r.rir ?? 0), 0) / recentSets.length;
    }
  }

  // ── 3. Nutrition adherence (20%) ─────────────────────────────────────────
  const foodLogList = foodLogs ?? [];
  const proteinDaysBelow = foodLogList.filter(
    l => l.protein_g !== null && l.target_protein_g !== null
      && l.protein_g < l.target_protein_g * 0.8
  ).length;
  const totalLoggedDays = new Set(foodLogList.map(l =>
    l.logged_at?.split('T')[0]
  )).size;
  const nutritionScore = totalLoggedDays === 0
    ? 40  // no data — neutral
    : Math.max(20, Math.round(
        ((28 - proteinDaysBelow) / 28) * 100 * (totalLoggedDays / 28)
      ));

  // ── 4. Cardio load (15%) ─────────────────────────────────────────────────
  const cardioKm = (cardioSessions ?? []).reduce((s, c) => s + (c.distance_km ?? 0), 0);
  const cardioGoalKm = 20;
  const cardioScore = Math.min(100, Math.round((cardioKm / cardioGoalKm) * 100));

  // ── 5. Recovery score (10%) ──────────────────────────────────────────────
  let recoveryScore = 80;
  if (daysSinceLastWorkout === 0) recoveryScore = 60;  // trained today
  else if (daysSinceLastWorkout === 1) recoveryScore = 90;
  else if (daysSinceLastWorkout >= 4) recoveryScore = Math.max(40, 90 - (daysSinceLastWorkout - 1) * 8);
  if (avgRir !== null && avgRir < 1) recoveryScore = Math.max(40, recoveryScore - 15);

  // ── EDN Score composto ────────────────────────────────────────────────────
  const ednScore = Math.round(
    consistencyPct  * 0.30 +
    progressionScore * 0.25 +
    nutritionScore  * 0.20 +
    cardioScore     * 0.15 +
    recoveryScore   * 0.10
  );

  // ── Weight/body trend ─────────────────────────────────────────────────────
  const wLogs = weightLogs ?? [];
  const weightTrend14d = wLogs.length >= 2
    ? wLogs[wLogs.length - 1].weight_kg - wLogs[0].weight_kg
    : (bioList && bioList.length >= 2
      ? bioList[0].weight_kg - bioList[bioList.length - 1].weight_kg
      : null);

  const latestBio = bioList?.[0];
  const plateauDetected = wLogs.length >= 3 &&
    Math.abs(wLogs[wLogs.length - 1].weight_kg - wLogs[0].weight_kg) < 0.4;

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts: Alert[] = [];
  if (proteinDaysBelow >= 3) alerts.push({ type: 'warning', category: 'nutrition', message: `Proteína abaixo da meta em ${proteinDaysBelow} dos últimos 7 dias` });
  if (daysSinceLastWorkout >= 4) alerts.push({ type: 'warning', category: 'training', message: `Há ${daysSinceLastWorkout} dias sem treinar` });
  if (plateauDetected) alerts.push({ type: 'info', category: 'training', message: 'Platô de peso detectado — considere refeed ou ajuste de déficit' });
  if (cardioKm > cardioGoalKm * 1.1) alerts.push({ type: 'warning', category: 'cardio', message: `Volume de cárdio ${Math.round(((cardioKm / cardioGoalKm) - 1) * 100)}% acima do limite seguro` });

  // ── Recommendations (max 3) ───────────────────────────────────────────────
  const recs: string[] = [];
  if (daysSinceLastWorkout >= 2 && sessionsCount < plannedSessions)
    recs.push('Você tem treino pendente — priorize hoje para manter a consistência');
  if (proteinDaysBelow >= 2)
    recs.push('Proteína abaixo da meta — adicione uma fonte proteica em cada refeição');
  if (cardioKm < cardioGoalKm * 0.5)
    recs.push(`Cárdio abaixo da meta semanal (${cardioKm.toFixed(1)}/${cardioGoalKm}km) — adicione uma saída de Zona 2`);
  if (plateauDetected && !recs.find(r => r.includes('platô')))
    recs.push('Platô de peso ativo — considere um refeed de 24h para resetar o metabolismo');
  if (!hasPrLast4Weeks && sessionsCount > 4)
    recs.push('Nenhum PR nos últimos 28 dias — verifique se a progressão de carga está ocorrendo');

  return {
    recovery_score: recoveryScore,
    progression_score: progressionScore,
    nutrition_adherence: nutritionScore,
    cardio_load: cardioScore,
    edn_score: ednScore,
    league: scoreToLeague(ednScore),
    recommendations: recs.slice(0, 3),
    alerts,
    raw: {
      sessions_last_28: sessionsCount,
      planned_sessions_last_28: plannedSessions,
      has_pr_last_4_weeks: hasPrLast4Weeks,
      protein_days_below_target: proteinDaysBelow,
      cardio_km_this_week: cardioKm,
      cardio_goal_km: cardioGoalKm,
      avg_rir: avgRir,
      weight_trend_14d: weightTrend14d,
      body_fat_current: latestBio?.body_fat_pct ?? null,
      muscle_current: latestBio?.skeletal_muscle_mass_kg ?? null,
      plateau_detected: plateauDetected,
      days_since_last_workout: daysSinceLastWorkout,
    },
  };
}

// ── Client-side lightweight version (sem acesso server) ───────────────────────
// Usar quando se tem os dados já carregados na tela
export function computeEdnScoreFromRaw(raw: AthleteState['raw'], daysPerWeek = 3): number {
  const consistency = Math.min(100, Math.round((raw.sessions_last_28 / Math.max(1, raw.planned_sessions_last_28)) * 100));
  const progression = raw.has_pr_last_4_weeks ? 85 : Math.max(20, 70 - raw.days_since_last_workout * 3);
  const nutrition   = Math.max(20, Math.round(((28 - raw.protein_days_below_target) / 28) * 80));
  const cardio      = Math.min(100, Math.round((raw.cardio_km_this_week / raw.cardio_goal_km) * 100));
  const recovery    = raw.avg_rir !== null && raw.avg_rir < 1 ? 55 : raw.days_since_last_workout === 1 ? 90 : 75;
  return Math.round(consistency * 0.30 + progression * 0.25 + nutrition * 0.20 + cardio * 0.15 + recovery * 0.10);
}

export function formatAthleteStateForAI(state: AthleteState): string {
  const r = state.raw;
  const lines = [
    `Score EDN: ${state.edn_score}/100 (Liga ${state.league.toUpperCase()})`,
    `Consistência: ${r.sessions_last_28}/${r.planned_sessions_last_28} sessões em 28 dias`,
    `Último treino: há ${r.days_since_last_workout} dia(s)`,
    r.avg_rir !== null ? `RIR médio recente: ${r.avg_rir.toFixed(1)}` : null,
    r.weight_trend_14d !== null ? `Tendência de peso 14d: ${r.weight_trend_14d > 0 ? '+' : ''}${r.weight_trend_14d.toFixed(1)}kg` : null,
    r.body_fat_current ? `Gordura corporal: ${r.body_fat_current}%` : null,
    r.muscle_current ? `Massa muscular: ${r.muscle_current}kg` : null,
    `Cárdio esta semana: ${r.cardio_km_this_week.toFixed(1)}km / ${r.cardio_goal_km}km meta`,
    `Proteína abaixo da meta: ${r.protein_days_below_target} dias recentes`,
    r.plateau_detected ? 'PLATÔ DETECTADO: peso estagnado há 14+ dias' : null,
    state.alerts.length > 0 ? `Alertas: ${state.alerts.map(a => a.message).join(' | ')}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}
