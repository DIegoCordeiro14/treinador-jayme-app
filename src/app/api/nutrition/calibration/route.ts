import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeNutritionTargets } from '@/lib/edn/nutrition-autopilot';
import { calibrateMetabolism } from '@/lib/edn/metabolic-calibration-engine';
import { logNutritionTelemetry } from '@/lib/edn/nutrition-telemetry';
import { nutritionErrorPayload } from '@/lib/edn/nutrition-error-handler';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/nutrition/calibration — TDEE OBSERVADO (§5).
 * Compara ingestão média × variação de peso nos últimos 28 dias para estimar o
 * gasto real, com faixa e confiança. Determinístico. Só sugere ajuste com critério.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    const sinceIso = new Date(now - 28 * 86400000).toISOString();
    const [{ data: logs }, { data: profile }, { data: bio }, { data: wl }] = await Promise.all([
      supabase.from('food_logs').select('logged_at, calories_kcal').eq('user_id', user.id).gte('logged_at', sinceIso),
      supabase.from('profiles').select('weight_kg, height_cm, age, gender, main_goal, weekly_frequency, work_type, cardio_frequency, meals_per_day').eq('id', user.id).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, basal_metabolic_rate_kcal, measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('body_weight_logs').select('log_date, weight_kg').eq('user_id', user.id).gte('log_date', sinceIso.slice(0, 10)).order('log_date', { ascending: true }),
    ]);

    // ingestão média por DIA registrado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byDay = new Map<string, number>();
    for (const l of (logs ?? []) as Record<string, number | string>[]) {
      const d = String(l.logged_at).slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + Number(l.calories_kcal ?? 0));
    }
    const loggedDays = byDay.size;
    const avgDailyIntakeKcal = loggedDays ? Math.round([...byDay.values()].reduce((a, b) => a + b, 0) / loggedDays) : null;

    // variação de peso no período (weight logs preferencial; senão bioimpedância)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = (wl ?? []) as any[];
    let weightChangeKg: number | null = null;
    if (W.length >= 2) weightChangeKg = Math.round((W[W.length - 1].weight_kg - W[0].weight_kg) * 10) / 10;

    // TDEE previsto pela fórmula base (mesma fonte oficial)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (profile ?? {}) as any;
    const targets = computeNutritionTargets({
      bio: bio ?? null,
      profile: {
        weight_kg: p.weight_kg ?? null, height_cm: p.height_cm ?? null, age: p.age ?? null, gender: p.gender ?? null,
        main_goal: p.main_goal ?? null, weekly_frequency: p.weekly_frequency ?? null, work_type: p.work_type ?? null,
        cardio_frequency: p.cardio_frequency ?? null, meals_per_day: p.meals_per_day ?? null,
      },
    });
    const predictedTdee = targets?.tdeeKcal ?? null;

    if (predictedTdee == null) return Response.json({ calibration: null, note: 'Sem dados de perfil para prever o TDEE.' });

    const loggingAdherence = Math.min(1, loggedDays / 28);
    const calibration = calibrateMetabolism({
      avgDailyIntakeKcal, loggedDays, periodDays: 28, weightChangeKg, loggingAdherence, predictedTdee,
    });

    await logNutritionTelemetry(supabase, user.id, 'recalibration', { trend: calibration.trend, confidence: calibration.confidence, applied: calibration.applyAdjustment });
    return Response.json({ calibration, predictedTdee });
  } catch (err) {
    return Response.json(nutritionErrorPayload('NUTRITION_CONTEXT_UNAVAILABLE', err instanceof Error ? err.message : 'Erro interno', null), { status: 200 });
  }
}
