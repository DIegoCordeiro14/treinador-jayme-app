import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildEvolutionState } from '@/lib/edn/evolution-intelligence-engine';
import { halvesDelta } from '@/lib/edn/body-metrics-unifier';
import type { RawBodyPoint } from '@/lib/edn/body-metrics-unifier';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/evolution-intelligence — Evolution Intelligence Engine (Fase 1).
 * Monta o EvolutionState único (o que mudou? é real? é progresso p/ o objetivo?
 * o que limita?). 100% determinístico. Aditivo: não substitui progress-intelligence.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    const since90 = new Date(now - 90 * 86400000);
    const iso = since90.toISOString();
    const date90 = iso.slice(0, 10);

    const [{ data: profile }, { data: bios }, { data: meas }, { data: wl }, { data: sess }, { data: sets }, { data: food }] =
      await Promise.all([
        supabase.from('profiles').select('main_goal, weekly_frequency, sleep_hours, sleep_quality, stress_level').eq('id', user.id).maybeSingle(),
        supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, lean_mass_kg, skeletal_muscle_mass_kg, measured_at').eq('user_id', user.id).gte('measured_at', date90).order('measured_at', { ascending: true }),
        supabase.from('body_measurements').select('weight_kg, body_fat_pct, waist_cm, date').eq('user_id', user.id).gte('date', date90).order('date', { ascending: true }),
        supabase.from('body_weight_logs').select('weight_kg, body_fat_pct, log_date').eq('user_id', user.id).gte('log_date', date90).order('log_date', { ascending: true }),
        supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', user.id).gte('started_at', iso).order('started_at', { ascending: true }),
        supabase.from('session_sets').select('weight_kg, completed, session:workout_sessions!inner(started_at, user_id)').eq('session.user_id', user.id).gte('session.started_at', iso),
        supabase.from('food_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', new Date(now - 14 * 86400000).toISOString()),
      ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (bios ?? []) as any[]; const M = (meas ?? []) as any[]; const W = (wl ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const S = (sess ?? []) as any[]; const SS = (sets ?? []) as any[]; const F = (food ?? []) as any[];

    // ── Série corporal unificável (RawBodyPoint[]) ──
    const bodyPoints: RawBodyPoint[] = [
      ...B.map((r) => ({ dateISO: String(r.measured_at), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, leanKg: r.lean_mass_kg ?? null, muscleKg: r.skeletal_muscle_mass_kg ?? null, source: 'bioimpedance' as const })),
      ...M.map((r) => ({ dateISO: String(r.date), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, waistCm: r.waist_cm ?? null, source: 'measurement' as const })),
      ...W.map((r) => ({ dateISO: String(r.log_date), weightKg: r.weight_kg ?? null, bodyFatPct: r.body_fat_pct ?? null, source: 'weight_log' as const })),
    ];

    // ── Volume: delta por metades das sessões (%) ──
    const volVals = S.map((r) => r.total_volume_kg ?? 0);
    const volDeltaAbs = halvesDelta(volVals);
    const volBase = volVals.length ? volVals.slice(0, Math.max(1, Math.floor(volVals.length / 2))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(volVals.length / 2)) : 0;
    const volumeDeltaPct = volDeltaAbs != null && volBase > 0 ? Math.round((volDeltaAbs / volBase) * 100) : null;

    // ── Força: top-set por sessão, delta por metades (%) ──
    const topBySession = new Map<string, number>();
    for (const s of SS) {
      if (s.completed === false) continue;
      const day = s.session?.started_at?.slice(0, 10);
      const w = s.weight_kg ?? 0;
      if (!day || w <= 0) continue;
      topBySession.set(day, Math.max(topBySession.get(day) ?? 0, w));
    }
    const topVals = [...topBySession.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    const strDeltaAbs = halvesDelta(topVals);
    const strBase = topVals.length ? topVals.slice(0, Math.max(1, Math.floor(topVals.length / 2))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(topVals.length / 2)) : 0;
    const strengthDeltaPct = strDeltaAbs != null && strBase > 0 ? Math.round((strDeltaAbs / strBase) * 1000) / 10 : null;

    // ── Consistência ──
    const spanDays = bodyPoints.length >= 2
      ? Math.max(7, Math.round((new Date(bodyPoints[bodyPoints.length - 1]?.dateISO ?? Date.now()).getTime() - new Date(bodyPoints[0]?.dateISO ?? Date.now()).getTime()) / 86400000))
      : 28;
    const weeklyFreq = Number((profile as { weekly_frequency?: number } | null)?.weekly_frequency ?? 0);
    const sessionsPlanned = weeklyFreq > 0 ? Math.round(weeklyFreq * (Math.min(spanDays, 90) / 7)) : 0;

    // ── Recuperação (proxy determinístico de sono + estresse) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (profile ?? {}) as any;
    let recoveryScore: number | null = null;
    let recoveryLabel: string | null = null;
    if (p.sleep_hours != null || p.stress_level != null || p.sleep_quality != null) {
      let r = 60;
      if (p.sleep_hours != null) { if (p.sleep_hours >= 7) r += 20; else if (p.sleep_hours < 6) r -= 20; }
      if (p.sleep_quality) { if (/bo[am]|good|otim/i.test(String(p.sleep_quality))) r += 10; else if (/ruim|poor|mau/i.test(String(p.sleep_quality))) r -= 10; }
      if (p.stress_level) { if (/alto|high/i.test(String(p.stress_level))) r -= 15; else if (/baixo|low/i.test(String(p.stress_level))) r += 10; }
      recoveryScore = Math.max(0, Math.min(100, r));
      recoveryLabel = recoveryScore >= 70 ? 'boa' : recoveryScore >= 45 ? 'moderada' : 'baixa';
    }

    const daysLogged = new Set(F.map((r) => String(r.logged_at).slice(0, 10))).size;

    const state = buildEvolutionState({
      goalRaw: (profile as { main_goal?: string | null } | null)?.main_goal ?? null,
      bodyPoints,
      strengthDeltaPct,
      volumeDeltaPct,
      sessionsDone: S.length,
      sessionsPlanned,
      recoveryScore,
      recoveryLabel,
      daysLogged,
      logWindowDays: 14,
    });

    return Response.json({ state });
  } catch (err) {
    return Response.json({ state: null, error: err instanceof Error ? err.message : 'Erro interno' }, { status: 200 });
  }
}
