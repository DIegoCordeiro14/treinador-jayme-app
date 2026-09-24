// src/lib/athlete-data/metric-catalog.ts
// ─────────────────────────────────────────────────────────────────────────────
// Athlete Data Hub — CATÁLOGO CANÔNICO DE MÉTRICAS (Fase 1).
//
// Definição ÚNICA de cada métrica do atleta, em todos os domínios (corpo, treino,
// cardio, recuperação, nutrição). Cada métrica declara: domínio, unidade, se
// "maior é melhor", a PREFERÊNCIA DE FONTE POR MÉTRICA (§9 — não é hierarquia
// global: BIA para composição, wearable para FC/sono, GPS para pace…), a faixa
// fisiológica plausível e o método de medição típico. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import type { DataSource, DataConfidence } from './types';

export type MetricDomain = 'body' | 'training' | 'cardio' | 'recovery' | 'nutrition';

export type MetricKey =
  // corpo
  | 'weight' | 'bodyFat' | 'leanMass' | 'skeletalMuscle' | 'visceralFat' | 'bodyWater'
  | 'waist' | 'arm' | 'thigh' | 'chest' | 'bmr'
  // treino
  | 'sessionCount' | 'weeklyVolumeKg' | 'trainingAdherence'
  // cardio
  | 'cardioDistanceKm' | 'cardioDurationMin' | 'pace' | 'avgHr' | 'maxHr'
  | 'elevationM' | 'cardioCalories' | 'cardioAcwr'
  // recuperação
  | 'sleepHours' | 'hrv' | 'restingHeartRate' | 'recoveryScore' | 'stress'
  // nutrição
  | 'calories' | 'protein' | 'carbs' | 'fat' | 'waterMl' | 'nutritionAdherence';

export interface MetricDefinition {
  key: MetricKey;
  domain: MetricDomain;
  label: string;           // rótulo PT-BR
  unit: string;
  higherIsBetter: boolean | null; // null = depende do objetivo (ex.: peso)
  /** Preferência de fonte, da MAIS confiável p/ a métrica à menos (§9). */
  sourcePreference: DataSource[];
  /** Faixa fisiológica plausível (sinaliza suspect; nunca bloqueia). */
  plausible?: { min: number; max: number };
  /** Frescor esperado em dias — acima disso o dado é "velho" (freshness §16). */
  freshnessDays: number;
}

const D = (d: MetricDefinition) => d;

export const METRIC_CATALOG: Record<MetricKey, MetricDefinition> = {
  // ── Corpo ──────────────────────────────────────────────────────────────────
  weight:        D({ key: 'weight', domain: 'body', label: 'Peso', unit: 'kg', higherIsBetter: null, sourcePreference: ['wearable', 'health_connect', 'bioimpedance', 'evolution', 'manual', 'profile', 'estimated'], plausible: { min: 25, max: 400 }, freshnessDays: 7 }),
  bodyFat:       D({ key: 'bodyFat', domain: 'body', label: 'Gordura corporal', unit: '%', higherIsBetter: false, sourcePreference: ['bioimpedance', 'wearable', 'health_connect', 'evolution', 'manual', 'estimated'], plausible: { min: 2, max: 75 }, freshnessDays: 21 }),
  leanMass:      D({ key: 'leanMass', domain: 'body', label: 'Massa magra', unit: 'kg', higherIsBetter: true, sourcePreference: ['bioimpedance', 'evolution', 'manual', 'estimated'], plausible: { min: 15, max: 200 }, freshnessDays: 21 }),
  skeletalMuscle:D({ key: 'skeletalMuscle', domain: 'body', label: 'Músculo esquelético', unit: 'kg', higherIsBetter: true, sourcePreference: ['bioimpedance', 'evolution', 'manual', 'estimated'], plausible: { min: 10, max: 120 }, freshnessDays: 21 }),
  visceralFat:   D({ key: 'visceralFat', domain: 'body', label: 'Gordura visceral', unit: '', higherIsBetter: false, sourcePreference: ['bioimpedance', 'manual', 'estimated'], plausible: { min: 1, max: 60 }, freshnessDays: 30 }),
  bodyWater:     D({ key: 'bodyWater', domain: 'body', label: 'Água corporal', unit: '%', higherIsBetter: null, sourcePreference: ['bioimpedance', 'manual', 'estimated'], plausible: { min: 20, max: 80 }, freshnessDays: 30 }),
  waist:         D({ key: 'waist', domain: 'body', label: 'Cintura', unit: 'cm', higherIsBetter: false, sourcePreference: ['manual', 'evolution', 'estimated'], plausible: { min: 40, max: 200 }, freshnessDays: 30 }),
  arm:           D({ key: 'arm', domain: 'body', label: 'Braço', unit: 'cm', higherIsBetter: true, sourcePreference: ['manual', 'evolution', 'estimated'], plausible: { min: 15, max: 70 }, freshnessDays: 30 }),
  thigh:         D({ key: 'thigh', domain: 'body', label: 'Coxa', unit: 'cm', higherIsBetter: true, sourcePreference: ['manual', 'evolution', 'estimated'], plausible: { min: 30, max: 100 }, freshnessDays: 30 }),
  chest:         D({ key: 'chest', domain: 'body', label: 'Peito', unit: 'cm', higherIsBetter: true, sourcePreference: ['manual', 'evolution', 'estimated'], plausible: { min: 60, max: 160 }, freshnessDays: 30 }),
  bmr:           D({ key: 'bmr', domain: 'body', label: 'TMB', unit: 'kcal', higherIsBetter: null, sourcePreference: ['bioimpedance', 'estimated'], plausible: { min: 600, max: 4500 }, freshnessDays: 30 }),

  // ── Treino ─────────────────────────────────────────────────────────────────
  sessionCount:     D({ key: 'sessionCount', domain: 'training', label: 'Sessões/semana', unit: '', higherIsBetter: true, sourcePreference: ['coach_action', 'manual'], plausible: { min: 0, max: 21 }, freshnessDays: 7 }),
  weeklyVolumeKg:   D({ key: 'weeklyVolumeKg', domain: 'training', label: 'Volume semanal', unit: 'kg', higherIsBetter: true, sourcePreference: ['coach_action', 'manual'], plausible: { min: 0, max: 500000 }, freshnessDays: 7 }),
  trainingAdherence:D({ key: 'trainingAdherence', domain: 'training', label: 'Aderência ao treino', unit: '%', higherIsBetter: true, sourcePreference: ['coach_action'], plausible: { min: 0, max: 100 }, freshnessDays: 7 }),

  // ── Cardio ─────────────────────────────────────────────────────────────────
  cardioDistanceKm: D({ key: 'cardioDistanceKm', domain: 'cardio', label: 'Distância', unit: 'km', higherIsBetter: null, sourcePreference: ['health_connect', 'wearable', 'manual'], plausible: { min: 0, max: 500 }, freshnessDays: 7 }),
  cardioDurationMin:D({ key: 'cardioDurationMin', domain: 'cardio', label: 'Duração', unit: 'min', higherIsBetter: null, sourcePreference: ['health_connect', 'wearable', 'manual'], plausible: { min: 0, max: 1440 }, freshnessDays: 7 }),
  pace:             D({ key: 'pace', domain: 'cardio', label: 'Pace', unit: 'min/km', higherIsBetter: false, sourcePreference: ['health_connect', 'wearable', 'manual'], plausible: { min: 2, max: 20 }, freshnessDays: 7 }),
  avgHr:            D({ key: 'avgHr', domain: 'cardio', label: 'FC média', unit: 'bpm', higherIsBetter: null, sourcePreference: ['wearable', 'health_connect', 'manual'], plausible: { min: 40, max: 220 }, freshnessDays: 7 }),
  maxHr:            D({ key: 'maxHr', domain: 'cardio', label: 'FC máxima', unit: 'bpm', higherIsBetter: null, sourcePreference: ['wearable', 'health_connect', 'manual'], plausible: { min: 90, max: 230 }, freshnessDays: 30 }),
  elevationM:       D({ key: 'elevationM', domain: 'cardio', label: 'Elevação', unit: 'm', higherIsBetter: null, sourcePreference: ['health_connect', 'wearable', 'manual'], plausible: { min: 0, max: 10000 }, freshnessDays: 7 }),
  cardioCalories:   D({ key: 'cardioCalories', domain: 'cardio', label: 'Calorias (cardio)', unit: 'kcal', higherIsBetter: null, sourcePreference: ['wearable', 'health_connect', 'estimated'], plausible: { min: 0, max: 5000 }, freshnessDays: 7 }),
  cardioAcwr:       D({ key: 'cardioAcwr', domain: 'cardio', label: 'ACWR', unit: '', higherIsBetter: null, sourcePreference: ['coach_action'], plausible: { min: 0, max: 3 }, freshnessDays: 7 }),

  // ── Recuperação ──────────────────────────────────────────────────────────────
  sleepHours:       D({ key: 'sleepHours', domain: 'recovery', label: 'Sono', unit: 'h', higherIsBetter: true, sourcePreference: ['wearable', 'health_connect', 'manual', 'profile'], plausible: { min: 0, max: 16 }, freshnessDays: 2 }),
  hrv:              D({ key: 'hrv', domain: 'recovery', label: 'HRV', unit: 'ms', higherIsBetter: true, sourcePreference: ['wearable', 'health_connect'], plausible: { min: 5, max: 300 }, freshnessDays: 2 }),
  restingHeartRate: D({ key: 'restingHeartRate', domain: 'recovery', label: 'FC repouso', unit: 'bpm', higherIsBetter: false, sourcePreference: ['wearable', 'health_connect', 'manual'], plausible: { min: 25, max: 120 }, freshnessDays: 3 }),
  recoveryScore:    D({ key: 'recoveryScore', domain: 'recovery', label: 'Recuperação', unit: '/100', higherIsBetter: true, sourcePreference: ['wearable', 'coach_action'], plausible: { min: 0, max: 100 }, freshnessDays: 2 }),
  stress:           D({ key: 'stress', domain: 'recovery', label: 'Estresse', unit: '', higherIsBetter: false, sourcePreference: ['wearable', 'manual', 'profile'], plausible: { min: 0, max: 100 }, freshnessDays: 3 }),

  // ── Nutrição ─────────────────────────────────────────────────────────────────
  calories:         D({ key: 'calories', domain: 'nutrition', label: 'Calorias', unit: 'kcal', higherIsBetter: null, sourcePreference: ['nutrition', 'manual', 'estimated'], plausible: { min: 0, max: 12000 }, freshnessDays: 2 }),
  protein:          D({ key: 'protein', domain: 'nutrition', label: 'Proteína', unit: 'g', higherIsBetter: null, sourcePreference: ['nutrition', 'manual', 'estimated'], plausible: { min: 0, max: 600 }, freshnessDays: 2 }),
  carbs:            D({ key: 'carbs', domain: 'nutrition', label: 'Carboidrato', unit: 'g', higherIsBetter: null, sourcePreference: ['nutrition', 'manual', 'estimated'], plausible: { min: 0, max: 1500 }, freshnessDays: 2 }),
  fat:              D({ key: 'fat', domain: 'nutrition', label: 'Gordura', unit: 'g', higherIsBetter: null, sourcePreference: ['nutrition', 'manual', 'estimated'], plausible: { min: 0, max: 500 }, freshnessDays: 2 }),
  waterMl:          D({ key: 'waterMl', domain: 'nutrition', label: 'Água', unit: 'ml', higherIsBetter: true, sourcePreference: ['nutrition', 'manual'], plausible: { min: 0, max: 12000 }, freshnessDays: 2 }),
  nutritionAdherence:D({ key: 'nutritionAdherence', domain: 'nutrition', label: 'Aderência nutricional', unit: '%', higherIsBetter: true, sourcePreference: ['nutrition', 'coach_action'], plausible: { min: 0, max: 100 }, freshnessDays: 3 }),
};

export const ALL_METRIC_KEYS = Object.keys(METRIC_CATALOG) as MetricKey[];

export function metricsByDomain(domain: MetricDomain): MetricDefinition[] {
  return ALL_METRIC_KEYS.map((k) => METRIC_CATALOG[k]).filter((m) => m.domain === domain);
}

export function getMetric(key: MetricKey): MetricDefinition { return METRIC_CATALOG[key]; }

/** Confiança default de uma fonte PARA uma métrica: quanto mais alta na
 *  preferência, maior a confiança. Usada quando o registro não a traz explícita. */
export function sourceConfidenceFor(key: MetricKey, source: DataSource): DataConfidence {
  const pref = METRIC_CATALOG[key].sourcePreference;
  const idx = pref.indexOf(source);
  if (idx < 0) return 'low';
  if (idx === 0) return 'high';
  if (idx <= 2) return 'medium';
  return 'low';
}

/** Rank de preferência de fonte p/ a métrica (0 = melhor; -1 = fora da lista). */
export function sourceRankFor(key: MetricKey, source: DataSource): number {
  return METRIC_CATALOG[key].sourcePreference.indexOf(source);
}
