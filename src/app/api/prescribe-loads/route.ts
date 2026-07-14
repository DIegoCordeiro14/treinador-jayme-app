import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prescribeLoads, roundToAvailableLoad, type SetPerf, type RecoveryCategory } from '@/lib/edn/load-intelligence';
import { buildSetProfiles, profileFor, type SetHistoryRecord } from '@/lib/edn/set-progression-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/prescribe-loads?dayId=... — cargas sugeridas por exercício do dia,
 * calculadas do histórico real (top set por sessão). Determinístico.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const dayId = req.nextUrl.searchParams.get('dayId');
  if (!dayId) return Response.json({ error: 'dayId obrigatório' }, { status: 400 });

  // valida posse do dia
  const { data: day } = await supabase
    .from('workout_days')
    .select('id, plan:workout_plans!inner(user_id), workout_exercises(id, exercise_id, sets, reps_min, reps_max, exercise:exercises(name, muscle_group))')
    .eq('id', dayId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!day || (day as any).plan?.user_id !== user.id) return Response.json({ error: 'Dia não encontrado' }, { status: 404 });

  // recuperação simples via wearable
  const { data: wm } = await supabase.from('wearable_metrics').select('hrv_ms, hrv_baseline_ms').eq('user_id', user.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  let recoveryCategory: RecoveryCategory = 'good';
  if (wm && (wm as any).hrv_ms && (wm as any).hrv_baseline_ms) {
    const drop = (((wm as any).hrv_ms - (wm as any).hrv_baseline_ms) / (wm as any).hrv_baseline_ms) * 100;
    if (drop <= -20) recoveryCategory = 'critical'; else if (drop <= -10) recoveryCategory = 'low';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exercises: any[] = (day as any).workout_exercises ?? [];
  const compoundMuscles = ['legs', 'back', 'chest'];
  const out: Record<string, unknown> = {};

  for (const ex of exercises) {
    const exId = ex.exercise_id;
    // últimas ~40 séries completas desse exercício
    const { data: sets } = await supabase
      .from('session_sets')
      .select('weight_kg, reps_done, rir, set_type, set_number, completed, session:workout_sessions!inner(started_at, user_id)')
      .eq('exercise_id', exId)
      .eq('session.user_id', user.id)
      .order('id', { ascending: false })
      .limit(60);

    // top set por sessão = maior peso (ou set_type='top')
    const bySession: Record<string, SetPerf> = {};
    for (const s of (sets ?? []) as any[]) {
      if (s.completed === false || !s.weight_kg) continue;
      const key = s.session?.started_at ?? '';
      const cur = bySession[key];
      const cand: SetPerf = { weightKg: s.weight_kg, reps: s.reps_done ?? 0, rir: s.rir ?? null, dateMs: new Date(key || Date.now()).getTime() };
      if (!cur || cand.weightKg > cur.weightKg || s.set_type === 'top') bySession[key] = cand;
    }
    const history = Object.values(bySession).sort((a, b) => (a.dateMs ?? 0) - (b.dateMs ?? 0)).slice(-10);

    const presc = prescribeLoads({
      history,
      repsMin: ex.reps_min ?? 8, repsMax: ex.reps_max ?? 12,
      isCompound: compoundMuscles.includes(ex.exercise?.muscle_group),
      workingSetsCount: Math.max(1, (ex.sets ?? 3) - 1),
      recoveryCategory,
    });
    // Histórico por POSIÇÃO de série (working) — cada working usa a resposta real da sua posição
    const typeMap: Record<string, any> = { aquecimento: 'aquecimento', warmup: 'aquecimento', feeder: 'feeder', top: 'top', top_set: 'top', working: 'working', backoff: 'backoff', corrective: 'corrective' };
    const records: SetHistoryRecord[] = ((sets ?? []) as any[]).filter(x => x.weight_kg != null).map(x => ({
      performedAt: x.session?.started_at ?? '', setType: (typeMap[x.set_type] ?? 'working'),
      setPosition: 0, weightKg: x.weight_kg, reps: x.reps_done ?? null, rir: x.rir ?? null, completed: x.completed !== false,
    }));
    const profiles = buildSetProfiles(records);
    if (presc) {
      let wpos = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const st of (presc.sets as any[])) {
        if (st.kind === 'working') {
          wpos++;
          const prof = profileFor(profiles, 'working', wpos);
          if (prof && prof.latestWeightKg != null) {
            // usa a carga real dessa posição, com micro-progressão se a tendência é de alta
            const bump = prof.recentTrend === 'up' ? 1 : 0;
            st.weightKg = roundToAvailableLoad(prof.latestWeightKg + bump * (prof.latestWeightKg >= 40 ? 2.5 : 1));
            st.confidence = prof.confidence;
            st.reason = `Working ${wpos}: baseado no seu histórico dessa posição (${prof.totalOccurrences} sessões, tendência ${prof.recentTrend}).`;
          } else {
            st.reason = (st.reason ?? '') + ' (sem histórico da posição — derivado do Top Set).';
          }
        }
      }
    }
    out[ex.id] = presc ? { exerciseName: ex.exercise?.name ?? '', ...presc } : { exerciseName: ex.exercise?.name ?? '', noHistory: true };
  }

  return Response.json({ recoveryCategory, prescriptions: out });
}
