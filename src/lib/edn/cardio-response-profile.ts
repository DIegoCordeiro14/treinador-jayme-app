// cardio-response-profile.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §2 — Modelo longitudinal de resposta ao cardio (persistido).
//
// Aprende COMO o atleta responde ao treinamento: tolerância a aumento de volume,
// resposta a longões/intervalados, e a ZONA IDEAL de progressão individual (em vez
// da regra fixa de +10%). Puro/determinístico; a rota persiste o resultado.
// ─────────────────────────────────────────────────────────────────────────────

export interface CardioBlockObservation {
  volumeIncreasePct: number;         // aumento aplicado no bloco
  outcome: 'improved' | 'stable' | 'recovery_dropped'; // resultado observado
  kind?: 'volume' | 'long_run' | 'interval';
}

export interface CardioResponseInput { observations: CardioBlockObservation[]; }

export type Tolerance = 'high' | 'normal' | 'low' | 'unknown';

export interface CardioResponseProfile {
  idealProgression: { low: number; high: number };   // zona ideal %
  cautionHigh: number;                                 // % onde começa a cautela
  volumeTolerance: Tolerance;
  longRunResponse: 'responds_well' | 'neutral' | 'struggles' | 'unknown';
  intervalResponse: 'responds_well' | 'neutral' | 'struggles' | 'unknown';
  observations: number;
  confidence: number;                                  // 0..100
  note: string;
}

function respFromObs(obs: CardioBlockObservation[], kind: CardioBlockObservation['kind']): CardioResponseProfile['longRunResponse'] {
  const rel = obs.filter((o) => o.kind === kind);
  if (rel.length < 2) return 'unknown';
  const good = rel.filter((o) => o.outcome === 'improved').length;
  const bad = rel.filter((o) => o.outcome === 'recovery_dropped').length;
  if (good >= bad && good >= rel.length * 0.5) return 'responds_well';
  if (bad > good) return 'struggles';
  return 'neutral';
}

export function learnCardioResponse(input: CardioResponseInput): CardioResponseProfile {
  const obs = input.observations ?? [];
  if (obs.length < 3) {
    return {
      idealProgression: { low: 5, high: 10 }, cautionHigh: 15, volumeTolerance: 'unknown',
      longRunResponse: 'unknown', intervalResponse: 'unknown', observations: obs.length,
      confidence: Math.round(Math.min(1, obs.length / 6) * 100),
      note: 'Poucos dados — usando a regra populacional (5–10%).',
    };
  }

  // maior aumento que ainda "improved" e menor aumento que já "recovery_dropped"
  const improved = obs.filter((o) => o.outcome === 'improved').map((o) => o.volumeIncreasePct);
  const dropped = obs.filter((o) => o.outcome === 'recovery_dropped').map((o) => o.volumeIncreasePct);
  const maxImproved = improved.length ? Math.max(...improved) : 10;
  const minDropped = dropped.length ? Math.min(...dropped) : 18;

  // zona ideal: até o maior aumento tolerado com melhora; cautela até onde começa a queda
  let low = 5;
  let high = Math.max(6, Math.min(maxImproved, minDropped - 2));
  let cautionHigh = Math.max(high + 2, minDropped);
  // arredonda e ordena
  high = Math.round(high); low = Math.min(low, high - 1 < 3 ? 3 : high - 3); cautionHigh = Math.round(cautionHigh);
  if (low < 3) low = 3;

  const volumeTolerance: Tolerance = maxImproved >= 14 ? 'high' : maxImproved <= 7 ? 'low' : 'normal';
  const confidence = Math.round(Math.min(1, obs.length / 8) * 100);

  return {
    idealProgression: { low, high }, cautionHigh, volumeTolerance,
    longRunResponse: respFromObs(obs, 'long_run'), intervalResponse: respFromObs(obs, 'interval'),
    observations: obs.length, confidence,
    note: `Zona ideal aprendida: ${low}–${high}% (cautela a partir de ${cautionHigh}%). Tolerância a volume: ${volumeTolerance}.`,
  };
}

// linha persistível
export function toCardioProfileRow(userId: string, p: CardioResponseProfile) {
  return {
    user_id: userId, ideal_progression_low: p.idealProgression.low, ideal_progression_high: p.idealProgression.high,
    caution_high: p.cautionHigh, volume_tolerance: p.volumeTolerance, long_run_response: p.longRunResponse,
    interval_response: p.intervalResponse, observations: p.observations, confidence_score: p.confidence,
    last_updated: new Date().toISOString(),
  };
}
