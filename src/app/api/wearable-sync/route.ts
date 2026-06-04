import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * /api/wearable-sync — V6.5 Pilar 1 (Integração Universal de Wearables)
 *
 * POST: recebe métricas do dia (manual hoje; Apple Health / Health Connect /
 *       Garmin / Polar / Fitbit no futuro — mesma estrutura) e faz upsert.
 * GET:  retorna a métrica mais recente (usada pelo Recovery Engine).
 *
 * Campos aceitos: hrv_ms, hrv_baseline_ms, resting_hr, sleep_hours,
 * sleep_score, body_battery, training_readiness, recovery_time_hours,
 * vo2max, stress_score, steps, calories_kcal, distance_km, raw.
 */

const NUMERIC_FIELDS = [
  'hrv_ms', 'hrv_baseline_ms', 'resting_hr', 'sleep_hours', 'sleep_score',
  'body_battery', 'training_readiness', 'recovery_time_hours', 'vo2max',
  'stress_score', 'steps', 'calories_kcal', 'distance_km',
] as const;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
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

  const { data } = await supabase
    .from('wearable_metrics')
    .select('*')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return Response.json({ metric: data ?? null });
}
