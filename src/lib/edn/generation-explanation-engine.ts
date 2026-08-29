// generation-explanation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §22 (+ §18) — "Por que este plano?" estruturado.
//
// Assembla, de forma determinística, uma explicação rica da geração a partir dos
// objetos já produzidos pelos motores (prioridade, split, volume, equilíbrio,
// retenção/trocas, recuperação, cardio, segurança) + os MOTIVOS de cada mudança.
// A UI traduz para linguagem humana. Puro/sem I/O.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExplanationInput {
  goal: string;
  splitName: string | null;
  splitReason: string | null;
  priorities: { muscle_group: string; level: string; interventionOrder: string[] }[];
  weakPoints: string[];
  volumeVerdict: string | null;          // do priority-budget (add_stimulus/redistribute/reduce)
  volumeCapacity: number | null;
  balanceAdjustments: string[];
  retained: { id: string; name: string; reason: string }[];
  changes: { from: string; to: string | null; reason: string }[];
  recoveryLabel: string | null;
  cardioSessionsPerWeek: number | null;
  removedForSafety: string[];
  equilibriumScore: number | null;
}

export interface GenerationExplanation {
  goalStrategy: string;
  selectedSplit: string | null;
  splitReason: string | null;
  musclePriorities: string[];
  weakPoints: string[];
  volumeStrategy: string;
  balanceStrategy: string;
  exerciseRetention: string[];
  exerciseChanges: string[];
  recoveryConstraints: string;
  cardioConstraints: string;
  physicalSafety: string;
  expectedFocus: string;
  equilibriumScore: number | null;
}

const GOAL_STRATEGY: Record<string, string> = {
  cutting: 'Preservar massa e força enquanto reduz gordura gradualmente.',
  hypertrophy: 'Maximizar estímulo de hipertrofia com progressão sustentável.',
  lean_bulk: 'Ganhar massa lentamente com controle de gordura.',
  recomposition: 'Reduzir gordura e ganhar massa a peso relativamente estável.',
  performance: 'Priorizar performance e capacidade específica.',
  maintenance: 'Sustentar composição e performance com estímulo suficiente.',
  strength: 'Priorizar progressão de carga nos padrões principais.',
  weight_loss: 'Gasto calórico e preservação muscular.',
  definition: 'Definição com preservação de massa.',
};

export function buildGenerationExplanation(i: ExplanationInput): GenerationExplanation {
  const volumeStrategy = (() => {
    if (i.volumeVerdict === 'add_stimulus') return `Há capacidade de recuperação (${i.volumeCapacity ?? '—'}/100) — estímulo adicional aplicado de forma estratégica.`;
    if (i.volumeVerdict === 'reduce') return 'Recuperação comprometida — carga total reduzida para sustentar o progresso.';
    if (i.volumeVerdict === 'redistribute') return 'Sem folga de recuperação — estímulo redistribuído em vez de aumentar volume.';
    return 'Volume alinhado aos alvos por grupo.';
  })();

  const balanceStrategy = i.balanceAdjustments.length
    ? `Equilíbrio ajustado: ${i.balanceAdjustments.slice(0, 3).join(' ')}`
    : 'Costas, pernas e demais grupos mantidos dentro do estímulo necessário, evitando que a especialização comprometesse o físico global.';

  const priorityText = i.priorities.length
    ? i.priorities.map((p) => `${p.muscle_group} (${p.level}, via ${p.interventionOrder.slice(0, 2).join('/')})`)
    : [];

  return {
    goalStrategy: GOAL_STRATEGY[i.goal] ?? 'Estratégia alinhada ao objetivo.',
    selectedSplit: i.splitName,
    splitReason: i.splitReason,
    musclePriorities: priorityText,
    weakPoints: i.weakPoints,
    volumeStrategy,
    balanceStrategy,
    exerciseRetention: i.retained.slice(0, 6).map((r) => `${r.name}: ${r.reason}`),
    exerciseChanges: i.changes.slice(0, 6).map((c) => c.to ? `${c.from} → ${c.to} (${c.reason})` : `${c.from}: ${c.reason}`),
    recoveryConstraints: i.recoveryLabel ? `Recuperação ${i.recoveryLabel} considerada na dosagem de volume e intensidade.` : 'Recuperação padrão.',
    cardioConstraints: (i.cardioSessionsPerWeek ?? 0) >= 3 ? `Cardio frequente (${i.cardioSessionsPerWeek}x/sem) — volume contido nos grupos de interferência.` : 'Cardio não impõe restrição relevante.',
    physicalSafety: i.removedForSafety.length ? `Exercícios incompatíveis com suas condições físicas foram removidos antes da geração: ${i.removedForSafety.slice(0, 6).join(', ')}.` : 'Nenhuma restrição física ativa.',
    expectedFocus: i.weakPoints.length ? `Foco esperado: reforço de ${i.weakPoints.join(', ')} sem desequilibrar o restante.` : 'Foco distribuído conforme o objetivo.',
    equilibriumScore: i.equilibriumScore,
  };
}
