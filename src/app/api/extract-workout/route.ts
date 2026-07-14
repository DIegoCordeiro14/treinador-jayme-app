import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 45;

/**
 * POST /api/extract-workout — importa uma ficha de treino (imagem/PDF/texto).
 * A IA (Vision) extrai a estrutura (dias/exercícios/séries/reps) e gera um
 * diagnóstico. Os exercícios extraídos são casados com a biblioteca (exercises)
 * por nome para virar exerciseId real — o que permite aplicar via create_workout_plan.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image, mediaType, text } = await req.json() as { image?: string; mediaType?: string; text?: string };
    if (!image && !text) return Response.json({ error: 'Envie uma imagem/PDF ou o texto da ficha.' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });
    const client = new Anthropic({ apiKey });

    const instruction = `Esta é a ficha de treino atual do atleta. Extraia a estrutura e gere um diagnóstico técnico (metodologia natural).
Retorne APENAS JSON válido, sem markdown:
{"days":[{"name":"string (ex.: Treino A - Peito/Tríceps)","exercises":[{"name":"nome do exercício","sets":number,"repsMin":number,"repsMax":number}]}],
"diagnosis":{"positives":["pontos fortes"],"problems":["problemas detectados"],"suggestions":["melhorias recomendadas"]}}`;

    const content: any[] = [];
    if (image) {
      content.push(mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
        : { type: 'image', source: { type: 'base64', media_type: (mediaType ?? 'image/jpeg'), data: image } });
    }
    content.push({ type: 'text', text: image ? instruction : `${instruction}\n\nFICHA (texto):\n${text}` });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return Response.json({ error: 'Não consegui ler a ficha. Tente uma foto mais nítida.' }, { status: 422 });
    let parsed: any;
    try { parsed = JSON.parse(m[0]); } catch { return Response.json({ error: 'Falha ao interpretar a ficha.' }, { status: 422 }); }

    // ── Casa nomes extraídos com a biblioteca real (exerciseId) ──────────────
    const { data: lib } = await supabase.from('exercises').select('id, name, muscle_group');
    const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
    const libList = (lib ?? []).map((e: any) => ({ id: e.id, name: e.name, n: norm(e.name) }));
    const match = (name: string): string | null => {
      const n = norm(name);
      let best: { id: string; score: number } | null = null;
      for (const e of libList) {
        let score = 0;
        if (e.n === n) score = 100;
        else if (e.n.includes(n) || n.includes(e.n)) score = 70;
        else { const w = n.split(' ').filter(Boolean); score = w.filter(x => e.n.includes(x)).length * 20; }
        if (score > 0 && (!best || score > best.score)) best = { id: e.id, score };
      }
      return best && best.score >= 40 ? best.id : null;
    };

    let matched = 0, total = 0;
    for (const d of (parsed.days ?? [])) {
      for (const ex of (d.exercises ?? [])) {
        total++;
        ex.exerciseId = match(ex.name);
        if (ex.exerciseId) matched++;
      }
    }

    // Bloco 8: sinaliza reps fora de faixa saudável (o Coach pede confirmação antes de aplicar)
    let repsFlags = 0;
    for (const d of (parsed.days ?? [])) for (const ex of (d.exercises ?? [])) {
      const rmin = Number(ex.repsMin) || 0, rmax = Number(ex.repsMax) || 0;
      if (rmax > 20 || (rmin > 0 && rmin < 1)) { ex.repsOutOfRange = true; repsFlags++; }
    }
    return Response.json({ plan: parsed, matchStats: { matched, total }, repsFlags });
  } catch (err: any) {
    console.error('[extract-workout] error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
