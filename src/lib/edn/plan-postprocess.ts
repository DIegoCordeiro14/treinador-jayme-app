// plan-postprocess.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §13/§17 aplicados — Pós-processamento determinístico do plano da IA.
//
// A IA organiza a ficha; aqui reordenamos cada dia por regras determinísticas
// (segurança → prioridade → composto → técnica → fadiga), preservando o conjunto
// de exercícios escolhido pela IA. Puro/sem I/O. Reusa exercise-order-engine e
// classifyPattern/session-fatigue.
// ─────────────────────────────────────────────────────────────────────────────

import { orderExercises, type OrderExercise } from './exercise-order-engine';
import { classifyPattern } from './exercise-rotation-engine';
import { exerciseFatigueCost, type Pattern as FatiguePattern } from './session-fatigue-planner';

export interface PlanExerciseMeta {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  is_compound?: boolean;
  difficulty?: string;
}

export interface AiPlanExercise {
  exerciseId: string;
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  restSeconds?: number;
  notes?: string;
  targetRir?: number;
}

const PATTERN_TO_FATIGUE: Record<string, FatiguePattern> = {
  horizontal_push: 'horizontal_push', vertical_push: 'vertical_push',
  horizontal_pull: 'horizontal_pull', vertical_pull: 'vertical_pull',
  squat: 'squat', hinge: 'hinge', lunge: 'lunge', isolation: 'isolation', other: 'isolation',
};

function technicalDemand(meta: PlanExerciseMeta): number {
  const diff = meta.difficulty === 'advanced' ? 0.9 : meta.difficulty === 'intermediate' ? 0.6 : 0.35;
  const compoundBoost = meta.is_compound ? 0.15 : 0;
  return Math.min(1, diff + compoundBoost);
}

export interface ReorderContext {
  metaById: Record<string, PlanExerciseMeta>;
  priorityMuscles: string[];
  cautionIds?: string[];
  objective?: string;
  highFatigue?: boolean;
}

// Reordena UMA sessão preservando exatamente o conjunto de exercícios.
export function reorderDay(exercises: AiPlanExercise[], ctx: ReorderContext): AiPlanExercise[] {
  const priority = new Set(ctx.priorityMuscles);
  const caution = new Set(ctx.cautionIds ?? []);

  const orderInputs: OrderExercise[] = exercises.map((e) => {
    const meta = ctx.metaById[e.exerciseId] ?? { id: e.exerciseId, name: e.exerciseId, muscle_group: 'full_body', equipment: 'machine' };
    const pat = classifyPattern({ id: meta.id, name: meta.name, muscle_group: meta.muscle_group, equipment: meta.equipment, is_compound: meta.is_compound });
    const fatigue = exerciseFatigueCost({
      exerciseId: meta.id, name: meta.name,
      pattern: PATTERN_TO_FATIGUE[pat.pattern] ?? 'isolation',
      is_compound: !!meta.is_compound, sets: e.sets ?? 3, targetRir: e.targetRir ?? 2,
    });
    return {
      id: e.exerciseId, name: meta.name, muscle_group: meta.muscle_group,
      is_compound: !!meta.is_compound, technicalDemand: technicalDemand(meta),
      isPriorityMuscle: priority.has(meta.muscle_group), fatigueCost: fatigue,
      caution: caution.has(e.exerciseId),
    };
  });

  const { ordered } = orderExercises(orderInputs, { objective: ctx.objective, highFatigue: ctx.highFatigue });
  // reordena os objetos originais na nova ordem (por id)
  const byId = new Map(exercises.map((e) => [e.exerciseId, e]));
  const seen = new Set<string>();
  const result: AiPlanExercise[] = [];
  for (const o of ordered) {
    const orig = byId.get(o.id);
    if (orig && !seen.has(o.id)) { result.push(orig); seen.add(o.id); }
  }
  // acrescenta quaisquer não mapeados (segurança)
  for (const e of exercises) if (!seen.has(e.exerciseId)) result.push(e);
  return result;
}

export interface AiPlanDay { dayIndex?: number; focusLabel?: string; exercises: AiPlanExercise[]; }

export function reorderPlan(days: AiPlanDay[], ctx: ReorderContext): AiPlanDay[] {
  return days.map((d) => ({ ...d, exercises: reorderDay(d.exercises ?? [], ctx) }));
}
