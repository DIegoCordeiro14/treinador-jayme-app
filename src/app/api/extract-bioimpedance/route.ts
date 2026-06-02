import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image, mediaType } = await req.json() as { image: string; mediaType: string };
    if (!image) return Response.json({ error: 'No image provided' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });
    const isPdf = mediaType === 'application/pdf';

    const contentBlock = isPdf
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } } as any)
      : ({ type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: image } } as any);

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Extraia os dados de bioimpedância desta imagem. Retorne APENAS um JSON com estas chaves (null se não encontrar):
{"body_score":number|null,"body_type":string|null,"weight_kg":number|null,"bmi":number|null,"body_fat_pct":number|null,"water_pct":number|null,"basal_metabolic_rate_kcal":number|null,"visceral_fat_level":number|null,"bone_mass_kg":number|null,"protein_pct":number|null,"skeletal_muscle_mass_kg":number|null,"lean_mass_kg":number|null,"fat_mass_kg":number|null,"source":string|null}
Apenas JSON, sem markdown.`,
          },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'Dados não encontrados na imagem' }, { status: 422 });

    return Response.json({ data: JSON.parse(jsonMatch[0]) });
  } catch (err: any) {
    console.error('[extract-bioimpedance] error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
