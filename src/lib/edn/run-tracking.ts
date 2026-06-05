/**
 * Run Tracking Engine — V6.6
 * Cálculo de distância nível Strava: Haversine ponto a ponto com filtros
 * de qualidade (accuracy + sanidade de velocidade), em vez de descarte cego.
 *
 * Por que o tracker antigo media MENOS que o Strava:
 *  - descartava qualquer segmento > 200m (após a tela travar, o trecho
 *    inteiro percorrido era jogado fora);
 *  - não filtrava pontos de baixa accuracy (ruído urbano);
 *  - cronômetro via setInterval congelava em segundo plano.
 */

export interface TrackPoint {
  lat: number;
  lng: number;
  timestamp: number;        // epoch ms
  accuracy?: number | null; // metros
  altitude?: number | null;
  speed?: number | null;    // m/s reportado pelo GPS
}

export type GpsQuality = 'excellent' | 'good' | 'poor';

export const GPS_QUALITY_LABELS: Record<GpsQuality, string> = {
  excellent: 'Excelente',
  good: 'Boa',
  poor: 'Ruim',
};

// Score de qualidade do GPS (spec V6.6): <10m excelente · 10-20m boa · >20m ruim
export function classifyAccuracy(accuracyM: number | null | undefined): GpsQuality {
  if (accuracyM == null) return 'poor';
  if (accuracyM < 10) return 'excellent';
  if (accuracyM <= 20) return 'good';
  return 'poor';
}

// ── Haversine ─────────────────────────────────────────────────────────────────
export function haversineKm(p1: Pick<TrackPoint, 'lat' | 'lng'>, p2: Pick<TrackPoint, 'lat' | 'lng'>): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Filtro de aceitação de ponto ──────────────────────────────────────────────
export interface AcceptResult {
  accept: boolean;          // ponto entra na rota
  addDistanceKm: number;    // distância a somar (0 se rejeitado p/ distância)
  reason: string | null;    // motivo da rejeição (auditoria)
}

const MAX_ACCURACY_M = 35;        // pontos piores que isso não somam distância
const MAX_HUMAN_SPEED_MS = 12.5;  // ~45 km/h: acima disso é glitch de GPS
const MIN_MOVE_KM = 0.002;        // <2m: jitter parado, não soma

/**
 * Decide se o novo ponto soma distância. Diferente do filtro antigo (corte
 * fixo de 200m), aqui a sanidade é por VELOCIDADE: um gap de 60s com 250m
 * percorridos (4,2 m/s — corrida normal) é ACEITO; um salto de 250m em 2s
 * (125 m/s — glitch) é rejeitado.
 */
export function evaluatePoint(prev: TrackPoint | null, curr: TrackPoint): AcceptResult {
  // Accuracy ruim demais: mantém o ponto para rota/auditoria, mas não soma distância
  if (curr.accuracy != null && curr.accuracy > MAX_ACCURACY_M) {
    return { accept: true, addDistanceKm: 0, reason: `accuracy ${Math.round(curr.accuracy)}m > ${MAX_ACCURACY_M}m` };
  }
  if (!prev) return { accept: true, addDistanceKm: 0, reason: null };

  const dKm = haversineKm(prev, curr);
  const dtSec = Math.max(0.001, (curr.timestamp - prev.timestamp) / 1000);
  const speedMs = (dKm * 1000) / dtSec;

  if (dKm < MIN_MOVE_KM) {
    return { accept: true, addDistanceKm: 0, reason: null }; // parado/jitter
  }
  if (speedMs > MAX_HUMAN_SPEED_MS) {
    return { accept: false, addDistanceKm: 0, reason: `velocidade impossível ${speedMs.toFixed(1)}m/s` };
  }
  return { accept: true, addDistanceKm: dKm, reason: null };
}

// ── Distância total de uma lista de pontos (reconstrução/auditoria) ──────────
export function computeTrackDistanceKm(points: TrackPoint[]): number {
  let total = 0;
  let prev: TrackPoint | null = null;
  for (const p of points) {
    const r = evaluatePoint(prev, p);
    total += r.addDistanceKm;
    if (r.accept) prev = p;
  }
  return total;
}

// ── Formatação ────────────────────────────────────────────────────────────────
export function fmtPaceMinKm(seconds: number, km: number): string {
  if (km < 0.01) return '--:--';
  const ps = seconds / km;
  return `${Math.floor(ps / 60)}:${String(Math.floor(ps % 60)).padStart(2, '0')}`;
}

export function fmtSpeedKmh(km: number, seconds: number): string {
  if (seconds < 1) return '0,0';
  return ((km / seconds) * 3600).toFixed(1).replace('.', ',');
}
