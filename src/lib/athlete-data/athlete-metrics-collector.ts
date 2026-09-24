// src/lib/athlete-data/athlete-metrics-collector.ts
// ─────────────────────────────────────────────────────────────────────────────
// Coletor multi-domínio (Fase 3). Traz TODAS as fontes do atleta para o Hub num
// único MetricMeasurement[] — corpo, recuperação (wearable), cardio e nutrição.
// Os wearables entram pelo Hub (não mais direto para cada aba). Mapeadores puros
// (testáveis) + collectAllMetrics (IO defensivo, best-effort por query).
// ─────────────────────────────────────────────────────────────────────────────

import type { DataSource } from './types';
import type { MetricMeasurement } from './data-resolution-engine';
import type { MetricKey } from './metric-catalog';
import { collectBodyMeasurements } from './athlete-measurements-repo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const push = (out: MetricMeasurement[], metric: MetricKey, value: number | null, source: DataSource, measuredAt: string | null) => {
  if (value != null) out.push({ metric, value, source, measuredAt });
};

// Um provider de wearable/health vira a fonte canônica 'wearable' ou 'health_connect'.
function wearableSource(provider: string | null | undefined): DataSource {
  const p = (provider ?? '').toLowerCase();
  if (p.includes('health') || p.includes('connect')) return 'health_connect';
  return 'wearable';
}

/** Recuperação + FC a partir de wearable_metrics. */
export function wearableToMetrics(rows: Row[]): MetricMeasurement[] {
  const out: MetricMeasurement[] = [];
  for (const w of rows ?? []) {
    const at = w.recorded_at ?? w.created_at ?? null;
    const src = wearableSource(w.source);
    push(out, 'restingHeartRate', num(w.resting_hr), src, at);
    push(out, 'hrv', num(w.hrv_ms), src, at);
    push(out, 'sleepHours', num(w.sleep_hours), src, at);
    push(out, 'recoveryScore', num(w.training_readiness ?? w.body_battery), src, at);
    push(out, 'stress', num(w.stress_score), src, at);
  }
  return out;
}

/** Métricas de cardio a partir de cardio_sessions (sessão mais recente por métrica). */
export function cardioToMetrics(rows: Row[]): MetricMeasurement[] {
  const out: MetricMeasurement[] = [];
  for (const c of rows ?? []) {
    if (c.deleted_at) continue;
    const at = c.performed_at ?? c.created_at ?? null;
    const src = wearableSource(c.source_provider);
    const dist = num(c.distance_km);
    const dur = num(c.duration_min);
    push(out, 'cardioDistanceKm', dist, src, at);
    push(out, 'cardioDurationMin', dur, src, at);
    if (dist != null && dist > 0 && dur != null && dur > 0) push(out, 'pace', Math.round((dur / dist) * 100) / 100, src, at);
    push(out, 'avgHr', num(c.avg_hr ?? c.avg_heart_rate), src, at);
    push(out, 'maxHr', num(c.max_hr ?? c.max_heart_rate), src, at);
    push(out, 'cardioCalories', num(c.calories_burned), src, at);
    push(out, 'elevationM', num(c.elevation_gain_m), src, at);
  }
  return out;
}

/** Nutrição do dia: soma dos food_logs de uma data (source nutrition). */
export function nutritionToMetrics(rows: Row[], logDate: string): MetricMeasurement[] {
  const today = (rows ?? []).filter((r) => (r.log_date ?? '').slice(0, 10) === logDate);
  if (today.length === 0) return [];
  const sum = (f: string) => today.reduce((a, r) => a + (num(r[f]) ?? 0), 0);
  const at = today[0].logged_at ?? `${logDate}T12:00:00Z`;
  return [
    { metric: 'calories', value: Math.round(sum('calories_kcal')), source: 'nutrition', measuredAt: at },
    { metric: 'protein', value: Math.round(sum('protein_g')), source: 'nutrition', measuredAt: at },
    { metric: 'carbs', value: Math.round(sum('carbs_g')), source: 'nutrition', measuredAt: at },
    { metric: 'fat', value: Math.round(sum('fat_g')), source: 'nutrition', measuredAt: at },
  ];
}

// mapeia BodyMetric (repo antigo) → MetricKey do catálogo
const BODY_TO_METRIC: Record<string, MetricKey | undefined> = {
  weight: 'weight', bodyFat: 'bodyFat', leanMass: 'leanMass', muscleMass: 'skeletalMuscle',
  visceralFat: 'visceralFat', bodyWater: 'bodyWater', bmr: 'bmr', restingHeartRate: 'restingHeartRate',
};

/** Coleta unificada de TODAS as métricas do atleta (best-effort por query). */
export async function collectAllMetrics(supabase: DB, userId: string, nowISO = new Date().toISOString()): Promise<MetricMeasurement[]> {
  const logDate = nowISO.slice(0, 10);
  const q = (fn: () => Row) => Promise.resolve(fn()).then((r: Row) => r?.data ?? []).catch(() => []);

  const [body, wearables, cardios, foods] = await Promise.all([
    collectBodyMeasurements(supabase, userId).catch(() => []),
    q(() => supabase.from('wearable_metrics').select('recorded_at, created_at, source, resting_hr, hrv_ms, sleep_hours, training_readiness, body_battery, stress_score').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(14)),
    q(() => supabase.from('cardio_sessions').select('performed_at, created_at, source_provider, distance_km, duration_min, avg_hr, avg_heart_rate, max_hr, max_heart_rate, calories_burned, elevation_gain_m, deleted_at').eq('user_id', userId).is('deleted_at', null).order('performed_at', { ascending: false }).limit(20)),
    q(() => supabase.from('food_logs').select('log_date, logged_at, calories_kcal, protein_g, carbs_g, fat_g').eq('user_id', userId).eq('log_date', logDate)),
  ]);

  const out: MetricMeasurement[] = [];
  for (const m of body as Row[]) { const mk = BODY_TO_METRIC[m.metric]; if (mk) out.push({ metric: mk, value: m.value, source: m.source, measuredAt: m.measuredAt, confidence: m.confidence }); }
  out.push(...wearableToMetrics(wearables));
  out.push(...cardioToMetrics(cardios));
  out.push(...nutritionToMetrics(foods, logDate));
  return out;
}
