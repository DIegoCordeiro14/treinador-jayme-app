// muscle-development-score.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 (item 9) — Muscle Development Score por grupo (0-100).
//
// Score determinístico de quão bem cada grupo está sendo desenvolvido, a partir
// de sinais reais: volume (vs faixa produtiva), progressão de carga, tendência de
// reps, RIR médio (intensidade), frequência e recuperação. Grupos com score baixo
// viram candidatos a PONTO FRACO — alimenta o Weak Point Engine do gerador.
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface MuscleDevInput {
  muscle_group: string;
  weekly_sets: number;              // volume real/semana
  target_weekly_sets: number;       // alvo (do muscle-volume-intelligence)
  load_progression_pct: number | null;  // % de progressão de carga no período
  reps_trend_pct: number | null;
  avg_rir: number | null;           // menor = mais intenso
  frequency_per_week: number;
  recovery_ok: boolean;             // recuperação adequada p/ o grupo?
}

export interface MuscleDevScore {
  muscle_group: string;
  score: number;                    // 0..100
  components: { volume: number; progression: number; intensity: number; frequency: number };
  is_weak_point: boolean;
  reason: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function scoreMuscleDevelopment(i: MuscleDevInput): MuscleDevScore {
  // Volume (30): proximidade do alvo, penalizando ficar muito abaixo
  const ratio = i.target_weekly_sets > 0 ? i.weekly_sets / i.target_weekly_sets : 1;
  const volume = clamp01(ratio >= 1 ? 1 - Math.max(0, ratio - 1.3) : ratio);

  // Progressão (35): carga subindo é o principal driver de desenvolvimento
  const prog = i.load_progression_pct == null
    ? 0.5
    : clamp01(0.5 + i.load_progression_pct / 12); // +6% no período ~ ótimo

  // Intensidade (20): RIR próximo de 1-2 é ideal; muito alto = frouxo
  let intensity = 0.6;
  if (i.avg_rir != null) {
    if (i.avg_rir <= 2 && i.avg_rir >= 0) intensity = 1 - Math.abs(i.avg_rir - 1) * 0.15;
    else if (i.avg_rir >= 4) intensity = 0.4;
    else intensity = 0.7;
  }
  intensity = clamp01(intensity);

  // Frequência (15): 2x/semana ideal p/ hipertrofia
  const frequency = clamp01(i.frequency_per_week >= 2 ? 1 : i.frequency_per_week / 2);

  let raw = 0.30 * volume + 0.35 * prog + 0.20 * intensity + 0.15 * frequency;
  if (!i.recovery_ok) raw *= 0.9; // recuperação ruim limita desenvolvimento

  const score = Math.round(clamp01(raw) * 100);
  const is_weak_point = score < 55;

  const reasons: string[] = [];
  if (volume < 0.6) reasons.push('volume abaixo do alvo');
  if (prog < 0.45) reasons.push('carga estagnada/regredindo');
  if (intensity < 0.5) reasons.push('intensidade baixa (RIR alto)');
  if (frequency < 1) reasons.push('frequência < 2x/semana');
  if (!i.recovery_ok) reasons.push('recuperação limitando');
  const reason = reasons.length ? reasons.join(', ') + '.' : 'Bom desenvolvimento em todos os fatores.';

  return {
    muscle_group: i.muscle_group,
    score,
    components: {
      volume: Math.round(volume * 100),
      progression: Math.round(prog * 100),
      intensity: Math.round(intensity * 100),
      frequency: Math.round(frequency * 100),
    },
    is_weak_point,
    reason,
  };
}

export function scoreAllMuscles(inputs: MuscleDevInput[]): MuscleDevScore[] {
  return inputs.map(scoreMuscleDevelopment).sort((a, b) => a.score - b.score); // piores primeiro
}

// Retorna o(s) ponto(s) fraco(s) para alimentar o gerador de treino.
export function weakPointsFromScores(scores: MuscleDevScore[], max = 2): string[] {
  return scores.filter((s) => s.is_weak_point).slice(0, max).map((s) => s.muscle_group);
}
