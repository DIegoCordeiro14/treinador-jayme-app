// movement-pattern-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §16 — Movement Pattern Coverage.
//
// Além de grupos musculares, avalia a cobertura de PADRÕES de movimento
// (agachar, hinge, empurrar/puxar horizontal e vertical, unilateral, estabilidade)
// adequada ao objetivo — sem obrigar todos os padrões em todo plano.
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type Pattern =
  | 'squat' | 'hinge' | 'horizontal_push' | 'horizontal_pull'
  | 'vertical_push' | 'vertical_pull' | 'unilateral' | 'stability';

export type Objective = 'strength' | 'hypertrophy' | 'weight_loss' | 'definition' | 'recomp' | 'running' | 'health';

// Padrões esperados por objetivo (cobertura semanal recomendada).
const EXPECTED: Record<Objective, Pattern[]> = {
  strength: ['squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull'],
  hypertrophy: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull'],
  recomp: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_pull'],
  weight_loss: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'unilateral'],
  definition: ['squat', 'horizontal_push', 'horizontal_pull', 'vertical_pull'],
  running: ['squat', 'hinge', 'unilateral', 'stability'],
  health: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'stability'],
};

export interface CoverageResult {
  expected: Pattern[];
  covered: Pattern[];
  missing: Pattern[];
  coveragePct: number;
  adequate: boolean;
  note: string;
}

export function analyzeCoverage(objective: Objective, patternsInPlan: Pattern[]): CoverageResult {
  const expected = EXPECTED[objective] ?? EXPECTED.hypertrophy;
  const present = new Set(patternsInPlan);
  const covered = expected.filter((p) => present.has(p));
  const missing = expected.filter((p) => !present.has(p));
  const coveragePct = expected.length ? Math.round((covered.length / expected.length) * 100) : 100;
  const adequate = coveragePct >= 80;
  return {
    expected, covered, missing, coveragePct, adequate,
    note: adequate ? 'Cobertura de padrões adequada ao objetivo.' : `Padrões ausentes: ${missing.join(', ')}.`,
  };
}
