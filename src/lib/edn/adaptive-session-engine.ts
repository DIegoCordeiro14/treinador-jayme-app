/**
 * Adaptive Session Engine (V8) — cruza recuperação + carga de endurance (ACWR) +
 * tendência de performance + demanda muscular do dia para recomendar a adaptação
 * concreta da sessão de HOJE, com explicação. NÃO altera o plano; apenas orienta a
 * sessão. Determinístico e testável. A IA usa a explicação; não inventa números.
 *
 * Preserva o plano original: retorna percentuais/limites a aplicar sobre as Working
 * sets, RIR mínimo alvo e se pode tentar PR — sem remover exercícios.
 */
import type { RecoveryCategory } from './recovery-engine';

export type SessionIntensity = 'push' | 'normal' | 'reduce' | 'deload' | 'rest';

export interface AdaptiveSessionInput {
  recoveryScore: number;              // 0–100
  recoveryCategory: RecoveryCategory;
  cardioAcwr?: number | null;         // razão agudo:crônico de cardio
  recentPerformanceDeltaPct?: number | null; // negativo = caindo
  todayIsHeavyCompound?: boolean;     // dia pesado (pernas/costas/peito composto)
  primaryMuscleToday?: string | null; // ex.: 'legs'
  daysSinceLastWorkout?: number;
}

export interface AdaptiveSessionPlan {
  intensity: SessionIntensity;
  workingVolumePct: number;   // % do volume Working a manter (100 = sem corte)
  targetRirMin: number;       // RIR mínimo recomendado
  allowPr: boolean;           // pode tentar PR?
  loadDeltaPct: number;       // ajuste sugerido de carga nos compostos (+2.5 / 0 / negativo)
  drivers: string[];          // fatores que pesaram na decisão
  explanation: string;        // texto pronto para o Coach
}

export function recommendSessionAdaptation(i: AdaptiveSessionInput): AdaptiveSessionPlan {
  const drivers: string[] = [];
  const acwr = i.cardioAcwr ?? null;
  const perf = i.recentPerformanceDeltaPct ?? null;

  // ponto de partida pela recuperação
  let intensity: SessionIntensity;
  switch (i.recoveryCategory) {
    case 'critical': intensity = 'rest'; break;
    case 'low': intensity = 'reduce'; break;
    case 'moderate': intensity = 'reduce'; break;
    case 'good': intensity = 'normal'; break;
    case 'excellent': intensity = 'push'; break;
    default: intensity = 'normal';
  }
  drivers.push(`Recuperação ${i.recoveryScore}/100 (${i.recoveryCategory})`);

  // primeiro treino: seguir o plano
  if ((i.daysSinceLastWorkout ?? 0) >= 999) {
    return { intensity: 'normal', workingVolumePct: 100, targetRirMin: 2, allowPr: false, loadDeltaPct: 0, drivers: ['Primeiro treino registrado'], explanation: 'Primeiro treino: siga o plano como prescrito, com foco total na técnica.' };
  }

  // carga de endurance elevada agrava
  const highCardio = acwr != null && acwr >= 1.5;
  const risingCardio = acwr != null && acwr >= 1.3 && acwr < 1.5;
  if (highCardio) { drivers.push(`Carga de cardio elevada (ACWR ${acwr!.toFixed(2)})`); }
  else if (risingCardio) { drivers.push(`Carga de cardio subindo (ACWR ${acwr!.toFixed(2)})`); }

  // performance caindo agrava
  const perfFalling = perf != null && perf <= -7;
  const perfSlightFall = perf != null && perf <= -3 && perf > -7;
  if (perfFalling) drivers.push(`Performance caindo ${Math.abs(Math.round(perf!))}% nas últimas sessões`);
  else if (perfSlightFall) drivers.push(`Leve queda de performance (${Math.round(perf!)}%)`);

  // dia pesado eleva a demanda
  if (i.todayIsHeavyCompound) drivers.push('Dia pesado de composto (demanda elevada)');

  // agravamento: se dois ou mais sinais negativos coincidem, escala a redução
  const negatives = [highCardio, risingCardio, perfFalling, perfSlightFall].filter(Boolean).length;
  if (intensity === 'push' && (highCardio || perfFalling)) intensity = 'normal';
  if (intensity === 'normal' && negatives >= 1 && i.todayIsHeavyCompound) intensity = 'reduce';
  if (intensity === 'reduce' && negatives >= 2) intensity = 'deload';
  if (i.recoveryCategory === 'low' && (highCardio || perfFalling) && i.todayIsHeavyCompound) intensity = 'deload';

  // mapeia intensidade → parâmetros concretos
  let workingVolumePct = 100, targetRirMin = 2, allowPr = false, loadDeltaPct = 0;
  switch (intensity) {
    case 'push': workingVolumePct = 100; targetRirMin = 1; allowPr = true; loadDeltaPct = 2.5; break;
    case 'normal': workingVolumePct = 100; targetRirMin = 2; allowPr = false; loadDeltaPct = 0; break;
    case 'reduce': workingVolumePct = 70; targetRirMin = 2; allowPr = false; loadDeltaPct = 0; break; // -30% Working
    case 'deload': workingVolumePct = 60; targetRirMin = 3; allowPr = false; loadDeltaPct = -10; break;
    case 'rest': workingVolumePct = 0; targetRirMin = 4; allowPr = false; loadDeltaPct = 0; break;
  }

  const muscle = i.primaryMuscleToday ? ` de ${muscleLabel(i.primaryMuscleToday)}` : '';
  const explanation = buildExplanation(intensity, i.recoveryScore, workingVolumePct, targetRirMin, muscle, drivers);
  return { intensity, workingVolumePct, targetRirMin, allowPr, loadDeltaPct, drivers, explanation };
}

function muscleLabel(m: string): string {
  const map: Record<string, string> = { legs: 'pernas', back: 'costas', chest: 'peito', shoulders: 'ombros', biceps: 'bíceps', triceps: 'tríceps', glutes: 'glúteos', hamstrings: 'posteriores', quads: 'quadríceps', calves: 'panturrilhas', abs: 'abdômen' };
  return map[m] ?? m;
}

function buildExplanation(intensity: SessionIntensity, score: number, volPct: number, rir: number, muscle: string, drivers: string[]): string {
  const because = drivers.length > 1 ? ` (${drivers.slice(0, 3).join('; ')})` : '';
  switch (intensity) {
    case 'push': return `Recuperação alta (${score}/100). Dia ideal para progredir: pode tentar PR nos compostos e trabalhar mais perto da falha (RIR ${rir}).`;
    case 'normal': return `Recuperação adequada (${score}/100). Execute o treino${muscle} conforme o plano, mantendo RIR ${rir}.`;
    case 'reduce': return `Sua recuperação está abaixo do padrão e a demanda de hoje é alta${because}. Recomendo reduzir o volume das séries Working em ${100 - volPct}% e manter RIR ${rir}. Seu treino${muscle} será preservado, mas adaptado para recuperação.`;
    case 'deload': return `Vários sinais de fadiga coincidem${because}. Recomendo um mini-deload hoje: −${100 - volPct}% de volume Working, carga ~10% menor e RIR ${rir}. Preservamos o estímulo${muscle} sem aprofundar a fadiga.`;
    case 'rest': return `Recuperação crítica (${score}/100)${because}. O Coach recomenda descanso ou mobilidade leve hoje — treinar pesado agora aumenta o risco de regressão e lesão.`;
  }
}
