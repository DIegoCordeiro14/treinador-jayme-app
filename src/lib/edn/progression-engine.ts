/**
 * Progression Engine — EDN V8
 * Progressão automática de carga a partir da última execução (peso/reps/RIR)
 * vs a meta de repetições. Determinístico — sugere o próximo peso/reps.
 */

export interface LastSetPerformance {
  weightKg: number;
  reps: number;
  rir: number | null;          // reps em reserva
  repsMin: number;             // alvo mínimo do exercício
  repsMax: number;             // alvo máximo do exercício
  isIsometric?: boolean;
  lastSeconds?: number;        // para isométricos
}

export interface ProgressionSuggestion {
  apply: boolean;
  type: 'increase_load' | 'increase_reps' | 'hold' | 'reduce' | 'increase_time';
  nextWeightKg?: number;
  nextReps?: number;
  nextSeconds?: number;
  reason: string;
  impact: string;
}

// Incremento de carga por faixa de peso (kg). Compostos pesados sobem mais.
function loadStep(weightKg: number): number {
  if (weightKg >= 100) return 5;
  if (weightKg >= 40) return 2.5;
  if (weightKg >= 20) return 2;
  return 1;
}

export function suggestProgression(p: LastSetPerformance): ProgressionSuggestion {
  // Isométricos: progressão por tempo
  if (p.isIsometric) {
    const cur = p.lastSeconds ?? p.reps;
    if (cur >= p.repsMax) return { apply: true, type: 'increase_time', nextSeconds: cur + 10, reason: `Sustentou ${cur}s (no topo do alvo).`, impact: '+10s de tempo sob tensão.' };
    return { apply: false, type: 'hold', nextSeconds: cur, reason: `Mantenha ${cur}s até o topo do alvo (${p.repsMax}s).`, impact: 'Consolidar a base antes de progredir.' };
  }

  const atOrAboveTop = p.reps >= p.repsMax;
  const easy = (p.rir ?? 0) >= 2;            // sobrou 2+ reps
  const belowMin = p.reps < p.repsMin;

  // Bateu o topo da faixa e ainda fácil → sobe carga
  if (atOrAboveTop && (p.rir == null || p.rir >= 1)) {
    const step = loadStep(p.weightKg);
    const next = Math.round((p.weightKg + step) * 10) / 10;
    return { apply: true, type: 'increase_load', nextWeightKg: next, nextReps: p.repsMin, reason: `Completou ${p.reps} reps (≥ alvo ${p.repsMax})${p.rir != null ? ` com RIR ${p.rir}` : ''}.`, impact: `Sobrecarga progressiva: +${step}kg, recomeçando em ${p.repsMin} reps.` };
  }
  // Dentro da faixa mas folgado → sobe reps
  if (!atOrAboveTop && easy) {
    return { apply: true, type: 'increase_reps', nextWeightKg: p.weightKg, nextReps: Math.min(p.repsMax, p.reps + 1), reason: `RIR ${p.rir} — ainda há margem.`, impact: '+1 rep mantendo a carga.' };
  }
  // Abaixo do mínimo / muito perto da falha → manter ou reduzir
  if (belowMin && (p.rir ?? 0) <= 0) {
    return { apply: false, type: 'reduce', nextWeightKg: Math.round((p.weightKg - loadStep(p.weightKg)) * 10) / 10, nextReps: p.repsMin, reason: `Só ${p.reps} reps e na falha — carga alta demais.`, impact: 'Reduzir carga para treinar dentro da faixa com técnica.' };
  }
  return { apply: false, type: 'hold', nextWeightKg: p.weightKg, nextReps: Math.min(p.repsMax, p.reps + (easy ? 1 : 0)), reason: `Dentro da faixa (${p.reps}/${p.repsMin}-${p.repsMax})${p.rir != null ? `, RIR ${p.rir}` : ''}.`, impact: 'Manter e buscar +1 rep na próxima sessão.' };
}
