// equilibrium-score-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §20 — Training Equilibrium Score (0-100).
//
// Avalia o plano montado como um todo: prioridade respeitada, equilíbrio
// muscular, volume, frequência, recuperação, duração, cardio interference,
// segurança, padrões de movimento, histórico e aderência. Abaixo do limite,
// sinaliza REBALANCE antes de persistir. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface EquilibriumInput {
  priorityRespected: boolean;
  muscleBalanced: boolean;
  volumeWithinTargets: boolean;
  frequencyAdequate: boolean;
  recoveryRespected: boolean;
  sessionDurationOk: boolean;
  cardioConsidered: boolean;
  safetyRespected: boolean;        // nenhum restrito
  patternCoverageOk: boolean;
  historyRespected: boolean;       // manteve o que progredia
  adherenceFriendly: boolean;      // não é longo/complexo demais
}

export interface EquilibriumResult {
  score: number;
  needsRebalance: boolean;
  failing: string[];
  verdict: 'excellent' | 'good' | 'rebalance';
}

const WEIGHTS: { key: keyof EquilibriumInput; label: string; w: number; hard?: boolean }[] = [
  { key: 'safetyRespected', label: 'segurança', w: 15, hard: true },
  { key: 'priorityRespected', label: 'prioridade', w: 12 },
  { key: 'muscleBalanced', label: 'equilíbrio muscular', w: 12 },
  { key: 'volumeWithinTargets', label: 'volume', w: 12 },
  { key: 'recoveryRespected', label: 'recuperação', w: 11 },
  { key: 'frequencyAdequate', label: 'frequência', w: 8 },
  { key: 'patternCoverageOk', label: 'padrões de movimento', w: 8 },
  { key: 'historyRespected', label: 'histórico', w: 8 },
  { key: 'sessionDurationOk', label: 'duração', w: 6 },
  { key: 'adherenceFriendly', label: 'aderência', w: 5 },
  { key: 'cardioConsidered', label: 'cardio', w: 3 },
];

export function computeEquilibriumScore(i: EquilibriumInput, rebalanceThreshold = 70): EquilibriumResult {
  let score = 0;
  const failing: string[] = [];
  let hardFail = false;
  for (const f of WEIGHTS) {
    if (i[f.key]) score += f.w;
    else { failing.push(f.label); if (f.hard) hardFail = true; }
  }
  score = Math.round(score);
  const needsRebalance = hardFail || score < rebalanceThreshold;
  const verdict = hardFail || score < rebalanceThreshold ? 'rebalance' : score >= 88 ? 'excellent' : 'good';
  return { score, needsRebalance, failing, verdict };
}
