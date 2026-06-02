import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AICompletionOptions, AIStreamChunk } from '../types';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(options: AICompletionOptions): Promise<string> {
    const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const history = options.messages
      .filter((m) => m.role !== 'system')
      .slice(0, -1)
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const lastMsg = options.messages.filter((m) => m.role !== 'system').at(-1)?.content ?? '';
    const chat = model.startChat({ history, systemInstruction: options.systemPrompt });
    const result = await chat.sendMessage(lastMsg);
    return result.response.text();
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const lastMsg = options.messages.filter((m) => m.role !== 'system').at(-1)?.content ?? '';
    const result = await model.generateContentStream(lastMsg);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield { text, done: false };
    }
    yield { text: '', done: true };
  }
}
