import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultProvider, EDN_SYSTEM_PROMPT } from '@/lib/ai-coach';
import { makeCacheKey, getCached, setCached } from '@/lib/ai-coach/cache';
import type { AIMessage } from '@/lib/ai-coach';
import { detectAgent, AGENT_CONFIGS } from '@/lib/ai-coach/agents';
import { getCachedAthleteContext, serializeAthleteContext } from '@/lib/edn/athlete-context';
import {
  applyWorkoutActions,
  parseWorkoutDirective,
  partialMarkerHold,
  EDN_ACTION_MARKER,
} from '@/lib/edn/workout-actions';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages, conversationId, agentHint } = await req.json() as {
      messages: AIMessage[];
      conversationId?: string;
      agentHint?: string;
    };
    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Invalid messages' }, { status: 400 });
    }

    // ── Multi-agent routing ────────────────────────────────────────────────────
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const detectedAgent = agentHint ?? (lastUserMessage ? detectAgent(lastUserMessage.content) : 'geral');
    const agentConfig = AGENT_CONFIGS[detectedAgent as keyof typeof AGENT_CONFIGS] ?? AGENT_CONFIGS.geral;

    // ── Get full AthleteContext (single source of truth) ─────────────────────
    const ctx = await getCachedAthleteContext(user.id);

    // ── V6.0: Serialize with workout context only for agents that need it ─────
    const includeWorkoutContext = agentConfig.includeWorkoutContext === true;
    const athleteContextStr = serializeAthleteContext(ctx, {
      includeWorkoutPlans: includeWorkoutContext,
      includeExerciseLibrary: includeWorkoutContext,
    });

    // ── Build system prompt: agent-specific + athlete context ─────────────────
    const systemPrompt = `${agentConfig.systemPrompt}

${athleteContextStr}

INSTRUÇÕES CRÍTICAS:
- Os dados acima são a realidade atual do atleta. Nunca peça informações que já estão aqui.
- Se detectar problemas (platô, proteína baixa, fadiga, deload pendente), mencione-os.
- Use os números reais do atleta em todas as recomendações.
- Ao sugerir substituições de exercício, SEMPRE referencie o nome e ID do exercício da biblioteca.`;

    const trimmedMessages = messages.length > 8 ? messages.slice(-8) : messages;
    const lastUserMsg = trimmedMessages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? '';

    // ── Response cache ─────────────────────────────────────────────────────────
    const cacheKey = makeCacheKey(systemPrompt, lastUserMsg);
    const cached = getCached(cacheKey);
    if (cached) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cached })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ agent: detectedAgent, agentLabel: agentConfig.label })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
    }

    const provider = getDefaultProvider();
    const encoder = new TextEncoder();

    const responseStream = new ReadableStream({
      async start(controller) {
        // Tudo que já foi enviado ao cliente; a diretiva @@EDN_ACTIONS@@ nunca é
        // transmitida (é segurada e removida antes de chegar à tela).
        let fullText = '';
        let emittedLen = 0;

        const visibleOf = (full: string): string => {
          const mi = full.indexOf(EDN_ACTION_MARKER);
          if (mi >= 0) return full.slice(0, mi);
          const hold = partialMarkerHold(full);
          return full.slice(0, full.length - hold);
        };
        const emit = (text: string) => {
          if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        };

        try {
          for await (const chunk of provider.stream({ messages: trimmedMessages, systemPrompt, maxTokens: 800 })) {
            if (chunk.text) {
              fullText += chunk.text;
              const visible = visibleOf(fullText);
              if (visible.length > emittedLen) {
                emit(visible.slice(emittedLen));
                emittedLen = visible.length;
              }
            }

            if (chunk.done) {
              // ── Separa a diretiva da prosa e executa as ações reais ─────────
              const { clean, actions } = parseWorkoutDirective(fullText);

              // Garante que toda a prosa limpa foi enviada
              if (clean.length > emittedLen) {
                emit(clean.slice(emittedLen));
                emittedLen = clean.length;
              }

              let finalText = clean;

              if (actions.length > 0) {
                const results = await applyWorkoutActions(supabase, user.id, actions);
                const okMsgs = results.filter(r => r.ok).map(r => r.message);
                const failMsgs = results.filter(r => !r.ok).map(r => r.message);
                let confirm = '';
                if (okMsgs.length) confirm += `\n\n✅ **Aplicado no app:**\n` + okMsgs.map(m => `- ${m}`).join('\n');
                if (failMsgs.length) confirm += `\n\n⚠️ **Não foi possível aplicar:**\n` + failMsgs.map(m => `- ${m}`).join('\n');
                if (confirm) {
                  emit(confirm);
                  finalText = clean + confirm;
                }
              }

              // Cache só a prosa final (sem diretiva, com a confirmação real)
              if (finalText.length > 50) setCached(cacheKey, finalText);

              // Salva a conversa
              try {
                const assistantMessage: AIMessage = { role: 'assistant', content: finalText };
                const allMessages = [...messages, assistantMessage];
                if (conversationId) {
                  await supabase.from('ai_conversations').update({ messages: allMessages, updated_at: new Date().toISOString() }).eq('id', conversationId).eq('user_id', user.id);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ conversationId })}\n\n`));
                } else {
                  const { data: newConv } = await supabase.from('ai_conversations').insert({ user_id: user.id, messages: allMessages }).select('id').single();
                  if (newConv?.id) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ conversationId: newConv.id })}\n\n`));
                }
              } catch (_err) { /* non-fatal */ }

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ agent: detectedAgent, agentLabel: agentConfig.label })}\n\n`));
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
            }
          }
        } catch (err: any) {
          const msg = err?.message ?? '';
          let fallback = `⚠️ Erro ao conectar com a IA. Tente novamente.`;
          if (err?.status === 401 || msg.includes('API key')) fallback = '⚠️ **Chave de API inválida.** Configure `ANTHROPIC_API_KEY` no Vercel.';
          else if (msg.includes('credit balance')) fallback = '⚠️ **Sem créditos Anthropic.** Adicione em console.anthropic.com.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fallback })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err) {
    console.error('ai-coach error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
