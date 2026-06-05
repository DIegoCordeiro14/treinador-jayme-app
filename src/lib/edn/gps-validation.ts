/**
 * GPS Validation — V6.6
 * Ferramenta interna para comparar a distância medida pelo Coach EDN com a
 * referência (Strava/Garmin no mesmo dispositivo). Meta: erro < 3%.
 *
 * Uso (ex. num console/rota de debug):
 *   const report = validateAgainstReference(points, 1.7);
 */

import { computeTrackDistanceKm, classifyAccuracy, haversineKm, type TrackPoint, type GpsQuality } from './run-tracking';

export interface GpsValidationReport {
  ednDistanceKm: number;
  referenceDistanceKm: number;
  errorPct: number;            // |edn - ref| / ref * 100
  withinTarget: boolean;       // erro < 3%
  rawDistanceKm: number;       // sem nenhum filtro (todos os pontos)
  pointCount: number;
  avgAccuracyM: number | null;
  qualityBreakdown: Record<GpsQuality, number>;
  avgIntervalSec: number | null;
  maxGapSec: number | null;    // maior buraco entre pontos (tela travada?)
  diagnosis: string[];
}

export function validateAgainstReference(points: TrackPoint[], referenceKm: number): GpsValidationReport {
  const edn = computeTrackDistanceKm(points);

  // Distância "crua" sem filtros — para isolar o efeito dos filtros
  let raw = 0;
  for (let i = 1; i < points.length; i++) raw += haversineKm(points[i - 1], points[i]);

  const errorPct = referenceKm > 0 ? Math.abs(edn - referenceKm) / referenceKm * 100 : 0;

  const accs = points.map(p => p.accuracy).filter((a): a is number => a != null);
  const avgAccuracy = accs.length ? accs.reduce((s, a) => s + a, 0) / accs.length : null;

  const quality: Record<GpsQuality, number> = { excellent: 0, good: 0, poor: 0 };
  for (const p of points) quality[classifyAccuracy(p.accuracy)] += 1;

  let avgInterval: number | null = null;
  let maxGap: number | null = null;
  if (points.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < points.length; i++) gaps.push((points[i].timestamp - points[i - 1].timestamp) / 1000);
    avgInterval = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    maxGap = Math.max(...gaps);
  }

  const diagnosis: string[] = [];
  if (errorPct < 3) diagnosis.push(`Erro de ${errorPct.toFixed(1)}% — dentro da meta (<3%).`);
  else diagnosis.push(`Erro de ${errorPct.toFixed(1)}% — ACIMA da meta de 3%.`);

  if (maxGap != null && maxGap > 30) {
    diagnosis.push(`Maior intervalo entre pontos: ${Math.round(maxGap)}s — coleta interrompida (tela bloqueada/app em segundo plano). Esse trecho é a principal fonte de distância perdida.`);
  }
  if (avgInterval != null && avgInterval > 5) {
    diagnosis.push(`Intervalo médio de ${avgInterval.toFixed(1)}s entre pontos — ideal é 1-3s (enableHighAccuracy + maximumAge: 0).`);
  }
  if (avgAccuracy != null && avgAccuracy > 20) {
    diagnosis.push(`Accuracy média de ${Math.round(avgAccuracy)}m — sinal fraco; rotas em área aberta melhoram a medição.`);
  }
  if (raw - edn > referenceKm * 0.05) {
    diagnosis.push(`Filtros removeram ${(raw - edn).toFixed(2)}km de ruído (cru ${raw.toFixed(2)}km → filtrado ${edn.toFixed(2)}km).`);
  }
  if (edn < referenceKm * 0.9 && (maxGap ?? 0) <= 30) {
    diagnosis.push('Distância subestimada sem gaps grandes — verifique se pontos válidos estão sendo rejeitados pelo filtro de velocidade/accuracy.');
  }

  return {
    ednDistanceKm: parseFloat(edn.toFixed(3)),
    referenceDistanceKm: referenceKm,
    errorPct: parseFloat(errorPct.toFixed(2)),
    withinTarget: errorPct < 3,
    rawDistanceKm: parseFloat(raw.toFixed(3)),
    pointCount: points.length,
    avgAccuracyM: avgAccuracy != null ? Math.round(avgAccuracy) : null,
    qualityBreakdown: quality,
    avgIntervalSec: avgInterval != null ? parseFloat(avgInterval.toFixed(1)) : null,
    maxGapSec: maxGap != null ? Math.round(maxGap) : null,
    diagnosis,
  };
}
