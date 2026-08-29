// priority-budget-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §5 — Priority Budget (orçamento de recuperação).
//
// Calcula QUANTO estímulo adicional o atleta consegue recuperar. Se há
// capacidade, permite adicionar estímulo estratégico; se não, obriga a
// REDISTRIBUIR o estímulo existente. Nunca aumenta volume só porque existe uma
// prioridade. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecoveryBudgetInput {
  recoveryScore: number | null;      // 0..100 (wearable/subjetivo)
  hrvTrendPerWeek: number | null;    // + melhora
  sleepHours: number | null;
  acwr: number | null;               // acute:chronic workload ratio (~0.8-1.3 ideal)
  recentWeeklySets: number | null;   // volume total recente
  avgRir: number | null;             // menor = mais intenso/fatigante
  sessionDurationMin: number | null;
  weeklyFrequency: number | null;
  cardioSessionsPerWeek: number | null;
  experience: 'beginner' | 'intermediate' | 'advanced';
  priorVolumeResponsePositive: boolean | null; // respondeu bem a aumento antes?
}

export type BudgetVerdict = 'add_stimulus' | 'redistribute' | 'reduce';

export interface RecoveryBudget {
  capacityScore: number;             // 0..100
  verdict: BudgetVerdict;
  extraSetsAllowed: number;          // séries/semana extras recuperáveis (0+)
  reasons: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function computeRecoveryBudget(i: RecoveryBudgetInput): RecoveryBudget {
  let cap = 50;
  const reasons: string[] = [];

  if (i.recoveryScore != null) {
    cap += (i.recoveryScore - 60) * 0.5;
    if (i.recoveryScore < 45) reasons.push('recovery score baixo');
  }
  if (i.hrvTrendPerWeek != null) { cap += clamp(i.hrvTrendPerWeek, -5, 5) * 2; if (i.hrvTrendPerWeek < -1) reasons.push('HRV em queda'); }
  if (i.sleepHours != null) { if (i.sleepHours >= 7.5) cap += 8; else if (i.sleepHours < 6) { cap -= 12; reasons.push('sono insuficiente'); } }
  if (i.acwr != null) {
    if (i.acwr > 1.5) { cap -= 20; reasons.push('ACWR alto (pico de carga)'); }
    else if (i.acwr < 0.8) { cap += 8; }
  }
  if (i.avgRir != null && i.avgRir <= 1) { cap -= 8; reasons.push('treino muito próximo da falha'); }
  if (i.sessionDurationMin != null && i.sessionDurationMin >= 90) { cap -= 5; }
  if (i.cardioSessionsPerWeek != null && i.cardioSessionsPerWeek >= 3) { cap -= 10; reasons.push('cardio frequente compete por recuperação'); }
  if (i.experience === 'advanced') cap += 6;
  else if (i.experience === 'beginner') cap -= 4;
  if (i.priorVolumeResponsePositive === true) cap += 8;
  else if (i.priorVolumeResponsePositive === false) { cap -= 8; reasons.push('histórico ruim ao aumentar volume'); }

  const capacityScore = Math.round(clamp(cap, 0, 100));

  let verdict: BudgetVerdict;
  let extraSetsAllowed: number;
  if (capacityScore >= 65) { verdict = 'add_stimulus'; extraSetsAllowed = capacityScore >= 80 ? 4 : 2; reasons.unshift('há capacidade de recuperação — adicionar estímulo estratégico'); }
  else if (capacityScore >= 40) { verdict = 'redistribute'; extraSetsAllowed = 0; reasons.unshift('capacidade limitada — redistribuir estímulo, sem inflar volume'); }
  else { verdict = 'reduce'; extraSetsAllowed = 0; reasons.unshift('recuperação comprometida — reduzir carga total'); }

  return { capacityScore, verdict, extraSetsAllowed, reasons };
}
