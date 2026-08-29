// cardio-energy-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §9 — Calorias de cardio por PRIORIDADE de fonte (com transparência).
//
// Prioridade: (1) kcal medido pelo wearable; (2) modelo por FC (Keytel) quando há
// FC média, peso, idade, sexo; (3) modelo por MET × peso × duração por modalidade;
// (4) fallback simples por distância. Sempre informa a ORIGEM. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type EnergySourceKind = 'wearable' | 'hr_model' | 'met_model' | 'distance_fallback';

export interface CardioEnergyInput {
  wearableKcal?: number | null;
  weightKg?: number | null;
  age?: number | null;
  gender?: string | null;            // 'male' | 'female'
  durationMin?: number | null;
  distanceKm?: number | null;
  avgHr?: number | null;
  modality: 'running' | 'walking' | 'cycling' | 'swimming' | 'hiit' | 'rowing' | 'other';
  intensity?: 'leve' | 'moderada' | 'alta' | 'muito_alta' | null;
}

export interface CardioEnergyResult {
  kcal: number;
  source: EnergySourceKind;
  sourceLabel: string;
  estimated: boolean;
}

// MET aproximado por modalidade e intensidade
const MET: Record<string, Record<string, number>> = {
  running: { leve: 8, moderada: 10, alta: 12.5, muito_alta: 15 },
  walking: { leve: 3, moderada: 4.3, alta: 5.5, muito_alta: 6.5 },
  cycling: { leve: 6, moderada: 8, alta: 10, muito_alta: 12 },
  swimming: { leve: 6, moderada: 8, alta: 10, muito_alta: 11 },
  hiit: { leve: 8, moderada: 10, alta: 12, muito_alta: 14 },
  rowing: { leve: 6, moderada: 8.5, alta: 10.5, muito_alta: 12 },
  other: { leve: 5, moderada: 7, alta: 9, muito_alta: 11 },
};

function keytelKcal(i: CardioEnergyInput): number | null {
  if (i.avgHr == null || i.weightKg == null || i.age == null || i.durationMin == null) return null;
  const isFemale = /f/i.test(String(i.gender ?? ''));
  const hr = i.avgHr, w = i.weightKg, a = i.age, t = i.durationMin;
  // Keytel et al. (kcal/min) × minutos
  const perMin = isFemale
    ? (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * a) / 4.184
    : (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * a) / 4.184;
  return perMin > 0 ? Math.round(perMin * t) : null;
}

export function computeCardioEnergy(i: CardioEnergyInput): CardioEnergyResult {
  // 1) wearable
  if (i.wearableKcal != null && i.wearableKcal > 0) {
    return { kcal: Math.round(i.wearableKcal), source: 'wearable', sourceLabel: 'Wearable', estimated: false };
  }
  // 2) modelo por FC (Keytel)
  const hrModel = keytelKcal(i);
  if (hrModel != null && hrModel > 0) {
    return { kcal: hrModel, source: 'hr_model', sourceLabel: 'Estimativa por FC', estimated: true };
  }
  // 3) modelo MET × peso × duração
  if (i.weightKg != null && i.durationMin != null && i.durationMin > 0) {
    const intensity = i.intensity ?? 'moderada';
    const met = (MET[i.modality] ?? MET.other)[intensity] ?? 7;
    const kcal = Math.round(met * 3.5 * i.weightKg / 200 * i.durationMin); // fórmula ACSM
    return { kcal, source: 'met_model', sourceLabel: 'Estimativa EDN (MET)', estimated: true };
  }
  // 4) fallback por distância
  const km = i.distanceKm ?? 0;
  const kcalPerKm = i.modality === 'walking' ? 50 : i.modality === 'cycling' ? 30 : 65;
  return { kcal: Math.round(km * kcalPerKm), source: 'distance_fallback', sourceLabel: 'Estimativa simples (distância)', estimated: true };
}
