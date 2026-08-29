import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCanonicalBodyState, type BodyFact, type BodySource } from '@/lib/edn/canonical-body-state';
import type { RawBodyPoint } from '@/lib/edn/body-metrics-unifier';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/body-state — Athlete Body Data Hub (fonte ÚNICA de dados corporais).
 * Monta o Canonical Body State das 4 tabelas (bioimpedance_data, body_measurements,
 * body_weight_logs, wearable_metrics + profiles) com proveniência e confiança.
 * Determinístico. Qualquer tela/motor deve ler daqui em vez de consultar as 3 tabelas.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const since = new Date(Date.now() - 120 * 86400000);
    const [{ data: bios }, { data: meas }, { data: wl }, { data: wear }, { data: profile }] = await Promise.all([
      supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, skeletal_muscle_mass_kg, visceral_fat_level, water_pct, basal_metabolic_rate_kcal, measured_at').eq('user_id', user.id).gte('measured_at', since.toISOString().slice(0, 10)).order('measured_at', { ascending: true }),
      supabase.from('body_measurements').select('weight_kg, body_fat_pct, date').eq('user_id', user.id).gte('date', since.toISOString().slice(0, 10)).order('date', { ascending: true }),
      supabase.from('body_weight_logs').select('weight_kg, body_fat_pct, log_date').eq('user_id', user.id).gte('log_date', since.toISOString().slice(0, 10)).order('log_date', { ascending: true }),
      supabase.from('wearable_metrics').select('resting_hr, recorded_at').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('height_cm, age, gender').eq('id', user.id).maybeSingle(),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (bios ?? []) as any[]; const M = (meas ?? []) as any[]; const W = (wl ?? []) as any[];
    const facts: BodyFact[] = [];
    const push = (metric: BodyFact['metric'], value: number | null | undefined, source: BodySource, measuredAtISO: string | null) => {
      if (value != null) facts.push({ metric, value: Number(value), source, measuredAtISO });
    };
    for (const r of B) {
      const at = String(r.measured_at);
      push('weight', r.weight_kg, 'bioimpedance', at); push('bodyFat', r.body_fat_pct, 'bioimpedance', at);
      push('leanMass', r.lean_mass_kg, 'bioimpedance', at); push('muscleMass', r.skeletal_muscle_mass_kg, 'bioimpedance', at);
      push('visceral', r.visceral_fat_level, 'bioimpedance', at); push('water', r.water_pct, 'bioimpedance', at);
      push('bmr', r.basal_metabolic_rate_kcal, 'bioimpedance', at);
    }
    for (const r of M) { push('weight', r.weight_kg, 'measurement', String(r.date)); push('bodyFat', r.body_fat_pct, 'measurement', String(r.date)); }
    for (const r of W) { push('weight', r.weight_kg, 'weight_log', String(r.log_date)); push('bodyFat', r.body_fat_pct, 'weight_log', String(r.log_date)); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wr = wear as any;
    if (wr?.resting_hr != null) push('restingHr', wr.resting_hr, 'wearable', String(wr.recorded_at));

    const weightSeries: RawBodyPoint[] = [
      ...B.map((r) => ({ dateISO: String(r.measured_at), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, source: 'bioimpedance' as const })),
      ...M.map((r) => ({ dateISO: String(r.date), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, source: 'measurement' as const })),
      ...W.map((r) => ({ dateISO: String(r.log_date), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, source: 'weight_log' as const })),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (profile ?? {}) as any;
    const bodyState = getCanonicalBodyState({
      facts, weightSeries,
      profile: { heightCm: p.height_cm ?? null, age: p.age ?? null, gender: p.gender ?? null },
    });

    return Response.json({ bodyState });
  } catch (err) {
    return Response.json({ bodyState: null, error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}
