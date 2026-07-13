/**
 * Digital Twin + Simulador de Estratégias — AOS Blocos 7/8
 * Modelo virtual do atleta + simulação determinística de "e se...".
 * Antes de aplicar qualquer mudança, prevê impacto em peso/BF/massa magra,
 * performance e recuperação, com risco e confiança.
 */

export interface DigitalTwin {
  weightKg: number;
  bfPct: number | null;
  leanKg: number | null;
  weeklyKcalBalance: number;   // saldo calórico semanal atual (+superávit / -déficit)
  weeklyCardioKm: number;
  weeklyVolumeKg: number;      // volume de musculação semanal
  recoveryScore: number;       // 0–100
  weeklyStrengthSessions: number;
}

export type StrategyChange =
  | { type: 'change_calories'; dailyDeltaKcal: number }
  | { type: 'add_cardio'; sessionsPerWeek: number; kmPerSession: number }
  | { type: 'change_volume'; deltaSetsPerWeek: number }
  | { type: 'add_carbs'; dailyGrams: number };

export interface SimHorizon { day: number; weightKg: number; bfPct: number | null; leanKg: number | null }
export interface SimulationResult {
  label: string;
  horizons: SimHorizon[];         // 30/60/90 dias
  performanceImpact: string;
  recoveryImpact: string;
  risk: 'baixo' | 'moderado' | 'alto';
  confidence: number;             // 0–100
  summary: string;
}

const KG_PER_KCAL = 1 / 7700;

function project(t: DigitalTwin, weeklyKcalDelta: number, leanShareOnLoss = 0.2): SimHorizon[] {
  const weeklyKg = (t.weeklyKcalBalance + weeklyKcalDelta) * KG_PER_KCAL;
  return [30, 60, 90].map((day) => {
    const weeks = day / 7;
    const dw = Math.round(weeklyKg * weeks * 10) / 10;
    const fatShare = dw < 0 ? 0.8 : 0.4;
    const fatKg = dw * fatShare;
    const leanKgDelta = dw * (1 - fatShare) * (dw < 0 ? leanShareOnLoss / 0.2 : 1);
    const newWeight = Math.round((t.weightKg + dw) * 10) / 10;
    const newBf = t.bfPct != null && t.weightKg > 0
      ? Math.round((((t.bfPct / 100) * t.weightKg + fatKg) / newWeight) * 1000) / 10
      : null;
    const newLean = t.leanKg != null ? Math.round((t.leanKg + leanKgDelta) * 10) / 10 : null;
    return { day, weightKg: newWeight, bfPct: newBf, leanKg: newLean };
  });
}

export function simulateStrategy(t: DigitalTwin, change: StrategyChange): SimulationResult {
  let weeklyKcalDelta = 0;
  let label = '', performanceImpact = '', recoveryImpact = '', summary = '';
  let risk: SimulationResult['risk'] = 'baixo';
  let confidence = 70;

  switch (change.type) {
    case 'change_calories': {
      weeklyKcalDelta = change.dailyDeltaKcal * 7;
      label = `${change.dailyDeltaKcal > 0 ? '+' : ''}${change.dailyDeltaKcal} kcal/dia`;
      performanceImpact = change.dailyDeltaKcal >= 0 ? 'Mais energia para o treino.' : 'Menos energia — cuidar da performance em déficit.';
      recoveryImpact = change.dailyDeltaKcal < -300 ? 'Déficit agressivo pode reduzir a recuperação.' : 'Impacto pequeno na recuperação.';
      risk = change.dailyDeltaKcal < -500 ? 'alto' : change.dailyDeltaKcal < -300 ? 'moderado' : 'baixo';
      break;
    }
    case 'add_cardio': {
      const kmWeek = change.sessionsPerWeek * change.kmPerSession;
      weeklyKcalDelta = -Math.round(kmWeek * t.weightKg * 0.9); // ~0.9 kcal/kg/km
      label = `+${change.sessionsPerWeek}x cardio (${kmWeek.toFixed(0)}km/sem)`;
      performanceImpact = 'Melhora o condicionamento aeróbico; excesso pode competir com a força.';
      recoveryImpact = kmWeek >= 25 ? 'Volume alto de cardio aumenta a demanda de recuperação.' : 'Demanda de recuperação moderada.';
      risk = kmWeek >= 30 || t.recoveryScore < 55 ? 'moderado' : 'baixo';
      break;
    }
    case 'change_volume': {
      label = `${change.deltaSetsPerWeek > 0 ? '+' : ''}${change.deltaSetsPerWeek} séries/sem`;
      performanceImpact = change.deltaSetsPerWeek > 0 ? 'Mais estímulo de hipertrofia (se dentro do MRV).' : 'Menos fadiga; útil se estava em excesso.';
      recoveryImpact = change.deltaSetsPerWeek > 0 ? 'Maior volume aumenta a fadiga acumulada.' : 'Reduz a fadiga.';
      risk = change.deltaSetsPerWeek > 6 || (change.deltaSetsPerWeek > 0 && t.recoveryScore < 55) ? 'alto' : change.deltaSetsPerWeek > 0 ? 'moderado' : 'baixo';
      weeklyKcalDelta = -Math.round(change.deltaSetsPerWeek * 25); // gasto pequeno
      confidence = 62;
      break;
    }
    case 'add_carbs': {
      weeklyKcalDelta = change.dailyGrams * 4 * 7;
      label = `+${change.dailyGrams}g carbo/dia`;
      performanceImpact = 'Mais glicogênio → melhor performance e pump no treino.';
      recoveryImpact = 'Ajuda na recuperação (reposição de glicogênio).';
      risk = 'baixo';
      break;
    }
  }

  const horizons = project(t, weeklyKcalDelta);
  const d90 = horizons[2];
  summary = `Em 90 dias: ~${d90.weightKg}kg${d90.bfPct != null ? `, BF ${d90.bfPct}%` : ''}${d90.leanKg != null ? `, magra ${d90.leanKg}kg` : ''}. Risco: ${risk}.`;
  // Confiança: menor quando a recuperação é baixa (mais incerteza) ou dados faltam
  if (t.recoveryScore < 55) confidence -= 8;
  if (t.bfPct == null || t.leanKg == null) confidence -= 10;
  confidence = Math.max(0, Math.min(100, confidence));

  return { label, horizons, performanceImpact, recoveryImpact, risk, confidence, summary };
}

// Compara N estratégias e ranqueia por aderência ao objetivo (perda p/ cutting, ganho p/ bulk).
export function compareStrategies(t: DigitalTwin, changes: StrategyChange[], goalIsCut: boolean): SimulationResult[] {
  return changes.map((c) => simulateStrategy(t, c)).sort((a, b) => {
    const da = a.horizons[2].weightKg - t.weightKg;
    const db = b.horizons[2].weightKg - t.weightKg;
    return goalIsCut ? da - db : db - da; // cutting: mais negativo primeiro
  });
}
