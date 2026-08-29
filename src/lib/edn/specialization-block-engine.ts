// specialization-block-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §10 — Specialization Block Engine.
//
// A prioridade muscular pode ser um BLOCO temporário (não permanente): músculo
// prioritário, duração, estratégia, volume/frequência extra e critérios de
// sucesso/parada. Ao fim do bloco, avalia e decide o próximo passo.
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecializationBlock {
  muscle_group: string;
  durationWeeks: number;
  addedWeeklySets: number;
  addedFrequency: number;     // exposições extra/semana
  startedWeek: number;
  strategy: string;
}

export function planSpecializationBlock(
  muscle: string,
  opts: { experience: 'beginner' | 'intermediate' | 'advanced'; extraSetsBudget: number; startWeek?: number }
): SpecializationBlock {
  const duration = opts.experience === 'advanced' ? 6 : opts.experience === 'intermediate' ? 5 : 4;
  const addedWeeklySets = Math.max(0, Math.min(opts.extraSetsBudget, opts.experience === 'advanced' ? 6 : 4));
  const addedFrequency = addedWeeklySets >= 4 ? 1 : 0;
  return {
    muscle_group: muscle,
    durationWeeks: duration,
    addedWeeklySets,
    addedFrequency,
    startedWeek: opts.startWeek ?? 0,
    strategy: addedFrequency > 0
      ? `Especialização de ${muscle}: +${addedWeeklySets} séries/sem em +1 exposição, ${duration} semanas.`
      : `Especialização de ${muscle}: +${addedWeeklySets} séries/sem na mesma frequência, ${duration} semanas.`,
  };
}

export interface BlockReviewInput {
  weeksElapsed: number;
  durationWeeks: number;
  loadProgressionPct: number | null;
  repsProgressionPct: number | null;
  volumeTolerated: boolean;      // recuperou o volume extra?
  discomfort: boolean;
  measurableGain: boolean;       // medidas/carga melhoraram?
}

export type BlockDecision = 'CONTINUE' | 'MAINTAIN' | 'REDUCE' | 'ROTATE' | 'CHANGE_PRIORITY';

export interface BlockReview {
  decision: BlockDecision;
  reason: string;
  finished: boolean;
}

export function reviewSpecializationBlock(i: BlockReviewInput): BlockReview {
  const finished = i.weeksElapsed >= i.durationWeeks;

  if (i.discomfort || !i.volumeTolerated) {
    return { decision: 'REDUCE', finished, reason: 'Desconforto ou volume não recuperado — reduzir o estímulo extra.' };
  }
  const progressing = (i.loadProgressionPct ?? 0) >= 3 || (i.repsProgressionPct ?? 0) >= 5 || i.measurableGain;

  if (!finished) {
    return progressing
      ? { decision: 'CONTINUE', finished, reason: 'Bloco em andamento com boa resposta — continuar.' }
      : { decision: 'MAINTAIN', finished, reason: 'Sem ganho claro ainda — manter e reavaliar (checar recuperação/técnica antes de mudar).' };
  }
  // bloco terminou
  if (progressing && i.volumeTolerated) return { decision: 'CONTINUE', finished, reason: 'Respondeu bem — pode estender o bloco.' };
  if (progressing) return { decision: 'MAINTAIN', finished, reason: 'Ganho ok — consolidar antes de novo bloco.' };
  return { decision: 'CHANGE_PRIORITY', finished, reason: 'Resposta fraca ao fim do bloco — trocar o foco de especialização.' };
}
