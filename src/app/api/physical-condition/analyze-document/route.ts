import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { normalizeRegion, normalizeSide } from '@/lib/edn/condition-mapping';

export const runtime = 'nodejs';
export const maxDuration = 45;

/**
 * POST /api/physical-condition/analyze-document
 * Interpreta (não diagnostica) um documento médico/laudo/imagem e retorna um
 * resumo ESTRUTURADO para o usuário revisar e confirmar. NÃO salva nada.
 * Regra de segurança: sem laudo textual, a IA é conservadora e nunca afirma lesão.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image, mediaType, text: rawText } = await req.json() as { image?: string; mediaType?: string; text?: string };
    if (!image && !rawText) return Response.json({ error: 'Envie uma imagem/PDF ou o texto do documento.' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });
    const client = new Anthropic({ apiKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [];
    if (image) {
      const isPdf = mediaType === 'application/pdf';
      blocks.push(isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
        : { type: 'image', source: { type: 'base64', media_type: (mediaType ?? 'image/jpeg'), data: image } });
    }
    const instruction = `Você é um assistente que INTERPRETA documentos físicos/médicos para adaptar TREINO — você NÃO é médico e NÃO diagnostica.
${rawText ? `Texto fornecido pelo usuário:\n"""${rawText}"""\n` : ''}
Regras OBRIGATÓRIAS:
- NUNCA afirme que existe uma lesão/fratura/ruptura. Use "mencionado no documento" ou "não foi possível determinar".
- Para imagens SEM laudo textual (ex.: raio-X puro), seja conservador: document_type="imagem_sem_laudo" e diga que não é possível determinar restrições apenas pela imagem.
- Só extraia o que estiver EXPLÍCITO.
Retorne APENAS JSON, sem markdown:
{
 "document_type": "laudo|ressonancia|tomografia|raio_x|ultrassom|relatorio_fisio|alta|imagem_sem_laudo|outro|null",
 "body_region_raw": "texto da região como aparece|null",
 "side_raw": "direito|esquerdo|bilateral|null",
 "procedure_or_condition": "procedimento/condição MENCIONADA (sem afirmar diagnóstico)|null",
 "occurred_or_surgery_date": "YYYY-MM-DD|null",
 "explicit_restrictions": ["movimentos/atividades a evitar EXPLICITAMENTE citados"],
 "explicit_allowances": ["movimentos liberados EXPLICITAMENTE citados"],
 "training_recommendations": ["recomendações de treino/reabilitação escritas"],
 "undetermined": ["informações que não foi possível determinar"],
 "confidence": 0.0,
 "summary": "resumo neutro do que foi encontrado (sem diagnosticar)",
 "requires_professional_review": true
}`;
    blocks.push({ type: 'text', text: instruction });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: blocks }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'Não foi possível interpretar o documento.' }, { status: 422 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(jsonMatch[0]);

    // Normalização determinística (região/lado) — a IA sugere, o motor normaliza
    const bodyRegion = normalizeRegion(parsed.body_region_raw);
    const side = normalizeSide(parsed.side_raw);

    return Response.json({
      // resumo estruturado para o usuário CONFIRMAR (nada é salvo aqui)
      extracted: {
        documentType: parsed.document_type ?? null,
        bodyRegion, side,
        procedureOrCondition: parsed.procedure_or_condition ?? null,
        date: parsed.occurred_or_surgery_date ?? null,
        restrictedMovements: Array.isArray(parsed.explicit_restrictions) ? parsed.explicit_restrictions : [],
        allowedMovements: Array.isArray(parsed.explicit_allowances) ? parsed.explicit_allowances : [],
        trainingRecommendations: Array.isArray(parsed.training_recommendations) ? parsed.training_recommendations : [],
        undetermined: Array.isArray(parsed.undetermined) ? parsed.undetermined : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
        summary: parsed.summary ?? '',
        requiresProfessionalReview: parsed.requires_professional_review !== false,
      },
      raw_text: text,
      disclaimer: 'Interpretação automática — não é diagnóstico médico. Confirme as informações e, em caso de dúvida, consulte um profissional.',
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erro ao analisar documento' }, { status: 500 });
  }
}
