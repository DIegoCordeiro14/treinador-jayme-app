// src/lib/athlete-data/athlete-measurements-repo.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adaptador de MIGRAÇÃO GRADUAL (§30/§31). NÃO quebra as tabelas atuais.
//
// Leitura: coleta medições das tabelas legadas (bioimpedance_data,
// body_measurements, body_weight_logs, wearable_metrics) E da nova tabela
// unificada athlete_measurements, devolvendo um Measurement[] único para o
// resolver. Assim o Data Hub já enxerga tudo, mesmo antes de migrar dados.
//
// Escrita: novos registros de peso/composição vão para athlete_measurements
// (com client_generated_id p/ idempotência), mas os fluxos antigos continuam
// gravando em suas tabelas — nada é removido.
// ─────────────────────────────────────────────────────────────────────────────

import type { Measurement, BodyMetric, DataSource, DataConfidence } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

/** Lê todas as medições corporais conhecidas do atleta (legado + nova tabela). */
export async function collectBodyMeasurements(supabase: DB, userId: string): Promise<Measurement[]> {
  const out: Measurement[] = [];
  const push = (metric: BodyMetric, value: number | null, source: DataSource, measuredAt: string | null, confidence?: DataConfidence) => {
    if (value != null) out.push({ metric, value, source, measuredAt, confidence });
  };

  const [bioR, bmR, wlR, wmR, amR] = await Promise.all([
    supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, muscle_mass_kg, body_water_pct, visceral_fat, basal_metabolic_rate_kcal, measured_at').eq('user_id', userId).order('measured_at', { ascending: false }).limit(12),
    supabase.from('body_measurements').select('weight_kg, measured_at, created_at').eq('user_id', userId).order('measured_at', { ascending: false }).limit(24),
    supabase.from('body_weight_logs').select('weight_kg, log_date, created_at').eq('user_id', userId).order('log_date', { ascending: false }).limit(60),
    supabase.from('wearable_metrics').select('resting_hr, recorded_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(12),
    supabase.from('athlete_measurements').select('metric_type, numeric_value, source, confidence, measured_at, status').eq('user_id', userId).neq('status', 'archived').order('measured_at', { ascending: false }).limit(200),
  ]);

  for (const b of (bioR.data ?? [])) {
    const at = b.measured_at ?? null;
    push('weight', num(b.weight_kg), 'bioimpedance', at);
    push('bodyFat', num(b.body_fat_pct), 'bioimpedance', at);
    push('leanMass', num(b.lean_mass_kg), 'bioimpedance', at);
    push('muscleMass', num(b.muscle_mass_kg), 'bioimpedance', at);
    push('bodyWater', num(b.body_water_pct), 'bioimpedance', at);
    push('visceralFat', num(b.visceral_fat), 'bioimpedance', at);
    push('bmr', num(b.basal_metabolic_rate_kcal), 'bioimpedance', at);
  }
  for (const m of (bmR.data ?? [])) push('weight', num(m.weight_kg), 'evolution', m.measured_at ?? m.created_at ?? null);
  for (const w of (wlR.data ?? [])) push('weight', num(w.weight_kg), 'evolution', w.log_date ?? w.created_at ?? null);
  for (const w of (wmR.data ?? [])) push('restingHeartRate', num(w.resting_hr), 'wearable', w.recorded_at ?? w.created_at ?? null);

  for (const a of (amR.data ?? [])) {
    if (a.numeric_value == null) continue;
    out.push({
      metric: a.metric_type as BodyMetric,
      value: num(a.numeric_value),
      source: (a.source ?? 'manual') as DataSource,
      confidence: (a.confidence ?? undefined) as DataConfidence | undefined,
      measuredAt: a.measured_at ?? null,
    });
  }
  return out;
}

export interface WriteMeasurementInput {
  metric: BodyMetric;
  value: number;
  unit?: string;
  source?: DataSource;
  confidence?: DataConfidence;
  measuredAt?: string | null;
  verifiedByUser?: boolean;
  clientGeneratedId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

/**
 * Grava uma medição na tabela unificada. Idempotente por client_generated_id
 * (upsert no índice único user_id+client_generated_id) para suportar offline.
 */
export async function writeMeasurement(supabase: DB, userId: string, m: WriteMeasurementInput) {
  const row = {
    user_id: userId,
    metric_type: m.metric,
    numeric_value: m.value,
    unit: m.unit ?? (m.metric === 'weight' ? 'kg' : null),
    source: m.source ?? 'manual',
    confidence: m.confidence ?? 'medium',
    measured_at: m.measuredAt ?? new Date().toISOString(),
    verified_by_user: m.verifiedByUser ?? false,
    status: 'valid',
    client_generated_id: m.clientGeneratedId ?? null,
    metadata: m.metadata ?? null,
  };
  if (m.clientGeneratedId) {
    return supabase.from('athlete_measurements').upsert(row, { onConflict: 'user_id,client_generated_id' }).select('id').maybeSingle();
  }
  return supabase.from('athlete_measurements').insert(row).select('id').maybeSingle();
}
