/**
 * Athlete Intelligence Engine — EDN V8 (motor central)
 * Consolida os scores dos sub-motores (treino, nutrição, recuperação, cardio)
 * num EDN 360 Score, identifica o PRINCIPAL LIMITADOR e a PRÓXIMA AÇÃO, e
 * detecta o ponto fraco muscular (Weak Point Engine).
 * 100% determinístico — a IA apenas narra o que sai daqui.
 */

export interface Edn360Input {
  training: number;     // 0–100
  nutrition: number;    // 0–100
  recovery: number;     // 0–100
  cardio: number;       // 0–100
}

export type Edn360Pillar = 'recovery' | 'training' | 'nutrition' | 'cardio';

export interface Edn360Result {
  overall: number;
  scores: Edn360Input;
  limiter: Edn360Pillar;
  limiterLabel: string;
  limiterMessage: string;
  nextAction: string;
}

const PILLAR_LABEL: Record<Edn360Pillar, string> = {
  recovery: 'Recuperação', training: 'Treino', nutrition: 'Nutrição', cardio: 'Cardio',
};

// Pesos do EDN 360 (recuperação tem peso menor no overall, mas é tratada como
// limitadora prioritária quando está claramente baixa — fisiologia manda).
export function computeEdn360(i: Edn360Input): Edn360Result {
  const overall = Math.round(i.training * 0.34 + i.nutrition * 0.24 + i.cardio * 0.16 + i.recovery * 0.26);

  // Limitador: pilar com menor score; recuperação baixa (<55) tem prioridade.
  const entries: [Edn360Pillar, number][] = [
    ['recovery', i.recovery], ['training', i.training], ['nutrition', i.nutrition], ['cardio', i.cardio],
  ];
  let limiter: Edn360Pillar = entries[0][0];
  let min = entries[0][1];
  for (const [p, v] of entries) { if (v < min) { min = v; limiter = p; } }
  if (i.recovery < 55 && limiter !== 'recovery') limiter = 'recovery';

  const limiterMessage: Record<Edn360Pillar, string> = {
    recovery: 'Sua recuperação está abaixo do ideal — ela pode estar limitando sua evolução.',
    training: 'Sua consistência/progressão de treino é o que mais pesa hoje.',
    nutrition: 'Sua nutrição (aderência/ajuste) é o elo mais fraco agora.',
    cardio: 'Seu condicionamento cardiovascular é o ponto a desenvolver.',
  };
  const nextAction: Record<Edn360Pillar, string> = {
    recovery: 'Priorize sono e reduza volume/intensidade hoje (ex.: -25% no treino pesado).',
    training: 'Cumpra os treinos planejados da semana e mantenha a progressão de carga.',
    nutrition: 'Aperte a aderência alimentar e confirme o ajuste calórico da fase.',
    cardio: 'Adicione 1–2 sessões de Z2 na semana para subir a base aeróbica.',
  };

  return {
    overall, scores: i, limiter,
    limiterLabel: PILLAR_LABEL[limiter],
    limiterMessage: limiterMessage[limiter],
    nextAction: nextAction[limiter],
  };
}

// ── Weak Point Engine ───────────────────────────────────────────────────────
export interface MuscleVolume {
  muscle: string;
  recentVolume: number;   // volume (carga×reps) no período recente (ex.: 30d)
  priorVolume: number;    // volume no período anterior (ex.: 30–60d)
  sessions: number;       // nº de vezes que o grupo foi treinado no recente
}

export interface WeakPointResult {
  weakest: { muscle: string; evolutionPct: number; sessions: number } | null;
  strongest: { muscle: string; evolutionPct: number } | null;
  evolutionByMuscle: { muscle: string; evolutionPct: number; sessions: number }[];
  recommendation: string | null;
}

const MUSCLE_LABEL: Record<string, string> = {
  chest: 'Peitoral', back: 'Costas', legs: 'Pernas', shoulders: 'Ombros',
  biceps: 'Bíceps', triceps: 'Tríceps', glutes: 'Glúteos', hamstrings: 'Posteriores',
  quads: 'Quadríceps', calves: 'Panturrilhas', abs: 'Abdômen', forearms: 'Antebraços',
};
const label = (m: string) => MUSCLE_LABEL[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : m);

export function detectWeakPoint(muscles: MuscleVolume[]): WeakPointResult {
  const evo = muscles
    .filter((m) => m.priorVolume > 0 || m.recentVolume > 0)
    .map((m) => ({
      muscle: m.muscle,
      sessions: m.sessions,
      evolutionPct: m.priorVolume > 0 ? Math.round(((m.recentVolume - m.priorVolume) / m.priorVolume) * 100) : (m.recentVolume > 0 ? 100 : 0),
    }))
    .sort((a, b) => a.evolutionPct - b.evolutionPct);

  if (evo.length < 2) {
    return { weakest: null, strongest: null, evolutionByMuscle: evo, recommendation: null };
  }
  const weakest = evo[0];
  const strongest = evo[evo.length - 1];
  let recommendation: string | null = null;
  // Especializa quando há clara defasagem (gap ≥ 6 p.p.) ou estagnação (<2%).
  if (strongest.evolutionPct - weakest.evolutionPct >= 6 || weakest.evolutionPct < 2) {
    recommendation = `Seu ${label(weakest.muscle)} evoluiu ${weakest.evolutionPct}% enquanto ${label(strongest.muscle)} evoluiu ${strongest.evolutionPct}%. Recomendo especialização de ${label(weakest.muscle)} por ~8 semanas: +1 frequência/semana, novos exercícios e mais volume efetivo.`;
  }
  return {
    weakest: { muscle: label(weakest.muscle), evolutionPct: weakest.evolutionPct, sessions: weakest.sessions },
    strongest: { muscle: label(strongest.muscle), evolutionPct: strongest.evolutionPct },
    evolutionByMuscle: evo.map((e) => ({ ...e, muscle: label(e.muscle) })),
    recommendation,
  };
}
