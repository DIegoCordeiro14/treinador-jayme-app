// canonical-body-state.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hub P1 — Athlete Body Data Hub (fonte ÚNICA de dados corporais).
//
// Qualquer módulo pergunta getCanonicalBodyState(...) e NUNCA lê profiles.weight /
// bioimpedance.weight / body_measurements.weight diretamente. Resolve conflitos por
// data > fonte > confiança (sem apagar histórico) e carrega PROVENIÊNCIA de cada
// dado (source, measured_at, confidence). Puro/determinístico. Reusa o
// body-metrics-unifier para a série de peso/BF.
// ─────────────────────────────────────────────────────────────────────────────

import { unifyBodyMetrics, seriesOf, linearTrend, type RawBodyPoint, type MetricSource } from './body-metrics-unifier';

export type BodySource = MetricSource | 'profile' | 'wearable' | 'health_connect' | 'manual' | 'estimated';
export type Confidence = 'high' | 'moderate' | 'low';

export interface Provenance<T> {
  value: T;
  source: BodySource;
  measuredAtISO: string | null;
  confidence: Confidence;
  ageDays: number | null;
}

export interface CanonicalBodyState {
  currentWeightKg: Provenance<number> | null;
  bodyFatPct: Provenance<number> | null;
  leanMassKg: Provenance<number> | null;
  muscleMassKg: Provenance<number> | null;
  visceralFat: Provenance<number> | null;
  waterPct: Provenance<number> | null;
  bmrKcal: Provenance<number> | null;
  restingHr: Provenance<number> | null;
  heightCm: Provenance<number> | null;
  age: Provenance<number> | null;
  gender: 'male' | 'female' | 'other' | null;
  weeklyWeightRateKg: number | null;      // ritmo por regressão
  dataConfidence: number;                  // 0..100 (frescor + fontes)
  lastMeasurementISO: string | null;
}

// confiança por fonte
const SOURCE_CONF: Record<BodySource, Confidence> = {
  bioimpedance: 'high', measurement: 'moderate', weight_log: 'moderate',
  wearable: 'high', health_connect: 'high', manual: 'moderate', profile: 'moderate', estimated: 'low',
};

const MS_DAY = 86_400_000;
const ageDaysOf = (iso: string | null, nowMs: number): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((nowMs - t) / MS_DAY));
};

// ── Entrada: fatos brutos por fonte ──
export interface BodyFact {
  metric: 'weight' | 'bodyFat' | 'leanMass' | 'muscleMass' | 'visceral' | 'water' | 'bmr' | 'restingHr';
  value: number | null;
  source: BodySource;
  measuredAtISO: string | null;
}

export interface CanonicalBodyInput {
  facts: BodyFact[];                 // todos os registros conhecidos (não apagar histórico)
  weightSeries: RawBodyPoint[];      // série p/ o ritmo (do body-metrics-unifier)
  profile: { heightCm: number | null; age: number | null; gender: 'male' | 'female' | 'other' | null };
  nowMs?: number;
}

// escolhe o fato "canônico" de uma métrica: mais recente vence; empate → maior confiança de fonte.
const CONF_RANK: Record<Confidence, number> = { high: 3, moderate: 2, low: 1 };
export function resolveCanonicalMeasurement(facts: BodyFact[], nowMs: number): Provenance<number> | null {
  const valid = facts.filter((f) => f.value != null);
  if (valid.length === 0) return null;
  const best = valid.reduce((a, b) => {
    const ta = a.measuredAtISO ? new Date(a.measuredAtISO).getTime() : 0;
    const tb = b.measuredAtISO ? new Date(b.measuredAtISO).getTime() : 0;
    if (Math.abs(ta - tb) > MS_DAY / 2) return tb > ta ? b : a;           // mais recente (>1 dia de diferença)
    return CONF_RANK[SOURCE_CONF[b.source]] > CONF_RANK[SOURCE_CONF[a.source]] ? b : a; // empate → fonte melhor
  });
  return {
    value: Math.round((best.value as number) * 100) / 100,
    source: best.source, measuredAtISO: best.measuredAtISO,
    confidence: SOURCE_CONF[best.source], ageDays: ageDaysOf(best.measuredAtISO, nowMs),
  };
}

export function getCanonicalBodyState(i: CanonicalBodyInput): CanonicalBodyState {
  const nowMs = i.nowMs ?? Date.now();
  const byMetric = (m: BodyFact['metric']) => resolveCanonicalMeasurement(i.facts.filter((f) => f.metric === m), nowMs);

  const currentWeightKg = byMetric('weight');
  const bodyFatPct = byMetric('bodyFat');
  const leanMassKg = byMetric('leanMass');
  const muscleMassKg = byMetric('muscleMass');
  const visceralFat = byMetric('visceral');
  const waterPct = byMetric('water');
  const bmrKcal = byMetric('bmr');
  const restingHr = byMetric('restingHr');

  // ritmo de peso por regressão sobre a série unificada
  const unified = unifyBodyMetrics(i.weightSeries);
  const weeklyWeightRateKg = linearTrend(seriesOf(unified, 'weightKg')).slopePerWeek;

  // confiança global: frescor do peso + nº de fontes distintas + presença de bioimpedância
  const distinctSources = new Set(i.facts.filter((f) => f.value != null).map((f) => f.source)).size;
  const weightAge = currentWeightKg?.ageDays ?? 999;
  const freshness = Math.max(0, 1 - weightAge / 30);       // peso <30d
  const sourcesScore = Math.min(1, distinctSources / 3);
  const bioScore = i.facts.some((f) => f.source === 'bioimpedance' && f.value != null) ? 1 : 0.5;
  const dataConfidence = Math.round((0.5 * freshness + 0.3 * sourcesScore + 0.2 * bioScore) * 100);

  const lastMeasurementISO = [currentWeightKg, bodyFatPct, muscleMassKg]
    .map((p) => p?.measuredAtISO).filter(Boolean).sort().slice(-1)[0] ?? null;

  return {
    currentWeightKg, bodyFatPct, leanMassKg, muscleMassKg, visceralFat, waterPct, bmrKcal, restingHr,
    heightCm: i.profile.heightCm != null ? { value: i.profile.heightCm, source: 'profile', measuredAtISO: null, confidence: 'moderate', ageDays: null } : null,
    age: i.profile.age != null ? { value: i.profile.age, source: 'profile', measuredAtISO: null, confidence: 'moderate', ageDays: null } : null,
    gender: i.profile.gender,
    weeklyWeightRateKg, dataConfidence, lastMeasurementISO,
  };
}
