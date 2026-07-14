/**
 * Import Processing — reconstrói a corrida importada com fidelidade.
 * Normaliza rota GPS e série de FC de fontes oficiais e calcula (determinístico)
 * FC média/máx/mín, tempo por zona, distribuição %, deriva cardíaca e pace×FC.
 * A IA NÃO calcula esses números — apenas interpreta o resultado.
 */

export interface ImportedGpsPoint { timestamp?: string | null; latitude: number; longitude: number; altitude?: number | null; accuracy?: number | null; speedMps?: number | null; bearing?: number | null }
export interface ImportedHeartRateSample { timestamp?: string | null; bpm: number }

export interface ImportedCardioActivity {
  externalId: string; provider: string; performedAt: string; activityType: string;
  durationSeconds: number; distanceMeters?: number | null; caloriesKcal?: number | null;
  averageHeartRate?: number | null; maxHeartRate?: number | null; cadence?: number | null; elevationGainMeters?: number | null;
  gpsPoints: ImportedGpsPoint[]; heartRateSamples: ImportedHeartRateSample[];
  rawMetadata?: Record<string, unknown>;
}

// ── GPS: validar/ordenar/dedup (wearable = só validação, sem filtro agressivo) ─
export function processGpsPoints(points: ImportedGpsPoint[]): ImportedGpsPoint[] {
  const valid = points.filter(p =>
    Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 &&
    !(p.latitude === 0 && p.longitude === 0));
  const withT = valid.filter(p => p.timestamp);
  if (withT.length === valid.length && withT.length > 0) {
    valid.sort((a, b) => new Date(a.timestamp as string).getTime() - new Date(b.timestamp as string).getTime());
  }
  // remove duplicados consecutivos (mesma coordenada e timestamp)
  const out: ImportedGpsPoint[] = [];
  for (const p of valid) {
    const last = out[out.length - 1];
    if (last && last.latitude === p.latitude && last.longitude === p.longitude && last.timestamp === p.timestamp) continue;
    out.push(p);
  }
  return out;
}

// ── FC: zonas por %FCmáx (Z1<60, Z2 60-70, Z3 70-80, Z4 80-90, Z5 90+) ─────────
export interface HrMetrics {
  avg: number | null; max: number | null; min: number | null;
  maxHrRef: number;                 // FC máx de referência usada nas zonas
  timeInZonePct: number[];          // [Z1..Z5] em % das amostras
  drift: number | null;             // deriva: FC média 2ª metade vs 1ª metade (%)
  samples: number;
}

export function processHeartRate(samples: ImportedHeartRateSample[], maxHrProvided: number | null, age: number | null): HrMetrics {
  const bpms = samples.map(s => s.bpm).filter(b => Number.isFinite(b) && b >= 30 && b <= 230);
  if (!bpms.length) return { avg: null, max: null, min: null, maxHrRef: maxHrProvided ?? (age ? 220 - age : 190), timeInZonePct: [0, 0, 0, 0, 0], drift: null, samples: 0 };
  const max = Math.max(...bpms);
  const min = Math.min(...bpms);
  const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
  const maxHrRef = Math.max(maxHrProvided ?? 0, age ? 220 - age : 0, max) || max;
  const zoneCount = [0, 0, 0, 0, 0];
  for (const b of bpms) {
    const pct = b / maxHrRef;
    const z = pct < 0.6 ? 0 : pct < 0.7 ? 1 : pct < 0.8 ? 2 : pct < 0.9 ? 3 : 4;
    zoneCount[z]++;
  }
  const timeInZonePct = zoneCount.map(c => Math.round((c / bpms.length) * 100));
  // deriva cardíaca: metade final vs inicial
  let drift: number | null = null;
  if (bpms.length >= 6) {
    const mid = Math.floor(bpms.length / 2);
    const a1 = bpms.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const a2 = bpms.slice(mid).reduce((a, b) => a + b, 0) / (bpms.length - mid);
    if (a1 > 0) drift = Math.round(((a2 - a1) / a1) * 1000) / 10;
  }
  return { avg, max, min, maxHrRef, timeInZonePct, drift, samples: bpms.length };
}

// Estado da importação (sincronização incremental).
export function importStatus(a: { gpsPoints: unknown[]; heartRateSamples: unknown[]; distanceMeters?: number | null }): string {
  const hasGps = a.gpsPoints.length > 1;
  const hasHr = a.heartRateSamples.length > 0;
  if (hasGps && hasHr) return 'complete';
  if (hasGps || hasHr) return 'partial';
  return 'summary_imported';
}
