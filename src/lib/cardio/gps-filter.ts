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

import {
  GpsAnomalyDetector,
  bearingDelta,
  newQualityStats,
  routeConfidence,
  confidenceLabel,
  type GpsQualityStats,
  type RunModality,
} from './gps-anomaly-detector';

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
export const MAX_ACCURACY_M = 35;     // V7.3: ignora accuracy > 35m
export const PROVISIONAL_ACCURACY_M = 150; // fix inicial grosseiro aceito só para destravar a UI
export const MAX_SPEED_KMH = 24;      // V6.7: limite fisiológico de corrida (km/h)
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
  private provisional = false;
  private kLat = new Kalman1D(2.5);
  private kLng = new Kalman1D(2.5);
  private anomaly: GpsAnomalyDetector;
  private stats: GpsQualityStats = newQualityStats();

  constructor(modality: RunModality = 'running') {
    this.anomaly = new GpsAnomalyDetector(modality);
  }

  reset() {
    this.last = null; this.provisional = false;
    this.kLat.reset(); this.kLng.reset();
    this.anomaly.reset(); this.stats = newQualityStats();
  }

  /** Estatísticas de qualidade da rota (módulos 8/9). */
  getStats(): GpsQualityStats { return { ...this.stats }; }
  getConfidence(): number { return routeConfidence(this.stats); }
  getConfidenceLabel() { return confidenceLabel(this.getConfidence()); }

  private markValid(raw: RawPoint) {
    this.stats.valid++;
    if (raw.accuracy != null) { this.stats.sumAccuracy += raw.accuracy; this.stats.accuracyCount++; }
  }

  /** Processa um ponto cru e devolve a versão limpa (accepted=true/false). */
  push(raw: RawPoint): CleanPoint {
    this.stats.captured++;
    // 1) Filtro de precisão
    if (raw.accuracy != null && raw.accuracy > MAX_ACCURACY_M) {
      // Fix grosseiro no início: aceita provisoriamente (até PROVISIONAL_ACCURACY_M)
      // para destravar a UI e mostrar a posição; distância NÃO conta nesta fase.
      if ((!this.last || this.provisional) && raw.accuracy <= PROVISIONAL_ACCURACY_M) {
        const latP = this.kLat.filter(raw.latitude, raw.accuracy);
        const lngP = this.kLng.filter(raw.longitude, raw.accuracy);
        const prov: CleanPoint = { ...raw, latitude: latP, longitude: lngP, speedKmh: 0, segmentKm: 0, accepted: true };
        this.last = prov; this.provisional = true;
        this.markValid(raw);
        return prov;
      }
      return this.reject(raw, `accuracy ${raw.accuracy?.toFixed(0)}m > ${MAX_ACCURACY_M}m`);
    }

    // 4) Suavização Kalman da posição (usa accuracy como confiança)
    const acc = raw.accuracy ?? MAX_ACCURACY_M;
    const lat = this.kLat.filter(raw.latitude, acc);
    const lng = this.kLng.filter(raw.longitude, acc);
    const smoothed: RawPoint = { ...raw, latitude: lat, longitude: lng };

    // Primeiro fix PRECISO após âncora provisória: re-ancora aqui sem somar
    // a distância acumulada na fase de baixa precisão.
    if (this.last && this.provisional) {
      this.provisional = false;
      const reanchor: CleanPoint = { ...smoothed, speedKmh: 0, segmentKm: 0, accepted: true };
      this.last = reanchor;
      this.markValid(raw);
      return reanchor;
    }

    if (!this.last) {
      const first: CleanPoint = { ...smoothed, speedKmh: 0, segmentKm: 0, accepted: true };
      this.last = first;
      this.markValid(raw);
      return first;
    }

    const dtSec = Math.max(0.001, (raw.timestamp - this.last.timestamp) / 1000);
    const segKm = haversineKm(this.last.latitude, this.last.longitude, lat, lng);
    const speedKmh = (segKm / dtSec) * 3600;

    // Tremor/deslocamento sub-limiar: NÃO avança a âncora — o movimento
    // acumula entre ticks até cruzar MIN_MOVE_KM (corrige taxas altas de
    // pontos, ex. ~3 Hz, em que cada tick anda menos de 1,5 m).
    if (segKm < MIN_MOVE_KM) {
      this.markValid(raw);
      return { ...smoothed, speedKmh: 0, segmentKm: 0, accepted: true };
    }

    // Distância "bruta" (inclui o que será rejeitado) p/ o relatório de qualidade
    this.stats.rawKm += segKm;

    const newBearing = raw.bearing ?? bearingDeg(this.last.latitude, this.last.longitude, lat, lng);
    const bChange = bearingDelta(this.last.bearing ?? null, newBearing);

    // Módulos 2–5: velocidade fisiológica + aceleração + mediana + direção
    const verdict = this.anomaly.check({
      speedKmh,
      prevSpeedKmh: this.last.speedKmh,
      dtSec,
      bearingChangeDeg: bChange,
      timestamp: raw.timestamp,
    });
    if (!verdict.ok) {
      this.stats.spikes++;
      return this.reject(raw, `${verdict.kind}: ${verdict.reason}`);
    }

    this.anomaly.accept(speedKmh);
    this.markValid(raw);
    const clean: CleanPoint = { ...smoothed, bearing: newBearing, speedKmh, segmentKm: segKm, accepted: true };
    this.last = clean;
    return clean;
  }

  private reject(raw: RawPoint, reason: string): CleanPoint {
    // ponto rejeitado NÃO atualiza o "last" — evita propagar o ruído
    this.stats.discarded++;
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
