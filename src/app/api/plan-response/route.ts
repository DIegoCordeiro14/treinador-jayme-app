import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evaluateBlock } from '@/lib/edn/plan-response-evaluation';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/plan-response — avalia o BLOCO do plano ativo e classifica a resposta
 * (HIGHLY_EFFECTIVE..EXCESSIVE_FATIGUE). Determinístico. Registra a classificação
 * em athlete_decisions (engine plan-response) para retroalimentar a próxima geração.
 * GET = avaliar (dry-run); POST = avaliar + persistir a decisão.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await evaluateBlock(supabase, user.id);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await evaluateBlock(supabase, user.id);
    // registra a classificação do bloco para retroalimentar a próxima geração
    try {
      await supabase.from('athlete_decisions').insert({
        user_id: user.id, trigger: 'block_end', engine: 'plan-response', domain: 'training',
        decision: result.classification, applied: true, outcome: result.classification,
        outcome_at: new Date().toISOString(),
        inputs: { strengthDeltaPct: result.strengthDeltaPct, adherenceRate: result.adherenceRate, score: result.score },
      });
    } catch { /* não bloqueia */ }
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}
