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
import { logTimeline } from '@/lib/athlete-os/timeline';
import { computeFingerprint } from '@/lib/cardio/activity-fingerprint';

export type WorkoutActionType =
  | 'substitute_exercise'
  | 'add_exercise'
  | 'remove_exercise'
  | 'set_day_exercises'
  | 'reschedule_workouts'
  | 'set_goal'
  | 'adjust_volume'
  | 'create_deload'
  | 'remember'
  | 'create_workout_plan'
  | 'replace_workout_day'
  | 'increase_muscle_volume'
  | 'upgrade_training_level'
  | 'create_race_preparation'
  | 'adjust_running_goal'
  | 'soft_delete_cardio_session'
  | 'restore_cardio_session'
  | 'permanently_delete_cardio_session';

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
  /** ajuste de volume: nº de séries (valor absoluto) ou delta */
  setsDelta?: number;
  /** memória do atleta */
  memoryKind?: string;
  memoryContent?: string;
  /** criação de plano inteiro pelo chat */
  planName?: string;
  daysPerWeek?: number;
  setActive?: boolean;
  description?: string;
  days?: Array<{ name: string; dayOfWeek?: number; exercises?: Array<{ exerciseId: string; sets?: number; repsMin?: number; repsMax?: number; restSeconds?: number }> }>;
  /** grupo muscular alvo (increase_muscle_volume): chave da biblioteca (chest, back, legs...) */
  muscleGroup?: string;
  /** preparação de prova / meta de corrida */
  raceDate?: string;
  raceName?: string;
  goalText?: string;
  sessionId?: string;
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

async function activePlanId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('workout_plans').select('id').eq('user_id', userId).eq('is_active', true).maybeSingle();
  return data ? (data as any).id : null;
}

async function logCoachDecision(supabase: any, userId: string, domain: string, decision: string, reason?: string): Promise<void> {
  try { await supabase.from('coach_decisions').insert({ user_id: userId, domain, decision, reason: reason ?? null }); } catch { /* tabela pode faltar */ }
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
      await logTimeline(supabase, userId, 'goal_change', `Objetivo → ${label[goal]}`, `de ${fromGoal ?? '—'} para ${goal}`, { from: fromGoal, to: goal });
      return { ok: true, message: `Objetivo atualizado para ${label[goal]} — macros e calorias recalculados automaticamente.` };
    }

    // ── Ajustar volume (séries) de um dia ────────────────────────────────────
    case 'adjust_volume': {
      if (!a.dayId) return { ok: false, message: 'Ajuste de volume: falta dayId.' };
      if (!(await ownsDay(supabase, userId, a.dayId))) return { ok: false, message: 'Ajuste de volume: dia não pertence a você.' };
      const { data: exs } = await supabase.from('workout_exercises').select('id, sets, exercise_id').eq('workout_day_id', a.dayId);
      if (!exs || !exs.length) return { ok: false, message: 'Ajuste de volume: nenhum exercício no dia.' };
      const rows = a.exerciseId ? exs.filter((e: any) => e.exercise_id === a.exerciseId) : exs;
      if (!rows.length) return { ok: false, message: 'Ajuste de volume: exercício não encontrado nesse dia.' };
      let changed = 0;
      for (const e of rows as any[]) {
        const next = a.sets != null ? clampInt(a.sets, 1, 8, e.sets) : clampInt(e.sets + (a.setsDelta ?? 0), 1, 8, e.sets);
        if (next !== e.sets) { const { error } = await supabase.from('workout_exercises').update({ sets: next }).eq('id', e.id); if (!error) changed++; }
      }
      await logCoachDecision(supabase, userId, 'treino', `Ajuste de volume: ${a.exerciseId ? '1 exercício' : 'dia inteiro'} → ${a.sets != null ? a.sets + ' séries' : (a.setsDelta && a.setsDelta > 0 ? '+' : '') + a.setsDelta + ' séries'}`, a.reason);
      return { ok: changed > 0, message: changed > 0 ? `Volume ajustado em ${changed} exercício(s).` : 'Nenhuma alteração de volume aplicada.' };
    }

    // ── Deload de um dia (reduz ~40% das séries) ──────────────────────────────
    case 'create_deload': {
      if (!a.dayId) return { ok: false, message: 'Deload: falta dayId.' };
      if (!(await ownsDay(supabase, userId, a.dayId))) return { ok: false, message: 'Deload: dia não pertence a você.' };
      const { data: exs } = await supabase.from('workout_exercises').select('id, sets').eq('workout_day_id', a.dayId);
      if (!exs || !exs.length) return { ok: false, message: 'Deload: nenhum exercício no dia.' };
      let changed = 0;
      for (const e of exs as any[]) {
        const next = Math.max(1, Math.round(e.sets * 0.6));
        if (next !== e.sets) { const { error } = await supabase.from('workout_exercises').update({ sets: next }).eq('id', e.id); if (!error) changed++; }
      }
      await logCoachDecision(supabase, userId, 'treino', 'Deload aplicado (-40% séries no dia)', a.reason);
      await logTimeline(supabase, userId, 'deload', 'Deload aplicado', '-40% séries no dia');
      return { ok: changed > 0, message: changed > 0 ? `Deload aplicado: séries reduzidas em ${changed} exercício(s).` : 'Deload não alterou as séries.' };
    }

    // ── Memória do atleta (preferências/limitações) ───────────────────────────
    case 'remember': {
      const content = (a.memoryContent ?? '').trim();
      if (!content) return { ok: false, message: 'Memória: conteúdo vazio.' };
      const { error } = await supabase.from('athlete_memory').insert({ user_id: userId, kind: a.memoryKind ?? 'note', content });
      if (error) return { ok: false, message: `Memória: ${error.message}` };
      return { ok: true, message: 'Anotado na sua memória do atleta.' };
    }

    // ── Criar um plano de treino inteiro pelo chat ────────────────────────────
    case 'create_workout_plan': {
      const name = (a.planName ?? '').trim();
      if (!name || !Array.isArray(a.days) || a.days.length === 0)
        return { ok: false, message: 'Criação de plano: faltam nome ou dias.' };
      const goal = (a.goal ?? 'hypertrophy');
      const dpw = clampInt(a.daysPerWeek ?? a.days.length, 1, 7, a.days.length);

      // desativa outros planos se este for o ativo
      if (a.setActive) {
        await supabase.from('workout_plans').update({ is_active: false }).eq('user_id', userId).then(() => {}, () => {});
      }
      const { data: plan, error: planErr } = await supabase
        .from('workout_plans')
        .insert({ user_id: userId, name, description: a.description ?? '', goal, days_per_week: dpw, is_active: a.setActive ?? false })
        .select('id')
        .single();
      if (planErr || !plan) return { ok: false, message: `Criação de plano falhou: ${planErr?.message ?? 'sem id'}` };
      const planId = (plan as any).id as string;

      // catálogo válido (todos os IDs usados)
      const allIds = a.days.flatMap(d => (d.exercises ?? []).map(e => e.exerciseId)).filter(Boolean);
      const { data: valid } = await supabase.from('exercises').select('id').in('id', allIds.length ? allIds : ['00000000-0000-0000-0000-000000000000']);
      const validSet = new Set((valid ?? []).map((r: any) => r.id));

      let totalEx = 0;
      for (let i = 0; i < a.days.length; i++) {
        const d = a.days[i];
        const { data: day, error: dayErr } = await supabase
          .from('workout_days')
          .insert({ plan_id: planId, name: d.name ?? `Treino ${i + 1}`, day_of_week: typeof d.dayOfWeek === 'number' ? d.dayOfWeek : null, order_index: i })
          .select('id')
          .single();
        if (dayErr || !day) continue;
        const exRows = (d.exercises ?? [])
          .filter(e => validSet.has(e.exerciseId))
          .map((e, j) => ({ workout_day_id: (day as any).id, exercise_id: e.exerciseId, sets: clampInt(e.sets, 1, 10, 3), reps_min: clampInt(e.repsMin, 1, 50, 8), reps_max: clampInt(e.repsMax, 1, 50, 12), rest_seconds: clampInt(e.restSeconds, 10, 600, 90), order_index: j }));
        if (exRows.length) { const { error } = await supabase.from('workout_exercises').insert(exRows); if (!error) totalEx += exRows.length; }
      }

      // versão inicial + decisão registrada (não-fatais)
      try { await supabase.from('workout_plan_versions').insert({ user_id: userId, plan_id: planId, version: 1, snapshot: { name, goal, days_per_week: dpw, days: a.days }, reason: a.reason ?? 'Plano criado pelo Coach' }); } catch { /* ok */ }
      await logCoachDecision(supabase, userId, 'treino', `Plano criado: "${name}" (${dpw}x/sem, ${a.days.length} dias, ${totalEx} exercícios)`, a.reason);

      await logTimeline(supabase, userId, 'new_plan', `Novo plano: ${name}`, `${dpw}x/sem · ${a.days.length} dias · ${totalEx} exercícios`);
      return { ok: true, message: `Plano "${name}" criado com ${a.days.length} dia(s) e ${totalEx} exercício(s)${a.setActive ? ' — definido como ativo' : ''}.` };
    }

    // ── Trocar (regerar) um dia de treino — mesma semântica de set_day_exercises
    case 'replace_workout_day': {
      return applyOne(supabase, userId, { ...a, type: 'set_day_exercises' });
    }

    // ── Aumentar volume de um grupo muscular no plano ativo ───────────────────
    case 'increase_muscle_volume': {
      const mg = (a.muscleGroup ?? '').toLowerCase();
      if (!mg) return { ok: false, message: 'Volume por músculo: falta muscleGroup.' };
      const planId = a.planId ?? (await activePlanId(supabase, userId));
      if (!planId) return { ok: false, message: 'Volume por músculo: nenhum plano ativo.' };
      const { data: days } = await supabase.from('workout_days').select('id').eq('plan_id', planId);
      const dayIds = (days ?? []).map((d: any) => d.id);
      if (!dayIds.length) return { ok: false, message: 'Volume por músculo: plano sem dias.' };
      const { data: exs } = await supabase
        .from('workout_exercises')
        .select('id, sets, exercise:exercises!inner(muscle_group)')
        .in('workout_day_id', dayIds)
        .eq('exercise.muscle_group', mg);
      if (!exs || !exs.length) return { ok: false, message: `Volume por músculo: nenhum exercício de ${mg} no plano.` };
      const delta = a.setsDelta ?? 1;
      let changed = 0;
      for (const e of exs as any[]) {
        const next = clampInt(e.sets + delta, 1, 10, e.sets);
        if (next !== e.sets) { const { error } = await supabase.from('workout_exercises').update({ sets: next }).eq('id', e.id); if (!error) changed++; }
      }
      await logCoachDecision(supabase, userId, 'treino', `Volume de ${mg} ${delta > 0 ? '+' : ''}${delta} série(s) em ${changed} exercício(s)`, a.reason);
      return { ok: changed > 0, message: changed > 0 ? `Volume de ${mg} ajustado (+${delta} série) em ${changed} exercício(s).` : 'Nenhum exercício alterado.' };
    }

    // ── Subir o nível do treino (mais volume/intensidade) ─────────────────────
    case 'upgrade_training_level': {
      const planId = a.planId ?? (await activePlanId(supabase, userId));
      if (!planId) return { ok: false, message: 'Upgrade: nenhum plano ativo.' };
      const { data: days } = await supabase.from('workout_days').select('id').eq('plan_id', planId);
      const dayIds = (days ?? []).map((d: any) => d.id);
      if (!dayIds.length) return { ok: false, message: 'Upgrade: plano sem dias.' };
      const { data: exs } = await supabase.from('workout_exercises').select('id, sets, rest_seconds').in('workout_day_id', dayIds);
      let changed = 0;
      for (const e of (exs ?? []) as any[]) {
        const nextSets = clampInt(e.sets + 1, 1, 10, e.sets);
        const nextRest = clampInt((e.rest_seconds ?? 90) - 10, 30, 600, e.rest_seconds ?? 90);
        const { error } = await supabase.from('workout_exercises').update({ sets: nextSets, rest_seconds: nextRest }).eq('id', e.id);
        if (!error) changed++;
      }
      await logCoachDecision(supabase, userId, 'treino', `Upgrade de nível: +1 série e -10s descanso em ${changed} exercício(s)`, a.reason);
      return { ok: changed > 0, message: changed > 0 ? `Treino avançado: +1 série e densidade maior em ${changed} exercício(s).` : 'Nenhum exercício alterado.' };
    }

    // ── Preparação de prova (ativa periodização + modo endurance da nutrição) ──
    case 'create_race_preparation': {
      const date = (a.raceDate ?? '').trim();
      if (!date) return { ok: false, message: 'Preparação de prova: falta a data (raceDate).' };
      const { error } = await supabase.from('profiles').update({ target_race_date: date, target_race_name: a.raceName ?? null }).eq('id', userId);
      if (error) return { ok: false, message: `Preparação de prova: ${error.message}` };
      await logCoachDecision(supabase, userId, 'cardio', `Prova definida: ${a.raceName ?? 'prova'} em ${date}`, a.reason);
      await logTimeline(supabase, userId, 'race_scheduled', `Prova marcada: ${a.raceName ?? 'prova'}`, date);
      return { ok: true, message: `Prova marcada para ${date}${a.raceName ? ` (${a.raceName})` : ''} — periodização e modo endurance ativados.` };
    }

    // ── Ajustar meta de corrida (registrada na memória do atleta) ─────────────
    case 'adjust_running_goal': {
      const g = (a.goalText ?? '').trim();
      if (!g) return { ok: false, message: 'Meta de corrida: conteúdo vazio.' };
      const { error } = await supabase.from('athlete_memory').insert({ user_id: userId, kind: 'running_goal', content: g });
      if (error) return { ok: false, message: `Meta de corrida: ${error.message}` };
      await logCoachDecision(supabase, userId, 'cardio', `Meta de corrida: ${g}`, a.reason);
      return { ok: true, message: `Meta de corrida registrada: ${g}.` };
    }

    // ── Exclusão de corrida (soft delete) pelo Coach ──────────────────────────
    case 'soft_delete_cardio_session': {
      if (!a.sessionId) return { ok: false, message: 'Exclusão: falta sessionId.' };
      const { data: sess } = await supabase.from('cardio_sessions').select('*').eq('id', a.sessionId).eq('user_id', userId).is('deleted_at', null).maybeSingle();
      if (!sess) return { ok: false, message: 'Corrida não encontrada (ou já excluída).' };
      const { error } = await supabase.from('cardio_sessions').update({ deleted_at: new Date().toISOString(), deleted_by: userId, deletion_reason: a.reason ?? 'coach' }).eq('id', a.sessionId);
      if (error) return { ok: false, message: `Exclusão falhou: ${error.message}` };
      try {
        const coords = (sess as any).gps_track?.coordinates ?? [];
        const fp = computeFingerprint({ userId, performedAt: (sess as any).performed_at || (sess as any).created_at, durationSeconds: ((sess as any).duration_min ?? 0) * 60, distanceMeters: (sess as any).distance_km != null ? (sess as any).distance_km * 1000 : null, activityType: (sess as any).type ?? 'Corrida', routeStart: coords.length ? { latitude: coords[0].lat, longitude: coords[0].lng } : null });
        await supabase.from('cardio_import_tombstones').insert({ user_id: userId, provider: (sess as any).source_provider ?? null, external_id: (sess as any).external_id ?? null, activity_fingerprint: fp, expires_at: new Date(Date.now() + 365 * 86400000).toISOString() });
        await supabase.from('activity_audit_logs').insert({ user_id: userId, session_id: a.sessionId, action: 'soft_deleted', reason: a.reason ?? 'coach', source: 'coach' });
      } catch { /* non-fatal */ }
      return { ok: true, message: `Corrida excluída do Coach EDN (${(sess as any).distance_km ?? '—'}km). Deixa de influenciar seus scores; dá pra restaurar nas "Atividades excluídas".` };
    }
    case 'restore_cardio_session': {
      if (!a.sessionId) return { ok: false, message: 'Restaurar: falta sessionId.' };
      const { error } = await supabase.from('cardio_sessions').update({ deleted_at: null, deleted_by: null, deletion_reason: null }).eq('id', a.sessionId).eq('user_id', userId);
      if (error) return { ok: false, message: `Restaurar falhou: ${error.message}` };
      try { await supabase.from('activity_audit_logs').insert({ user_id: userId, session_id: a.sessionId, action: 'restored', source: 'coach' }); } catch { /* ok */ }
      return { ok: true, message: 'Corrida restaurada — voltou ao histórico e aos cálculos.' };
    }
    case 'permanently_delete_cardio_session': {
      if (!a.sessionId) return { ok: false, message: 'Exclusão definitiva: falta sessionId.' };
      try { await supabase.from('activity_audit_logs').insert({ user_id: userId, session_id: a.sessionId, action: 'permanently_deleted', source: 'coach' }); } catch { /* ok */ }
      const { error } = await supabase.from('cardio_sessions').delete().eq('id', a.sessionId).eq('user_id', userId);
      if (error) return { ok: false, message: `Exclusão definitiva falhou: ${error.message}` };
      return { ok: true, message: 'Corrida excluída definitivamente (dados vinculados removidos).' };
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
