// decision-outcome-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 (item 11) — Decisões -> Resultados.
//
// Avalia decisões registradas em athlete_decisions comparando métricas ANTES vs
// DEPOIS (janela de N dias) e classifica se a decisão foi positiva/neutra/negativa.
// Isso permite ao Coach EDN aprender quais estratégias funcionam para o atleta.
// Puro/determinístico. Não faz I/O — recebe a decisão + os deltas medidos.
// ─────────────────────────────────────────────────────────────────────────────

export interface DecisionRecord {
  id: string;
  decision: string;               // ex "Reduzir volume em 25%"
  domain: string;                 // training | nutrition | recovery | cardio
  appliedAtISO: string;
  // métricas medidas após a janela (deltas)
  strengthDeltaPct: number | null;
  recoveryDeltaPct: number | null;
  bodyFatDeltaPct: number | null;
  leanDeltaKg: number | null;
  // objetivo que a decisão pretendia melhorar (opcional)
  targetMetric?: 'strength' | 'recovery' | 'fat_loss' | 'muscle_gain' | null;
}

export type DecisionVerdict = 'positive' | 'neutral' | 'negative' | 'pending';

export interface DecisionOutcome {
  id: string;
  decision: string;
  verdict: DecisionVerdict;
  scoreDelta: number;             // índice agregado de resultado
  summary: string;
}

export function evaluateDecision(d: DecisionRecord, minDaysToJudge = 10, daysSinceApplied = 999): DecisionOutcome {
  if (daysSinceApplied < minDaysToJudge) {
    return { id: d.id, decision: d.decision, verdict: 'pending', scoreDelta: 0,
      summary: `Aguardando ${minDaysToJudge - daysSinceApplied} dia(s) para avaliar o resultado.` };
  }

  // combina os sinais relevantes num índice; a métrica-alvo pesa mais
  const parts: { key: string; val: number; w: number }[] = [];
  const add = (key: string, val: number | null, w: number) => { if (val != null) parts.push({ key, val, w }); };
  const targetBoost = (k: string) => (d.targetMetric && kMatch(k, d.targetMetric) ? 2 : 1);

  add('strength', d.strengthDeltaPct, 1 * targetBoost('strength'));
  add('recovery', d.recoveryDeltaPct, 1 * targetBoost('recovery'));
  add('fat', d.bodyFatDeltaPct != null ? -d.bodyFatDeltaPct * 5 : null, 1 * targetBoost('fat')); // gordura↓ é bom
  add('lean', d.leanDeltaKg != null ? d.leanDeltaKg * 10 : null, 1 * targetBoost('muscle'));

  if (parts.length === 0) {
    return { id: d.id, decision: d.decision, verdict: 'neutral', scoreDelta: 0, summary: 'Sem métricas para avaliar.' };
  }
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const scoreDelta = Math.round((parts.reduce((a, p) => a + p.val * p.w, 0) / wsum) * 10) / 10;

  let verdict: DecisionVerdict;
  if (scoreDelta >= 3) verdict = 'positive';
  else if (scoreDelta <= -3) verdict = 'negative';
  else verdict = 'neutral';

  const label = verdict === 'positive' ? 'Decisão positiva' : verdict === 'negative' ? 'Decisão negativa' : 'Resultado neutro';
  return {
    id: d.id, decision: d.decision, verdict, scoreDelta,
    summary: `${label}. Índice de resultado ${scoreDelta > 0 ? '+' : ''}${scoreDelta} após aplicar "${d.decision}".`,
  };
}

function kMatch(key: string, target: string): boolean {
  return (key === 'strength' && target === 'strength')
    || (key === 'recovery' && target === 'recovery')
    || (key === 'fat' && target === 'fat_loss')
    || (key === 'lean' && target === 'muscle_gain');
}

// Agrega vários resultados para ver a taxa de acerto das estratégias.
export interface DecisionStats {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  pending: number;
  successRate: number;            // positivas / (positivas+negativas)
}

export function summarizeDecisions(outcomes: DecisionOutcome[]): DecisionStats {
  const c = { total: outcomes.length, positive: 0, negative: 0, neutral: 0, pending: 0 };
  for (const o of outcomes) c[o.verdict]++;
  const judged = c.positive + c.negative;
  return { ...c, successRate: judged > 0 ? Math.round((c.positive / judged) * 100) : 0 };
}
