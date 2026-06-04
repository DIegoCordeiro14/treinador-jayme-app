/**
 * Recovery Engine — EDN V6.5 (Pilar 3)
 * Calcula o RecoveryState do atleta combinando:
 *  - Anamnese (sono, estresse, tipo de trabalho — Módulo 0)
 *  - Carga aguda de treino (dias desde o último treino, RIR médio, frequência)
 *  - Wearables (HRV, FC repouso, Body Battery, Training Readiness) — quando disponíveis
 *
 * Fonte de verdade para o Decision Engine e para o ajuste pré-treino (Pilar 5).
 */

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export const RECOVERY_CATEGORY_LABELS: Record<RecoveryCategory, string> = {
  excellent: 'Excelente',
  good: 'Boa',
  moderate: 'Moderada',
  low: 'Baixa',
  critical: 'Crítica',
};

// ── Wearables (Pilar 1 — campos prontos para integração futura) ──────────────
export interface WearableMetrics {
  hrvMs?: number | null;              // HRV atual
  hrvBaselineMs?: number | null;      // média 7 dias
  restingHr?: number | null;          // FC repouso
  sleepHoursMeasured?: number | null; // sono medido (substitui anamnese)
  bodyBattery?: number | null;        // Garmin 0-100
  trainingReadiness?: number | null;  // Garmin 0-100
  recoveryTimeHours?: number | null;  // Garmin/Polar
}

export interface RecoveryInput {
  // Anamnese (Módulo 0)
  sleepHours?: string | null;   // 'lt_5h' | '5_6h' | '7_8h' | 'gt_8h'
  sleepQuality?: string | null; // 'poor' | 'regular' | 'good' | 'excellent'
  stressLevel?: string | null;  // 'low' | 'medium' | 'high'
  workType?: string | null;     // 'sedentary' | 'moderate' | 'active'
  // Carga aguda
  daysSinceLastWorkout: number; // 999 = nunca treinou
  avgRir: number | null;        // RIR médio dos top sets recentes
  sessionsLast7: number;
  plannedPerWeek: number;
  // Wearables (opcional — quando presentes têm prioridade)
  wearable?: WearableMetrics | null;
}

export interface RecoveryState {
  score: number;                // 0–100
  category: RecoveryCategory;
  factors: string[];            // Camada 2 — interpretação de cada fator
  usedWearable: boolean;
}

function categorize(score: number): RecoveryCategory {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'moderate';
  if (score >= 40) return 'low';
  return 'critical';
}

export function computeRecoveryState(input: RecoveryInput): RecoveryState {
  const factors: string[] = [];
  const w = input.wearable;
  const hasWearable = !!(w && (w.hrvMs != null || w.trainingReadiness != null || w.bodyBattery != null));

  let score = 70; // base neutra

  // ── 1. Wearables (prioridade máxima quando disponíveis) ───────────────────
  if (hasWearable && w) {
    if (w.trainingReadiness != null) {
      // Training Readiness já é um índice consolidado — peso alto
      score = Math.round(score * 0.3 + w.trainingReadiness * 0.7);
      factors.push(`Training Readiness ${w.trainingReadiness}/100 (wearable)`);
    }
    if (w.hrvMs != null && w.hrvBaselineMs != null && w.hrvBaselineMs > 0) {
      const deltaPct = Math.round(((w.hrvMs - w.hrvBaselineMs) / w.hrvBaselineMs) * 100);
      score += Math.max(-15, Math.min(15, deltaPct));
      factors.push(deltaPct >= 0
        ? `HRV ${deltaPct}% acima da média de 7 dias — sistema nervoso recuperado`
        : `HRV ${Math.abs(deltaPct)}% abaixo da média de 7 dias — sinal de fadiga`);
    }
    if (w.bodyBattery != null) {
      score += w.bodyBattery >= 70 ? 5 : w.bodyBattery < 35 ? -10 : 0;
      factors.push(`Body Battery ${w.bodyBattery}/100`);
    }
    if (w.sleepHoursMeasured != null) {
      score += w.sleepHoursMeasured >= 7 ? 5 : w.sleepHoursMeasured < 5.5 ? -10 : 0;
      factors.push(`Sono medido: ${w.sleepHoursMeasured.toFixed(1)}h`);
    }
  } else {
    // ── 2. Anamnese (fallback sem wearable) ──────────────────────────────────
    switch (input.sleepHours) {
      case 'gt_8h': score += 10; factors.push('Sono habitual >8h — recuperação favorecida'); break;
      case '7_8h':  score += 5;  factors.push('Sono habitual 7-8h — adequado'); break;
      case '5_6h':  score -= 5;  factors.push('Sono habitual 5-6h — abaixo do ideal para hipertrofia'); break;
      case 'lt_5h': score -= 15; factors.push('Sono habitual <5h — recuperação comprometida'); break;
    }
    switch (input.sleepQuality) {
      case 'excellent': score += 8; break;
      case 'good':      score += 4; break;
      case 'poor':      score -= 10; factors.push('Qualidade de sono ruim relatada'); break;
    }
    switch (input.stressLevel) {
      case 'low':  score += 8; break;
      case 'high': score -= 12; factors.push('Estresse alto — eleva cortisol e atrasa recuperação'); break;
    }
    switch (input.workType) {
      case 'sedentary': score += 3; break;
      case 'active':    score -= 5; factors.push('Trabalho fisicamente ativo — fadiga acumulada extra'); break;
    }
  }

  // ── 3. Carga aguda de treino (sempre aplicada) ────────────────────────────
  if (input.daysSinceLastWorkout >= 999) {
    factors.push('Nenhum treino registrado — estado de recuperação total, sem carga acumulada');
    score += 10;
  } else if (input.daysSinceLastWorkout === 0) {
    score -= 10;
    factors.push('Treinou hoje — músculos em janela de recuperação');
  } else if (input.daysSinceLastWorkout === 1) {
    score += 5;
    factors.push('Último treino: ontem — recuperação parcial em andamento');
  } else if (input.daysSinceLastWorkout >= 3) {
    score += 8;
    factors.push(`${input.daysSinceLastWorkout} dias desde o último treino — totalmente recuperado`);
  }

  if (input.avgRir !== null && input.avgRir < 1) {
    score -= 12;
    factors.push(`RIR médio ${input.avgRir.toFixed(1)} — treinos muito próximos da falha, fadiga elevada`);
  }

  if (input.plannedPerWeek > 0 && input.sessionsLast7 > input.plannedPerWeek) {
    score -= 8;
    factors.push(`${input.sessionsLast7} treinos nos últimos 7 dias (planejado: ${input.plannedPerWeek}) — volume acima do programado`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    category: categorize(score),
    factors,
    usedWearable: hasWearable,
  };
}
