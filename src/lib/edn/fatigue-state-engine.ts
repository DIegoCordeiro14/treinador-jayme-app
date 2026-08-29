// fatigue-state-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS (laço) — Estado de fadiga por região com DECAIMENTO.
//
// Agrega o impacto das atividades recentes (activity-impact-engine) aplicando
// decaimento temporal (a fadiga se dissipa em ~48-72h) para um estado de fadiga
// ATUAL por região. É lido pelo gerador/adaptive-session para aliviar o treino da
// região sobrecarregada por cardio. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import { computeActivityImpact, type ActivityKind } from './activity-impact-engine';

export interface FatigueActivity {
  dateMs: number;
  kind: ActivityKind;
  durationMin: number;
  distanceKm?: number | null;
  avgHrPctMax?: number | null;
  elevationGainM?: number | null;
  strengthMuscles?: string[];
}

export interface FatigueState {
  lowerBodyFatigue: number;      // 0..100 (após decaimento)
  upperBodyFatigue: number;
  centralFatigue: number;
  dominantRegion: 'lower' | 'upper' | 'central' | 'none';
  note: string;
  // recomendações para o gerador
  reduceLegVolume: boolean;
  reduceUpperVolume: boolean;
  reduceIntensity: boolean;      // fadiga central alta
}

const HALF_LIFE_HOURS = 36;      // metade da fadiga dissipa em 36h

function decay(value: number, ageHours: number): number {
  return value * Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
}

export function computeFatigueState(activities: FatigueActivity[], nowMs = Date.now()): FatigueState {
  let lower = 0, upper = 0, central = 0;
  for (const a of activities) {
    const ageHours = Math.max(0, (nowMs - a.dateMs) / 3_600_000);
    if (ageHours > 96) continue; // >4 dias: fadiga já dissipada
    const impact = computeActivityImpact({
      kind: a.kind, durationMin: a.durationMin, distanceKm: a.distanceKm ?? null,
      avgHrPctMax: a.avgHrPctMax ?? null, elevationGainM: a.elevationGainM ?? null, strengthMuscles: a.strengthMuscles,
    });
    // soma com decaimento (fadigas se acumulam, saturando em 100)
    lower = Math.min(100, lower + decay(impact.lowerBodyFatigue, ageHours));
    upper = Math.min(100, upper + decay(impact.upperBodyFatigue, ageHours));
    central = Math.min(100, central + decay(impact.centralFatigue, ageHours));
  }
  lower = Math.round(lower); upper = Math.round(upper); central = Math.round(central);

  const max = Math.max(lower, upper, central);
  const dominantRegion: FatigueState['dominantRegion'] = max < 20 ? 'none' : lower === max ? 'lower' : upper === max ? 'upper' : 'central';

  const reduceLegVolume = lower >= 55;
  const reduceUpperVolume = upper >= 55;
  const reduceIntensity = central >= 60;

  const parts: string[] = [];
  if (reduceLegVolume) parts.push('fadiga de membros inferiores alta (cardio recente) — aliviar volume de pernas');
  if (reduceUpperVolume) parts.push('fadiga de membros superiores alta');
  if (reduceIntensity) parts.push('fadiga central alta — conter intensidade');
  const note = parts.length ? parts.join('; ') + '.' : 'Fadiga de atividade dentro do normal.';

  return { lowerBodyFatigue: lower, upperBodyFatigue: upper, centralFatigue: central, dominantRegion, note, reduceLegVolume, reduceUpperVolume, reduceIntensity };
}
