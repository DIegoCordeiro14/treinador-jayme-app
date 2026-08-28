// athlete-evolution-memory.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 3 (item 16) — Aprendizado LONGITUDINAL por atleta.
//
// Agrega os resultados de decisões (decision-outcome) e a resposta corporal ao
// longo do tempo para PERSONALIZAR estratégias futuras: quais ações funcionaram
// para ESTE atleta, tolerância a volume, resposta a déficit, sensibilidade a
// cardio. Alimenta o gerador (training-response-profile) e o Coach. Determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import type { DecisionOutcome } from './decision-outcome-engine';

export interface DecisionMemoryItem {
  action: string;          // ex "apply_deload" | "reduce_volume" | "increase_volume"
  outcome: DecisionOutcome;
}

export interface ResponseObservation {
  // resposta a um bloco: volume aplicado e resultado (do training-response-profile)
  context: 'high_volume' | 'low_volume' | 'deficit' | 'surplus' | 'high_cardio';
  positive: boolean;
}

export interface EvolutionMemoryInput {
  decisions: DecisionMemoryItem[];
  responses: ResponseObservation[];
}

export interface StrategyStat {
  action: string;
  timesTried: number;
  successRate: number;     // 0..100 (positivas / julgadas)
  recommendation: 'favor' | 'avoid' | 'neutral' | 'insufficient';
}

export interface AthleteEvolutionMemory {
  strategies: StrategyStat[];
  traits: {
    volumeTolerance: 'high' | 'normal' | 'low' | 'unknown';
    deficitResponse: 'handles_well' | 'loses_performance' | 'unknown';
    cardioSensitivity: 'sensitive' | 'tolerant' | 'unknown';
  };
  learnedNotes: string[];
}

function statForAction(items: DecisionMemoryItem[]): StrategyStat {
  const action = items[0].action;
  const judged = items.filter((i) => i.outcome.verdict === 'positive' || i.outcome.verdict === 'negative');
  const positive = judged.filter((i) => i.outcome.verdict === 'positive').length;
  const successRate = judged.length ? Math.round((positive / judged.length) * 100) : 0;
  let recommendation: StrategyStat['recommendation'];
  if (judged.length < 2) recommendation = 'insufficient';
  else if (successRate >= 67) recommendation = 'favor';
  else if (successRate <= 33) recommendation = 'avoid';
  else recommendation = 'neutral';
  return { action, timesTried: items.length, successRate, recommendation };
}

export function buildEvolutionMemory(input: EvolutionMemoryInput): AthleteEvolutionMemory {
  // estatística por ação
  const byAction = new Map<string, DecisionMemoryItem[]>();
  for (const it of input.decisions) {
    const arr = byAction.get(it.action) ?? [];
    arr.push(it);
    byAction.set(it.action, arr);
  }
  const strategies = [...byAction.values()].map(statForAction).sort((a, b) => b.successRate - a.successRate);

  // traços aprendidos a partir das respostas
  const posBy = (c: ResponseObservation['context']) => {
    const arr = input.responses.filter((r) => r.context === c);
    if (arr.length < 2) return null;
    return arr.filter((r) => r.positive).length / arr.length;
  };
  const hv = posBy('high_volume');
  const def = posBy('deficit');
  const cardio = posBy('high_cardio');

  const traits: AthleteEvolutionMemory['traits'] = {
    volumeTolerance: hv == null ? 'unknown' : hv >= 0.6 ? 'high' : hv <= 0.35 ? 'low' : 'normal',
    deficitResponse: def == null ? 'unknown' : def >= 0.6 ? 'handles_well' : def <= 0.35 ? 'loses_performance' : 'unknown',
    cardioSensitivity: cardio == null ? 'unknown' : cardio <= 0.35 ? 'sensitive' : cardio >= 0.6 ? 'tolerant' : 'unknown',
  };

  const learnedNotes: string[] = [];
  for (const s of strategies) {
    if (s.recommendation === 'favor') learnedNotes.push(`"${s.action}" tem funcionado (${s.successRate}% de acerto) — priorizar quando indicado.`);
    if (s.recommendation === 'avoid') learnedNotes.push(`"${s.action}" costuma falhar para este atleta (${s.successRate}%) — evitar.`);
  }
  if (traits.volumeTolerance === 'high') learnedNotes.push('Responde bem a volume alto — pode operar no topo da faixa adaptativa.');
  if (traits.volumeTolerance === 'low') learnedNotes.push('Satura cedo com volume — manter volumes mais baixos e progressão de carga.');
  if (traits.deficitResponse === 'loses_performance') learnedNotes.push('Perde performance em déficit agressivo — preferir déficits menores.');
  if (traits.cardioSensitivity === 'sensitive') learnedNotes.push('Cardio interfere na recuperação/força — dosar com cuidado.');

  return { strategies, traits, learnedNotes };
}
