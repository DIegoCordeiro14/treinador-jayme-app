// stagnation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 13 — Motor de ESTAGNAÇÃO unificado + playbook.
//
// Consolida os sinais de estagnação (por exercício + volume + recuperação) e
// devolve um plano de ação PRIORIZADO. Regra de ouro: antes de trocar exercício,
// checar as causas reversíveis (recuperação/sono, volume excessivo, deload).
// Só recomenda substituir quando o resto está OK e a estagnação persiste.
// ─────────────────────────────────────────────────────────────────────────────

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export interface StagnationExerciseSignal {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  trend: 'progressing' | 'stable' | 'plateau' | 'regressing' | 'new';
  weeks_stagnant: number;
}

export interface StagnationVolumeSignal {
  muscle_group: string;
  status: 'below_mev' | 'at_mev' | 'optimal' | 'near_mrv' | 'over_mrv';
}

export interface StagnationInput {
  exercises: StagnationExerciseSignal[];
  volume?: StagnationVolumeSignal[];
  recovery?: RecoveryCategory;
  sleep_h?: number | null;
}

export type StagnationActionKind =
  | 'improve_recovery'
  | 'reduce_volume'
  | 'deload'
  | 'progression_change'
  | 'rotate_exercise'
  | 'replace_exercise'
  | 'none';

export interface StagnationAction {
  kind: StagnationActionKind;
  priority: number;      // 1 = fazer primeiro
  scope: string;         // grupo/exercício alvo
  reason: string;
}

export interface StagnationReport {
  stagnated: boolean;
  systemic: boolean;     // estagnação generalizada (provável fadiga/recuperação)
  actions: StagnationAction[];
  summary: string;
}

export function analyzeStagnation(input: StagnationInput): StagnationReport {
  const recovery = input.recovery ?? 'good';
  const recoveryPoor = recovery === 'low' || recovery === 'critical';
  const lowSleep = input.sleep_h != null && input.sleep_h < 6;

  const stagnant = input.exercises.filter((e) => e.trend === 'plateau' || e.trend === 'regressing');
  const total = input.exercises.length || 1;
  const ratio = stagnant.length / total;
  const systemic = ratio >= 0.5 && input.exercises.length >= 3;

  const actions: StagnationAction[] = [];

  if (stagnant.length === 0) {
    return { stagnated: false, systemic: false, actions: [{ kind: 'none', priority: 1, scope: 'geral', reason: 'Sem estagnação relevante — seguir progressão.' }], summary: 'Sem estagnação.' };
  }

  // 1) Causas reversíveis primeiro
  if (recoveryPoor || lowSleep) {
    actions.push({
      kind: 'improve_recovery',
      priority: 1,
      scope: 'sistêmico',
      reason: `Recuperação ${recovery}${lowSleep ? ' + sono < 6h' : ''} — corrigir recuperação antes de mudar o treino.`,
    });
  }

  // 2) Volume excessivo é causa comum
  const overMrv = (input.volume ?? []).filter((v) => v.status === 'over_mrv' || v.status === 'near_mrv');
  for (const v of overMrv) {
    actions.push({
      kind: 'reduce_volume',
      priority: 2,
      scope: v.muscle_group,
      reason: `Volume ${v.status} em ${v.muscle_group} — reduzir séries pode destravar o progresso.`,
    });
  }

  // 3) Se estagnação é sistêmica e recuperação OK/volume OK => deload global
  if (systemic && !recoveryPoor && overMrv.length === 0) {
    actions.push({
      kind: 'deload',
      priority: 3,
      scope: 'sistêmico',
      reason: 'Estagnação generalizada com recuperação/volume ok — semana de deload para ressensibilizar.',
    });
  }

  // 4) Ações por exercício: progressão -> rotação -> substituição
  for (const e of stagnant) {
    if (recoveryPoor || lowSleep) continue; // recuperação vem antes
    if (e.weeks_stagnant >= 6) {
      actions.push({ kind: 'replace_exercise', priority: 5, scope: e.exercise_name, reason: `${e.exercise_name}: estagnado ${e.weeks_stagnant} semanas — substituir por novo estímulo.` });
    } else if (e.weeks_stagnant >= 3) {
      actions.push({ kind: 'rotate_exercise', priority: 4, scope: e.exercise_name, reason: `${e.exercise_name}: ${e.weeks_stagnant} semanas — rotacionar variação do mesmo padrão.` });
    } else {
      actions.push({ kind: 'progression_change', priority: 4, scope: e.exercise_name, reason: `${e.exercise_name}: tentar progressão dupla (reps antes de carga) antes de trocar.` });
    }
  }

  actions.sort((a, b) => a.priority - b.priority);

  const summary = systemic
    ? `Estagnação sistêmica (${stagnant.length}/${total}). Priorizar recuperação/deload antes de trocar exercícios.`
    : `Estagnação pontual em ${stagnant.length} exercício(s). Ajustes localizados.`;

  return { stagnated: true, systemic, actions, summary };
}
