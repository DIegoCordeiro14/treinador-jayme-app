/**
 * Coach Router — EDN V8.1
 * Classifica a intenção da mensagem do atleta em um agente primário e,
 * quando a pergunta é multidisciplinar, sugere agentes de apoio.
 * Determinístico (palavras-chave + combinações).
 */
import type { AgentType } from './agents';

export interface RouteResult {
  primary: AgentType;
  support: AgentType[];   // especialistas adicionais relevantes
}

const KW: Record<Exclude<AgentType, 'geral'>, string[]> = {
  treinador: ['supino', 'agachamento', 'carga', 'série', 'serie', 'repetição', 'rir', 'exercício', 'exercicio', 'split', 'volume', 'progressão', 'progressao', 'treino', 'hipertrofia', 'deload', 'periodização'],
  nutricionista: ['caloria', 'macro', 'proteína', 'proteina', 'carbo', 'gordura', 'déficit', 'deficit', 'dieta', 'emagrec', 'secar', 'cutting', 'comer', 'refeição', 'tdee'],
  performance: ['corrida', 'correr', 'pace', 'maratona', '5km', '10km', 'zona 2', 'prova', 'cardio', 'ciclismo', 'endurance', 'vo2'],
  recovery: ['sono', 'dormir', 'hrv', 'fadiga', 'cansado', 'cansaço', 'recupera', 'descanso', 'readiness', 'overtraining'],
  analista: ['peso', 'gordura corporal', 'bf', 'massa magra', 'evolução', 'evolucao', 'projeção', 'projecao', 'tendência', 'platô', 'plato', 'bioimped', 'composição'],
  periodizacao: ['mesociclo', 'macrociclo', 'fase do treino', 'periodiza', 'acúmulo', 'intensificação', 'sobrecarga'],
};

function scores(msg: string): Record<string, number> {
  const m = msg.toLowerCase();
  const out: Record<string, number> = {};
  for (const [agent, words] of Object.entries(KW)) {
    out[agent] = words.reduce((n, w) => n + (m.includes(w) ? 1 : 0), 0);
  }
  return out;
}

export function routeIntent(message: string): RouteResult {
  const sc = scores(message);
  const ranked = (Object.entries(sc) as [AgentType, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) return { primary: 'geral', support: [] };

  const primary = ranked[0][0];
  const support = ranked.slice(1).filter(([, n]) => n > 0).map(([a]) => a);

  // Combinações comuns: "secar sem perder músculo" → nutrição + treino + recovery
  const m = message.toLowerCase();
  if ((m.includes('secar') || m.includes('emagrec') || m.includes('déficit')) && (m.includes('músculo') || m.includes('musculo') || m.includes('força') || m.includes('forca'))) {
    return { primary: 'nutricionista', support: Array.from(new Set(['treinador', 'recovery', ...support] as AgentType[])).filter(a => a !== 'nutricionista') };
  }
  if (m.includes('travado') && (m.includes('emagrec') || m.includes('peso'))) {
    return { primary: 'analista', support: Array.from(new Set(['nutricionista', ...support] as AgentType[])).filter(a => a !== 'analista') };
  }

  return { primary, support: support.slice(0, 2) };
}
