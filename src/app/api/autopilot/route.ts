import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeNutritionTargets } from '@/lib/edn/nutrition-autopilot';
import { computeCardioPrescription } from '@/lib/edn/cardio-autopilot';
import { computeRecoveryState } from '@/lib/edn/recovery-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/autopilot — V6.5 Pilares 6 e 7
 *
 * Nutrição e Cardio autônomos: sempre que chamado, busca os registros MAIS
 * RECENTES (bioimpedância, perfil, plano, recuperação), recalcula TDEE,
 * calorias, macros, água e a prescrição de cardio da semana, e PERSISTE
 * calorie_target / water_target_ml no perfil — sem pedir nada ao usuário.
 */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // segunda-feira
  weekStart.setHours(0, 0, 0, 0);
  const d7 = new Date(Date.now() - 7 * 86400000);

  const [{ data: profile }, { data: bio }, { data: plan }, { data: sessions7 }, { data: cardioWeek }] = await Promise.all([
    supabase
      .from('profiles')
      .select('weight_kg, height_cm, age, gender, main_goal, weekly_frequency, work_type, cardio_frequency, meals_per_day, sleep_hours, sleep_quality, stress_level, calorie_target, water_target_ml, profile_completion_pct')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('bioimpedance_data')
      .select('weight_kg, body_fat_pct, lean_mass_kg, basal_metabolic_rate_kcal, measured_at')
      .eq('user_id', user.id)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workout_plans')
      .select('created_at, days_per_week')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('workout_sessions')
      .select('id, started_at')
      .eq('user_id', user.id)
      .gte('started_at', d7.toISOString())
      .order('started_at', { ascending: false }),
    supabase
      .from('cardio_sessions')
      .select('distance_km')
      .eq('user_id', user.id)
      .gte('created_at', weekStart.toISOString()),
  ]);

  // ── Gate Módulo 0 ───────────────────────────────────────────────────────
  const completionPct = (profile as any)?.profile_completion_pct ?? 0;
  if (completionPct < 80) {
    return Response.json({
      error: 'profile_incomplete',
      message: `Perfil ${completionPct}% completo — complete a anamnese (mínimo 80%) para o autopilot de nutrição e cardio.`,
      completionPct,
    }, { status: 412 });
  }

  // ── Pilar 6: Nutrição autônoma ──────────────────────────────────────────
  const nutrition = computeNutritionTargets({
    bio: bio ?? null,
    profile: {
      weight_kg: profile?.weight_kg ?? null,
      height_cm: profile?.height_cm ?? null,
      age: profile?.age ?? null,
      gender: profile?.gender ?? null,
      main_goal: (profile as any)?.main_goal ?? null,
      weekly_frequency: profile?.weekly_frequency ?? null,
      work_type: (profile as any)?.work_type ?? null,
      cardio_frequency: (profile as any)?.cardio_frequency ?? null,
      meals_per_day: profile?.meals_per_day ?? null,
    },
  });

  // Persiste os alvos recalculados no perfil (fonte para o restante do app)
  let persisted = false;
  if (nutrition && (profile?.calorie_target !== nutrition.targetKcal || profile?.water_target_ml !== nutrition.waterMl)) {
    const { error } = await supabase
      .from('profiles')
      .update({ calorie_target: nutrition.targetKcal, water_target_ml: nutrition.waterMl })
      .eq('id', user.id);
    persisted = !error;
  }

  // ── Pilar 7: Cardio autônomo ────────────────────────────────────────────
  const daysSince = sessions7?.[0]
    ? Math.floor((Date.now() - new Date(sessions7[0].started_at).getTime()) / 86400000)
    : 999;
  const recovery = computeRecoveryState({
    sleepHours: (profile as any)?.sleep_hours ?? null,
    sleepQuality: (profile as any)?.sleep_quality ?? null,
    stressLevel: (profile as any)?.stress_level ?? null,
    workType: (profile as any)?.work_type ?? null,
    daysSinceLastWorkout: daysSince,
    avgRir: null,
    sessionsLast7: sessions7?.length ?? 0,
    plannedPerWeek: plan?.days_per_week ?? profile?.weekly_frequency ?? 3,
    wearable: null,
  });

  const weeksOnPlan = plan?.created_at
    ? Math.max(0, Math.floor((Date.now() - new Date(plan.created_at).getTime()) / (7 * 86400000)))
    : 0;
  const cardioKm = (cardioWeek ?? []).reduce((s, c) => s + (c.distance_km ?? 0), 0);

  const cardio = computeCardioPrescription({
    mainGoal: (profile as any)?.main_goal ?? null,
    bodyFatPct: bio?.body_fat_pct ?? null,
    gender: profile?.gender ?? null,
    weeksOnPlan,
    recovery,
    cardioKmThisWeek: cardioKm,
    cardioSessionsThisWeek: cardioWeek?.length ?? 0,
  });

  return Response.json({
    nutrition,
    cardio,
    recovery,
    persisted,
    bioUsed: !!bio,
    bioMeasuredAt: bio?.measured_at ?? null,
  });
}
