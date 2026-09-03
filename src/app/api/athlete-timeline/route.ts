import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildTimeline, detectInterference, type TimelineInputs } from '@/lib/athlete-data';

export const runtime = 'nodejs';

/**
 * GET /api/athlete-timeline?days=60 — READ ONLY (§22/§26).
 * Timeline multi-domínio unificada + avisos de interferência (§27). Cada query é
 * best-effort: uma tabela ausente/errada não derruba a resposta.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const days = Math.min(180, Math.max(7, Number(new URL(req.url).searchParams.get('days') ?? 60)));
  const sinceISO = new Date(Date.now() - days * 86400000).toISOString();
  const sinceDate = sinceISO.slice(0, 10);
  const uid = user.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (fn: () => any) => Promise.resolve(fn()).then((r: any) => r?.data ?? []).catch(() => []);

  const [sessions, cardios, weights, bios, prs, deloads, plans, conditions, discomforts] = await Promise.all([
    q(() => supabase.from('workout_sessions').select('started_at, name, total_volume_kg').eq('user_id', uid).gte('started_at', sinceISO)),
    q(() => supabase.from('cardio_sessions').select('performed_at, created_at, distance_km, sport').eq('user_id', uid).gte('created_at', sinceISO)),
    q(() => supabase.from('body_weight_logs').select('weight_kg, log_date').eq('user_id', uid).gte('log_date', sinceDate)),
    q(() => supabase.from('bioimpedance_data').select('measured_at').eq('user_id', uid).gte('measured_at', sinceISO)),
    q(() => supabase.from('personal_records').select('achieved_at, created_at, exercise_name').eq('user_id', uid).gte('created_at', sinceISO)),
    q(() => supabase.from('deloads').select('created_at').eq('user_id', uid).gte('created_at', sinceISO)),
    q(() => supabase.from('workout_plan_versions').select('created_at').eq('user_id', uid).gte('created_at', sinceISO)),
    q(() => supabase.from('physical_conditions').select('created_at, region').eq('user_id', uid).gte('created_at', sinceISO)),
    q(() => supabase.from('workout_discomfort_logs').select('created_at, region').eq('user_id', uid).gte('created_at', sinceISO)),
  ]);

  // Data no fuso do atleta (app é focado no Brasil) — evita off-by-one em
  // relação ao calendário, que agrupa por dia local.
  const dOf = (v: string | null | undefined) => {
    if (!v) return '';
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) return String(v).slice(0, 10);
    try { return t.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
    catch { return String(v).slice(0, 10); }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputs: TimelineInputs = {
    workouts: (sessions as any[]).map((w) => ({ date: dOf(w.started_at), label: w.name ?? 'Treino', heavy: (w.total_volume_kg ?? 0) > 8000 })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cardios: (cardios as any[]).map((c) => ({ date: dOf(c.performed_at ?? c.created_at), label: c.sport ?? 'Cardio', km: c.distance_km ?? null, long: (c.distance_km ?? 0) >= 12 })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    weights: (weights as any[]).map((w) => ({ date: dOf(w.log_date), kg: w.weight_kg ?? null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bioimpedances: (bios as any[]).map((b) => ({ date: dOf(b.measured_at) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prs: (prs as any[]).map((p) => ({ date: dOf(p.achieved_at ?? p.created_at), label: p.exercise_name ? `PR: ${p.exercise_name}` : 'Novo PR' })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deloads: (deloads as any[]).map((d) => ({ date: dOf(d.created_at) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    planChanges: (plans as any[]).map((p) => ({ date: dOf(p.created_at) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions: (conditions as any[]).map((c) => ({ date: dOf(c.created_at), label: c.region ? `Condição: ${c.region}` : 'Condição física' })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    discomforts: (discomforts as any[]).map((d) => ({ date: dOf(d.created_at), region: d.region ?? undefined })),
  };
  const events = buildTimeline(inputs).filter((e) => e.date);
  const interference = detectInterference(events);
  return Response.json({ events, interference, days });
}
