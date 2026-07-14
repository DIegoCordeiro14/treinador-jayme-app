/**
 * Regra global — todas as reps sugeridas DEVEM respeitar o intervalo do exercício.
 * O motor adapta a CARGA para cumprir a faixa de reps; nunca muda a faixa para
 * justificar a carga. Fonte oficial do intervalo: workout_exercises (reps_min/max).
 */

export function clampRepsToExerciseRange(suggestedReps: number, repsMin: number, repsMax: number): number {
  const lo = Math.max(1, Math.round(repsMin));
  const hi = Math.max(lo, Math.round(repsMax));
  return Math.max(lo, Math.min(hi, Math.round(suggestedReps)));
}

// Isométricos: mesma regra por tempo (segundos).
export function clampDurationToRange(suggestedSeconds: number, minSeconds: number, maxSeconds: number): number {
  const lo = Math.max(1, Math.round(minSeconds));
  const hi = Math.max(lo, Math.round(maxSeconds));
  return Math.max(lo, Math.min(hi, Math.round(suggestedSeconds)));
}

export interface RepsValidation { valid: boolean; reps: number; adjusted: boolean; adjustmentReason?: string }

// Valida antes de persistir/exibir; se fora da faixa, aplica clamp e sinaliza.
export function validateReps(reps: number, repsMin: number, repsMax: number): RepsValidation {
  const clamped = clampRepsToExerciseRange(reps, repsMin, repsMax);
  if (clamped === Math.round(reps)) return { valid: true, reps: clamped, adjusted: false };
  return { valid: false, reps: clamped, adjusted: true, adjustmentReason: `Repetições ajustadas para respeitar a faixa ${repsMin}–${repsMax} do exercício.` };
}
