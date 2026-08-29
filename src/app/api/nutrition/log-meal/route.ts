import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nutritionErrorPayload } from '@/lib/edn/nutrition-error-handler';
import { calculateMeal, type MealItemInput } from '@/lib/edn/nutrition-calculation-engine';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * POST /api/nutrition/log-meal — CÁLCULO DETERMINÍSTICO + persistência.
 * Recebe os itens CONFIRMADOS pelo usuário (alimento da base + quantidade),
 * calcula os macros pelo motor (nunca pela IA) e grava em food_logs.
 * Também aprende as quantidades habituais (user_food_preferences).
 */
export async function POST(req: NextRequest) { try {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json() as { meal?: string; source?: string; photoBase64?: string; photoType?: string; items?: Array<Record<string, unknown>> };
  const rawItems = body.items ?? [];
  if (!rawItems.length) return Response.json({ error: 'Nenhum item para registrar.' }, { status: 400 });

  // monta a entrada do motor a partir dos itens confirmados
  const inputs: MealItemInput[] = rawItems.map((i) => ({
    food: {
      name: String(i.name ?? ''), serving_size: Number(i.serving_size ?? 100), serving_unit: String(i.serving_unit ?? 'g'),
      calories: Number(i.calories ?? 0), protein: Number(i.protein ?? 0), carbohydrates: Number(i.carbohydrates ?? 0),
      fat: Number(i.fat ?? 0), fiber: i.fiber != null ? Number(i.fiber) : null,
    },
    quantity: Number(i.quantity ?? 0), unit: String(i.unit ?? 'g'),
    preparation: (i.preparation as string) ?? null, confidence: i.confidence != null ? Number(i.confidence) : null,
  }));
  const calc = calculateMeal(inputs);

  // opcional: salva a foto no bucket privado
  let photoPath: string | null = null;
  if (body.photoBase64) {
    try {
      const ext = body.photoType?.includes('png') ? 'png' : 'jpg';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('meal-photos').upload(path, Buffer.from(body.photoBase64, 'base64'), { contentType: body.photoType || 'image/jpeg' });
      if (!up.error) photoPath = path;
    } catch { /* foto é opcional */ }
  }

  const nowIso = new Date().toISOString();
  const logDate = nowIso.slice(0, 10);
  const rows = calc.items.map((it, idx) => ({
    user_id: user.id, logged_at: nowIso, log_date: logDate, meal: body.meal ?? 'outro',
    food_id: (rawItems[idx]?.food_id as string) ?? null, name: it.name, quantity: it.quantity, unit: it.unit, preparation: it.preparation,
    calories_kcal: it.calories_kcal, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, fiber_g: it.fiber_g,
    source: body.source ?? 'manual', confidence: it.confidence, photo_path: idx === 0 ? photoPath : null,
  }));
  const { error } = await supabase.from('food_logs').insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // aprendizado: quantidade habitual por alimento (não altera a base global)
  for (const it of calc.items) {
    try {
      await supabase.from('user_food_preferences').upsert({
        user_id: user.id, food_name: it.name.toLowerCase(), usual_quantity: it.quantity, usual_unit: it.unit, usual_preparation: it.preparation, updated_at: nowIso,
      }, { onConflict: 'user_id,food_name' });
    } catch { /* ok */ }
  }

  return Response.json({ ok: true, totals: calc.totals, confidenceLevel: calc.confidenceLevel, event: 'MEAL_LOGGED' });
  } catch (err) {
    return Response.json(nutritionErrorPayload('NUTRITION_CALC_FAILED', err instanceof Error ? err.message : 'Erro interno', null), { status: 200 });
  }
}
