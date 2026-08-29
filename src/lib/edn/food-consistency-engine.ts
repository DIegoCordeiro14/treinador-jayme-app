// food-consistency-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §13 — Consistência alimentar (histórico visual).
//
// Agrega os últimos N dias de ingestão (kcal/P/C/G + dias registrados), calcula
// tendências (proteína melhorando, registro caindo, alta variação calórica) e um
// heatmap por dia (🟢 no alvo / 🟡 parcial / 🔴 fora ou sem registro). Puro/
// determinístico. Integra com Nutrition Score / Food Behavior / Adherence.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsistencyDay {
  dateISO: string;
  weekday: number;        // 0=Dom..6=Sáb
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  logged: boolean;
}

export interface ConsistencyTargets { calories: number; protein: number; }

export type HeatCell = { dateISO: string; weekday: number; status: 'on' | 'partial' | 'off' | 'none' };

export interface ConsistencyTrend { id: string; direction: 'up' | 'down' | 'flat'; label: string; }

export interface FoodConsistencyResult {
  days: number;
  loggedDays: number;
  avg: { calories: number; protein: number; carbs: number; fat: number };
  calorieVariationPct: number;     // coef. de variação (%)
  trends: ConsistencyTrend[];
  heatmap: HeatCell[];
  summary: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = avg(xs); return Math.sqrt(avg(xs.map((x) => (x - m) ** 2))); };
const halves = (xs: number[]) => { if (xs.length < 2) return null; const h = Math.max(1, Math.floor(xs.length / 2)); return avg(xs.slice(-h)) - avg(xs.slice(0, h)); };

export function analyzeFoodConsistency(daysIn: ConsistencyDay[], targets: ConsistencyTargets): FoodConsistencyResult {
  const days = [...daysIn].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const logged = days.filter((d) => d.logged);
  const cals = logged.map((d) => d.calories).filter((v): v is number => v != null);
  const prot = logged.map((d) => d.protein).filter((v): v is number => v != null);
  const carb = logged.map((d) => d.carbs).filter((v): v is number => v != null);
  const fat = logged.map((d) => d.fat).filter((v): v is number => v != null);

  const meanCal = avg(cals);
  const calorieVariationPct = meanCal > 0 ? Math.round((std(cals) / meanCal) * 100) : 0;

  // tendências
  const trends: ConsistencyTrend[] = [];
  const protDelta = halves(prot);
  if (protDelta != null && Math.abs(protDelta) >= 8) trends.push({ id: 'protein', direction: protDelta > 0 ? 'up' : 'down', label: protDelta > 0 ? 'Proteína melhorando' : 'Proteína caindo' });
  // registro caindo: compara nº de registros na 1ª vs 2ª metade da janela
  const half = Math.max(1, Math.floor(days.length / 2));
  const firstLog = days.slice(0, half).filter((d) => d.logged).length / half;
  const secondLog = days.slice(-half).filter((d) => d.logged).length / half;
  if (secondLog < firstLog - 0.25) trends.push({ id: 'logging', direction: 'down', label: 'Registro alimentar caindo' });
  if (calorieVariationPct >= 25) trends.push({ id: 'variation', direction: 'flat', label: 'Alta variação calórica' });

  // heatmap por dia
  const heatmap: HeatCell[] = days.map((d) => {
    if (!d.logged || d.calories == null) return { dateISO: d.dateISO, weekday: d.weekday, status: 'none' };
    const calRatio = targets.calories > 0 ? d.calories / targets.calories : 1;
    const protOk = targets.protein > 0 ? (d.protein ?? 0) >= targets.protein * 0.85 : true;
    const calOk = Math.abs(calRatio - 1) <= 0.12;
    const status: HeatCell['status'] = calOk && protOk ? 'on' : (calOk || protOk) ? 'partial' : 'off';
    return { dateISO: d.dateISO, weekday: d.weekday, status };
  });

  const onDays = heatmap.filter((h) => h.status === 'on').length;
  const summary = logged.length === 0
    ? 'Sem registros no período.'
    : `${logged.length}/${days.length} dias registrados · ${onDays} no alvo · variação calórica ${calorieVariationPct}%.`;

  return {
    days: days.length, loggedDays: logged.length,
    avg: { calories: Math.round(meanCal), protein: Math.round(avg(prot)), carbs: Math.round(avg(carb)), fat: Math.round(avg(fat)) },
    calorieVariationPct, trends, heatmap, summary,
  };
}
