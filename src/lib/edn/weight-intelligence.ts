/**
 * Weight Intelligence — EDN
 * Análise determinística de peso a partir de TODOS os dados do usuário
 * (série mesclada manual+bioimpedância, objetivo, sexo, BF, meta).
 * Calcula tendência, ritmo semanal, previsão de chegada à meta e, quando não
 * há meta definida, sugere uma meta saudável pelo BF/objetivo.
 */

export interface WeightPoint { t: number; peso: number; bf: number | null }

export interface WeightAnalysisInput {
  series: WeightPoint[];            // ascendente por data
  targetWeightKg: number | null;
  goal: string | null;             // fat_loss | hypertrophy | recomposition | ...
  gender: string | null;           // male | female
  latestBfPct: number | null;
}

export interface WeightAnalysis {
  trendKg: number | null;          // variação no período (~14d tolerante)
  weeklyRateKg: number | null;     // ritmo kg/semana
  targetKg: number | null;         // meta (usuário ou sugerida)
  targetIsSuggested: boolean;
  etaWeeks: number | null;         // semanas até a meta no ritmo atual
  etaDateMs: number | null;
  message: string;
}

export function analyzeWeight(i: WeightAnalysisInput): WeightAnalysis | null {
  const s = [...i.series].sort((a, b) => a.t - b.t);
  if (!s.length) return null;
  const latest = s[s.length - 1];

  // ── Tendência + ritmo: referência ~14d atrás (janela 5–40d), senão ponto anterior
  let trendKg: number | null = null;
  let weeklyRateKg: number | null = null;
  if (s.length >= 2) {
    const target = latest.t - 14 * 86400000;
    let ref: WeightPoint | null = null;
    let best = Infinity;
    for (const e of s) {
      if (e.t >= latest.t) continue;
      const gap = (latest.t - e.t) / 86400000;
      if (gap < 5 || gap > 40) continue;
      const d = Math.abs(e.t - target);
      if (d < best) { best = d; ref = e; }
    }
    if (!ref) ref = s[s.length - 2];
    const weeks = (latest.t - ref.t) / (7 * 86400000);
    trendKg = Math.round((latest.peso - ref.peso) * 10) / 10;
    if (weeks > 0) weeklyRateKg = Math.round((trendKg / weeks) * 100) / 100;
  }

  // ── Meta: usuário ou sugerida pelo BF/objetivo ────────────────────────────
  let targetKg = i.targetWeightKg;
  let targetIsSuggested = false;
  const cutting = i.goal === 'fat_loss' || i.goal === 'weight_loss' || i.goal === 'definition';
  if (targetKg == null && i.latestBfPct != null && i.latestBfPct > 0) {
    const targetBf = i.gender === 'female' ? 24 : 15;
    if (i.latestBfPct > targetBf + 2) {
      const lean = latest.peso * (1 - i.latestBfPct / 100);
      targetKg = Math.round((lean / (1 - targetBf / 100)) * 10) / 10;
      targetIsSuggested = true;
    }
  }

  // ── ETA até a meta no ritmo atual ─────────────────────────────────────────
  let etaWeeks: number | null = null;
  let etaDateMs: number | null = null;
  if (targetKg != null && weeklyRateKg != null && Math.abs(weeklyRateKg) >= 0.05) {
    const remaining = targetKg - latest.peso;          // negativo se precisa perder
    const sameDirection = (remaining < 0 && weeklyRateKg < 0) || (remaining > 0 && weeklyRateKg > 0);
    if (Math.abs(remaining) < 0.3) { etaWeeks = 0; etaDateMs = latest.t; }
    else if (sameDirection) {
      etaWeeks = Math.ceil(Math.abs(remaining / weeklyRateKg));
      etaDateMs = latest.t + etaWeeks * 7 * 86400000;
    }
  }

  // ── Mensagem ──────────────────────────────────────────────────────────────
  let message: string;
  const rateStr = weeklyRateKg != null ? `${weeklyRateKg > 0 ? '+' : ''}${weeklyRateKg}kg/sem` : null;
  if (targetKg == null) {
    message = rateStr ? `Ritmo atual: ${rateStr}. Defina uma meta de peso para ver a previsão.` : 'Registre mais pesagens para a análise.';
  } else if (etaWeeks === 0) {
    message = `Você atingiu a meta de ${targetKg}kg! 🎯`;
  } else if (etaWeeks != null) {
    message = `No ritmo atual (${rateStr}), você chega aos ${targetKg}kg${targetIsSuggested ? ' (meta sugerida)' : ''} em ~${etaWeeks} semana(s).`;
  } else if (weeklyRateKg != null && Math.abs(weeklyRateKg) < 0.05) {
    message = `Peso estável. ${cutting ? 'Para retomar a perda, ajuste déficit/cardio.' : 'Ajuste calorias conforme o objetivo.'}`;
  } else {
    message = `Seu ritmo atual (${rateStr}) está te afastando da meta de ${targetKg}kg — reveja a estratégia.`;
  }

  return { trendKg, weeklyRateKg, targetKg, targetIsSuggested, etaWeeks, etaDateMs, message };
}
