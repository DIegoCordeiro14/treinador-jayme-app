import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AICompletionOptions, AIStreamChunk } from '../types';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(options: AICompletionOptions): Promise<string> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: options.maxTokens ?? 1024,
      system: options.systemPrompt,
      messages,
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = await this.client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: options.maxTokens ?? 1024,
      system: options.systemPrompt,
      messages,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield { text: chunk.delta.text, done: false };
      }
    }
    yield { text: '', done: true };
  }
}
