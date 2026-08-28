// decision-simulation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 3 (item 18) — Simulação de decisões (what-if).
//
// Estima o efeito PROVÁVEL de decisões (ex: +1 dia de treino, aplicar deload,
// aumentar/reduzir volume, aumentar cardio) sobre volume, performance potencial
// e recuperação. Determinístico e explicitamente probabilístico/qualitativo —
// não promete resultados. Complementa o Digital Twin do Athlete OS.
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionAction =
  | 'add_training_day' | 'remove_training_day' | 'apply_deload'
  | 'increase_volume' | 'reduce_volume' | 'increase_cardio' | 'reduce_cardio';

export interface SimulationContext {
  currentTrainingDays: number;
  currentRecoveryScore: number | null;   // 0..100
  volumeStatus: 'below_mev' | 'optimal' | 'near_mrv' | 'over_mrv' | 'unknown';
}

export type Effect = 'up' | 'down' | 'neutral';

export interface SimulationResult {
  action: DecisionAction;
  effects: { volume: Effect; performancePotential: Effect; recovery: Effect };
  likelihood: 'high' | 'moderate' | 'low';
  message: string;
  caution: string | null;
}

export function simulateDecision(action: DecisionAction, ctx: SimulationContext): SimulationResult {
  const recPoor = ctx.currentRecoveryScore != null && ctx.currentRecoveryScore < 45;
  const nearLimit = ctx.volumeStatus === 'near_mrv' || ctx.volumeStatus === 'over_mrv';
  let effects: SimulationResult['effects'];
  let message: string;
  let caution: string | null = null;
  let likelihood: SimulationResult['likelihood'] = 'moderate';

  switch (action) {
    case 'add_training_day':
      effects = { volume: 'up', performancePotential: nearLimit ? 'neutral' : 'up', recovery: 'down' };
      message = 'Mais um dia de treino tende a aumentar volume e potencial de performance, ao custo de recuperação.';
      if (recPoor || nearLimit) { caution = 'Recuperação/volume já no limite — o ganho pode não se converter em progresso.'; likelihood = 'low'; }
      else likelihood = 'high';
      break;
    case 'remove_training_day':
      effects = { volume: 'down', performancePotential: nearLimit ? 'up' : 'down', recovery: 'up' };
      message = 'Remover um dia reduz volume mas melhora recuperação — pode destravar progresso se havia fadiga.';
      likelihood = recPoor || nearLimit ? 'high' : 'moderate';
      break;
    case 'apply_deload':
      effects = { volume: 'down', performancePotential: 'up', recovery: 'up' };
      message = 'Deload reduz volume nesta semana; após a recuperação, aumenta a probabilidade de recuperar a performance.';
      likelihood = recPoor || nearLimit ? 'high' : 'moderate';
      break;
    case 'increase_volume':
      effects = { volume: 'up', performancePotential: nearLimit ? 'down' : 'up', recovery: 'down' };
      message = 'Mais volume estimula hipertrofia até certo ponto; acima do MRV o retorno vira negativo.';
      if (nearLimit) { caution = 'Você já está perto/acima do MRV — aumentar volume tende a piorar.'; likelihood = 'low'; }
      else likelihood = 'high';
      break;
    case 'reduce_volume':
      effects = { volume: 'down', performancePotential: nearLimit ? 'up' : 'neutral', recovery: 'up' };
      message = 'Reduzir volume melhora recuperação; se você estava acima do MRV, tende a melhorar a performance.';
      likelihood = nearLimit ? 'high' : 'moderate';
      break;
    case 'increase_cardio':
      effects = { volume: 'neutral', performancePotential: 'down', recovery: 'down' };
      message = 'Mais cardio ajuda condicionamento/gasto calórico, mas pode interferir na recuperação e na força.';
      if (recPoor) { caution = 'Recuperação baixa — aumentar cardio pode acentuar a interferência.'; likelihood = 'low'; }
      break;
    case 'reduce_cardio':
      effects = { volume: 'neutral', performancePotential: 'up', recovery: 'up' };
      message = 'Menos cardio libera recuperação para o treino de força.';
      likelihood = 'moderate';
      break;
  }

  return { action, effects, likelihood, message, caution };
}

export function simulateAll(ctx: SimulationContext, actions?: DecisionAction[]): SimulationResult[] {
  const all: DecisionAction[] = actions ?? ['add_training_day', 'apply_deload', 'increase_volume', 'reduce_volume', 'increase_cardio'];
  return all.map((a) => simulateDecision(a, ctx));
}
