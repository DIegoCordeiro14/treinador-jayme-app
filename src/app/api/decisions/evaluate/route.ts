import { createClient } from '@/lib/supabase/server';
import { recordOutcome, evaluateOutcome } from '@/lib/edn/decision-log';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/decisions/evaluate — preenche automaticamente o resultado das decisões
 * aplicadas há 14+ dias e ainda sem outcome, usando a tendência de força posterior.
 * Determinístico: o motor mede; a IA não. Chamado na abertura do app (best-effort).
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const now = Date.now();
  const cutoff = new Date(now - 14 * 86400000).toISOString();

  const { data: pend } = await supabase.from('athlete_decisions')
    .select('id, created_at').eq('user_id', user.id).eq('applied', true).is('outcome', null)
    .lte('created_at', cutoff).order('created_at', { ascending: true }).limit(20);
  const pending = pend ?? [];
  if (!pending.length) return Response.json({ evaluated: 0 });

  let evaluated = 0;
  for (const d of pending as { id: string; created_at: string }[]) {
    // tendência de força DEPOIS da decisão: compara volume médio das 2 semanas
    // seguintes vs 2 anteriores à data da decisão.
    const t0 = new Date(d.created_at).getTime();
    const { data: sess } = await supabase.from('workout_sessions')
      .select('total_volume_kg, started_at').eq('user_id', user.id)
      .gte('started_at', new Date(t0 - 14 * 86400000).toISOString())
      .lte('started_at', new Date(t0 + 21 * 86400000).toISOString());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (sess ?? []) as any[];
    const before = rows.filter(r => new Date(r.started_at).getTime() < t0);
    const after = rows.filter(r => new Date(r.started_at).getTime() >= t0);
    const avg = (a: any[]) => a.length ? a.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0) / a.length : 0;
    const b = avg(before), af = avg(after);
    const trendPct = b > 0 && after.length ? Math.round(((af - b) / b) * 1000) / 10 : null;
    await recordOutcome(supabase, user.id, d.id, evaluateOutcome(trendPct));
    evaluated++;
  }
  return Response.json({ evaluated });
}
