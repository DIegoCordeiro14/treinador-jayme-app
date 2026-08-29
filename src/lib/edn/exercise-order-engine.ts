// exercise-order-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §17 — Exercise Order Engine.
//
// Ordena exercícios por: segurança → prioridade muscular → objetivo → demanda
// técnica → performance → fadiga local → interferência. Decide entre ordem em
// BLOCO (todos do músculo juntos) e INTERCALADA conforme fadiga/objetivo.
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderExercise {
  id: string;
  name: string;
  muscle_group: string;
  is_compound: boolean;
  technicalDemand: number;   // 0..1 (maior = mais técnico, deve vir cedo)
  isPriorityMuscle: boolean;
  fatigueCost: number;       // do session-fatigue-planner
  caution: boolean;          // condição física (deve vir cedo, com atleta fresco)
}

export type OrderMode = 'blocked' | 'interleaved';

export interface OrderResult {
  ordered: OrderExercise[];
  mode: OrderMode;
  reason: string;
}

function priorityKey(e: OrderExercise): number {
  // menor = vem primeiro
  let k = 0;
  if (e.caution) k -= 100;               // segurança primeiro (atleta fresco)
  if (e.isPriorityMuscle) k -= 40;       // prioridade
  if (e.is_compound) k -= 20;            // compostos antes de isolados
  k -= e.technicalDemand * 15;           // técnicos cedo
  k += e.fatigueCost * 0.2;              // muito fatigante tende a ir um pouco depois entre iguais
  return k;
}

export function orderExercises(
  exercises: OrderExercise[],
  opts?: { objective?: string; highFatigue?: boolean }
): OrderResult {
  // modo: sessões de força/alta fadiga => blocked (recuperar entre compostos);
  // hipertrofia com prioridade => interleaved p/ frescor no prioritário
  const anyPriority = exercises.some((e) => e.isPriorityMuscle);
  const mode: OrderMode = opts?.highFatigue || opts?.objective === 'strength'
    ? 'blocked'
    : (anyPriority ? 'interleaved' : 'blocked');

  const ordered = [...exercises].sort((a, b) => priorityKey(a) - priorityKey(b));

  const reason = mode === 'interleaved'
    ? 'Ordem intercalada: mantém frescor no músculo prioritário sem acumular fadiga local.'
    : 'Ordem em bloco: agrupa por músculo, priorizando segurança e compostos no início.';

  return { ordered, mode, reason };
}
