// nutrition-goal-map.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §3 — Fonte ÚNICA de conversão objetivo → fase nutricional.
//
// Nenhuma rota deve interpretar strings de objetivo manualmente. Toda conversão
// passa por normalizeGoal() (objetivo canônico) e deriveGoalPhase() (NutritionPhase).
// Corrige o mapeamento incoerente anterior (hypertrophy/muscle_gain caíam no default
// silenciosamente; 'cutting' ia para 'definicao'). Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import type { NutritionPhase } from './nutrition-autopilot';

// Objetivo canônico (inglês) usado internamente pelos motores.
export type CanonicalGoal =
  | 'weight_loss' | 'definition' | 'hypertrophy' | 'lean_bulk'
  | 'recomposition' | 'performance' | 'maintenance';

// Aliases → objetivo canônico. Cobre todas as variações vistas no app/banco.
const GOAL_ALIASES: Record<string, CanonicalGoal> = {
  // perda de gordura / cutting
  weight_loss: 'weight_loss', fat_loss: 'weight_loss', emagrecimento: 'weight_loss',
  perder_peso: 'weight_loss', perda_gordura: 'weight_loss', cutting: 'weight_loss',
  // definição
  definition: 'definition', definicao: 'definition', 'definição': 'definition',
  // hipertrofia
  hypertrophy: 'hypertrophy', hipertrofia: 'hypertrophy', muscle_gain: 'hypertrophy',
  massa: 'hypertrophy', ganho_muscular: 'hypertrophy',
  // lean bulk
  lean_bulk: 'lean_bulk', bulk: 'lean_bulk', mass_gain: 'lean_bulk', ganho_massa: 'lean_bulk',
  bulking: 'lean_bulk',
  // recomposição
  recomposition: 'recomposition', recomposicao: 'recomposition', 'recomposição': 'recomposition',
  recomp: 'recomposition',
  // performance / endurance
  performance: 'performance', endurance: 'performance', corrida: 'performance',
  running: 'performance', resistencia: 'performance',
  // manutenção
  maintenance: 'maintenance', manutencao: 'maintenance', 'manutenção': 'maintenance',
  health: 'maintenance', saude: 'maintenance',
};

// objetivo canônico → fase nutricional (valores PT-BR do NutritionPhase existente)
const CANONICAL_TO_PHASE: Record<CanonicalGoal, NutritionPhase> = {
  weight_loss: 'cutting',
  definition: 'definicao',
  hypertrophy: 'hipertrofia',
  lean_bulk: 'lean_bulk',
  recomposition: 'recomposicao',
  performance: 'performance',
  maintenance: 'manutencao',
};

export function normalizeGoal(raw: string | null | undefined): CanonicalGoal {
  const g = String(raw ?? '').toLowerCase().trim();
  if (g && GOAL_ALIASES[g]) return GOAL_ALIASES[g];
  // fallback tolerante por substring (ex: 'weight_loss_fast')
  for (const [alias, canon] of Object.entries(GOAL_ALIASES)) {
    if (g && g.includes(alias)) return canon;
  }
  return 'hypertrophy'; // default explícito
}

export function deriveGoalPhase(raw: string | null | undefined): NutritionPhase {
  return CANONICAL_TO_PHASE[normalizeGoal(raw)];
}

// Conveniência: rótulo humano do objetivo canônico.
export const CANONICAL_GOAL_LABEL: Record<CanonicalGoal, string> = {
  weight_loss: 'Emagrecimento', definition: 'Definição', hypertrophy: 'Hipertrofia',
  lean_bulk: 'Lean Bulk', recomposition: 'Recomposição', performance: 'Performance',
  maintenance: 'Manutenção',
};
