/**
 * AI Coach — Strategy Pattern
 * Allows swapping between Anthropic, OpenAI, Gemini
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIStreamChunk {
  text: string;
  done: boolean;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AIProvider {
  name: string;
  complete(options: AICompletionOptions): Promise<string>;
  stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk>;
}

export type AIProviderName = 'anthropic' | 'openai' | 'gemini';
