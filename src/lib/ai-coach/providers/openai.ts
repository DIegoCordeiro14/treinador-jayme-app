import OpenAI from 'openai';
import type { AIProvider, AICompletionOptions, AIStreamChunk } from '../types';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(options: AICompletionOptions): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push(
      ...options.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    );
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: options.maxTokens ?? 1024,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push(
      ...options.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    );
    const stream = await this.client.chat.completions.create({ model: 'gpt-4o-mini', messages, stream: true });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) yield { text, done: false };
    }
    yield { text: '', done: true };
  }
}
