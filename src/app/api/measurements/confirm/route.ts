import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { writeMeasurement } from '@/lib/athlete-data/athlete-measurements-repo';
import { METRIC_CATALOG, type MetricKey } from '@/lib/athlete-data/metric-catalog';

export const runtime = 'nodejs';

/**
 * POST /api/measurements/confirm — resolve um conflito/valor SEM apagar histórico.
 * O usuário escolhe qual valor é o correto; gravamos uma NOVA medição confirmada
 * (verified_by_user=true, measured_at=agora) na tabela unificada, de modo que ela
 * passe a vencer a resolução daqui pra frente. Nenhum registro anterior é apagado.
 * Body: { metric, value, source? }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { metric?: string; value?: number; source?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }); }

  const metric = body.metric as MetricKey | undefined;
  if (!metric || !(metric in METRIC_CATALOG)) return Response.json({ error: 'Métrica desconhecida' }, { status: 400 });
  const value = Number(body.value);
  if (!Number.isFinite(value)) return Response.json({ error: 'Valor inválido' }, { status: 400 });

  const def = METRIC_CATALOG[metric];
  // sanidade: recusa valores fisiologicamente impossíveis mesmo confirmados
  if (def.plausible && (value < def.plausible.min || value > def.plausible.max)) {
    return Response.json({ error: `Valor fora da faixa fisiológica (${def.plausible.min}–${def.plausible.max}${def.unit}).` }, { status: 422 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src = (['manual', 'bioimpedance', 'wearable', 'health_connect', 'evolution', 'nutrition'].includes(String(body.source)) ? body.source : 'manual') as any;
    const r = await writeMeasurement(supabase, user.id, {
      metric, value, source: src, confidence: 'high', measuredAt: new Date().toISOString(), verifiedByUser: true,
      metadata: { confirmedConflict: true },
    });
    if (r?.error) return Response.json({ error: r.error.message }, { status: 500 });
    return Response.json({ ok: true, metric, value });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'erro' }, { status: 500 });
  }
}
