import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultProvider, EDN_SYSTEM_PROMPT } from '@/lib/ai-coach';
import { makeCacheKey, getCached, setCached } from '@/lib/ai-coach/cache';
import type { AIMessage } from '@/lib/ai-coach';
import { detectAgent, AGENT_CONFIGS } from '@/lib/ai-coach/agents';
import { routeIntent } from '@/lib/ai-coach/coach-router';
import { getCachedAthleteContext, serializeAthleteContext } from '@/lib/edn/athlete-context';
import { classifyRunner, computeCardioLoad, computeTrainingZones, deriveRacePhase, analyzeRunPerformance, type RunPoint } from '@/lib/cardio/endurance-engine';
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
    const route = lastUserMessage ? routeIntent(lastUserMessage.content) : { primary: 'geral' as const, support: [] };
    const detectedAgent = agentHint ?? route.primary ?? (lastUserMessage ? detectAgent(lastUserMessage.content) : 'geral');
    const agentConfig = AGENT_CONFIGS[detectedAgent as keyof typeof AGENT_CONFIGS] ?? AGENT_CONFIGS.geral;

    // ── Get full AthleteContext (single source of truth) ─────────────────────
    const ctx = await getCachedAthleteContext(user.id);

    // ── Memória de longo prazo do atleta (preferências/limitações) ────────────
    let memoryStr = '';
    try {
      const { data: mem } = await supabase.from('athlete_memory').select('content').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8);
      if (mem && mem.length) memoryStr = `\n[MEMÓRIA DO ATLETA]\n${mem.map((m: { content: string }) => `- ${m.content}`).join('\n')}`;
    } catch { /* tabela pode faltar */ }
    const supportStr = (!agentHint && route.support && route.support.length)
      ? `\n[ESPECIALISTAS DE APOIO sugeridos para esta pergunta: ${route.support.join(', ')}] — integre essas perspectivas na resposta.`
      : '';

    // ── V6.0: Serialize with workout context only for agents that need it ─────
    const includeWorkoutContext = agentConfig.includeWorkoutContext === true;
    const athleteContextStr = serializeAthleteContext(ctx, {
      includeWorkoutPlans: includeWorkoutContext,
      includeExerciseLibrary: includeWorkoutContext,
    });

    // ── Endurance Coach: injeta resumo determinístico da corrida ──────────────
    let enduranceStr = '';
    if (detectedAgent === 'performance') {
      try {
        const now = Date.now();
        const [{ data: prof }, { data: runs }, { data: wm }] = await Promise.all([
          supabase.from('profiles').select('age, target_race_date').eq('id', user.id).maybeSingle(),
          supabase.from('cardio_sessions').select('performed_at, created_at, distance_km, duration_min, avg_hr, avg_heart_rate').eq('user_id', user.id).gte('created_at', new Date(now - 90 * 86400000).toISOString()),
          supabase.from('wearable_metrics').select('resting_hr').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (runs ?? []) as any[];
        const dm = (r: any) => new Date(r.performed_at || r.created_at).getTime();
        const kmIn = (d: number) => L.filter(r => dm(r) >= now - d * 86400000).reduce((a, r) => a + (r.distance_km ?? 0), 0);
        const km7 = kmIn(7), km28 = kmIn(28), km90 = kmIn(90);
        const weeklyKmAvg = km90 / Math.max(1, Math.ceil(90 / 7));
        const longestKm = L.reduce((m, r) => Math.max(m, r.distance_km ?? 0), 0);
        let weeksConsistent = 0;
        for (let w = 0; w < 8; w++) { const end = now - w * 7 * 86400000; if (L.some(r => dm(r) <= end && dm(r) > end - 7 * 86400000)) weeksConsistent++; }
        const runner = classifyRunner({ weeklyKmAvg, sessionsPerWeek: L.filter(r => dm(r) >= now - 28 * 86400000).length / 4, weeksConsistent, longestKm });
        const load = computeCardioLoad({ km7, km28, km90, sessions7: L.filter(r => dm(r) >= now - 7 * 86400000).length });
        const maxHrSeen = L.reduce((m, r) => Math.max(m, r.avg_hr ?? r.avg_heart_rate ?? 0), 0);
        const zones = computeTrainingZones({ age: (prof as any)?.age ?? null, maxHrMeasured: maxHrSeen > 0 ? Math.round(maxHrSeen / 0.92) : null, restingHr: (wm as any)?.resting_hr ?? null });
        const raceDate = (prof as any)?.target_race_date ? new Date((prof as any).target_race_date) : null;
        const weeksToRace = raceDate && raceDate.getTime() >= now - 86400000 ? Math.max(0, Math.ceil((raceDate.getTime() - now) / (7 * 86400000))) : null;
        const racePhase = deriveRacePhase({ weeksToRace });
        const runPoints: RunPoint[] = L.map(r => ({ dateMs: dm(r), km: r.distance_km ?? 0, durationMin: r.duration_min ?? 0, avgHr: r.avg_hr ?? r.avg_heart_rate ?? null }));
        const perf = analyzeRunPerformance({ runs: runPoints, periodDays: 90 });
        const zStr = zones ? `FCmáx ${zones.maxHr} (${zones.source}); Z2 ${zones.zones[1].hrLow}-${zones.zones[1].hrHigh}, Z4 ${zones.zones[3].hrLow}-${zones.zones[3].hrHigh} bpm` : 'sem zonas (faltam idade/FC)';
        enduranceStr = `\n[CORRIDA — MOTOR DETERMINÍSTICO (use estes números, não invente)]\nNível: ${runner.label}. Volume: 7d ${km7.toFixed(1)}km, 28d ${km28.toFixed(1)}km, média ${weeklyKmAvg.toFixed(1)}km/sem.\nCarga: ${load.score}/100 (ACWR ${load.acwr}, risco ${load.risk}). ${load.note}\nZonas: ${zStr}.\nEvolução: ${perf.status}${perf.paceTrendPct != null ? `, pace ${perf.paceTrendPct}%` : ''}${perf.hrTrendPct != null ? `, FC ${perf.hrTrendPct}%` : ''}. ${perf.message}\nFase de prova: ${racePhase.label}${weeksToRace != null ? ` (faltam ${weeksToRace} sem.)` : ''} — ${racePhase.objective}`;
      } catch { /* sem dados de corrida — segue só com o contexto geral */ }
    }

    // ── Build system prompt: agent-specific + athlete context ─────────────────
    const systemPrompt = `${agentConfig.systemPrompt}

${athleteContextStr}${enduranceStr}${memoryStr}${supportStr}

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
          for await (const chunk of provider.stream({ messages: trimmedMessages, systemPrompt, maxTokens: 2400 })) {
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
