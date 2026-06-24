/**
 * Training Periodization Engine — EDN V8.1
 * Distribui a semana (treino/descanso/cardio/deload), detecta a fase do
 * mesociclo e adapta o dia conforme a recuperação. Determinístico.
 */

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
export type MesocyclePhase = 'base' | 'volume' | 'intensificacao' | 'deload';

export interface MesocycleInput {
  weeksOnPlan: number;
  recentVolumeTrendPct: number | null;  // tendência de volume recente
  recoveryCategory: RecoveryCategory;
  hadPrRecently: boolean;
}
export interface MesocycleResult { phase: MesocyclePhase; label: string; focus: string; }

const PHASE_LABEL: Record<MesocyclePhase, string> = {
  base: 'Base', volume: 'Acúmulo de Volume', intensificacao: 'Intensificação', deload: 'Deload',
};

export function detectMesocyclePhase(i: MesocycleInput): MesocycleResult {
  // Deload: recuperação baixa OU 5+ semanas sem deload com volume alto e sem PR
  if (i.recoveryCategory === 'critical' || (i.recoveryCategory === 'low' && i.weeksOnPlan % 5 === 0)) {
    return { phase: 'deload', label: PHASE_LABEL.deload, focus: 'Reduzir volume ~40% e intensidade — supercompensar.' };
  }
  if (i.weeksOnPlan >= 5 && !i.hadPrRecently && (i.recentVolumeTrendPct ?? 0) <= 0) {
    return { phase: 'deload', label: PHASE_LABEL.deload, focus: 'Estagnação — deload estratégico para retomar a progressão.' };
  }
  const wk = i.weeksOnPlan % 8;
  if (wk <= 1) return { phase: 'base', label: PHASE_LABEL.base, focus: 'Construção técnica e adaptação — RIR mais alto.' };
  if (wk <= 4) return { phase: 'volume', label: PHASE_LABEL.volume, focus: 'Aumentar séries/volume efetivo semana a semana.' };
  return { phase: 'intensificacao', label: PHASE_LABEL.intensificacao, focus: 'Mais carga, RIR menor, manter técnica.' };
}

// Plano semanal a partir do schedule + ajuste por recuperação.
export interface WeekPlanInput {
  pattern: number[];                       // dias de treino 1=Seg..7=Dom
  dayAssignments: Record<string, string>;  // weekday -> rótulo
  cardioDays?: number[];                   // dias com cardio (1..7)
  todayWeekday: number;                    // 1..7
  recoveryCategory: RecoveryCategory;
}
export interface WeekDayPlan { weekday: number; label: string; type: 'treino' | 'cardio' | 'descanso'; adapted?: string; }

const WD = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const LARGE = ['perna', 'pernas', 'leg', 'quadr', 'posterior', 'gluteo'];

export function planWeek(i: WeekPlanInput): WeekDayPlan[] {
  const out: WeekDayPlan[] = [];
  for (let d = 1; d <= 7; d++) {
    const isTrain = i.pattern.includes(d);
    const isCardio = (i.cardioDays ?? []).includes(d);
    const label = i.dayAssignments?.[String(d)] ?? (isTrain ? 'Treino' : isCardio ? 'Cardio Z2' : 'Descanso');
    let type: WeekDayPlan['type'] = isTrain ? 'treino' : isCardio ? 'cardio' : 'descanso';
    let adapted: string | undefined;
    // Adaptação: hoje, recuperação baixa em dia de grupo grande → mobilidade + cardio leve
    if (d === i.todayWeekday && isTrain && (i.recoveryCategory === 'low' || i.recoveryCategory === 'critical')) {
      const big = LARGE.some((g) => label.toLowerCase().includes(g));
      adapted = big ? 'Alterado para mobilidade + cardio leve (HRV/recuperação baixa).' : 'Reduzir 1 série nos compostos (recuperação baixa).';
      if (big) type = 'cardio';
    }
    out.push({ weekday: d, label: `${WD[d]}: ${label}`, type, adapted });
  }
  return out;
}

// Performance Score de uma sessão (0–100): progressão de carga + RIR + conclusão.
export interface SessionPerfInput {
  setsCompleted: number;
  setsPlanned: number;
  volumeKg: number;
  prevVolumeKg: number | null;   // volume da última sessão equivalente
  avgRir: number | null;         // RIR médio dos top sets
}
export function computeSessionPerformance(i: SessionPerfInput): { score: number; note: string } {
  const completion = i.setsPlanned > 0 ? Math.min(1, i.setsCompleted / i.setsPlanned) : 1;
  let score = completion * 50;
  // progressão de volume vs sessão anterior
  if (i.prevVolumeKg && i.prevVolumeKg > 0) {
    const delta = (i.volumeKg - i.prevVolumeKg) / i.prevVolumeKg;
    score += Math.max(-15, Math.min(35, Math.round(delta * 100)));
  } else score += 20;
  // proximidade do alvo de esforço (RIR ~1-2 ideal)
  if (i.avgRir != null) score += i.avgRir <= 2 ? 15 : i.avgRir <= 3 ? 8 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const note = score >= 80 ? 'Sessão forte — progressão consistente.' : score >= 60 ? 'Boa sessão.' : 'Sessão abaixo do potencial — revisar carga/recuperação.';
  return { score, note };
}
