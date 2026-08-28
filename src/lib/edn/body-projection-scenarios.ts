// body-projection-scenarios.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 3 (item 17) — Projeções com CENÁRIOS (conservador / esperado / otimista).
//
// Projeta peso/BF/massa magra em horizontes futuros com três cenários baseados
// no ritmo histórico ± incerteza, sempre deixando claro que é projeção e não
// previsão garantida. Unifica a heurística de partição gordura/músculo (resolve
// a divergência 0.8/0.4 vs 0.75/0.5 apontada na auditoria). Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectionScenarioInput {
  currentWeightKg: number;
  currentBfPct: number | null;
  currentLeanKg: number | null;
  weeklyWeightDeltaKg: number;     // ritmo histórico (regressão)
  adherencePct: number;            // 0..100
  horizonsDays?: number[];         // default [30,60,90,180]
  confidence?: number;             // 0..1 (qualidade do ritmo); default 0.7
}

export type ScenarioName = 'conservative' | 'expected' | 'optimistic';

export interface ProjectionPoint {
  day: number;
  weightKg: number;
  bfPct: number | null;
  leanKg: number | null;
}

export interface ScenarioProjection {
  scenario: ScenarioName;
  points: ProjectionPoint[];
}

export interface ProjectionScenariosResult {
  scenarios: ScenarioProjection[];
  disclaimer: string;
  partitionUsed: { deficit: number; surplus: number };
}

// Partição UNIFICADA gordura/músculo (público natural): déficit preserva massa.
const FAT_SHARE_DEFICIT = 0.75;
const FAT_SHARE_SURPLUS = 0.5;

const DECAY: Record<number, number> = { 30: 1, 60: 0.9, 90: 0.8, 180: 0.65 };

function projectOne(i: ProjectionScenarioInput, ratePerWeek: number, horizons: number[]): ProjectionPoint[] {
  const out: ProjectionPoint[] = [];
  for (const day of horizons) {
    const weeks = day / 7;
    const decay = DECAY[day] ?? 0.7;
    const deltaW = ratePerWeek * weeks * decay;
    const weightKg = Math.max(40, Math.round((i.currentWeightKg + deltaW) * 10) / 10);

    const losing = deltaW < 0;
    const fatShare = losing ? FAT_SHARE_DEFICIT : FAT_SHARE_SURPLUS;
    const fatDelta = deltaW * fatShare;
    const leanDelta = deltaW * (1 - fatShare);

    let bfPct: number | null = null;
    let leanKg: number | null = null;
    if (i.currentLeanKg != null) {
      leanKg = Math.max(20, Math.round((i.currentLeanKg + leanDelta) * 10) / 10);
    }
    if (i.currentBfPct != null) {
      // recompoe BF a partir da nova massa de gordura estimada
      const curFatMass = (i.currentBfPct / 100) * i.currentWeightKg;
      const newFatMass = Math.max(2, curFatMass + fatDelta);
      bfPct = Math.max(4, Math.min(50, Math.round((newFatMass / weightKg) * 1000) / 10));
    }
    out.push({ day, weightKg, bfPct, leanKg });
  }
  return out;
}

export function projectScenarios(i: ProjectionScenarioInput): ProjectionScenariosResult {
  const horizons = i.horizonsDays ?? [30, 60, 90, 180];
  const confidence = i.confidence ?? 0.7;
  const adhFactor = Math.max(0.3, Math.min(1, i.adherencePct / 100));
  const expectedRate = i.weeklyWeightDeltaKg * adhFactor;

  // largura da banda de incerteza (menor confiança/aderência => banda maior)
  const spread = Math.abs(expectedRate) * (0.4 + (1 - confidence) * 0.5) + 0.05;
  const conservativeRate = expectedRate - Math.sign(expectedRate || 1) * spread;
  const optimisticRate = expectedRate + Math.sign(expectedRate || 1) * spread;

  return {
    scenarios: [
      { scenario: 'conservative', points: projectOne(i, conservativeRate, horizons) },
      { scenario: 'expected', points: projectOne(i, expectedRate, horizons) },
      { scenario: 'optimistic', points: projectOne(i, optimisticRate, horizons) },
    ],
    disclaimer: 'Projeção baseada no comportamento histórico e na aderência. Não é previsão garantida.',
    partitionUsed: { deficit: FAT_SHARE_DEFICIT, surplus: FAT_SHARE_SURPLUS },
  };
}
