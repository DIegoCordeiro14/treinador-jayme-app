/**
 * Auditoria de trajeto GPS (§19) — evolui a detecção de anomalias preservando o
 * ponto BRUTO e o ponto FILTRADO. NÃO apaga trajetos reais: marca cada ponto com o
 * tipo de anomalia e deixa a UI decidir. Determinístico e testável.
 *
 * Complementa (não substitui) GpsFilter/GpsAnomalyDetector já existentes.
 */
import { haversineKm } from './gps-filter';

export type TrackAnomaly = 'none' | 'teleport' | 'spike' | 'impossible_speed' | 'jump' | 'drift' | 'signal_loss';

export interface RawTrackPoint {
  latitude: number;
  longitude: number;
  timestamp?: string | number | null;
  accuracy?: number | null;   // metros
  altitude?: number | null;
}

export interface AuditedPoint {
  index: number;
  raw: { latitude: number; longitude: number };
  filtered: { latitude: number; longitude: number } | null; // null quando descartado do traçado limpo
  kept: boolean;                 // entra no traçado exibido?
  anomaly: TrackAnomaly;
  speedKmh: number | null;
  gapSeconds: number | null;
}

export interface TrackAudit {
  points: AuditedPoint[];
  summary: {
    total: number;
    kept: number;
    teleport: number;
    spike: number;
    impossibleSpeed: number;
    jump: number;
    drift: number;
    signalLossGaps: number;
    maxGapSeconds: number;
  };
}

export interface AuditConfig {
  maxSpeedKmh?: number;       // acima disso = velocidade impossível (default 45 — cobre ciclismo)
  teleportKm?: number;        // salto absurdo entre 2 pontos consecutivos (default 0.5 km)
  signalLossSeconds?: number; // buraco temporal = perda de sinal (default 20s)
  maxAccuracyM?: number;      // acima disso o ponto é ruído/drift (default 50m)
}

function ts(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = new Date(v as string).getTime();
  return Number.isFinite(t) ? t : null;
}

export function auditTrack(raw: RawTrackPoint[], cfg: AuditConfig = {}): TrackAudit {
  const maxSpeed = cfg.maxSpeedKmh ?? 45;
  const teleportKm = cfg.teleportKm ?? 0.5;
  const signalLoss = cfg.signalLossSeconds ?? 20;
  const maxAcc = cfg.maxAccuracyM ?? 50;

  const points: AuditedPoint[] = [];
  const sum = { total: raw.length, kept: 0, teleport: 0, spike: 0, impossibleSpeed: 0, jump: 0, drift: 0, signalLossGaps: 0, maxGapSeconds: 0 };
  let prevKept: RawTrackPoint | null = null;
  let prevT: number | null = null;

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    let anomaly: TrackAnomaly = 'none';
    let speedKmh: number | null = null;
    let gapSeconds: number | null = null;

    const bad = !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180;
    const t = ts(p.timestamp);

    if (bad) {
      anomaly = 'spike';
    } else if (p.accuracy != null && p.accuracy > maxAcc) {
      anomaly = 'drift'; // baixa precisão = deriva; preserva bruto, não entra no limpo
    } else if (prevKept) {
      const distKm = haversineKm(prevKept.latitude, prevKept.longitude, p.latitude, p.longitude);
      if (t != null && prevT != null) {
        gapSeconds = (t - prevT) / 1000;
        if (gapSeconds > signalLoss) { anomaly = 'signal_loss'; sum.signalLossGaps++; sum.maxGapSeconds = Math.max(sum.maxGapSeconds, Math.round(gapSeconds)); }
        if (gapSeconds > 0) speedKmh = (distKm / (gapSeconds / 3600));
      }
      if (anomaly === 'none') {
        if (distKm >= teleportKm && (gapSeconds == null || gapSeconds < signalLoss)) anomaly = 'teleport';
        else if (speedKmh != null && speedKmh > maxSpeed) anomaly = 'impossible_speed';
        else if (distKm >= teleportKm * 0.4) anomaly = 'jump';
      }
    }

    // sinal de perda mantém o ponto (é real, só houve buraco); demais anomalias saem do traçado limpo
    const kept = anomaly === 'none' || anomaly === 'signal_loss';
    if (kept) { prevKept = p; if (t != null) prevT = t; sum.kept++; }
    if (anomaly === 'teleport') sum.teleport++;
    else if (anomaly === 'spike') sum.spike++;
    else if (anomaly === 'impossible_speed') sum.impossibleSpeed++;
    else if (anomaly === 'jump') sum.jump++;
    else if (anomaly === 'drift') sum.drift++;

    points.push({
      index: i,
      raw: { latitude: p.latitude, longitude: p.longitude },
      filtered: kept && !bad ? { latitude: p.latitude, longitude: p.longitude } : null,
      kept, anomaly, speedKmh: speedKmh != null ? Math.round(speedKmh * 10) / 10 : null,
      gapSeconds: gapSeconds != null ? Math.round(gapSeconds) : null,
    });
  }
  return { points, summary: sum };
}
