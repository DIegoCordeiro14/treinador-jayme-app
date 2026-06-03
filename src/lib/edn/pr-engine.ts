/**
 * PR Engine — EDN V3
 * Detecta recordes pessoais em tempo real durante a sessão de treino.
 */
import { createClient } from '@/lib/supabase/client';

export type PRType = 'load' | 'reps' | 'volume' | 'estimated_1rm';

export interface PRResult {
  type: PRType;
  exercise_id: string;
  exercise_name: string;
  previous_value: number;
  new_value: number;
  improvement_pct: number;
  xp_reward: number;
}

/** Fórmula Epley para 1RM estimado */
export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Busca PRs atuais do usuário para um exercício */
export async function getCurrentPRs(exerciseId: string): Promise<{
  max_load: number; max_reps: number; max_volume: number; max_1rm: number;
}> {
  const supabase = createClient();
  const { data } = await supabase
    .from('personal_records')
    .select('pr_type, value')
    .eq('exercise_id', exerciseId);

  const prMap: Record<string, number> = {};
  (data ?? []).forEach(r => { prMap[r.pr_type] = r.value; });
  return {
    max_load:   prMap['load']          ?? 0,
    max_reps:   prMap['reps']          ?? 0,
    max_volume: prMap['volume']        ?? 0,
    max_1rm:    prMap['estimated_1rm'] ?? 0,
  };
}

/** Verifica se a série bate PR e atualiza no banco */
export async function checkAndSavePR(params: {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  sessionVolume: number;
}): Promise<PRResult[]> {
  const { exerciseId, exerciseName, weightKg, reps, sessionVolume } = params;
  const supabase = createClient();
  const current = await getCurrentPRs(exerciseId);
  const new1rm  = epley1RM(weightKg, reps);
  const prs: PRResult[] = [];

  const checks: { type: PRType; prev: number; next: number; xp: number }[] = [
    { type: 'load',          prev: current.max_load,   next: weightKg,     xp: 50 },
    { type: 'reps',          prev: current.max_reps,   next: reps,         xp: 30 },
    { type: 'volume',        prev: current.max_volume, next: sessionVolume, xp: 40 },
    { type: 'estimated_1rm', prev: current.max_1rm,    next: new1rm,       xp: 60 },
  ];

  for (const check of checks) {
    if (check.next > check.prev && check.prev >= 0) {
      prs.push({
        type: check.type,
        exercise_id: exerciseId,
        exercise_name: exerciseName,
        previous_value: check.prev,
        new_value: check.next,
        improvement_pct: check.prev > 0
          ? Math.round(((check.next - check.prev) / check.prev) * 100)
          : 100,
        xp_reward: check.xp,
      });

      // Salvar no banco
      await supabase.from('personal_records').upsert({
        exercise_id: exerciseId,
        pr_type: check.type,
        value: check.next,
        achieved_at: new Date().toISOString(),
      }, { onConflict: 'exercise_id,pr_type' });
    }
  }
  return prs;
}

export function prTypeLabel(type: PRType): string {
  const labels: Record<PRType, string> = {
    load: 'Maior Carga',
    reps: 'Maior Reps',
    volume: 'Maior Volume',
    estimated_1rm: '1RM Estimado',
  };
  return labels[type];
}
