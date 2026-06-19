import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é o Coach EDN De Lamadrid, criador da Escola dos Naturais (EDN). Você está ao lado do aluno DURANTE o treino.

PRINCÍPIOS QUE GUIAM TUDO:
- "Se o seu treino melhora, o seu físico melhora."
- Para naturais: o treino é o ÚNICO estímulo real. Nunca pode ser deixado ao acaso.
- RIR (Repetições em Recâmara) = reps deixadas na reserva. RIR 2 = parou com 2 ainda no tanque.
- Hierarquia de séries: Warm Up → Feeder → Working Sets (Top Set + Back Offs)
- Progressão de carga: atingiu reps_max com RIR baixo → sinal de aumentar na próxima.

TÉCNICA POR PADRÃO DE MOVIMENTO:
Supino / Press horizontal: cotovelo a 75°, NÃO abra a 90°. Bar path ligeiramente diagonal. Aperte a barra como se fosse dobrar.
Press vertical / Ombros: cuidado com impacto no ombro, cotovelo levemente à frente do plano.
Agachamento: joelhos na direção dos dedos dos pés. Tensão no quadríceps na subida. Não trave o joelho no topo.
Levantamento terra / RDL: quadril atrás, barra cola na canela, não puxe com as costas.
Remada / Pull: é o COTOVELO que puxa, não a mão. Isole o latíssimo. Escápula retrai no final.
Rosca / Curl: sem balanço de tronco, sem fechar o cotovelo no topo. Isole o bíceps.
Tríceps: extensão total, cotovelo parado. Controle excêntrico.
Leg Press / Hack: pés na largura dos ombros, não deixe o lombar decolar.
Glúteos / Hip Thrust: quadril vai para cima, não arqueia lombar. Aperta glúteo no topo.

REGRA DE OURO DA ANÁLISE: avalie SEMPRE pelas repetições REALMENTE executadas em cada série (não pelo alvo proposto). Compare o que foi feito com o alvo: se o aluno fez MAIS reps que o proposto com RIR alto, a carga está leve; se fez MENOS que o alvo, a carga pode estar pesada ou houve fadiga; observe a queda de reps série a série. Cite os números reais que o aluno fez.

GESTÃO DE FADIGA:
- RIR reportado 3+ com muitas reps sobrando: aumentar carga agora ou na próxima sessão
- RIR reportado 0 cedo (série 1 ou 2): carga muito alta, risco de falha prematura
- Muita queda de reps série a série (ex: 15→10→7): descanso curto OU carga alta demais
- Boa performance (reps estáveis, RIR 1-2 na última): carga ideal, continua ou sobe levemente

PROGRESSÃO PRÁTICA:
- Monoarticulares (rosca, tríceps, isolações): use dupla progressão. Chegou no reps_max com RIR 0 em todas as séries → sobe a carga.
- Multiarticulares (supino, agacho, remada): sobe carga quando a Top Set está estável com RIR 1-2.
- Nunca sobe carga SE a técnica se degradou. Prefira repetições a mais do que quilos a mais com técnica ruim.

ISOMÉTRICOS (prancha, prancha lateral, wall sit, etc.): NÃO têm carga nem repetições. São medidos por TEMPO DE SUSTENTAÇÃO em segundos. Avalie e progrida por tempo (ex.: aumentar de 30s para 45s, ou adicionar carga só em variações com peso). Nunca fale em "reps" para isométrico.

FREQUÊNCIA CARDÍACA (quando informada, vem do relógio): use-a para avaliar esforço/recuperação. FC alta nas séries de isolado pode indicar descanso curto; FC muito baixa num composto pesado pode indicar carga leve. Cite a FC só se for relevante para a recomendação.

Responda SEMPRE em português do Brasil. Seja direto, objetivo, sem enrolação. Máximo 4 frases. Fale como o Jayme fala: assertivo, técnico mas acessível.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, exercise, sets_data, target_rir, previous_load, isometric, avg_hr } = body;

    if (!mode || !exercise) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let userMessage = '';

    if (mode === 'tip') {
      if (isometric) {
        userMessage = `Estou prestes a fazer um exercício ISOMÉTRICO: ${exercise.name} (${exercise.muscle_group ?? ''}).
Alvo: ${exercise.sets} séries × ${exercise.reps_min}–${exercise.reps_max} SEGUNDOS de sustentação.
${exercise.notes ? `Notas do plano: ${exercise.notes}` : ''}

Dê UMA dica técnica objetiva (o ponto mais crítico da postura), aponte o erro mais comum, e oriente a progressão POR TEMPO (não por reps).`;
      } else {
        userMessage = `Estou prestes a fazer: ${exercise.name} (${exercise.muscle_group ?? ''}).
Alvo: ${exercise.sets} séries × ${exercise.reps_min}–${exercise.reps_max} reps | RIR alvo: ${target_rir ?? 2}.
${exercise.notes ? `Notas do plano: ${exercise.notes}` : ''}
${previous_load ? `Última carga registrada: ${previous_load} kg` : 'Primeira vez registrando este exercício.'}

Dê UMA dica técnica objetiva de execução (o ponto mais crítico), aponte o erro mais comum, e se tiver carga anterior sugira se mantém ou ajusta.`;
      }

    } else if (mode === 'feedback') {
      if (isometric) {
        const setsInfo = (sets_data ?? []).map((s: { reps_done: number }, i: number) =>
          `Série ${i + 1}: ${s.reps_done}s sustentados`
        ).join('\n');
        userMessage = `Concluí o exercício ISOMÉTRICO ${exercise.name}:
Alvo: ${exercise.reps_min}–${exercise.reps_max} segundos de sustentação
${setsInfo}${avg_hr ? `\nFC atual (relógio): ${avg_hr} bpm` : ''}

Avalie por TEMPO: o tempo está adequado? Devo aumentar a sustentação na próxima? Como progredir (segundos ou carga, se aplicável)?`;
      } else {
        const setsInfo = (sets_data ?? []).map((s: { weight_kg: number; reps_done: number; rir: number }, i: number) =>
          `Série ${i + 1}: ${s.weight_kg}kg × ${s.reps_done} reps (RIR ${s.rir ?? '?'})`
        ).join('\n');

        userMessage = `Concluí o exercício ${exercise.name}:
Alvo: ${exercise.reps_min}–${exercise.reps_max} reps | RIR alvo: ${target_rir ?? 2}
${setsInfo}${avg_hr ? `\nFC atual (relógio): ${avg_hr} bpm` : ''}

Avalie minha performance considerando as REPETIÇÕES QUE EU REALMENTE FIZ acima (compare com o alvo: fiz mais ou menos?). A carga está adequada? Devo ajustar algo? O que muda na próxima sessão?`;
      }

    } else {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 280,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return NextResponse.json({ message: text });
  } catch (err) {
    console.error('workout-coach error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
