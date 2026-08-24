import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 45;

/**
 * POST /api/nutrition/analyze-meal — Nutrition Vision/Input AI.
 * Identifica alimentos a partir de FOTO ou TEXTO/VOZ (transcrita) e estima porções.
 * NÃO retorna calorias/macros e NÃO diagnostica — só candidatos + confiança.
 * O cálculo é feito depois, deterministicamente, em /log-meal.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image, mediaType, text } = await req.json() as { image?: string; mediaType?: string; text?: string };
    if (!image && !text) return Response.json({ error: 'Envie uma foto ou uma descrição.' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });
    const client = new Anthropic({ apiKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [];
    if (image) {
      const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const mt = supported.includes(mediaType ?? '') ? (mediaType as string) : 'image/jpeg';
      blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: image } });
    }

    const instruction = `Você está identificando alimentos ${image ? 'em uma FOTO de refeição' : 'em uma DESCRIÇÃO de refeição'}.
${text ? `Descrição do usuário: """${text}"""\n` : ''}
REGRAS OBRIGATÓRIAS:
- Não invente alimentos que não sejam plausíveis.
- NÃO forneça calorias. NÃO forneça macros. NÃO faça diagnóstico nutricional.
- Não trate estimativas como medições exatas.
- Quando não tiver segurança na identificação, use confidence baixa.
- Quando a quantidade não puder ser determinada, retorne estimated_quantity=null.
- Nunca transforme incerteza em precisão falsa.
- Para pratos compostos que não dá para decompor (pizza, lasanha, hambúrguer), retorne o prato como um único item.
- Nomes em português do Brasil, minúsculos.
Retorne APENAS JSON, sem markdown:
{
 "description": "descrição curta do prato em 1 frase (ex.: arroz branco, salada e frango grelhado)",
 "items": [
   { "candidate_name": "arroz branco", "estimated_quantity": 150, "unit": "g", "preparation": "cozido|grelhado|frito|assado|null", "confidence": 0.0 }
 ],
 "notes": "observações/incertezas (ex.: não é possível determinar o azeite)"
}`;
    blocks.push({ type: 'text', text: instruction });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 700,
      messages: [{ role: 'user', content: blocks }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'Não foi possível interpretar a refeição.' }, { status: 422 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return Response.json({
      items: items.map((i: Record<string, unknown>) => ({
        candidate_name: i.candidate_name ?? null,
        estimated_quantity: typeof i.estimated_quantity === 'number' ? i.estimated_quantity : null,
        unit: i.unit ?? 'g',
        preparation: i.preparation ?? null,
        confidence: typeof i.confidence === 'number' ? i.confidence : null,
      })),
      description: parsed.description ?? '',
      notes: parsed.notes ?? '',
      disclaimer: 'Identificação automática — estimativas, não medições. Confirme os itens; os valores nutricionais são calculados pelo sistema após a confirmação.',
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erro ao analisar refeição' }, { status: 500 });
  }
}
