// next-best-action-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hub P2 — Próxima melhor ação PRIORIZADA (uma ação principal).
//
// Em vez de uma lista de sugestões, prioriza CRÍTICO > IMPORTANTE > RECOMENDADO >
// OPCIONAL e devolve UMA ação principal para o Dashboard. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type ActionPriority = 'critical' | 'important' | 'recommended' | 'optional';

export interface NbaCandidate {
  id: string;
  priority: ActionPriority;
  emoji: string;
  title: string;
  detail: string;
  domain: 'recovery' | 'nutrition' | 'training' | 'cardio' | 'data' | 'safety';
  href?: string;
}

export interface NbaInput {
  injuryRisk: 'none' | 'low' | 'moderate' | 'high';
  recoveryScore: number | null;
  proteinBelowTarget: boolean;
  trainedToday: boolean;
  hasWorkoutToday: boolean;
  cardioPlannedToday: boolean;
  weightStaleDays: number | null;    // dias desde o último peso
  acwrHigh: boolean;
  plateau: boolean;
}

export interface NextBestAction {
  primary: NbaCandidate | null;
  all: NbaCandidate[];
}

const RANK: Record<ActionPriority, number> = { critical: 4, important: 3, recommended: 2, optional: 1 };

export function computeNextBestAction(i: NbaInput): NextBestAction {
  const c: NbaCandidate[] = [];

  // CRÍTICO — segurança/recuperação
  if (i.injuryRisk === 'high') c.push({ id: 'injury', priority: 'critical', emoji: '⚠️', title: 'Condição física ativa', detail: 'Priorize recuperação e evite sobrecarregar a região afetada hoje.', domain: 'safety', href: '/app/perfil' });
  if (i.recoveryScore != null && i.recoveryScore < 35) c.push({ id: 'recovery', priority: 'critical', emoji: '🛌', title: 'Recuperação muito baixa', detail: 'Reduza a sessão ou descanse — seu melhor investimento hoje é recuperar.', domain: 'recovery' });
  if (i.acwrHigh) c.push({ id: 'acwr', priority: 'critical', emoji: '📈', title: 'Carga acima do recuperável', detail: 'ACWR alto — segure o volume esta semana para evitar lesão.', domain: 'training' });

  // IMPORTANTE
  if (i.proteinBelowTarget) c.push({ id: 'protein', priority: 'important', emoji: '🍽️', title: 'Proteína abaixo da meta', detail: 'Ajuste a proteína do dia para preservar massa.', domain: 'nutrition', href: '/app/nutricao' });
  if (i.plateau) c.push({ id: 'plateau', priority: 'important', emoji: '🔄', title: 'Platô detectado', detail: 'Ver a análise e ajustar a estratégia.', domain: 'training', href: '/app/evolucao' });

  // RECOMENDADO
  if (i.hasWorkoutToday && !i.trainedToday) c.push({ id: 'workout', priority: 'recommended', emoji: '🏋️', title: 'Treino de hoje', detail: 'Você tem treino programado — bora treinar.', domain: 'training', href: '/app/treinos' });
  if (i.cardioPlannedToday && !i.trainedToday) c.push({ id: 'cardio', priority: 'recommended', emoji: '🏃', title: 'Cardio de hoje', detail: 'Dia de cardio no seu plano.', domain: 'cardio', href: '/app/cardio' });

  // OPCIONAL
  if (i.weightStaleDays != null && i.weightStaleDays >= 7) c.push({ id: 'weight', priority: 'optional', emoji: '⚖️', title: 'Registrar peso', detail: `Seu peso está desatualizado (${i.weightStaleDays} dias) — registre para calibrar melhor.`, domain: 'data', href: '/app/evolucao' });

  const all = c.sort((a, b) => RANK[b.priority] - RANK[a.priority]);
  return { primary: all[0] ?? null, all };
}
