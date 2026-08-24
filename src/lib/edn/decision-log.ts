/**
 * Decision Log (V9 §18) — registra decisões relevantes do sistema com o dado que
 * as motivou e, depois, o resultado observado. Fecha o loop de aprendizado.
 * Não grava conteúdo médico sensível (apenas região/severidade agregada).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface DecisionRecord {
  trigger: string;
  engine?: string;
  domain?: string;
  decision: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputs?: Record<string, any>;
  applied?: boolean;
}

/** Grava uma decisão. Best-effort — nunca quebra o fluxo principal. */
export async function logDecision(supabase: SB, userId: string, rec: DecisionRecord): Promise<string | null> {
  try {
    const { data } = await supabase.from('athlete_decisions').insert({
      user_id: userId, trigger: rec.trigger, engine: rec.engine ?? null, domain: rec.domain ?? null,
      decision: rec.decision, inputs: rec.inputs ?? null, applied: rec.applied ?? false,
    }).select('id').single();
    return data?.id ?? null;
  } catch { return null; }
}

/** Preenche o resultado posterior de uma decisão (ex.: "performance estabilizou"). */
export async function recordOutcome(supabase: SB, userId: string, decisionId: string, outcome: string): Promise<void> {
  try {
    await supabase.from('athlete_decisions').update({ outcome, outcome_at: new Date().toISOString() }).eq('id', decisionId).eq('user_id', userId);
  } catch { /* best-effort */ }
}

/**
 * Avalia automaticamente decisões de "reduzir/deload" comparando a tendência de
 * performance após a decisão. Determinístico: quem aplica passa o delta observado.
 */
export function evaluateOutcome(strengthTrendPctAfter: number | null): string {
  if (strengthTrendPctAfter == null) return 'sem dados suficientes';
  if (strengthTrendPctAfter >= 2) return 'performance voltou a subir';
  if (strengthTrendPctAfter >= -1) return 'performance estabilizou';
  return 'performance ainda em queda';
}
