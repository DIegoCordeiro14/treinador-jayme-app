import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeFoodConsistency, type ConsistencyDay } from '@/lib/edn/food-consistency-engine';
import { nutritionErrorPayload } from '@/lib/edn/nutrition-error-handler';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/nutrition/consistency — histórico alimentar (§13).
 * Agrega food_logs dos últimos 7 dias por DIA e devolve consistência + heatmap.
 * Determinístico. Metas de referência vêm do perfil (calorie_target).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    const days = 7;
    const since = new Date(now - (days - 1) * 86400000);
    const [{ data: logs }, { data: profile }] = await Promise.all([
      supabase.from('food_logs').select('logged_at, calories_kcal, protein_g, carbs_g, fat_g')
        .eq('user_id', user.id).gte('logged_at', since.toISOString()),
      supabase.from('profiles').select('calorie_target').eq('id', user.id).maybeSingle(),
    ]);

    // agrega por dia (soma dos itens do dia)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byDay = new Map<string, { c: number; p: number; ca: number; f: number }>();
    for (const l of (logs ?? []) as Record<string, number | string>[]) {
      const d = String(l.logged_at).slice(0, 10);
      const cur = byDay.get(d) ?? { c: 0, p: 0, ca: 0, f: 0 };
      cur.c += Number(l.calories_kcal ?? 0); cur.p += Number(l.protein_g ?? 0);
      cur.ca += Number(l.carbs_g ?? 0); cur.f += Number(l.fat_g ?? 0);
      byDay.set(d, cur);
    }

    const consistencyDays: ConsistencyDay[] = [];
    for (let i = 0; i < days; i++) {
      const dt = new Date(now - (days - 1 - i) * 86400000);
      const iso = dt.toISOString().slice(0, 10);
      const agg = byDay.get(iso);
      consistencyDays.push({
        dateISO: iso, weekday: dt.getDay(),
        calories: agg ? Math.round(agg.c) : null, protein: agg ? Math.round(agg.p) : null,
        carbs: agg ? Math.round(agg.ca) : null, fat: agg ? Math.round(agg.f) : null,
        logged: !!agg,
      });
    }

    const calorieTarget = Number((profile as { calorie_target?: number } | null)?.calorie_target ?? 2200);
    const result = analyzeFoodConsistency(consistencyDays, { calories: calorieTarget, protein: Math.round(calorieTarget * 0.075) });
    return Response.json({ consistency: result });
  } catch (err) {
    return Response.json(nutritionErrorPayload('NUTRITION_CONTEXT_UNAVAILABLE', err instanceof Error ? err.message : 'Erro interno', null), { status: 200 });
  }
}
