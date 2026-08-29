// activity-impact-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §17 — Activity Impact Engine.
//
// Cada atividade (corrida/ciclismo/natação/força/HIIT) gera um IMPACTO no
// AthleteState: training load + fadiga por região (membros inferiores/superiores,
// sistema central). Assim uma pedalada forte influencia o treino de pernas, etc.
// Puro/determinístico. Alimenta o adaptive-session-engine.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityKind = 'running' | 'walking' | 'cycling' | 'swimming' | 'hiit' | 'rowing' | 'strength' | 'other';

export interface ActivityImpactInput {
  kind: ActivityKind;
  durationMin: number;
  distanceKm?: number | null;
  avgHrPctMax?: number | null;      // 0..1 (intensidade relativa)
  elevationGainM?: number | null;
  strengthMuscles?: string[];       // se kind='strength'
}

export interface ActivityImpact {
  trainingLoad: number;             // 0..100
  lowerBodyFatigue: number;         // 0..100
  upperBodyFatigue: number;
  centralFatigue: number;           // sistema nervoso/cardiovascular
  note: string;
}

// distribuição base de fadiga por modalidade (lower, upper, central) — soma ~1
const DISTRIB: Record<ActivityKind, [number, number, number]> = {
  running: [0.7, 0.05, 0.25],
  walking: [0.5, 0.05, 0.1],
  cycling: [0.55, 0.05, 0.25],
  swimming: [0.2, 0.5, 0.2],
  hiit: [0.45, 0.25, 0.4],
  rowing: [0.35, 0.4, 0.3],
  strength: [0.4, 0.4, 0.35],
  other: [0.4, 0.2, 0.25],
};

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export function computeActivityImpact(i: ActivityImpactInput): ActivityImpact {
  const intensity = i.avgHrPctMax != null ? Math.max(0.4, Math.min(1, i.avgHrPctMax)) : (i.kind === 'hiit' ? 0.85 : i.kind === 'strength' ? 0.75 : 0.65);
  // carga base ~ duração × intensidade²  (TRIMP simplificado)
  let load = (i.durationMin ?? 0) * intensity * intensity * 1.6;
  if (i.elevationGainM && i.elevationGainM > 100) load += Math.min(20, i.elevationGainM / 20);
  const trainingLoad = clamp100(load);

  const [dl, du, dc] = DISTRIB[i.kind] ?? DISTRIB.other;
  let lower = trainingLoad * dl * 1.4;
  let upper = trainingLoad * du * 1.4;
  const central = trainingLoad * dc * 1.4;

  // força em pernas concentra fadiga inferior
  if (i.kind === 'strength' && (i.strengthMuscles ?? []).some((m) => /leg|perna|quadr|glut|posterior|calf|panturr/i.test(m))) {
    lower = Math.max(lower, trainingLoad * 0.85 * 1.4);
  }
  if (i.kind === 'strength' && (i.strengthMuscles ?? []).some((m) => /chest|peito|back|costas|shoulder|ombro|arm|braco|biceps|triceps/i.test(m))) {
    upper = Math.max(upper, trainingLoad * 0.7 * 1.4);
  }

  const note = `${i.kind}: carga ${trainingLoad}, fadiga inferior ${clamp100(lower)} / superior ${clamp100(upper)} / central ${clamp100(central)}.`;
  return { trainingLoad, lowerBodyFatigue: clamp100(lower), upperBodyFatigue: clamp100(upper), centralFatigue: clamp100(central), note };
}
