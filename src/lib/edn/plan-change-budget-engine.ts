// plan-change-budget-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §19 — Plan Change Budget.
//
// Evita trocar tudo de uma vez: limita mudanças simultâneas (padrão 20-30% dos
// exercícios) para preservar familiaridade, progressão e comparabilidade — salvo
// gatilhos que liberam mudança ampla (mudança de objetivo, lesão, condição
// física, plano inadequado, troca solicitada). Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChangeBudgetInput {
  previousExerciseIds: string[];
  proposedExerciseIds: string[];
  // gatilhos que liberam mudança ampla
  goalChanged?: boolean;
  injuryOrCondition?: boolean;
  planClearlyInadequate?: boolean;
  userRequestedOverhaul?: boolean;
  maxChangeRatio?: number;         // default 0.3
  // prioridade de retenção (ex progredindo) — não devem ser trocados
  mustKeepIds?: string[];
  // candidatos de troca ordenados por prioridade de mudança (pior primeiro)
  changePriority?: string[];
}

export interface ChangeBudgetResult {
  allowedChanges: number;
  overhaulAllowed: boolean;
  keptIds: string[];
  changedIds: string[];
  blockedChanges: string[];        // mudanças barradas pelo orçamento
  reason: string;
}

export function applyChangeBudget(i: ChangeBudgetInput): ChangeBudgetResult {
  const prev = new Set(i.previousExerciseIds);
  const proposed = i.proposedExerciseIds;
  const maxRatio = i.maxChangeRatio ?? 0.3;
  const overhaulAllowed = !!(i.goalChanged || i.injuryOrCondition || i.planClearlyInadequate || i.userRequestedOverhaul);

  // exercícios propostos que são NOVOS (não estavam no plano anterior) = mudanças
  const newOnes = proposed.filter((id) => !prev.has(id));
  const base = Math.max(1, i.previousExerciseIds.length);
  const allowedChanges = overhaulAllowed ? proposed.length : Math.max(1, Math.round(base * maxRatio));

  if (overhaulAllowed) {
    return {
      allowedChanges, overhaulAllowed: true,
      keptIds: proposed.filter((id) => prev.has(id)),
      changedIds: newOnes,
      blockedChanges: [],
      reason: 'Gatilho de mudança ampla ativo (objetivo/lesão/plano inadequado/solicitação) — sem limite de trocas.',
    };
  }

  // limita as mudanças ao orçamento: mantém as primeiras (retenção) e barra o excesso
  const mustKeep = new Set(i.mustKeepIds ?? []);
  // ordena as novas por prioridade de mudança se fornecida (pior primeiro = trocar primeiro)
  const orderedNew = i.changePriority
    ? [...newOnes].sort((a, b) => (i.changePriority!.indexOf(a) - i.changePriority!.indexOf(b)))
    : newOnes;
  const accepted = orderedNew.slice(0, allowedChanges);
  const blocked = orderedNew.slice(allowedChanges);

  const keptIds = proposed.filter((id) => prev.has(id) || mustKeep.has(id) || !accepted.includes(id) && !blocked.includes(id));

  return {
    allowedChanges, overhaulAllowed: false,
    keptIds,
    changedIds: accepted,
    blockedChanges: blocked,
    reason: `Orçamento de mudança: até ${allowedChanges} troca(s) (${Math.round(maxRatio * 100)}%). ${blocked.length ? blocked.length + ' troca(s) adiadas para preservar familiaridade.' : ''}`.trim(),
  };
}
