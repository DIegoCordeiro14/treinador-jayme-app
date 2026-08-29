// session-fatigue-planner.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §13 — Session Fatigue Planner.
//
// Estima o custo de fadiga determinístico de uma sessão e evita empilhar vários
// compostos pesados sistêmicos no mesmo dia (agacho + terra + leg press + RDL).
// Distribui a fadiga pela semana. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type Pattern = 'squat' | 'hinge' | 'horizontal_push' | 'vertical_push' | 'horizontal_pull' | 'vertical_pull' | 'lunge' | 'isolation';

export interface PlannedSet {
  exerciseId: string;
  name: string;
  pattern: Pattern;
  is_compound: boolean;
  sets: number;
  targetRir: number;         // menor = mais fatigante
}

// custo sistêmico base por padrão (compostos axiais pesam mais)
const SYSTEMIC_COST: Record<Pattern, number> = {
  squat: 3.0, hinge: 3.2, lunge: 2.0,
  horizontal_push: 1.6, vertical_push: 1.6, horizontal_pull: 1.5, vertical_pull: 1.4,
  isolation: 0.5,
};

export interface SessionFatigue {
  totalCost: number;
  heavySystemicCount: number;   // compostos axiais pesados (squat/hinge) com RIR baixo
  overloaded: boolean;
  note: string;
}

export function exerciseFatigueCost(e: PlannedSet): number {
  const base = SYSTEMIC_COST[e.pattern] ?? 1;
  const rirFactor = 1 + Math.max(0, (3 - e.targetRir)) * 0.15; // RIR baixo => +fadiga
  const compoundFactor = e.is_compound ? 1 : 0.7;
  return Math.round(base * e.sets * rirFactor * compoundFactor * 10) / 10;
}

export function computeSessionFatigue(exercises: PlannedSet[], maxCost = 45): SessionFatigue {
  const totalCost = Math.round(exercises.reduce((a, e) => a + exerciseFatigueCost(e), 0) * 10) / 10;
  const heavySystemicCount = exercises.filter((e) => (e.pattern === 'squat' || e.pattern === 'hinge') && e.is_compound && e.targetRir <= 2).length;
  const overloaded = totalCost > maxCost || heavySystemicCount >= 3;
  let note = 'Fadiga da sessão dentro do limite.';
  if (heavySystemicCount >= 3) note = 'Muitos compostos axiais pesados na mesma sessão — redistribuir pela semana.';
  else if (totalCost > maxCost) note = 'Custo de fadiga alto para uma sessão — reduzir volume ou intensidade.';
  return { totalCost, heavySystemicCount, overloaded, note };
}

// Distribui exercícios em N dias equilibrando o custo de fadiga (greedy).
export interface DayPlan { day: number; exercises: PlannedSet[]; cost: number; }
export function distributeAcrossWeek(exercises: PlannedSet[], days: number): DayPlan[] {
  const plan: DayPlan[] = Array.from({ length: Math.max(1, days) }, (_, i) => ({ day: i, exercises: [], cost: 0 }));
  // ordena por custo desc e joga no dia menos carregado
  const sorted = [...exercises].sort((a, b) => exerciseFatigueCost(b) - exerciseFatigueCost(a));
  for (const e of sorted) {
    const target = plan.reduce((min, d) => (d.cost < min.cost ? d : min), plan[0]);
    target.exercises.push(e);
    target.cost = Math.round((target.cost + exerciseFatigueCost(e)) * 10) / 10;
  }
  return plan;
}
