// gps-core.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §5/§6 — Núcleo ÚNICO de processamento de GPS.
//
// Uma única função `processGpsTrack()` avalia uma atividade da MESMA forma ao vivo,
// ao salvar, na importação, no replay e na auditoria. Compõe os módulos existentes
// (GpsFilter: normalize→accuracy→Kalman→anomaly→distance) e devolve distância, pace
// e um GPS Quality Score 0-100 unificado (5 componentes). Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import { GpsFilter, type RawPoint, type CleanPoint } from './gps-filter';

export interface GpsQualityScore {
  score: number;                 // 0..100
  label: 'excelente' | 'boa' | 'moderada' | 'baixa';
  components: { precision: number; kept: number; anomalies: number; continuity: number; distanceConsistency: number };
}

export interface ProcessedTrack {
  cleanPoints: CleanPoint[];
  distanceKm: number;
  rawKm: number;
  durationSec: number;
  avgPaceSecPerKm: number | null;
  captured: number; valid: number; discarded: number; spikes: number;
  avgAccuracyM: number | null;
  maxGapSec: number;
  quality: GpsQualityScore;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function labelFor(score: number): GpsQualityScore['label'] {
  if (score >= 90) return 'excelente';
  if (score >= 75) return 'boa';
  if (score >= 60) return 'moderada';
  return 'baixa';
}

export function processGpsTrack(points: RawPoint[], modality: 'running' | 'walking' | 'cycling' = 'running'): ProcessedTrack {
  const filter = new GpsFilter(modality);
  const cleanPoints: CleanPoint[] = [];
  let distanceKm = 0;
  let maxGapSec = 0;
  let prevAcceptedTs: number | null = null;

  const sorted = [...points].filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const raw of sorted) {
    const cp = filter.push(raw);
    if (cp.accepted) {
      cleanPoints.push(cp);
      distanceKm += cp.segmentKm ?? 0;
      if (prevAcceptedTs != null) maxGapSec = Math.max(maxGapSec, (cp.timestamp - prevAcceptedTs) / 1000);
      prevAcceptedTs = cp.timestamp;
    }
  }

  const stats = filter.getStats();
  const durationSec = sorted.length >= 2 ? (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 1000 : 0;
  const avgAccuracyM = stats.accuracyCount > 0 ? stats.sumAccuracy / stats.accuracyCount : null;
  const avgPaceSecPerKm = distanceKm > 0.05 && durationSec > 0 ? Math.round(durationSec / distanceKm) : null;

  // ── GPS Quality Score unificado (5 componentes ponderados) ──
  const precision = clamp01(1 - Math.max(0, (avgAccuracyM ?? 20) - 10) / 30) * 25;
  const validRatio = stats.captured > 0 ? stats.valid / stats.captured : 1;
  const kept = validRatio * 20;
  const anomalies = clamp01(1 - (stats.spikes / Math.max(1, stats.captured)) * 3) * 20;
  const continuity = clamp01(1 - maxGapSec / 60) * 20;
  const distConsistency = stats.rawKm > 0.1 ? clamp01(1 - Math.max(0, (stats.rawKm - distanceKm) / stats.rawKm - 0.05)) * 15 : 15;

  const score = Math.round(precision + kept + anomalies + continuity + distConsistency);
  const quality: GpsQualityScore = {
    score, label: labelFor(score),
    components: {
      precision: Math.round(precision), kept: Math.round(kept), anomalies: Math.round(anomalies),
      continuity: Math.round(continuity), distanceConsistency: Math.round(distConsistency),
    },
  };

  return {
    cleanPoints, distanceKm: Math.round(distanceKm * 1000) / 1000, rawKm: Math.round(stats.rawKm * 1000) / 1000,
    durationSec, avgPaceSecPerKm,
    captured: stats.captured, valid: stats.valid, discarded: stats.discarded, spikes: stats.spikes,
    avgAccuracyM: avgAccuracyM != null ? Math.round(avgAccuracyM * 10) / 10 : null, maxGapSec: Math.round(maxGapSec),
    quality,
  };
}


// Score unificado a partir de stats já coletados (para o rastreador ao vivo,
// evitando reprocessar os pontos). Mesma fórmula do processGpsTrack.
export function scoreFromStats(stats: { captured: number; valid: number; discarded: number; spikes: number; rawKm: number; sumAccuracy: number; accuracyCount: number }, distanceKm: number, maxGapSec: number): GpsQualityScore {
  const avgAccuracyM = stats.accuracyCount > 0 ? stats.sumAccuracy / stats.accuracyCount : 20;
  const precision = clamp01(1 - Math.max(0, avgAccuracyM - 10) / 30) * 25;
  const validRatio = stats.captured > 0 ? stats.valid / stats.captured : 1;
  const kept = validRatio * 20;
  const anomalies = clamp01(1 - (stats.spikes / Math.max(1, stats.captured)) * 3) * 20;
  const continuity = clamp01(1 - maxGapSec / 60) * 20;
  const distConsistency = stats.rawKm > 0.1 ? clamp01(1 - Math.max(0, (stats.rawKm - distanceKm) / stats.rawKm - 0.05)) * 15 : 15;
  const score = Math.round(precision + kept + anomalies + continuity + distConsistency);
  return { score, label: labelFor(score), components: { precision: Math.round(precision), kept: Math.round(kept), anomalies: Math.round(anomalies), continuity: Math.round(continuity), distanceConsistency: Math.round(distConsistency) } };
}
