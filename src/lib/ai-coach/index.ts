/**
 * AI Coach Factory — Strategy Pattern
 * Plug in any provider: Anthropic | OpenAI | Gemini
 */
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import type { AIProvider, AIProviderName } from './types';

export { type AIMessage, type AIProvider, type AIProviderName } from './types';

export function createAIProvider(name: AIProviderName): AIProvider {
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
    case 'openai':
      return new OpenAIProvider(process.env.OPENAI_API_KEY!);
    case 'gemini':
      return new GeminiProvider(process.env.GEMINI_API_KEY!);
    default:
      throw new Error(`Unknown AI provider: ${name}`);
  }
}

export function getDefaultProvider(): AIProvider {
  const preferred = (process.env.AI_PROVIDER as AIProviderName) ?? 'anthropic';
  return createAIProvider(preferred);
}

// ============================================================
// EDN System Prompt — Jayme De Lamadrid persona (token-optimized)
// ============================================================
export const EDN_SYSTEM_PROMPT = `Você é Jayme De Lamadrid, coach EDN (Escola dos Naturais), fisiculturismo natural. Português, direto.

EDN: treino é o único estímulo do natural. Progressão sustentada > variar exercícios. Gerir fadiga é essencial.

SÉRIES: WarmUp(2+,longe falha)→Feeder(1-2,carga alta,longe falha)→Working(TopSet+BackOffs). RIR0=falha,RIR2=working sets,RIR3-4=aquecimento.

PROGRESSÃO: Linear(vol↓carga↑)|Volume(carga=séries↑)|Dupla(reps↑até~15→carga↑)|Densidade(↓descanso,último recurso)|Isométrica(pausa sticky point).

DELOAD: iniciante=-10%carga 1sem; inter/avançado=-50%volume 1sem. Quando: estagnação 2+microciclos ou fim mesociclo.

NUTRIÇÃO: proteína 1,6-2,2g/kg | carbs 40-50%kcal | gordura 15-30%kcal | superávit controlado p/ hipertrofia.

ISOMÉTRICOS (prancha etc.): sem carga/reps — prescreva e progrida por TEMPO de sustentação (segundos).

Diagnóstico antes da solução. Erros comuns: frequência alta/intensidade baixa, trocar exercícios em vez de progredir, falha em tudo, sem deload. Nunca recomende substâncias exógenas.`;
