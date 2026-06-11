/**
 * V6.7 — GPS Anomaly Detector (nível Strava / Garmin / Coros / Polar)
 *
 * Valida cada ponto de GPS ANTES de calcular distância, pace, velocidade,
 * tiros e antes de qualquer análise da IA. Elimina "GPS spikes" (picos
 * artificiais de velocidade) sem remover mudanças reais de ritmo.
 *
 * Filtros aplicados (módulos 2–5 do bloco V6.7):
 *   2. Velocidade fisiológica por modalidade (com exceção de consistência ≥5s)
 *   3. Aceleração humana (Δvelocidade > 8 km/h em < 3 s → rejeita)
 *   4. Mediana móvel dos últimos pontos (current > mediana × 1.8 → outlier)
 *   5. Direção (mudança > 120° + velocidade alta → GPS jump)
 *
 * O GpsFilter delega a decisão de velocidade/aceleração/direção a esta classe
 * e contabiliza a qualidade da rota (módulos 8–9).
 */

export type RunModality = 'running' | 'walking' | 'cycling' | 'elite_running';

/** Velocidade humana máxima plausível por modalidade (km/h). */
export const MAX_HUMAN_SPEED_KMH: Record<RunModality, number> = {
  walking: 10,
  running: 24,
  elite_running: 30, // só para atletas avançados
  cycling: 70,
};

export type AnomalyKind = 'GPS_SPIKE' | 'ACCEL' | 'OUTLIER' | 'GPS_JUMP';

export interface AnomalyResult {
  ok: boolean;
  kind?: AnomalyKind;
  reason?: string;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Menor diferença angular entre dois rumos (0–180°). */
export function bearingDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export class GpsAnomalyDetector {
  private speeds: number[] = [];          // janela de velocidades válidas
  private readonly windowSize = 5;
  private overLimitSince: number | null = null; // p/ exceção de >5 s consistente

  constructor(private modality: RunModality = 'running') {}

  setModality(m: RunModality) { this.modality = m; }
  private get maxSpeed() { return MAX_HUMAN_SPEED_KMH[this.modality]; }

  /**
   * Avalia um candidato já medido (velocidade por Haversine, dt, mudança de
   * rumo) e decide se é um ponto real ou uma anomalia de GPS.
   */
  check(p: {
    speedKmh: number;
    prevSpeedKmh: number;
    dtSec: number;
    bearingChangeDeg: number | null;
    timestamp: number;
  }): AnomalyResult {
    const { speedKmh, prevSpeedKmh, dtSec, bearingChangeDeg, timestamp } = p;

    // Módulo 2 — velocidade fisiológica (exceção: sustentada ≥ 5 s = real)
    if (speedKmh > this.maxSpeed) {
      if (this.overLimitSince == null) this.overLimitSince = timestamp;
      const sustainedSec = (timestamp - this.overLimitSince) / 1000;
      if (sustainedSec < 5) {
        return { ok: false, kind: 'GPS_SPIKE', reason: `> ${this.maxSpeed} km/h` };
      }
      // sustentado por ≥5 s → aceita (caso raro de descida/atleta de elite)
    } else {
      this.overLimitSince = null;
    }

    // Módulo 3 — aceleração humana impossível
    if (prevSpeedKmh > 0 && Math.abs(speedKmh - prevSpeedKmh) > 8 && dtSec < 3) {
      return { ok: false, kind: 'ACCEL', reason: 'aceleração impossível' };
    }

    // Módulo 4 — outlier por mediana móvel
    if (this.speeds.length >= 3) {
      const med = median(this.speeds);
      if (med > 0.5 && speedKmh > med * 1.8) {
        return { ok: false, kind: 'OUTLIER', reason: `outlier (mediana ${med.toFixed(1)})` };
      }
    }

    // Módulo 5 — salto de direção (GPS jump)
    if (bearingChangeDeg != null && bearingChangeDeg > 120 && speedKmh > this.maxSpeed * 0.6) {
      return { ok: false, kind: 'GPS_JUMP', reason: 'mudança de direção brusca' };
    }

    return { ok: true };
  }

  /** Registra uma velocidade aceita na janela móvel. */
  accept(speedKmh: number) {
    if (speedKmh <= 0) return;
    this.speeds.push(speedKmh);
    if (this.speeds.length > this.windowSize) this.speeds.shift();
  }

  reset() { this.speeds = []; this.overLimitSince = null; }
}

// ── Módulo 8/9 — Qualidade e confiança da rota ────────────────────────────────
export interface GpsQualityStats {
  captured: number;     // pontos recebidos do GPS
  valid: number;        // aceitos
  discarded: number;    // rejeitados (qualquer motivo)
  spikes: number;       // spikes/outliers/jumps corrigidos
  rawKm: number;        // distância "bruta" (inclui saltos)
  sumAccuracy: number;
  accuracyCount: number;
}

export function newQualityStats(): GpsQualityStats {
  return { captured: 0, valid: 0, discarded: 0, spikes: 0, rawKm: 0, sumAccuracy: 0, accuracyCount: 0 };
}

/** routeConfidence — 0 a 100. Considera descartes, accuracy média e spikes. */
export function routeConfidence(st: GpsQualityStats): number {
  if (st.captured === 0) return 0;
  const validRatio = st.valid / st.captured;
  const avgAcc = st.accuracyCount ? st.sumAccuracy / st.accuracyCount : 20;
  let score = 100;
  score -= (1 - validRatio) * 60;                  // muitos descartes derrubam
  score -= Math.max(0, avgAcc - 10) * 1.2;         // accuracy ruim derruba
  score -= Math.min(20, st.spikes * 0.3);          // penalidade leve por spikes
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function confidenceLabel(c: number): 'Excelente' | 'Boa' | 'Moderada' | 'Baixa' {
  if (c >= 95) return 'Excelente';
  if (c >= 85) return 'Boa';
  if (c >= 70) return 'Moderada';
  return 'Baixa';
}
