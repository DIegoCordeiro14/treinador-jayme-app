import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * /api/wearable-sync — V6.5 Pilar 1 (Integração Universal de Wearables)
 *
 * Dois modos de autenticação:
 *  1. Sessão logada (cookie) — uso interno do app.
 *  2. TOKEN PESSOAL (`sync_token` no body ou header `x-sync-token`) — para
 *     Atalhos do iPhone (Apple Health), Tasker/MacroDroid (Health Connect)
 *     e futuras integrações cloud. Vai pela RPC ingest_wearable_metrics
 *     (SECURITY DEFINER), sem precisar de sessão.
 *
 * Campos aceitos: hrv_ms, hrv_baseline_ms, resting_hr, sleep_hours,
 * sleep_score, body_battery, training_readiness, recovery_time_hours,
 * vo2max, stress_score, steps, calories_kcal, distance_km, source,
 * recorded_at (YYYY-MM-DD).
 */

const NUMERIC_FIELDS = [
  'hrv_ms', 'hrv_baseline_ms', 'resting_hr', 'sleep_hours', 'sleep_score',
  'body_battery', 'training_readiness', 'recovery_time_hours', 'vo2max',
  'stress_score', 'steps', 'calories_kcal', 'distance_km',
] as const;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));

  // ── Modo token (Atalhos / Tasker / integrações externas) ──────────────────
  const token = body.sync_token ?? req.headers.get('x-sync-token');
  if (token) {
    const payload: Record<string, unknown> = {
      source: body.source ?? 'manual',
      recorded_at: body.recorded_at ?? null,
    };
    for (const f of NUMERIC_FIELDS) {
      const v = body[f];
      if (v !== undefined && v !== null && v !== '') {
        const n = Number(v);
        if (!Number.isNaN(n)) payload[f] = n;
      }
    }
    const { data, error } = await supabase.rpc('ingest_wearable_metrics', {
      p_token: token,
      p: payload,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if ((data as any)?.error === 'invalid_token') return Response.json({ error: 'Token inválido' }, { status: 401 });
    if ((data as any)?.error) return Response.json({ error: (data as any).error }, { status: 400 });
    return Response.json(data);
  }

  // ── Modo sessão (uso interno do app) ──────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const source: string = body.source ?? 'manual';
  const recordedAt: string = body.recorded_at ?? new Date().toISOString().slice(0, 10);

  const row: Record<string, unknown> = {
    user_id: user.id,
    recorded_at: recordedAt,
    source,
    raw: body.raw ?? null,
  };
  let hasData = false;
  for (const f of NUMERIC_FIELDS) {
    const v = body[f];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) { row[f] = n; hasData = true; }
    }
  }
  if (!hasData) return Response.json({ error: 'Nenhuma métrica válida enviada' }, { status: 400 });

  const { data, error } = await supabase
    .from('wearable_metrics')
    .upsert(row, { onConflict: 'user_id,recorded_at,source' })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, metric: data });
}

export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Devolve também o token pessoal para configurar Atalhos/Tasker
  const [{ data: metric }, { data: prof }] = await Promise.all([
    supabase
      .from('wearable_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('wearable_sync_token')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  return Response.json({
    metric: metric ?? null,
    sync_token: (prof as any)?.wearable_sync_token ?? null,
    endpoint: 'POST /api/wearable-sync com {"sync_token":"...", "source":"apple_health", "hrv_ms":68, "sleep_hours":7.3, "resting_hr":54}',
  });
}
