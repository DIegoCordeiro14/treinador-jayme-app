// sport-intelligence-profiles.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §16 — Sport Intelligence Profiles.
//
// Perfil de inteligência por modalidade: métricas principais, driver de carga,
// unidade de progressão, foco de fadiga e observações de segurança. Uniformiza o
// tratamento multiesporte (hoje centrado em corrida). Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type SportKey = 'running' | 'walking' | 'cycling' | 'swimming' | 'hiit' | 'rowing' | 'trail' | 'other';

export interface SportProfile {
  sport: SportKey;
  label: string;
  primaryMetrics: string[];        // ex: ['pace','distance','hr','elevation']
  loadDriver: 'distance' | 'duration' | 'power' | 'intervals';
  progressionUnit: 'km_per_week' | 'minutes_per_week' | 'intervals_per_week';
  fatigueFocus: 'lower' | 'upper' | 'mixed' | 'central';
  usesGps: boolean;
  safetyNotes: string[];
}

const PROFILES: Record<SportKey, SportProfile> = {
  running: { sport: 'running', label: 'Corrida', primaryMetrics: ['pace', 'distance', 'hr', 'elevation', 'cadence'], loadDriver: 'distance', progressionUnit: 'km_per_week', fatigueFocus: 'lower', usesGps: true, safetyNotes: ['Alto impacto — cuidado com joelho/tornozelo/pé.'] },
  trail: { sport: 'trail', label: 'Trilha', primaryMetrics: ['pace', 'distance', 'elevation', 'hr'], loadDriver: 'duration', progressionUnit: 'minutes_per_week', fatigueFocus: 'lower', usesGps: true, safetyNotes: ['Terreno irregular — risco de torção.'] },
  walking: { sport: 'walking', label: 'Caminhada', primaryMetrics: ['distance', 'duration', 'hr'], loadDriver: 'duration', progressionUnit: 'minutes_per_week', fatigueFocus: 'lower', usesGps: true, safetyNotes: ['Baixo impacto — segura na maioria dos casos.'] },
  cycling: { sport: 'cycling', label: 'Ciclismo', primaryMetrics: ['power', 'speed', 'hr', 'elevation', 'distance'], loadDriver: 'power', progressionUnit: 'minutes_per_week', fatigueFocus: 'lower', usesGps: true, safetyNotes: ['Sem impacto articular — bom substituto na corrida em recuperação.'] },
  swimming: { sport: 'swimming', label: 'Natação', primaryMetrics: ['distance', 'pace_100m', 'swolf', 'hr'], loadDriver: 'distance', progressionUnit: 'minutes_per_week', fatigueFocus: 'upper', usesGps: false, safetyNotes: ['Sem impacto — excelente para lesões de membros inferiores.'] },
  hiit: { sport: 'hiit', label: 'HIIT', primaryMetrics: ['intervals', 'hr', 'duration'], loadDriver: 'intervals', progressionUnit: 'intervals_per_week', fatigueFocus: 'central', usesGps: false, safetyNotes: ['Alta fadiga central — dosar frequência.'] },
  rowing: { sport: 'rowing', label: 'Remo', primaryMetrics: ['distance', 'pace_500m', 'power', 'hr'], loadDriver: 'distance', progressionUnit: 'minutes_per_week', fatigueFocus: 'mixed', usesGps: false, safetyNotes: ['Cuidado com lombar na técnica.'] },
  other: { sport: 'other', label: 'Outro', primaryMetrics: ['duration', 'hr'], loadDriver: 'duration', progressionUnit: 'minutes_per_week', fatigueFocus: 'mixed', usesGps: false, safetyNotes: [] },
};

export function getSportProfile(sport: string | null | undefined): SportProfile {
  const s = String(sport ?? '').toLowerCase();
  if (/trail|trilha/.test(s)) return PROFILES.trail;
  if (/run|corr/.test(s)) return PROFILES.running;
  if (/walk|caminh/.test(s)) return PROFILES.walking;
  if (/cycl|bike|bicicl|ciclis|mtb/.test(s)) return PROFILES.cycling;
  if (/swim|nata|nado/.test(s)) return PROFILES.swimming;
  if (/hiit|interval/.test(s)) return PROFILES.hiit;
  if (/row|remo/.test(s)) return PROFILES.rowing;
  return PROFILES.other;
}

export function listSportProfiles(): SportProfile[] { return Object.values(PROFILES); }
