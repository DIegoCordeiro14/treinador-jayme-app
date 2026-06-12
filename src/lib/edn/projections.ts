/**
 * EDN Projections Engine — V4.0
 * Projeta peso, BF% e massa muscular com base na tendência atual.
 * Usa regressão linear sobre os últimos 14-60 dias de medições.
 */

export interface BodyProjection {
  days: number;
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleKg: number | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ProjectionResult {
  current: { weightKg: number; bodyFatPct: number | null; muscleKg: number | null };
  trend14d: number | null;   // kg/day (negative = losing)
  projections: BodyProjection[];  // 30, 60, 90, 180 days
  adherenceFactor: number;        // 0-1 multiplier based on session adherence
  insight: string;
}

// ── Linear regression helper ───────────────────────────────────────────────────
function linearTrend(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom; // slope = kg/day
}

// ── Main projection function ──────────────────────────────────────────────────
export function computeProjections(params: {
  measurements: { date: string; weight_kg: number | null; body_fat_pct?: number | null }[];
  currentBodyFat: number | null;
  currentMuscle: number | null;
  sessionsLast28: number;
  plannedSessionsLast28: number;
  goalKcalDeficit?: number; // negative = deficit, positive = surplus
}): ProjectionResult | null {
  const { measurements, currentBodyFat, currentMuscle, sessionsLast28, plannedSessionsLast28 } = params;

  const validMeasurements = measurements
    .filter(m => m.weight_kg != null)
    .map(m => ({ ...m, weight_kg: m.weight_kg! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (validMeasurements.length === 0) return null;

  const latest = validMeasurements[validMeasurements.length - 1];
  const currentWeight = latest.weight_kg;
  const today = new Date();

  // Build time series (days ago → weight)
  const points = validMeasurements.map(m => ({
    x: -Math.round((today.getTime() - new Date(m.date).getTime()) / 86400000),
    y: m.weight_kg,
  }));

  // Use last 14d for primary trend, fallback to all data
  const recent = points.filter(p => p.x >= -14);
  const slope = recent.length >= 2 ? linearTrend(recent) : linearTrend(points);

  // Adherence factor (0.5–1.0)
  const adherence = plannedSessionsLast28 > 0
    ? Math.min(1, sessionsLast28 / plannedSessionsLast28)
    : 0.7;
  const adherenceFactor = 0.5 + adherence * 0.5;

  // Project weight at 30/60/90/180 days
  const HORIZONS = [30, 60, 90, 180];
  const projections: BodyProjection[] = HORIZONS.map(days => {
    const confidence: BodyProjection['confidence'] =
      days <= 30 && (recent.length >= 3) ? 'high' :
      days <= 60 ? 'medium' : 'low';

    let projectedWeight: number | null = null;
    let projectedBF: number | null = null;
    let projectedMuscle: number | null = null;

    if (slope !== null) {
      // Apply adherence decay: projections further out are less certain
      const decayFactor = days <= 30 ? 1 : days <= 60 ? 0.9 : days <= 90 ? 0.8 : 0.65;
      const deltaKg = slope * days * adherenceFactor * decayFactor;
      projectedWeight = Math.max(40, parseFloat((currentWeight + deltaKg).toFixed(1)));

      // Estimate BF% change (rough: assume fat loss/gain at 75/25 ratio for fat/muscle)
      if (currentBodyFat != null) {
        const fatRatio = slope < 0 ? 0.75 : 0.50; // losing: 75% fat | gaining: 50% fat
        const fatDeltaKg = deltaKg * fatRatio;
        const muscleDeltaKg = deltaKg * (1 - fatRatio);
        const fatMassKg = (currentWeight * currentBodyFat / 100) + fatDeltaKg;
        projectedBF = parseFloat(Math.max(5, Math.min(45, (fatMassKg / projectedWeight) * 100)).toFixed(1));
        if (currentMuscle != null) {
          projectedMuscle = parseFloat(Math.max(20, currentMuscle + muscleDeltaKg).toFixed(1));
        }
      }
    }

    return { days, weightKg: projectedWeight, bodyFatPct: projectedBF, muscleKg: projectedMuscle, confidence };
  });

  // Human insight
  let insight = '';
  if (slope === null) {
    insight = 'Dados insuficientes para projeção. Registre seu peso regularmente.';
  } else if (Math.abs(slope) < 0.003) {
    insight = 'Seu peso está estável. Se a meta é emagrecimento, revise o déficit calórico.';
  } else if (slope < -0.05) {
    insight = `Perda de ~${Math.abs(slope * 7).toFixed(1)}kg/semana. Ritmo acima do ideal — verifique ingestão proteica.`;
  } else if (slope < 0) {
    insight = `Perda de ~${Math.abs(slope * 7).toFixed(1)}kg/semana. Ritmo sustentável para preservação muscular.`;
  } else if (slope > 0.05) {
    insight = `Ganho de ~${(slope * 7).toFixed(1)}kg/semana. Ritmo acima do ideal para naturais — verifique superávit.`;
  } else {
    insight = `Ganho de ~${(slope * 7).toFixed(2)}kg/semana. Ritmo controlado para recomposição.`;
  }

  return {
    current: { weightKg: currentWeight, bodyFatPct: currentBodyFat, muscleKg: currentMuscle },
    trend14d: slope != null ? parseFloat((slope * 14).toFixed(2)) : null,
    projections,
    adherenceFactor,
    insight,
  };
}
