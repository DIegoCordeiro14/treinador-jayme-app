// src/lib/athlete-data/data-resolution-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Data Resolution Engine (Fase 2). PURO/DETERMINÍSTICO.
//
// resolveMetric(key, measurements) decide o valor CANÔNICO de UMA métrica usando:
//   1. plausibilidade fisiológica (catálogo) → marca suspect, nunca apaga;
//   2. recência (mais recente vence, janela de 12h);
//   3. dentro da janela, PREFERÊNCIA DE FONTE POR MÉTRICA (catálogo, §9);
//   4. detecção de CONFLITO: fontes recentes que divergem além do limiar (§18);
//   5. freshness: sinaliza dado "velho" acima do freshnessDays da métrica.
//
// A IA nunca entra aqui. Toda decisão é aritmética e explicável.
// ─────────────────────────────────────────────────────────────────────────────

import type { DataSource, DataConfidence, MeasurementStatus } from './types';
import { METRIC_CATALOG, sourceConfidenceFor, sourceRankFor, type MetricKey } from './metric-catalog';

export interface MetricMeasurement {
  metric: MetricKey;
  value: number | null;
  source: DataSource;
  measuredAt: string | null;
  confidence?: DataConfidence;
  verifiedByUser?: boolean;
}

export interface MetricConflict {
  metric: MetricKey;
  a: { value: number; source: DataSource; measuredAt: string | null };
  b: { value: number; source: DataSource; measuredAt: string | null };
  diffAbs: number;
  diffPct: number;
  severity: 'watch' | 'high';
}

export interface ResolvedMetric {
  metric: MetricKey;
  value: number | null;
  unit: string;
  source: DataSource;
  measuredAt: string | null;
  confidence: DataConfidence;
  status: MeasurementStatus;
  ageDays: number | null;
  isStale: boolean;                 // acima do freshnessDays da métrica
  sourceCount: number;              // fontes distintas com valor válido
  suspectCount: number;
  conflict: MetricConflict | null;  // divergência entre fontes recentes (§18)
}

const MS_DAY = 86_400_000;
const RECENCY_WINDOW_MS = MS_DAY / 2; // 12h
// Limiar de conflito por métrica: % relativo OU mínimo absoluto (o que for maior).
const CONFLICT_PCT = 3;   // >3% de diferença entre fontes recentes (com minimo absoluto por metrica)
const CONFLICT_MIN_ABS: Partial<Record<MetricKey, number>> = { weight: 1.5, bodyFat: 2, restingHeartRate: 8 };

const tms = (iso: string | null | undefined): number | null => {
  if (!iso) return null; const t = new Date(iso).getTime(); return Number.isNaN(t) ? null : t;
};
const confOf = (key: MetricKey, m: MetricMeasurement): DataConfidence => m.confidence ?? sourceConfidenceFor(key, m.source);
const CONF_RANK: Record<DataConfidence, number> = { high: 3, medium: 2, low: 1, unknown: 0 };

function isImplausible(key: MetricKey, value: number): boolean {
  const r = METRIC_CATALOG[key].plausible;
  return !!r && (value < r.min || value > r.max);
}

/** Escolhe entre dois candidatos: mais recente vence; empate (12h) → melhor
 *  rank de fonte para a métrica; empate de rank → maior confiança. */
function better<T extends { m: MetricMeasurement; t: number }>(key: MetricKey, a: T, b: T): T {
  if (Math.abs(a.t - b.t) > RECENCY_WINDOW_MS) return b.t > a.t ? b : a;
  const ra = sourceRankFor(key, a.m.source), rb = sourceRankFor(key, b.m.source);
  const na = ra < 0 ? 999 : ra, nb = rb < 0 ? 999 : rb;
  if (na !== nb) return nb < na ? b : a;                 // menor rank = melhor
  return CONF_RANK[confOf(key, b.m)] > CONF_RANK[confOf(key, a.m)] ? b : a;
}

export function resolveMetric(key: MetricKey, all: MetricMeasurement[], nowMs = Date.now()): ResolvedMetric | null {
  const def = METRIC_CATALOG[key];
  const mine = all.filter((m) => m.metric === key && m.value != null && Number.isFinite(m.value as number));
  if (mine.length === 0) return null;

  const tagged = mine.map((m) => ({ m, t: tms(m.measuredAt) ?? 0, suspect: isImplausible(key, m.value as number) }));
  const plausible = tagged.filter((x) => !x.suspect);
  const pool = plausible.length > 0 ? plausible : tagged;

  const best = pool.reduce((a, b) => better(key, a, b));
  const suspectCount = tagged.filter((x) => x.suspect).length;
  const sourceCount = new Set(mine.map((m) => m.source)).size;
  const ageDays = best.t ? Math.max(0, Math.floor((nowMs - best.t) / MS_DAY)) : null;
  const status: MeasurementStatus = best.suspect ? 'suspect' : 'valid';

  // ── Conflito (§18): duas fontes DISTINTAS, ambas recentes (dentro da janela do
  //    melhor), que divergem além do limiar. Só sinaliza — não altera o valor.
  let conflict: MetricConflict | null = null;
  const recent = pool.filter((x) => Math.abs(best.t - x.t) <= RECENCY_WINDOW_MS && x.m.source !== best.m.source);
  for (const other of recent) {
    const va = best.m.value as number, vb = other.m.value as number;
    const diffAbs = Math.round(Math.abs(va - vb) * 100) / 100;
    const diffPct = va !== 0 ? Math.round((diffAbs / Math.abs(va)) * 1000) / 10 : 0;
    const minAbs = CONFLICT_MIN_ABS[key] ?? 0;
    if (diffPct >= CONFLICT_PCT && diffAbs >= minAbs) {
      const sev: MetricConflict['severity'] = diffPct >= CONFLICT_PCT * 2 ? 'high' : 'watch';
      if (!conflict || sev === 'high') {
        conflict = {
          metric: key,
          a: { value: Math.round(va * 100) / 100, source: best.m.source, measuredAt: best.m.measuredAt },
          b: { value: Math.round(vb * 100) / 100, source: other.m.source, measuredAt: other.m.measuredAt },
          diffAbs, diffPct, severity: sev,
        };
      }
    }
  }

  return {
    metric: key, value: Math.round((best.m.value as number) * 100) / 100, unit: def.unit,
    source: best.m.source, measuredAt: best.m.measuredAt, confidence: confOf(key, best.m),
    status, ageDays, isStale: ageDays != null && ageDays > def.freshnessDays,
    sourceCount, suspectCount, conflict,
  };
}

/** Resolve todas as métricas presentes na lista. */
export function resolveMetrics(all: MetricMeasurement[], nowMs = Date.now()): Partial<Record<MetricKey, ResolvedMetric>> {
  const out: Partial<Record<MetricKey, ResolvedMetric>> = {};
  for (const key of new Set(all.map((m) => m.metric))) {
    const r = resolveMetric(key, all, nowMs);
    if (r) out[key] = r;
  }
  return out;
}
