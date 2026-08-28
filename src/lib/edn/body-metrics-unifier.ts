// body-metrics-unifier.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 (fundação) — Fonte ÚNICA de verdade de peso/composição.
//
// Hoje peso e %gordura vivem em 3 tabelas (bioimpedance_data, body_measurements,
// body_weight_logs) com nomes de data diferentes, e a deduplicação por dia é
// reimplementada em vários lugares. Este motor puro recebe as 3 séries cruas e
// devolve UMA série canônica por dia (com proveniência), além de utilidades de
// tendência robustas (regressão linear) reutilizadas por todos os motores de
// evolução. Sem I/O, 100% determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type MetricSource = 'bioimpedance' | 'measurement' | 'weight_log';

// Prioridade no mesmo dia: bioimpedância é a mais rica/precisa.
const SOURCE_PRIORITY: Record<MetricSource, number> = {
  bioimpedance: 3,
  measurement: 2,
  weight_log: 1,
};

export interface RawBodyPoint {
  dateISO: string;              // measured_at | date | log_date (só a data, YYYY-MM-DD)
  weightKg: number | null;
  bodyFatPct: number | null;
  leanKg?: number | null;       // só bioimpedância costuma ter
  muscleKg?: number | null;     // skeletal_muscle_mass_kg
  waistCm?: number | null;      // só body_measurements
  source: MetricSource;
}

export interface UnifiedBodyPoint {
  dateISO: string;
  weightKg: number | null;
  weightSource: MetricSource | null;
  bodyFatPct: number | null;
  bodyFatSource: MetricSource | null;
  leanKg: number | null;
  muscleKg: number | null;
  waistCm: number | null;
}

const MS_DAY = 86_400_000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// Escolhe, para um campo, o valor da fonte de maior prioridade que não é null.
function pickByPriority<T>(
  points: RawBodyPoint[],
  get: (p: RawBodyPoint) => T | null | undefined
): { value: T | null; source: MetricSource | null } {
  let best: { value: T; source: MetricSource } | null = null;
  for (const p of points) {
    const v = get(p);
    if (v == null) continue;
    if (!best || SOURCE_PRIORITY[p.source] > SOURCE_PRIORITY[best.source]) {
      best = { value: v as T, source: p.source };
    }
  }
  return best ? { value: best.value, source: best.source } : { value: null, source: null };
}

// ── Unificação por dia ───────────────────────────────────────────────────────
export function unifyBodyMetrics(points: RawBodyPoint[]): UnifiedBodyPoint[] {
  const byDay = new Map<string, RawBodyPoint[]>();
  for (const p of points) {
    if (!p.dateISO) continue;
    const k = dayKey(p.dateISO);
    const arr = byDay.get(k) ?? [];
    arr.push(p);
    byDay.set(k, arr);
  }

  const out: UnifiedBodyPoint[] = [];
  for (const [k, rows] of byDay) {
    const w = pickByPriority(rows, (p) => p.weightKg);
    const bf = pickByPriority(rows, (p) => p.bodyFatPct);
    const lean = pickByPriority(rows, (p) => p.leanKg);
    const muscle = pickByPriority(rows, (p) => p.muscleKg);
    const waist = pickByPriority(rows, (p) => p.waistCm);
    out.push({
      dateISO: k,
      weightKg: w.value,
      weightSource: w.source,
      bodyFatPct: bf.value,
      bodyFatSource: bf.source,
      leanKg: lean.value,
      muscleKg: muscle.value,
      waistCm: waist.value,
    });
  }
  out.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return out;
}

// ── Regressão linear (mínimos quadrados) sobre (dias, valor) ─────────────────
export interface TrendResult {
  slopePerDay: number | null;   // unidade/dia
  slopePerWeek: number | null;
  nPoints: number;
  spanDays: number;
  rSquared: number | null;      // qualidade do ajuste 0..1
}

export function linearTrend(
  series: { dateISO: string; value: number | null }[]
): TrendResult {
  const pts = series
    .filter((p) => p.value != null && !Number.isNaN(new Date(p.dateISO).getTime()))
    .map((p) => ({ t: new Date(p.dateISO).getTime(), v: p.value as number }))
    .sort((a, b) => a.t - b.t);

  if (pts.length < 2) {
    return { slopePerDay: null, slopePerWeek: null, nPoints: pts.length, spanDays: 0, rSquared: null };
  }

  const t0 = pts[0].t;
  const xs = pts.map((p) => (p.t - t0) / MS_DAY);
  const ys = pts.map((p) => p.v);
  const n = pts.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const rSquared = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  const spanDays = xs[xs.length - 1];

  return {
    slopePerDay: Math.round(slope * 1e6) / 1e6,
    slopePerWeek: Math.round(slope * 7 * 1000) / 1000,
    nPoints: n,
    spanDays: Math.round(spanDays),
    rSquared: Math.round(rSquared * 1000) / 1000,
  };
}

// Delta absoluto entre a média dos K primeiros e K últimos pontos (robusto a outlier).
export function halvesDelta(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const half = Math.max(1, Math.floor(v.length / 2));
  const first = v.slice(0, half);
  const last = v.slice(v.length - half);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return Math.round((avg(last) - avg(first)) * 1000) / 1000;
}

// Conveniências: extrai série de um campo da série unificada.
export function seriesOf(
  unified: UnifiedBodyPoint[],
  field: 'weightKg' | 'bodyFatPct' | 'leanKg' | 'muscleKg' | 'waistCm'
): { dateISO: string; value: number | null }[] {
  return unified.map((u) => ({ dateISO: u.dateISO, value: u[field] }));
}

export function spanDaysOf(unified: UnifiedBodyPoint[]): number {
  if (unified.length < 2) return 0;
  const a = new Date(unified[0].dateISO).getTime();
  const b = new Date(unified[unified.length - 1].dateISO).getTime();
  return Math.max(0, Math.round((b - a) / MS_DAY));
}
