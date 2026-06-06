/**
 * V7.3 — Filtro anti-ruído profissional de GPS (meta: erro < 2% vs Strava)
 *
 * Pipeline aplicado a cada ponto cru:
 *   1. Filtro de precisão  → descarta accuracy > MAX_ACCURACY_M
 *   2. Filtro de velocidade → descarta velocidade > MAX_SPEED_KMH (glitch)
 *   3. Filtro de aceleração → remove "saltos" impossíveis (ex: 5→25→6 km/h)
 *   4. Suavização Kalman 1D (lat/lng) → reduz tremor mantendo a trajetória
 *
 * Tudo é incremental (online): cada chamada processa um ponto novo usando
 * apenas o estado anterior, adequado para uso ao vivo no tracker.
 */

export interface RawPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;   // metros
  speed?: number | null;      // m/s (do GPS; pode vir null)
  bearing?: number | null;    // graus
  timestamp: number;          // epoch ms
}

export interface CleanPoint extends RawPoint {
  speedKmh: number;           // velocidade efetiva (recalculada por Haversine)
  segmentKm: number;          // distância desde o ponto aceito anterior
  accepted: boolean;          // passou em todos os filtros
  reason?: string;            // motivo da rejeição (debug)
}

// ── Limiares (nível Garmin/Strava) ────────────────────────────────────────────
export const MAX_ACCURACY_M = 15;     // V7.3: ignora accuracy > 15m
export const MAX_SPEED_KMH = 30;      // V7.3: ignora corrida > 30 km/h
export const MAX_ACCEL_KMH_S = 8;     // variação de velocidade fisicamente plausível
export const MIN_MOVE_KM = 0.0015;    // 1.5 m — abaixo disso é tremor parado

const R_EARTH_KM = 6371;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = (aLat * Math.PI) / 180, φ2 = (bLat * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── Kalman 1D para lat/lng (modelo de posição com ruído de processo) ──────────
class Kalman1D {
  private value: number | null = null;
  private variance = -1;
  constructor(private processNoise = 2) {} // metros — quanto confiamos no movimento

  filter(measurement: number, accuracyM: number): number {
    const r = Math.max(1, accuracyM) ** 2; // variância da medição
    if (this.value === null || this.variance < 0) {
      this.value = measurement;
      this.variance = r;
      return measurement;
    }
    // predição: adiciona ruído de processo
    this.variance += this.processNoise ** 2;
    // ganho de Kalman
    const k = this.variance / (this.variance + r);
    this.value = this.value + k * (measurement - this.value);
    this.variance = (1 - k) * this.variance;
    return this.value;
  }
  reset() { this.value = null; this.variance = -1; }
}

// ── Estado do filtro (uma instância por corrida) ──────────────────────────────
export class GpsFilter {
  private last: CleanPoint | null = null;
  private kLat = new Kalman1D(2.5);
  private kLng = new Kalman1D(2.5);

  reset() { this.last = null; this.kLat.reset(); this.kLng.reset(); }

  /** Processa um ponto cru e devolve a versão limpa (accepted=true/false). */
  push(raw: RawPoint): CleanPoint {
    // 1) Filtro de precisão
    if (raw.accuracy != null && raw.accuracy > MAX_ACCURACY_M) {
      return this.reject(raw, `accuracy ${raw.accuracy?.toFixed(0)}m > ${MAX_ACCURACY_M}m`);
    }

    // 4) Suavização Kalman da posição (usa accuracy como confiança)
    const acc = raw.accuracy ?? MAX_ACCURACY_M;
    const lat = this.kLat.filter(raw.latitude, acc);
    const lng = this.kLng.filter(raw.longitude, acc);
    const smoothed: RawPoint = { ...raw, latitude: lat, longitude: lng };

    if (!this.last) {
      const first: CleanPoint = { ...smoothed, speedKmh: 0, segmentKm: 0, accepted: true };
      this.last = first;
      return first;
    }

    const dtSec = Math.max(0.001, (raw.timestamp - this.last.timestamp) / 1000);
    const segKm = haversineKm(this.last.latitude, this.last.longitude, lat, lng);
    const speedKmh = (segKm / dtSec) * 3600;

    // Tremor parado: distância irrisória → mantém posição, velocidade 0
    if (segKm < MIN_MOVE_KM) {
      const p: CleanPoint = { ...smoothed, speedKmh: 0, segmentKm: 0, accepted: true };
      this.last = p;
      return p;
    }

    // 2) Filtro de velocidade
    if (speedKmh > MAX_SPEED_KMH) {
      return this.reject(raw, `velocidade ${speedKmh.toFixed(0)} km/h > ${MAX_SPEED_KMH}`);
    }

    // 3) Filtro de aceleração — salto impossível de velocidade
    const accelKmhS = Math.abs(speedKmh - this.last.speedKmh) / dtSec;
    if (this.last.speedKmh > 0 && accelKmhS > MAX_ACCEL_KMH_S) {
      return this.reject(raw, `aceleração ${accelKmhS.toFixed(1)} km/h/s (salto)`);
    }

    const bearing = raw.bearing ?? bearingDeg(this.last.latitude, this.last.longitude, lat, lng);
    const clean: CleanPoint = { ...smoothed, bearing, speedKmh, segmentKm: segKm, accepted: true };
    this.last = clean;
    return clean;
  }

  private reject(raw: RawPoint, reason: string): CleanPoint {
    // ponto rejeitado NÃO atualiza o "last" — evita propagar o ruído
    return { ...raw, speedKmh: 0, segmentKm: 0, accepted: false, reason };
  }
}

// ── V7.6 — Três paces (instantâneo 100m, suavizado 500m, médio sessão) ────────
export interface PaceTriple {
  instantSecPerKm: number | null;   // últimos ~100 m
  smoothedSecPerKm: number | null;  // últimos ~500 m
  averageSecPerKm: number | null;   // sessão inteira
}

interface TrackSample { km: number; sec: number } // cumulativos

/** Calcula os três paces a partir do histórico de pontos aceitos. */
export function computePaces(
  cumulative: TrackSample[],
): PaceTriple {
  if (cumulative.length < 2) return { instantSecPerKm: null, smoothedSecPerKm: null, averageSecPerKm: null };
  const last = cumulative[cumulative.length - 1];

  const paceOverLastKm = (windowKm: number): number | null => {
    const targetKm = last.km - windowKm;
    if (targetKm <= 0) return last.km > 0 ? last.sec / last.km : null;
    // acha o ponto cumulativo mais próximo de targetKm
    let ref = cumulative[0];
    for (let i = cumulative.length - 1; i >= 0; i--) {
      if (cumulative[i].km <= targetKm) { ref = cumulative[i]; break; }
    }
    const dKm = last.km - ref.km;
    const dSec = last.sec - ref.sec;
    return dKm > 0.02 ? dSec / dKm : null;
  };

  return {
    instantSecPerKm: paceOverLastKm(0.1),
    smoothedSecPerKm: paceOverLastKm(0.5),
    averageSecPerKm: last.km > 0 ? last.sec / last.km : null,
  };
}

export function fmtPace(secPerKm: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
