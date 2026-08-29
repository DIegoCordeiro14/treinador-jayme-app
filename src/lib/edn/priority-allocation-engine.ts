// priority-allocation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §3-4 — Gestão de PRIORIDADES musculares (relativa, não absoluta).
//
// Um músculo prioritário NÃO recebe simplesmente mais séries. O motor calcula um
// Priority Score determinístico e decide a ORDEM de intervenção:
//   1) melhor posição no treino  2) frequência  3) seleção de exercícios  4) volume
// A prioridade do usuário é respeitada, mas prioridade ≠ volume infinito.
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type PriorityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'PRIMARY';
export type InterventionKind = 'position' | 'frequency' | 'exercise_selection' | 'volume';

export interface PriorityInput {
  muscle_group: string;
  userDeclared: boolean;             // marcado pelo usuário como prioridade
  isWeakPoint: boolean;              // detectado automaticamente
  aestheticGoalMatch: boolean;      // bate com objetivo estético (ex v-taper→ombros)
  historicalResponse: number | null; // -1..1 (quão bem responde a estímulo)
  stagnant: boolean;                 // estagnado no histórico
  // capacidade / limitadores (0..1, maior = mais folga)
  recoveryCapacity: number;          // 0..1
  timeAvailability: number;          // 0..1 (sessões longas o bastante)
  fatigue: number;                   // 0..1 (maior = mais fadiga)
  cardioLoad: number;                // 0..1 (maior = mais cardio)
}

export interface PriorityAllocation {
  muscle_group: string;
  score: number;                     // 0..100
  level: PriorityLevel;
  interventionOrder: InterventionKind[];
  reason: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computePriorityScore(i: PriorityInput): number {
  // positivos
  let s = 0;
  if (i.userDeclared) s += 30;
  if (i.isWeakPoint) s += 22;
  if (i.aestheticGoalMatch) s += 12;
  if (i.stagnant) s += 8;
  if (i.historicalResponse != null) s += Math.round(i.historicalResponse * 10); // -10..+10

  // capacidade dá espaço; limitadores tiram
  s += Math.round(i.recoveryCapacity * 10);
  s += Math.round(i.timeAvailability * 5);
  s -= Math.round(i.fatigue * 15);
  s -= Math.round(i.cardioLoad * 8);

  return Math.max(0, Math.min(100, s));
}

function levelFromScore(score: number, userDeclared: boolean): PriorityLevel {
  if (score >= 70) return 'PRIMARY';
  if (score >= 50) return 'HIGH';
  if (score >= 30 || userDeclared) return 'MODERATE';
  return 'LOW';
}

// Ordem de intervenção: posição e frequência ANTES de volume; volume só com folga.
function interventionOrder(i: PriorityInput, level: PriorityLevel): InterventionKind[] {
  const order: InterventionKind[] = ['position'];
  const hasRecoveryRoom = i.recoveryCapacity >= 0.5 && i.fatigue <= 0.5;

  if (level === 'PRIMARY' || level === 'HIGH') {
    order.push('frequency', 'exercise_selection');
    if (hasRecoveryRoom) order.push('volume');
  } else if (level === 'MODERATE') {
    order.push('exercise_selection');
    if (hasRecoveryRoom) order.push('frequency');
  }
  // LOW: só posição/seleção implícita
  if (!order.includes('exercise_selection')) order.push('exercise_selection');
  return order;
}

export function allocatePriority(i: PriorityInput): PriorityAllocation {
  const score = computePriorityScore(i);
  const level = levelFromScore(score, i.userDeclared);
  const order = interventionOrder(i, level);

  const reasons: string[] = [];
  if (i.userDeclared) reasons.push('prioridade declarada pelo usuário');
  if (i.isWeakPoint) reasons.push('ponto fraco detectado');
  if (i.stagnant) reasons.push('estagnado');
  const noRoom = !(i.recoveryCapacity >= 0.5 && i.fatigue <= 0.5);
  if (noRoom && level !== 'LOW') {
    reasons.push('sem folga de recuperação — priorizar via posição/frequência, sem inflar volume');
  }
  const reason = `${level}: ${reasons.join(', ') || 'contexto neutro'}. Intervir na ordem: ${order.join(' → ')}.`;

  return { muscle_group: i.muscle_group, score, level, interventionOrder: order, reason };
}

export function allocateAll(inputs: PriorityInput[]): PriorityAllocation[] {
  return inputs.map(allocatePriority).sort((a, b) => b.score - a.score);
}
