import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluateBlock } from '@/lib/edn/plan-response-evaluation';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/plan-response — job SEMANAL (Vercel Cron).
 * Avalia o bloco de cada atleta com plano ativo e registra a classificação em
 * athlete_decisions (engine plan-response) para retroalimentar a próxima geração.
 *
 * Requer as envs: SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET.
 * O Vercel Cron envia o header `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: 'Service role não configurado (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // atletas com plano ativo
  const { data: plans } = await admin.from('workout_plans').select('user_id').eq('is_active', true);
  const userIds = [...new Set((plans ?? []).map((p: { user_id: string }) => p.user_id))];

  let evaluated = 0;
  const results: { user_id: string; classification: string; score: number }[] = [];
  for (const userId of userIds) {
    try {
      const r = await evaluateBlock(admin, userId);
      // só registra quando há execução suficiente no bloco
      if (r.sessionsCompleted >= 3) {
        await admin.from('athlete_decisions').insert({
          user_id: userId, trigger: 'weekly_cron', engine: 'plan-response', domain: 'training',
          decision: r.classification, applied: true, outcome: r.classification,
          outcome_at: new Date().toISOString(),
          inputs: { strengthDeltaPct: r.strengthDeltaPct, adherenceRate: r.adherenceRate, score: r.score },
        });
        evaluated++;
        results.push({ user_id: userId, classification: r.classification, score: r.score });
      }
    } catch { /* segue para o próximo atleta */ }
  }

  return Response.json({ ok: true, athletes: userIds.length, evaluated, results });
}
