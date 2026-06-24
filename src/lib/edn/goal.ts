/**
 * Objetivo OFICIAL do atleta — fonte única: profiles.main_goal.
 * Normaliza as várias chaves usadas no histórico do app para uma forma canônica
 * (ex.: weight_loss == fat_loss == Emagrecimento) e dá o rótulo em PT-BR.
 */
export type CanonicalGoal = 'fat_loss' | 'definition' | 'recomposition' | 'hypertrophy' | 'mass_gain' | 'performance' | 'maintenance';

export function canonicalGoal(raw: string | null | undefined): CanonicalGoal {
  const g = (raw ?? '').toLowerCase();
  if (g === 'fat_loss' || g === 'weight_loss' || g === 'emagrecimento') return 'fat_loss';
  if (g === 'definition' || g === 'definicao' || g === 'cutting') return 'definition';
  if (g === 'recomposition' || g === 'recomposicao' || g === 'recomp') return 'recomposition';
  if (g === 'mass_gain' || g === 'bulk' || g === 'lean_bulk' || g === 'ganho_massa') return 'mass_gain';
  if (g === 'performance' || g === 'endurance') return 'performance';
  if (g === 'maintenance' || g === 'manutencao') return 'maintenance';
  return 'hypertrophy';
}

export const GOAL_LABEL_PT: Record<CanonicalGoal, string> = {
  fat_loss: 'Emagrecimento',
  definition: 'Definição',
  recomposition: 'Recomposição',
  hypertrophy: 'Hipertrofia',
  mass_gain: 'Ganho de massa',
  performance: 'Performance',
  maintenance: 'Manutenção',
};

export function goalLabel(raw: string | null | undefined): string {
  return GOAL_LABEL_PT[canonicalGoal(raw)];
}

// Ajuste calórico padrão por objetivo canônico (déficit/superávit).
export function goalCalorieAdjustment(raw: string | null | undefined, tdee: number): number {
  switch (canonicalGoal(raw)) {
    case 'fat_loss': return -Math.round(Math.min(500, tdee * 0.18));
    case 'definition': return -Math.round(Math.min(450, tdee * 0.15));
    case 'recomposition': return -150;
    case 'hypertrophy': return Math.round(Math.min(350, tdee * 0.1));
    case 'mass_gain': return Math.round(Math.min(400, tdee * 0.12));
    default: return 0;
  }
}
