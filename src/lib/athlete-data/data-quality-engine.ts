// src/lib/athlete-data/data-quality-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Data Quality Engine (Fase 5). PURO/DETERMINÍSTICO.
//
// A partir das métricas resolvidas, produz um relatório de QUALIDADE DE DADOS:
// ausência, dado velho (freshness), valor implausível (suspect), conflito entre
// fontes (§18), baixa confiança e mudança abrupta. Não altera nenhum dado —
// apenas sinaliza (o usuário confirma). Também deduplica listas de medições de
// forma idempotente (evita loops de reingestão, §21).
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedMetric, MetricMeasurement } from './data-resolution-engine';
import { METRIC_CATALOG, ALL_METRIC_KEYS, type MetricKey } from './metric-catalog';

export type QualityKind = 'missing' | 'stale' | 'implausible' | 'conflict' | 'low_confidence' | 'abrupt_change';
export type QualitySeverity = 'info' | 'warn' | 'critical';

export interface DataQualityIssue {
  metric: MetricKey;
  label: string;
  kind: QualityKind;
  severity: QualitySeverity;
  detail: string;
}

export interface DataQualityReport {
  score: number;                 // 0..100 (100 = tudo íntegro)
  issues: DataQualityIssue[];
  counts: Record<QualityKind, number>;
}

export interface QualityOptions {
  /** Valor anterior conhecido por métrica (p/ detectar mudança abrupta). */
  previous?: Partial<Record<MetricKey, number>>;
  /** Métricas que são obrigatórias p/ o relatório considerar "missing" crítico. */
  required?: MetricKey[];
}

// Variação relativa que consideramos "abrupta" por métrica (fração).
const ABRUPT_PCT: Partial<Record<MetricKey, number>> = { weight: 0.05, bodyFat: 0.15, restingHeartRate: 0.25 };

export function computeDataQuality(
  resolved: Partial<Record<MetricKey, ResolvedMetric>>,
  opts: QualityOptions = {},
): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  const required = new Set(opts.required ?? (['weight', 'bodyFat'] as MetricKey[]));

  for (const key of ALL_METRIC_KEYS) {
    const def = METRIC_CATALOG[key];
    const r = resolved[key];

    if (!r || r.value == null) {
      if (required.has(key)) issues.push({ metric: key, label: def.label, kind: 'missing', severity: 'warn', detail: `${def.label} sem nenhum dado registrado.` });
      continue;
    }
    if (r.status === 'suspect') issues.push({ metric: key, label: def.label, kind: 'implausible', severity: 'critical', detail: `${def.label} com valor fora da faixa esperada (${r.value}${r.unit}).` });
    if (r.conflict) {
      const c = r.conflict;
      issues.push({ metric: key, label: def.label, kind: 'conflict', severity: c.severity === 'high' ? 'critical' : 'warn', detail: `${def.label}: ${c.a.source} ${c.a.value}${r.unit} vs ${c.b.source} ${c.b.value}${r.unit} (Δ ${c.diffAbs}${r.unit}).` });
    }
    if (r.isStale) issues.push({ metric: key, label: def.label, kind: 'stale', severity: 'info', detail: `${def.label} desatualizado (${r.ageDays} dias; ideal < ${def.freshnessDays}).` });
    if (r.confidence === 'low' || r.confidence === 'unknown') issues.push({ metric: key, label: def.label, kind: 'low_confidence', severity: 'info', detail: `${def.label} com baixa confiança (fonte ${r.source}).` });

    const prev = opts.previous?.[key];
    const thr = ABRUPT_PCT[key];
    if (prev != null && thr != null && prev !== 0) {
      const change = Math.abs((r.value - prev) / prev);
      if (change >= thr) issues.push({ metric: key, label: def.label, kind: 'abrupt_change', severity: 'warn', detail: `${def.label} mudou ${Math.round(change * 100)}% desde a última medição — verifique.` });
    }
  }

  const counts = { missing: 0, stale: 0, implausible: 0, conflict: 0, low_confidence: 0, abrupt_change: 0 } as Record<QualityKind, number>;
  let penalty = 0;
  for (const it of issues) {
    counts[it.kind]++;
    penalty += it.severity === 'critical' ? 15 : it.severity === 'warn' ? 7 : 2;
  }
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { score, issues, counts };
}

/** Deduplicação idempotente de medições (§21). Chave: metric+source+valor+
 *  timestamp (arredondado ao minuto) OU externalId quando presente. */
export function dedupeMeasurements(
  measurements: (MetricMeasurement & { externalId?: string | null })[],
): (MetricMeasurement & { externalId?: string | null })[] {
  const seen = new Set<string>();
  const out: (MetricMeasurement & { externalId?: string | null })[] = [];
  for (const m of measurements) {
    const t = m.measuredAt ? new Date(m.measuredAt).toISOString().slice(0, 16) : 'na';
    const key = m.externalId ? `${m.metric}|${m.source}|ext:${m.externalId}` : `${m.metric}|${m.source}|${m.value}|${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
