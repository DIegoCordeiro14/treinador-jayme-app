// heart-rate-zone-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §7 — Zonas de FC UNIFICADAS (uma fonte para tudo).
//
// Hierarquia da FCmáx: (1) medida e validada > (2) configurada pelo atleta > (3)
// estimativa por idade. FC de repouso disponível => Karvonen; senão => %FCmáx.
// Mesmo motor para corrida/caminhada/ciclismo/HIIT/musculação/importação. Puro.
// ─────────────────────────────────────────────────────────────────────────────

export type HrMaxSource = 'measured' | 'configured' | 'age_estimate';
export type HrZoneMethod = 'karvonen' | 'pct_max';

export interface HrZoneInput {
  measuredMaxHr?: number | null;     // FCmáx confiável (do hr-outlier-engine)
  configuredMaxHr?: number | null;   // definida pelo atleta
  age?: number | null;
  restingHr?: number | null;
}

export interface HrZone { zone: number; label: string; low: number; high: number; }

export interface HrZonesResult {
  maxHr: number;
  maxHrSource: HrMaxSource;
  method: HrZoneMethod;
  zones: HrZone[];
}

const ZONE_LABELS = ['Recuperação', 'Aeróbico leve', 'Aeróbico', 'Limiar', 'VO2máx'];
// faixas por fração da reserva (Karvonen) ou do máximo (%FCmáx)
const ZONE_BOUNDS = [[0.50, 0.60], [0.60, 0.70], [0.70, 0.80], [0.80, 0.90], [0.90, 1.00]];

export function resolveMaxHr(i: HrZoneInput): { maxHr: number; source: HrMaxSource } {
  if (i.measuredMaxHr != null && i.measuredMaxHr >= 120) return { maxHr: Math.round(i.measuredMaxHr), source: 'measured' };
  if (i.configuredMaxHr != null && i.configuredMaxHr >= 120) return { maxHr: Math.round(i.configuredMaxHr), source: 'configured' };
  const age = i.age ?? 30;
  return { maxHr: Math.round(211 - 0.64 * age), source: 'age_estimate' }; // Nes et al (mais precisa que 220-idade)
}

export function computeHrZones(i: HrZoneInput): HrZonesResult {
  const { maxHr, source } = resolveMaxHr(i);
  const useKarvonen = i.restingHr != null && i.restingHr >= 30 && i.restingHr < maxHr;
  const method: HrZoneMethod = useKarvonen ? 'karvonen' : 'pct_max';
  const rest = i.restingHr ?? 0;

  const zones: HrZone[] = ZONE_BOUNDS.map(([lo, hi], idx) => {
    const bpm = (frac: number) => useKarvonen ? Math.round(rest + frac * (maxHr - rest)) : Math.round(frac * maxHr);
    return { zone: idx + 1, label: ZONE_LABELS[idx], low: bpm(lo), high: bpm(hi) };
  });

  return { maxHr, maxHrSource: source, method, zones };
}

// Distribui segundos de FC nas zonas (para importação e para o replay).
export function timeInZones(samples: { tSec: number; bpm: number }[], zones: HrZone[]): number[] {
  const secs = new Array(zones.length).fill(0);
  for (let k = 1; k < samples.length; k++) {
    const dt = Math.max(0, samples[k].tSec - samples[k - 1].tSec);
    const bpm = samples[k].bpm;
    const zi = zones.findIndex((z) => bpm >= z.low && bpm <= z.high);
    const idx = zi >= 0 ? zi : bpm < zones[0].low ? 0 : zones.length - 1;
    secs[idx] += dt;
  }
  return secs;
}
