import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { collectAllMetrics } from '@/lib/athlete-data/athlete-metrics-collector';
import { resolveMetrics } from '@/lib/athlete-data/data-resolution-engine';
import { buildCurrentAthleteSnapshot } from '@/lib/athlete-data/current-athlete-snapshot';
import { computeDataQuality } from '@/lib/athlete-data/data-quality-engine';

export const runtime = 'nodejs';

/**
 * GET /api/current-snapshot — READ ONLY. O CurrentAthleteSnapshot canônico:
 * cada campo com valor + fonte + timestamp + confiança + freshness, mais
 * confiança global, conflitos e dados velhos/ausentes. Fonte única para
 * motores e IA (nenhuma aba precisa reconciliar dados por conta própria).
 */
export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const nowISO = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await supabase.from('profiles').select('name, gender, age, experience_level, main_goal, goal').eq('id', user.id).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = prof ?? {};
    const measurements = await collectAllMetrics(supabase, user.id, nowISO);
    // adiciona peso/altura/idade do perfil como fallback de baixa prioridade
    if (p.weight_kg != null) measurements.push({ metric: 'weight', value: p.weight_kg, source: 'profile', measuredAt: null });
    const metrics = resolveMetrics(measurements, new Date(nowISO).getTime());
    const snapshot = buildCurrentAthleteSnapshot({
      metrics,
      identity: { name: p.name ?? null, sex: p.gender ?? null, age: p.age ?? null, experience: p.experience_level ?? null },
      goalKey: p.main_goal ?? p.goal ?? null,
      nowISO,
    });
    const quality = computeDataQuality(metrics);
    return Response.json({ snapshot, quality });
  } catch (err) {
    return Response.json({ snapshot: null, error: err instanceof Error ? err.message : 'erro' }, { status: 200 });
  }
}
