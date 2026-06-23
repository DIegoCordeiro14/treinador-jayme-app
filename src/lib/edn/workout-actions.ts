/**
 * EDN Workout Actions — V6.6
 * Executa, de verdade, as modificações de treino que o Coach EDN confirma no chat.
 *
 * O agente Treinador emite uma diretiva machine-readable no fim da resposta
 * (ver agents.ts / ai-coach/route.ts). Este módulo aplica essas ações no banco,
 * SEMPRE validando que o plano/dia pertence ao usuário autenticado.
 *
 * Tipos de ação:
 *  - substitute_exercise : troca um exercício de um dia por outro da biblioteca
 *  - add_exercise        : adiciona um exercício a um dia
 *  - remove_exercise     : remove um exercício de um dia
 *  - reschedule_workouts : reprograma o calendário (schedule_config) do plano ativo
 */
import { invalidateAthleteContext } from '@/lib/edn/athlete-context';

export type WorkoutActionType =
  | 'substitute_exercise'
  | 'add_exercise'
  | 'remove_exercise'
  | 'set_day_exercises'
  | 'reschedule_workouts'
  | 'set_goal';

export interface WorkoutAction {
  type: WorkoutActionType;
  planId?: string;
  dayId?: string;
  /** exercício atual (a ser trocado/removido) */
  exerciseId?: string;
  /** novo exercício (substituição/adição) */
  newExerciseId?: string;
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  restSeconds?: number;
  /** montar um dia inteiro: lista completa de exercícios */
  exercises?: Array<{ exerciseId: string; sets?: number; repsMin?: number; repsMax?: number; restSeconds?: number }>;
  /** reprogramação de calendário */
  pattern?: number[];                       // dias da semana 1=Seg ... 7=Dom
  dayAssignments?: Record<string, string>;  // weekday -> rótulo (ex: "legs/abs")
  /** mudança de objetivo/fase nutricional (ajuste recomendado pelos sinais) */
  goal?: string;                            // fat_loss | definition | hypertrophy | mass_gain | recomposition | performance | maintenance
  /** motivo registrado no histórico de decisões da IA */
  reason?: string;
}

export interface WorkoutActionResult {
  ok: boolean;
  message: string;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Confirma que o dia pertence a um plano do usuário; retorna plan_id ou null. */
async function ownsDay(supabase: any, userId: string, dayId: string): Promise<string | null> {
  const { data } = await supabase
    .from('workout_days')
    .select('id, plan_id, workout_plans!inner(user_id)')
    .eq('id', dayId)
    .maybeSingle();
  if (!data) return null;
  const ownerId = (data as any).workout_plans?.user_id;
  return ownerId === userId ? (data as any).plan_id : null;
}

/** Confirma que o plano pertence ao usuário. */
async function ownsPlan(supabase: any, userId: string, planId: string): Promise<boolean> {
  const { data } = await supabase
    .from('workout_plans')
    .select('id, user_id')
    .eq('id', planId)
    .maybeSingle();
  return !!data && (data as any).user_id === userId;
}

/** Confirma que o exercício existe na biblioteca; retorna o nome ou null. */
async function exerciseName(supabase: any, exerciseId: string): Promise<string | null> {
  const { data } = await supabase.from('exercises').select('id, name').eq('id', exerciseId).maybeSingle();
  return data ? (data as any).name : null;
}

async function applyOne(supabase: any, userId: string, a: WorkoutAction): Promise<WorkoutActionResult> {
  switch (a.type) {
    // ── Substituir exercício ────────────────────────────────────────────────
    case 'substitute_exercise': {
      if (!a.dayId || !a.exerciseId || !a.newExerciseId)
        return { ok: false, message: 'Substituição: faltam dayId, exerciseId ou newExerciseId.' };
      if (!(await ownsDay(supabase, userId, a.dayId)))
        return { ok: false, message: 'Substituição: dia não encontrado ou não pertence a você.' };
      const newName = await exerciseName(supabase, a.newExerciseId);
      if (!newName) return { ok: false, message: 'Substituição: exercício novo não existe na biblioteca.' };

      const { data: row } = await supabase
        .from('workout_exercises')
        .select('id, sets, reps_min, reps_max, rest_seconds')
        .eq('workout_day_id', a.dayId)
        .eq('exercise_id', a.exerciseId)
        .maybeSingle();
      if (!row) return { ok: false, message: 'Substituição: exercício atual não encontrado nesse dia.' };

      const patch: Record<string, unknown> = { exercise_id: a.newExerciseId };
      if (a.sets != null) patch.sets = clampInt(a.sets, 1, 10, (row as any).sets);
      if (a.repsMin != null) patch.reps_min = clampInt(a.repsMin, 1, 50, (row as any).reps_min);
      if (a.repsMax != null) patch.reps_max = clampInt(a.repsMax, 1, 50, (row as any).reps_max);
      if (a.restSeconds != null) patch.rest_seconds = clampInt(a.restSeconds, 10, 600, (row as any).rest_seconds);

      const { error } = await supabase.from('workout_exercises').update(patch).eq('id', (row as any).id);
      if (error) return { ok: false, message: `Substituição falhou: ${error.message}` };
      return { ok: true, message: `Exercício substituído por **${newName}** no plano.` };
    }

    // ── Adicionar exercício ─────────────────────────────────────────────────
    case 'add_exercise': {
      if (!a.dayId || !a.newExerciseId)
        return { ok: false, message: 'Adição: faltam dayId ou newExerciseId.' };
      if (!(await ownsDay(supabase, userId, a.dayId)))
        return { ok: false, message: 'Adição: dia não encontrado ou não pertence a você.' };
      const newName = await exerciseName(supabase, a.newExerciseId);
      if (!newName) return { ok: false, message: 'Adição: exercício não existe na biblioteca.' };

      const { data: last } = await supabase
        .from('workout_exercises')
        .select('order_index')
        .eq('workout_day_id', a.dayId)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = last ? ((last as any).order_index ?? 0) + 1 : 0;

      const { error } = await supabase.from('workout_exercises').insert({
        workout_day_id: a.dayId,
        exercise_id: a.newExerciseId,
        sets: clampInt(a.sets, 1, 10, 3),
        reps_min: clampInt(a.repsMin, 1, 50, 8),
        reps_max: clampInt(a.repsMax, 1, 50, 12),
        rest_seconds: clampInt(a.restSeconds, 10, 600, 90),
        order_index: nextOrder,
      });
      if (error) return { ok: false, message: `Adição falhou: ${error.message}` };
      return { ok: true, message: `**${newName}** adicionado ao treino.` };
    }

    // ── Montar o dia inteiro (importar treino do Coach para o plano) ─────────
    case 'set_day_exercises': {
      if (!a.dayId || !Array.isArray(a.exercises) || a.exercises.length === 0)
        return { ok: false, message: 'Montagem: faltam dayId ou a lista de exercícios.' };
      if (!(await ownsDay(supabase, userId, a.dayId)))
        return { ok: false, message: 'Montagem: dia não encontrado ou não pertence a você.' };
      // valida quais IDs existem na biblioteca
      const ids = a.exercises.map(e => e.exerciseId).filter(Boolean);
      const { data: valid } = await supabase.from('exercises').select('id').in('id', ids);
      const validSet = new Set((valid ?? []).map((r: any) => r.id));
      const rows = a.exercises
        .filter(e => validSet.has(e.exerciseId))
        .map((e, i) => ({
          workout_day_id: a.dayId,
          exercise_id: e.exerciseId,
          sets: clampInt(e.sets, 1, 10, 3),
          reps_min: clampInt(e.repsMin, 1, 50, 8),
          reps_max: clampInt(e.repsMax, 1, 50, 12),
          rest_seconds: clampInt(e.restSeconds, 10, 600, 90),
          order_index: i,
        }));
      if (rows.length === 0) return { ok: false, message: 'Montagem: nenhum exercício válido (IDs não conferem com a biblioteca).' };
      // substitui o dia inteiro pelos exercícios montados
      await supabase.from('workout_exercises').delete().eq('workout_day_id', a.dayId).then(() => {}, () => {});
      const { error } = await supabase.from('workout_exercises').insert(rows);
      if (error) return { ok: false, message: `Montagem falhou: ${error.message}` };
      return { ok: true, message: `Treino montado no plano: ${rows.length} exercício(s).` };
    }

    // ── Remover exercício ───────────────────────────────────────────────────
    case 'remove_exercise': {
      if (!a.dayId || !a.exerciseId)
        return { ok: false, message: 'Remoção: faltam dayId ou exerciseId.' };
      if (!(await ownsDay(supabase, userId, a.dayId)))
        return { ok: false, message: 'Remoção: dia não encontrado ou não pertence a você.' };
      const { data: row } = await supabase
        .from('workout_exercises')
        .select('id')
        .eq('workout_day_id', a.dayId)
        .eq('exercise_id', a.exerciseId)
        .maybeSingle();
      if (!row) return { ok: false, message: 'Remoção: exercício não encontrado nesse dia.' };
      const { error } = await supabase.from('workout_exercises').delete().eq('id', (row as any).id);
      if (error) return { ok: false, message: `Remoção falhou: ${error.message}` };
      return { ok: true, message: 'Exercício removido do treino.' };
    }

    // ── Reprogramar calendário ──────────────────────────────────────────────
    case 'reschedule_workouts': {
      let planId = a.planId ?? null;
      if (planId) {
        if (!(await ownsPlan(supabase, userId, planId)))
          return { ok: false, message: 'Reprogramação: plano não pertence a você.' };
      } else {
        const { data: active } = await supabase
          .from('workout_plans')
          .select('id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle();
        planId = active ? (active as any).id : null;
      }
      if (!planId) return { ok: false, message: 'Reprogramação: nenhum plano ativo encontrado.' };

      const { data: plan } = await supabase
        .from('workout_plans')
        .select('schedule_config')
        .eq('id', planId)
        .maybeSingle();
      const current = ((plan as any)?.schedule_config as Record<string, unknown>) ?? {};

      const pattern = Array.isArray(a.pattern)
        ? a.pattern.map((d) => clampInt(d, 1, 7, 1)).filter((v, i, arr) => arr.indexOf(v) === i).sort((x, y) => x - y)
        : (current as any).pattern;
      if (!pattern || pattern.length === 0)
        return { ok: false, message: 'Reprogramação: padrão de dias inválido.' };

      const next = {
        ...current,
        pattern,
        day_assignments: a.dayAssignments ?? (current as any).day_assignments ?? {},
      };
      const { error } = await supabase.from('workout_plans').update({ schedule_config: next }).eq('id', planId);
      if (error) return { ok: false, message: `Reprogramação falhou: ${error.message}` };
      const dias = (pattern as number[]).map((d: number) => ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][d]).join(', ');
      return { ok: true, message: `Calendário reprogramado: treinos em ${dias}.` };
    }

    // ── Mudar objetivo/fase nutricional (recalcula macros automaticamente) ────
    case 'set_goal': {
      const allowed = ['fat_loss', 'definition', 'hypertrophy', 'mass_gain', 'recomposition', 'performance', 'maintenance'];
      const goal = (a.goal ?? '').toLowerCase();
      if (!allowed.includes(goal))
        return { ok: false, message: `Objetivo inválido. Use um de: ${allowed.join(', ')}.` };
      const label: Record<string, string> = {
        fat_loss: 'Emagrecimento (Cutting)', definition: 'Definição', hypertrophy: 'Hipertrofia',
        mass_gain: 'Ganho de massa (Lean Bulk)', recomposition: 'Recomposição', performance: 'Performance', maintenance: 'Manutenção',
      };
      // objetivo anterior (para o histórico de decisões)
      const { data: prev } = await supabase.from('profiles').select('main_goal').eq('id', userId).maybeSingle();
      const fromGoal = (prev as any)?.main_goal ?? null;
      const { error } = await supabase.from('profiles').update({ main_goal: goal }).eq('id', userId);
      if (error) return { ok: false, message: `Não foi possível mudar o objetivo: ${error.message}` };
      // Histórico de decisões da IA (Módulo 8 — não-fatal se a tabela faltar)
      try {
        await supabase.from('nutrition_decisions').insert({
          user_id: userId, source: 'coach_ia',
          reason: a.reason ?? null,
          change_applied: `Objetivo: ${fromGoal ?? '—'} → ${goal}`,
          from_goal: fromGoal, to_goal: goal,
        });
      } catch { /* tabela pode não existir ainda */ }
      return { ok: true, message: `Objetivo atualizado para ${label[goal]} — macros e calorias recalculados automaticamente.` };
    }

    default:
      return { ok: false, message: `Ação desconhecida: ${(a as any).type}` };
  }
}

/** Aplica uma lista de ações em sequência e devolve os resultados. */
export async function applyWorkoutActions(
  supabase: any,
  userId: string,
  actions: WorkoutAction[]
): Promise<WorkoutActionResult[]> {
  const results: WorkoutActionResult[] = [];
  for (const a of actions) {
    try {
      results.push(await applyOne(supabase, userId, a));
    } catch (err: any) {
      results.push({ ok: false, message: err?.message ?? 'Erro ao aplicar ação.' });
    }
  }
  if (results.some((r) => r.ok)) invalidateAthleteContext(userId);
  return results;
}

// ── Parser da diretiva embutida na resposta da IA ──────────────────────────────
export const EDN_ACTION_MARKER = '@@EDN_ACTIONS@@';

/**
 * Extrai a diretiva `@@EDN_ACTIONS@@ {json}` do texto da IA.
 * Retorna o texto limpo (sem a diretiva) e as ações detectadas.
 */
export function parseWorkoutDirective(text: string): { clean: string; actions: WorkoutAction[] } {
  const idx = text.indexOf(EDN_ACTION_MARKER);
  if (idx === -1) return { clean: text, actions: [] };
  const clean = text.slice(0, idx).trimEnd();
  const rest = text.slice(idx + EDN_ACTION_MARKER.length).trim();
  const jsonMatch = rest.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { clean, actions: [] };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const actions = Array.isArray(parsed?.actions) ? (parsed.actions as WorkoutAction[]) : [];
    return { clean, actions };
  } catch {
    return { clean, actions: [] };
  }
}

/** Maior sufixo de `text` que é prefixo do marcador — usado para segurar o stream. */
export function partialMarkerHold(text: string, marker = EDN_ACTION_MARKER): number {
  const max = Math.min(marker.length - 1, text.length);
  for (let n = max; n > 0; n--) {
    if (marker.startsWith(text.slice(text.length - n))) return n;
  }
  return 0;
}
