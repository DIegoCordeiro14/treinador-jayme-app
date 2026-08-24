/**
 * Nutrition Calculation Engine (V9.X) — determinístico.
 * (alimento da base + quantidade + unidade + preparação) → macros.
 * Usado por TODOS os caminhos (foto/voz/texto/manual) para o mesmo resultado.
 * A IA NUNCA fornece macros; ela só identifica o alimento e estima a porção.
 */

export interface FoodBaseItem {
  id?: string;
  name: string;
  serving_size: number;   // ex.: 100
  serving_unit: string;   // 'g' | 'ml'
  calories: number;       // por serving_size
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number | null;
}

export interface MealItemInput {
  food: FoodBaseItem;
  quantity: number;       // quantidade consumida
  unit?: string;          // 'g' | 'ml' | 'un' | 'colher' | 'fatia'...
  preparation?: string | null;
  confidence?: number | null;  // qualidade da identificação (0..1)
}

export interface CalculatedItem {
  name: string;
  quantity: number;
  unit: string;
  preparation: string | null;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number | null;
}

export interface CalculatedMeal {
  items: CalculatedItem[];
  totals: { calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  confidenceLevel: 'alta' | 'moderada' | 'baixa' | null;
  avgConfidence: number | null;
}

// Aproximação de unidades caseiras → gramas (quando a base é por g/ml).
const HOUSEHOLD_GRAMS: Record<string, number> = {
  colher_sopa: 15, colher_cha: 5, xicara: 120, copo: 200, concha: 80,
  fatia: 30, unidade: 50, un: 50, prato: 300, filé: 120, file: 120, escumadeira: 60,
};

/** Fator multiplicador do preparo (só quando não há entrada específica na base). */
function preparationFactor(preparation: string | null | undefined): number {
  const p = (preparation ?? '').toLowerCase();
  if (/frit/.test(p)) return 1.35;   // absorção de óleo
  if (/empanad|milanesa/.test(p)) return 1.5;
  if (/refogad|saltead/.test(p)) return 1.1;
  return 1;                          // grelhado/cozido/assado/cru: base
}

/** Converte a quantidade informada para a unidade da base (g/ml). */
function toBaseAmount(quantity: number, unit: string | undefined, food: FoodBaseItem): number {
  const u = (unit ?? food.serving_unit ?? 'g').toLowerCase();
  if (u === food.serving_unit || (u === 'g' && food.serving_unit === 'g') || (u === 'ml' && food.serving_unit === 'ml')) return quantity;
  const key = u.replace(/\s+/g, '_').replace('ç', 'c').replace('í', 'i');
  const grams = HOUSEHOLD_GRAMS[key];
  if (grams) return quantity * grams;
  // desconhecido: assume que a quantidade já está na unidade da base
  return quantity;
}

export function calculateItem(input: MealItemInput): CalculatedItem {
  const f = input.food;
  const baseAmount = toBaseAmount(input.quantity, input.unit, f);
  const ratio = (f.serving_size > 0 ? baseAmount / f.serving_size : 0) * preparationFactor(input.preparation);
  const r = (n: number) => Math.round((n ?? 0) * ratio * 10) / 10;
  return {
    name: f.name,
    quantity: input.quantity,
    unit: input.unit ?? f.serving_unit ?? 'g',
    preparation: input.preparation ?? null,
    calories_kcal: Math.round((f.calories ?? 0) * ratio),
    protein_g: r(f.protein),
    carbs_g: r(f.carbohydrates),
    fat_g: r(f.fat),
    fiber_g: r(f.fiber ?? 0),
    confidence: input.confidence ?? null,
  };
}

export function confidenceLabel(c: number): 'alta' | 'moderada' | 'baixa' {
  if (c >= 0.8) return 'alta';
  if (c >= 0.55) return 'moderada';
  return 'baixa';
}

export function calculateMeal(items: MealItemInput[]): CalculatedMeal {
  const calc = items.map(calculateItem);
  const totals = calc.reduce((t, i) => ({
    calories_kcal: t.calories_kcal + i.calories_kcal,
    protein_g: Math.round((t.protein_g + i.protein_g) * 10) / 10,
    carbs_g: Math.round((t.carbs_g + i.carbs_g) * 10) / 10,
    fat_g: Math.round((t.fat_g + i.fat_g) * 10) / 10,
    fiber_g: Math.round((t.fiber_g + i.fiber_g) * 10) / 10,
  }), { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  const confs = calc.map(i => i.confidence).filter((c): c is number => c != null);
  const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
  return { items: calc, totals, avgConfidence: avg, confidenceLevel: avg != null ? confidenceLabel(avg) : null };
}

// ─── Comparação refeição/consumo × meta (§13/§35) ────────────────────────────
export interface MacroTargets { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }
export type MacroStatus = 'ok' | 'below' | 'above';
export interface MealComparison {
  status: Record<'calories' | 'protein' | 'carbs' | 'fat', MacroStatus | 'na'>;
  messages: string[];
}

/** Compara valores consumidos com a meta (tolerância ±15%). Não altera a dieta — só interpreta. */
export function compareToTargets(
  consumed: { kcal: number; protein: number; carbs: number; fat: number },
  target: MacroTargets,
  tol = 0.15,
): MealComparison {
  const cmp = (v: number, t: number | null): MacroStatus | 'na' => {
    if (t == null || t <= 0) return 'na';
    if (v < t * (1 - tol)) return 'below';
    if (v > t * (1 + tol)) return 'above';
    return 'ok';
  };
  const status = { calories: cmp(consumed.kcal, target.kcal), protein: cmp(consumed.protein, target.protein), carbs: cmp(consumed.carbs, target.carbs), fat: cmp(consumed.fat, target.fat) };
  const messages: string[] = [];
  if (status.protein === 'below') messages.push('Proteína abaixo do planejado.');
  if (status.carbs === 'below') messages.push('Carboidrato abaixo do planejado.');
  if (status.calories === 'below') messages.push('Calorias abaixo da estratégia do dia.');
  if (status.calories === 'above') messages.push('Calorias acima da estratégia do dia.');
  return { status, messages };
}
