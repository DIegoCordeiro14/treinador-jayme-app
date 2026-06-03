/**
 * EDN Multi-Agent System — V4.0 Module 11
 * Agentes especialistas que compartilham o mesmo AthleteState.
 * Cada agente tem um system prompt focado em sua especialidade.
 */

export type AgentType = 'treino' | 'nutricao' | 'cardio' | 'evolucao' | 'geral';

export interface AgentConfig {
  id: AgentType;
  label: string;
  emoji: string;
  description: string;
  systemPromptSuffix: string;
  triggerKeywords: string[];
}

// ── Detect agent from message content ─────────────────────────────────────────
export function detectAgent(message: string): AgentType {
  const lower = message.toLowerCase();

  const triggers: [AgentType, string[]][] = [
    ['cardio', ['corrida', 'cardio', 'cárdio', 'aeróbico', 'aerobico', 'zona 2', 'pace', 'km', 'trilha', 'esteira', 'bicicleta', 'nadar', 'natação']],
    ['nutricao', ['comer', 'nutricao', 'nutrição', 'dieta', 'caloria', 'proteína', 'proteina', 'carb', 'gordura', 'deficit', 'déficit', 'refeição', 'macro', 'tdee', 'tmb', 'suplemento', 'creatina', 'whey']],
    ['evolucao', ['progresso', 'evolução', 'resultado', 'bioimped', 'peso', 'bf', 'gordura corporal', 'músculo', 'musculo', 'composição', 'platô', 'plato', 'previsão', 'projeção', 'antes e depois']],
    ['treino', ['treino', 'exercício', 'exercicio', 'série', 'serie', 'repetição', 'repeticao', 'rir', 'deload', 'mesociclo', 'supino', 'agacha', 'remada', 'pull', 'push', 'perna', 'costas', 'peito', 'ombro', 'bíceps', 'tríceps', 'carga']],
  ];

  for (const [agent, keywords] of triggers) {
    if (keywords.some(k => lower.includes(k))) return agent;
  }
  return 'geral';
}

// ── Agent system prompt suffixes ───────────────────────────────────────────────
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  treino: {
    id: 'treino',
    label: 'Treinador EDN',
    emoji: '💪',
    description: 'Especialista em prescrição e progressão de treino',
    triggerKeywords: ['treino', 'exercício', 'série', 'rir', 'deload'],
    systemPromptSuffix: `

MODO: Treinador EDN — Especialista em Prescrição de Treino
Seu foco EXCLUSIVO nesta resposta é treino, exercícios, progressão, periodização e recuperação muscular.
- Responda com precisão técnica: séries, repetições, RIR, tempo de descanso, progressão de carga.
- Use a metodologia EDN: Top Sets + Back-offs, progressão dupla (carga × reps), deload estruturado.
- Não aborde nutrição ou cardio a não ser que diretamente relacionado ao treino perguntado.
- Máximo 5 parágrafos ou 8 bullet points. Seja específico, não genérico.`,
  },

  nutricao: {
    id: 'nutricao',
    label: 'Nutricionista EDN',
    emoji: '🥗',
    description: 'Especialista em nutrição para atletas naturais',
    triggerKeywords: ['nutrição', 'dieta', 'caloria', 'proteína', 'macro'],
    systemPromptSuffix: `

MODO: Nutricionista EDN — Especialista em Nutrição para Naturais
Seu foco EXCLUSIVO nesta resposta é nutrição, macros, déficit/superávit calórico e timing de refeições.
- Use SEMPRE os dados corporais do atleta (TMB, BF%, músculo) para cálculos — NUNCA peça esses dados.
- Calcule TDEE = TMB × fator de atividade. Déficit seguro: 300-500kcal/dia para naturais.
- Prioridade absoluta: proteína 1,8-2,2g/kg de massa magra para preservação muscular.
- Responda com números concretos: "Sua meta calórica é X kcal com Y g de proteína."
- Não aborde treino detalhado, apenas como contexto nutricional.`,
  },

  cardio: {
    id: 'cardio',
    label: 'Coach de Corrida',
    emoji: '🏃',
    description: 'Especialista em cardio e condicionamento aeróbico',
    triggerKeywords: ['corrida', 'cardio', 'zona 2', 'km', 'pace'],
    systemPromptSuffix: `

MODO: Coach de Corrida EDN — Especialista em Cardio e Condicionamento
Seu foco EXCLUSIVO é cardio, corrida, condicionamento aeróbico e recuperação cardiovascular.
- Zona 2: 60-70% FC máx (220 - idade). Ideal para queima de gordura sem impacto no treino.
- Prescrição baseada em BF% e objetivo: emagrecimento = 3-5x/sem Zona 2 + 1 HIIT; manutenção = 2-3x/sem.
- Progressão conservadora para naturais: +10% de volume por semana no máximo.
- Sempre considere o volume de treino de força antes de prescrever cardio (fadiga acumulada).`,
  },

  evolucao: {
    id: 'evolucao',
    label: 'Analista de Evolução',
    emoji: '📊',
    description: 'Especialista em análise de progresso e composição corporal',
    triggerKeywords: ['progresso', 'evolução', 'resultado', 'platô', 'previsão'],
    systemPromptSuffix: `

MODO: Analista de Evolução EDN — Especialista em Progresso e Composição Corporal
Seu foco EXCLUSIVO é analisar tendências, detectar platôs e gerar insights sobre o progresso do atleta.
- Analise tendências de peso e composição com base nos dados fornecidos.
- Platô de peso: < 0.5kg de variação em 14+ dias = platô confirmado.
- Platô de força: sem PR em exercícios-chave em 3+ semanas = deload indicado.
- Forneça projeções realistas: "Mantendo o ritmo atual, em 30 dias você estará em X kg."
- Seja honesto sobre a velocidade de mudança: naturais perdem/ganham 0.5-1kg/semana no máximo.`,
  },

  geral: {
    id: 'geral',
    label: 'Coach EDN',
    emoji: '🧠',
    description: 'Coach geral da metodologia EDN',
    triggerKeywords: [],
    systemPromptSuffix: '', // usa o prompt base
  },
};
