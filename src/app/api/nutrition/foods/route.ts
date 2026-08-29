import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nutritionErrorPayload } from '@/lib/edn/nutrition-error-handler';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/nutrition/foods?q=... — busca alimentos na base própria (PT-BR) e,
 * se houver poucos resultados, complementa com Open Food Facts (fallback).
 * Normaliza tudo para o mesmo formato (por 100 g/ml).
 */
export async function GET(req: NextRequest) { try {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return Response.json({ foods: [] });

  // 1) base própria + termos de busca
  const { data: base } = await supabase.from('foods')
    .select('id, name, brand, serving_size, serving_unit, calories, protein, carbohydrates, fat, fiber, source')
    .or(`name.ilike.%${q}%,search_terms.ilike.%${q}%`).limit(12);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foods: any[] = (base ?? []).map((f) => ({ ...f, origin: 'edn_base' }));

  // 2) preferências do usuário (quantidade habitual) — anexa como dica
  const { data: prefs } = await supabase.from('user_food_preferences')
    .select('food_name, usual_quantity, usual_unit, usual_preparation').eq('user_id', user.id).ilike('food_name', `%${q}%`).limit(5);

  // 3) fallback Open Food Facts (só se a base própria trouxe poucos)
  if (foods.length < 4) {
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,brands,nutriments`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'CoachEDN/1.0' } });
      if (r.ok) {
        const d = await r.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (d.products ?? []) as any[]) {
          const n = p.nutriments ?? {};
          const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
          if (!p.product_name || kcal == null) continue;
          foods.push({
            id: null, name: p.product_name, brand: p.brands ?? null,
            serving_size: 100, serving_unit: 'g',
            calories: Math.round(kcal), protein: n.proteins_100g ?? 0, carbohydrates: n.carbohydrates_100g ?? 0,
            fat: n.fat_100g ?? 0, fiber: n.fiber_100g ?? null, source: 'open_food_facts', origin: 'off',
          });
          if (foods.length >= 12) break;
        }
      }
    } catch { /* offline/timeout: só a base própria */ }
  }

  return Response.json({ foods, preferences: prefs ?? [] });
  } catch (err) {
    return Response.json(nutritionErrorPayload('NUTRITION_CONTEXT_UNAVAILABLE', err instanceof Error ? err.message : 'Erro interno', { foods: [], preferences: [] }), { status: 200 });
  }
}
