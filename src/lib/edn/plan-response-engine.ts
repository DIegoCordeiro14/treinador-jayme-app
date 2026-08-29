// plan-response-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §24 — Feedback loop de geração: classifica o plano após o bloco.
//
// Plan → Execution → Performance → RIR → Recovery → Adherence → Body Evolution
// → Plan Response → Next Generation. A classificação influencia diretamente a
// próxima geração. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanResponseInput {
  strengthDeltaPct: number | null;
  volumeToleratedRate: number | null;   // 0..1 (quanto do volume prescrito foi recuperado)
  avgRirTrend: number | null;            // + = RIR subindo (menos fadiga), - = caindo
  recoveryTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  adherenceRate: number;                 // 0..1
  bodyProgress: 'positive' | 'neutral' | 'negative' | 'unknown';
}

export type PlanClass = 'HIGHLY_EFFECTIVE' | 'EFFECTIVE' | 'NEUTRAL' | 'INEFFECTIVE' | 'EXCESSIVE_FATIGUE';

export interface PlanResponseResult {
  classification: PlanClass;
  nextGenerationHint: string;
  score: number;                         // -100..100
}

export function classifyPlanResponse(i: PlanResponseInput): PlanResponseResult {
  // sinal de fadiga excessiva tem precedência
  const excessiveFatigue =
    (i.recoveryTrend === 'declining' && (i.volumeToleratedRate ?? 1) < 0.7) ||
    (i.avgRirTrend != null && i.avgRirTrend < -1 && (i.strengthDeltaPct ?? 0) <= 0);

  if (excessiveFatigue) {
    return { classification: 'EXCESSIVE_FATIGUE', score: -40,
      nextGenerationHint: 'Reduzir volume/frequência e priorizar recuperação; considerar deload antes de progredir.' };
  }

  let score = 0;
  if (i.strengthDeltaPct != null) score += Math.max(-30, Math.min(40, i.strengthDeltaPct * 4));
  if (i.volumeToleratedRate != null) score += (i.volumeToleratedRate - 0.7) * 40;
  score += (i.adherenceRate - 0.7) * 40;
  if (i.bodyProgress === 'positive') score += 15; else if (i.bodyProgress === 'negative') score -= 15;
  if (i.recoveryTrend === 'improving') score += 8; else if (i.recoveryTrend === 'declining') score -= 8;
  score = Math.round(Math.max(-100, Math.min(100, score)));

  let classification: PlanClass;
  let hint: string;
  if (score >= 45) { classification = 'HIGHLY_EFFECTIVE'; hint = 'Manter a estrutura e progredir; preservar exercícios que deram resultado.'; }
  else if (score >= 15) { classification = 'EFFECTIVE'; hint = 'Progressão funcionando — pequenos ajustes, sem revisão ampla.'; }
  else if (score >= -15) { classification = 'NEUTRAL'; hint = 'Resposta morna — investigar recuperação/aderência antes de mudar volume.'; }
  else { classification = 'INEFFECTIVE'; hint = 'Baixa resposta — revisar seleção de exercícios, volume e aderência na próxima geração.'; }

  return { classification, nextGenerationHint: hint, score };
}
