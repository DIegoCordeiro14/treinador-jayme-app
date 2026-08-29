// src/lib/athlete-data/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Athlete Data Hub — tipos centrais (§3/§4/§6/§29).
// Contratos canônicos de proveniência, confiança e status de medição usados por
// TODOS os módulos (Perfil, Evolução, Nutrição, Dashboard, Bioimpedância, Coach).
// ─────────────────────────────────────────────────────────────────────────────

/** Origem de um dado do atleta (§3). */
export type DataSource =
  | 'manual'
  | 'profile'
  | 'evolution'
  | 'bioimpedance'
  | 'wearable'
  | 'health_connect'
  | 'nutrition'
  | 'coach_action'
  | 'import'
  | 'estimated';

/** Nível de confiança de um dado (§4). Independente de recência. */
export type DataConfidence = 'high' | 'medium' | 'low' | 'unknown';

/** Ciclo de vida de uma medição (§6). Nada é apagado automaticamente. */
export type MeasurementStatus = 'valid' | 'suspect' | 'superseded' | 'archived';

/** Métricas corporais suportadas pelo resolver. */
export type BodyMetric =
  | 'weight'
  | 'bodyFat'
  | 'leanMass'
  | 'muscleMass'
  | 'visceralFat'
  | 'bodyWater'
  | 'bmr'
  | 'restingHeartRate';

/** Uma medição bruta de uma métrica, com proveniência completa. */
export interface Measurement {
  metric: BodyMetric;
  value: number | null;
  unit?: string;
  source: DataSource;
  /** Momento real da medição (o que importa para recência). */
  measuredAt: string | null;
  /** Momento em que foi registrada no sistema (auditoria/offline). */
  recordedAt?: string | null;
  confidence?: DataConfidence;
  verifiedByUser?: boolean;
  /** Idempotência p/ offline-first (§33). */
  clientGeneratedId?: string;
}

/** Resultado determinístico da resolução de conflitos para UMA métrica. */
export interface ResolvedMeasurement {
  metric: BodyMetric;
  value: number | null;
  source: DataSource;
  measuredAt: string | null;
  confidence: DataConfidence;
  status: MeasurementStatus;
  ageDays: number | null;
  /** Medições que foram descartadas/marcadas nesta resolução (auditoria, §32). */
  supersededCount: number;
  suspectCount: number;
}

/** Faixas fisiológicas conservadoras para detecção de valores implausíveis (§6). */
export interface PlausibilityRange { min: number; max: number }
