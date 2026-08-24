import { createClient } from '@/lib/supabase/server';
import { simulateAllScenarios, type DigitalTwin } from '@/lib/athlete-os/digital-twin';

export const runtime = 'nodejs';
export const maxDuration = 15;

/** GET /api/twin-scenarios — simula cenários "e se…" determinísticos sobre o Digital Twin. */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const now = Date.now();

  const [{ data: bio }, { data: prof }, { data: sess }, { data: cardio }, { data: wm }] = await Promise.all([
    supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, skeletal_muscle_mass_kg, basal_metabolic_rate_kcal').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('profiles').select('weight_kg, main_goal').eq('id', user.id).maybeSingle(),
    supabase.from('workout_sessions').select('total_volume_kg, started_at').eq('user_id', user.id).gte('started_at', new Date(now - 7 * 86400000).toISOString()),
    supabase.from('cardio_sessions').select('distance_km, performed_at, created_at').eq('user_id', user.id).is('deleted_at', null).gte('created_at', new Date(now - 7 * 86400000).toISOString()),
    supabase.from('wearable_metrics').select('training_readiness, body_battery').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weeklyVolume = ((sess ?? []) as any[]).reduce((a, s) => a + (s.total_volume_kg ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weeklyCardioKm = ((cardio ?? []) as any[]).reduce((a, c) => a + (c.distance_km ?? 0), 0);
  const goalIsCut = ['fat_loss', 'definition', 'weight_loss'].includes(prof?.main_goal ?? '');

  const twin: DigitalTwin = {
    weightKg: bio?.weight_kg ?? prof?.weight_kg ?? 75,
    bfPct: bio?.body_fat_pct ?? null,
    leanKg: bio?.skeletal_muscle_mass_kg ?? null,
    weeklyKcalBalance: goalIsCut ? -2800 : 0,     // aprox. -400/dia em cutting; neutro caso contrário
    weeklyCardioKm,
    weeklyVolumeKg: weeklyVolume,
    recoveryScore: wm?.training_readiness ?? wm?.body_battery ?? 70,
    weeklyStrengthSessions: (sess ?? []).length,
  };

  return Response.json({ twin, scenarios: simulateAllScenarios(twin) });
}
