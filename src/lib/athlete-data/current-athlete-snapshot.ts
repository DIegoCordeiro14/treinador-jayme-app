// src/lib/athlete-data/current-athlete-snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// CurrentAthleteSnapshot (Fase 4). Contrato objetivo que os motores/IA consomem:
// cada campo carrega { value, unit, source, measuredAt, confidence, ageDays,
// isStale }. Composto a partir das métricas resolvidas (Data Resolution Engine).
// Puro/determinístico. Agrega confiança global, conflitos, dados velhos/ausentes.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedMetric } from './data-resolution-engine';
import { goalLabel } from '../edn/goal';
import { METRIC_CATALOG, metricsByDomain, type MetricKey, type MetricDomain } from './metric-catalog';
import type { MetricConflict } from './data-resolution-engine';

export interface MetricCell {
  value: number | null;
  unit: string;
  source: string | null;
  measuredAt: string | null;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  ageDays: number | null;
  isStale: boolean;
}

export interface CurrentAthleteSnapshot {
  identity: { name: string | null; sex: string | null; age: number | null; experience: string | null };
  goal: { key: string | null; label: string };
  body: Record<string, MetricCell>;
  recovery: Record<string, MetricCell>;
  cardio: Record<string, MetricCell>;
  nutrition: Record<string, MetricCell>;
  training: Record<string, MetricCell>;
  globalConfidence: number;     // 0..100
  conflicts: MetricConflict[];
  staleData: string[];          // rótulos das métricas velhas
  missingData: string[];        // rótulos das métricas sem dado
  generatedAtISO: string;
}

export interface SnapshotInput {
  metrics: Partial<Record<MetricKey, ResolvedMetric>>;
  identity: { name: string | null; sex: string | null; age: number | null; experience: string | null };
  goalKey: string | null;
  nowISO?: string;
}

const CONF_SCORE = { high: 100, medium: 70, low: 40, unknown: 20 } as const;

function cellOf(r: ResolvedMetric | undefined, unit: string): MetricCell | null {
  if (!r) return null;
  return { value: r.value, unit: r.unit || unit, source: r.source, measuredAt: r.measuredAt, confidence: r.confidence, ageDays: r.ageDays, isStale: r.isStale };
}

export function buildCurrentAthleteSnapshot(i: SnapshotInput): CurrentAthleteSnapshot {
  const nowISO = i.nowISO ?? new Date().toISOString();
  const conflicts: MetricConflict[] = [];
  const staleData: string[] = [];
  const missingData: string[] = [];
  const confScores: number[] = [];

  const domainBlock = (domain: MetricDomain): Record<string, MetricCell> => {
    const block: Record<string, MetricCell> = {};
    for (const def of metricsByDomain(domain)) {
      const r = i.metrics[def.key];
      const cell = cellOf(r, def.unit);
      if (cell) {
        block[def.key] = cell;
        confScores.push(CONF_SCORE[cell.confidence]);
        if (cell.isStale) staleData.push(def.label);
        if (r?.conflict) conflicts.push(r.conflict);
      } else {
        missingData.push(def.label);
      }
    }
    return block;
  };

  // popula os blocos ANTES de agregar a confiança global
  const body = domainBlock('body');
  const recovery = domainBlock('recovery');
  const cardio = domainBlock('cardio');
  const nutrition = domainBlock('nutrition');
  const training = domainBlock('training');
  const globalConfidence = confScores.length ? Math.round(confScores.reduce((a, b) => a + b, 0) / confScores.length) : 0;

  return {
    identity: i.identity,
    goal: { key: i.goalKey, label: goalLabel(i.goalKey) },
    body, recovery, cardio, nutrition, training,
    globalConfidence, conflicts, staleData, missingData, generatedAtISO: nowISO,
  };
}

// util p/ consumidores: a métrica ou null, sem quebrar
export function cell(snapshot: CurrentAthleteSnapshot, domain: MetricDomain, key: MetricKey): MetricCell | null {
  const block = snapshot[domain] as Record<string, MetricCell>;
  return block?.[key] ?? null;
}

export { METRIC_CATALOG };
