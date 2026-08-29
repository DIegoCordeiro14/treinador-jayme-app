// exercise-role-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §15 — Exercise Role Engine.
//
// Cada exercício ganha uma FUNÇÃO explícita, e a sessão é montada por funções
// (ex 1 PRIMARY + 1 SECONDARY + 2 HYPERTROPHY + 1 ISOLATION) em vez de exercícios
// aleatórios. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type ExerciseRole =
  | 'PRIMARY_STRENGTH' | 'PRIMARY_HYPERTROPHY' | 'SECONDARY_COMPOUND'
  | 'ISOLATION' | 'TECHNIQUE' | 'CORRECTIVE' | 'MAINTENANCE';

export interface RoleInput {
  id: string;
  name: string;
  is_compound: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isCorrective?: boolean;
  objective: 'strength' | 'hypertrophy' | 'weight_loss' | 'definition' | 'recomp' | 'running' | 'health';
}

export function assignRole(i: RoleInput): ExerciseRole {
  if (i.isCorrective) return 'CORRECTIVE';
  if (i.is_compound) {
    if (i.objective === 'strength') return 'PRIMARY_STRENGTH';
    return 'PRIMARY_HYPERTROPHY';
  }
  return 'ISOLATION';
}

// Composição-alvo de funções por objetivo e nº de exercícios da sessão.
export interface RoleComposition { PRIMARY: number; SECONDARY: number; HYPERTROPHY: number; ISOLATION: number; }

export function targetComposition(objective: RoleInput['objective'], exercisesPerSession: number): RoleComposition {
  const n = Math.max(3, exercisesPerSession);
  if (objective === 'strength') {
    return { PRIMARY: 2, SECONDARY: 1, HYPERTROPHY: Math.max(0, n - 4), ISOLATION: 1 };
  }
  if (objective === 'weight_loss' || objective === 'definition') {
    return { PRIMARY: 1, SECONDARY: 2, HYPERTROPHY: Math.max(0, n - 4), ISOLATION: 1 };
  }
  // hipertrofia/recomp padrão
  return { PRIMARY: 1, SECONDARY: 1, HYPERTROPHY: Math.max(1, n - 3), ISOLATION: 1 };
}

// Verifica se um conjunto de funções atende (aproximadamente) a composição-alvo.
export function compositionGaps(roles: ExerciseRole[], target: RoleComposition): string[] {
  const primary = roles.filter((r) => r === 'PRIMARY_STRENGTH' || r === 'PRIMARY_HYPERTROPHY').length;
  const secondary = roles.filter((r) => r === 'SECONDARY_COMPOUND').length;
  const iso = roles.filter((r) => r === 'ISOLATION').length;
  const gaps: string[] = [];
  if (primary < target.PRIMARY) gaps.push(`faltam ${target.PRIMARY - primary} exercício(s) primário(s)`);
  if (iso < Math.min(1, target.ISOLATION)) gaps.push('falta exercício de isolamento');
  if (secondary + iso + primary === 0) gaps.push('sessão sem estrutura de funções');
  return gaps;
}
