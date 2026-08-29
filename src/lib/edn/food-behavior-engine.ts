// food-behavior-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §8 — Padrões comportamentais alimentares.
//
// Detecta padrões (proteína baixa no café, calorias sobem no fim de semana,
// registros caem no domingo, dias sem treino comem mais, carbo insuficiente antes
// de treinos pesados). Seleciona 1 oportunidade principal + até 2 secundárias —
// nunca dezenas de alertas. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface DayNutrition {
  dateISO: string;
  weekday: number;                  // 0=Dom..6=Sáb
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  logged: boolean;
  trainingDay: boolean;
  heavyTraining?: boolean;
  breakfastProtein?: number | null; // proteína no café (se conhecido)
}

export interface FoodPattern {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  metric?: number;
}

export interface FoodBehaviorResult {
  patterns: FoodPattern[];
  primaryOpportunity: FoodPattern | null;
  secondary: FoodPattern[];
  consistencyScore: number;         // 0..1 (regularidade calórica)
  confidence: number;               // 0..1
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = avg(xs); return Math.sqrt(avg(xs.map((x) => (x - m) ** 2))); };

export function analyzeFoodBehavior(days: DayNutrition[]): FoodBehaviorResult {
  const patterns: FoodPattern[] = [];
  const logged = days.filter((d) => d.logged);
  const confidence = Math.min(1, logged.length / 14);

  if (logged.length < 5) {
    return { patterns: [], primaryOpportunity: null, secondary: [], consistencyScore: 0, confidence };
  }

  const cals = logged.map((d) => d.calories).filter((v): v is number => v != null);
  const meanCal = avg(cals);
  const cv = meanCal > 0 ? std(cals) / meanCal : 0;
  const consistencyScore = Math.max(0, Math.min(1, 1 - cv));

  // 1) proteína baixa no café
  const bp = logged.map((d) => d.breakfastProtein).filter((v): v is number => v != null);
  if (bp.length >= 4 && avg(bp) < 20) {
    patterns.push({ id: 'low_breakfast_protein', severity: 'medium', title: 'Proteína baixa no café', message: `Café da manhã com ~${Math.round(avg(bp))}g de proteína — distribuir melhor a proteína ao longo do dia.`, metric: Math.round(avg(bp)) });
  }

  // 2) calorias sobem no fim de semana
  const weekend = logged.filter((d) => d.weekday === 0 || d.weekday === 6).map((d) => d.calories).filter((v): v is number => v != null);
  const weekday = logged.filter((d) => d.weekday >= 1 && d.weekday <= 5).map((d) => d.calories).filter((v): v is number => v != null);
  if (weekend.length >= 2 && weekday.length >= 3 && avg(weekend) > avg(weekday) * 1.15) {
    patterns.push({ id: 'weekend_surplus', severity: 'medium', title: 'Calorias sobem no fim de semana', message: `Fim de semana ~${Math.round((avg(weekend) / avg(weekday) - 1) * 100)}% acima dos dias de semana.`, metric: Math.round(avg(weekend)) });
  }

  // 3) registros caem no domingo
  const sundays = days.filter((d) => d.weekday === 0);
  const sundayLogRate = sundays.length ? sundays.filter((d) => d.logged).length / sundays.length : 1;
  if (sundays.length >= 2 && sundayLogRate < 0.5) {
    patterns.push({ id: 'sunday_logging_drop', severity: 'low', title: 'Registro cai aos domingos', message: 'Poucos registros aos domingos — manter o hábito também nos fins de semana.' });
  }

  // 4) dias sem treino comem mais
  const restCal = logged.filter((d) => !d.trainingDay).map((d) => d.calories).filter((v): v is number => v != null);
  const trainCal = logged.filter((d) => d.trainingDay).map((d) => d.calories).filter((v): v is number => v != null);
  if (restCal.length >= 2 && trainCal.length >= 2 && avg(restCal) > avg(trainCal) * 1.12) {
    patterns.push({ id: 'rest_day_overeat', severity: 'medium', title: 'Mais calorias em dias sem treino', message: 'Ingestão maior nos dias de descanso — inverter: mais energia nos dias de treino.' });
  }

  // 5) carbo insuficiente antes de treino pesado
  const heavy = logged.filter((d) => d.heavyTraining);
  if (heavy.length >= 2) {
    const lowCarbHeavy = heavy.filter((d) => (d.carbs ?? 0) < meanCal * 0.4 / 4).length; // <40% das kcal em carbo
    if (lowCarbHeavy / heavy.length >= 0.5) {
      patterns.push({ id: 'low_carb_heavy_days', severity: 'high', title: 'Carbo baixo em treinos pesados', message: 'Carboidrato insuficiente nos dias de treino mais exigente — aumentar carbo em torno dessas sessões.' });
    }
  }

  // ordena por severidade
  const rank = { high: 3, medium: 2, low: 1 };
  patterns.sort((a, b) => rank[b.severity] - rank[a.severity]);
  const primaryOpportunity = patterns[0] ?? null;
  const secondary = patterns.slice(1, 3);

  return { patterns, primaryOpportunity, secondary, consistencyScore: Math.round(consistencyScore * 100) / 100, confidence: Math.round(confidence * 100) / 100 };
}
