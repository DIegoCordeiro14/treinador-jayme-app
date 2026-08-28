// recomposition-plateau-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 (itens 6 e 7) — Recomposição corporal real + Platô inteligente.
//
// Item 6: muitos acham que "não evoluem" porque olham só o peso. Este motor
// detecta RECOMPOSIÇÃO (peso ~estável mas gordura↓ e massa magra/força↑).
// Item 7: platô NÃO é "peso parado" — só é platô se peso, BF, medidas, força e
// volume estiverem todos estagnados. Se qualquer um melhora, não há platô real.
// Puro/determinístico. Consome deltas já calculados (via body-metrics-unifier).
// ─────────────────────────────────────────────────────────────────────────────

export interface RecompInput {
  weightDeltaKg: number | null;      // variação no período (negativo = perdeu)
  bodyFatDeltaPct: number | null;    // negativo = perdeu gordura
  leanDeltaKg: number | null;        // positivo = ganhou magra
  strengthDeltaPct: number | null;   // performance (topset médio) %
  waistDeltaCm: number | null;       // negativo = afinou
  periodDays: number;
}

export type RecompVerdict =
  | 'recomposition'         // 🟢 provável
  | 'fat_loss'              // perda de gordura clara
  | 'muscle_gain'           // ganho de massa
  | 'muscle_loss'           // perda muscular (alerta)
  | 'inconclusive';

export interface RecompResult {
  verdict: RecompVerdict;
  confidence: 'high' | 'moderate' | 'low';
  message: string;
  signals: string[];
}

export function detectRecomposition(i: RecompInput): RecompResult {
  const signals: string[] = [];
  const weightStable = i.weightDeltaKg != null && Math.abs(i.weightDeltaKg) < 0.8;
  const fatDown = i.bodyFatDeltaPct != null && i.bodyFatDeltaPct <= -0.5;
  const leanUp = i.leanDeltaKg != null && i.leanDeltaKg >= 0.4;
  const strengthUp = i.strengthDeltaPct != null && i.strengthDeltaPct >= 3;
  const waistDown = i.waistDeltaCm != null && i.waistDeltaCm <= -0.8;
  const weightDown = i.weightDeltaKg != null && i.weightDeltaKg <= -0.8;
  const leanDown = i.leanDeltaKg != null && i.leanDeltaKg <= -0.5;

  if (fatDown) signals.push('gordura em queda');
  if (leanUp) signals.push('massa magra subindo');
  if (strengthUp) signals.push('força subindo');
  if (waistDown) signals.push('cintura afinando');
  if (weightStable) signals.push('peso estável');

  // Recomposição: peso estável (ou levemente ↓) + (gordura↓ OU cintura↓) + (magra↑ OU força↑)
  const bodyImproving = fatDown || waistDown;
  const anabolicSignal = leanUp || strengthUp;

  if ((weightStable || weightDown) && bodyImproving && anabolicSignal) {
    const strong = [fatDown, leanUp, strengthUp, waistDown].filter(Boolean).length;
    return {
      verdict: 'recomposition',
      confidence: strong >= 3 ? 'high' : 'moderate',
      message: 'Seu peso ficou praticamente estável, mas a composição corporal e a performance evoluíram — recomposição corporal provável.',
      signals,
    };
  }

  if (weightDown && fatDown && !leanDown) {
    return { verdict: 'fat_loss', confidence: fatDown && strengthUp ? 'high' : 'moderate',
      message: 'Perda de gordura com massa/força preservadas.', signals };
  }
  if (i.weightDeltaKg != null && i.weightDeltaKg >= 0.8 && (leanUp || strengthUp)) {
    return { verdict: 'muscle_gain', confidence: leanUp && strengthUp ? 'high' : 'moderate',
      message: 'Ganho de peso acompanhado de mais massa magra/força.', signals };
  }
  if (leanDown && (i.weightDeltaKg == null || i.weightDeltaKg <= 0)) {
    return { verdict: 'muscle_loss', confidence: 'moderate',
      message: 'Sinais de perda de massa magra — revisar proteína, recuperação e déficit.', signals };
  }
  return { verdict: 'inconclusive', confidence: 'low',
    message: 'Sinais insuficientes ou mistos para um veredito de composição.', signals };
}

// ── Platô inteligente ────────────────────────────────────────────────────────
export interface PlateauInput {
  periodDays: number;
  weightDeltaKg: number | null;
  bodyFatDeltaPct: number | null;
  waistDeltaCm: number | null;
  strengthDeltaPct: number | null;
  volumeDeltaPct: number | null;
}

export interface PlateauResult {
  isPlateau: boolean;
  reason: string;
  improvingSignals: string[];
}

export function detectPlateau(i: PlateauInput): PlateauResult {
  // sem tempo suficiente não dá pra falar em platô
  if (i.periodDays < 21) {
    return { isPlateau: false, reason: 'Período curto demais para caracterizar platô (< 21 dias).', improvingSignals: [] };
  }

  const weightStuck = i.weightDeltaKg == null || Math.abs(i.weightDeltaKg) < 0.4;
  const improving: string[] = [];
  if (i.bodyFatDeltaPct != null && i.bodyFatDeltaPct <= -0.4) improving.push('gordura ↓');
  if (i.waistDeltaCm != null && i.waistDeltaCm <= -0.7) improving.push('cintura ↓');
  if (i.strengthDeltaPct != null && i.strengthDeltaPct >= 3) improving.push('força ↑');
  if (i.volumeDeltaPct != null && i.volumeDeltaPct >= 5) improving.push('volume ↑');

  if (!weightStuck) {
    return { isPlateau: false, reason: 'Peso ainda em movimento — sem platô.', improvingSignals: improving };
  }
  if (improving.length > 0) {
    return {
      isPlateau: false,
      reason: `Peso estável há ${i.periodDays} dias, mas há progresso em: ${improving.join(', ')}. Provável recomposição, não platô.`,
      improvingSignals: improving,
    };
  }
  return {
    isPlateau: true,
    reason: `Peso, composição, medidas, força e volume estagnados há ${i.periodDays} dias — platô real. Ajustar calorias, volume ou aplicar deload.`,
    improvingSignals: [],
  };
}
