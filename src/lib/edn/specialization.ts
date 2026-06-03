/**
 * EDN Body Specialization Engine — V5.0 Pillar 5+6
 * Motor que adapta treino baseado em: sexo + objetivo + BF + ponto fraco + histórico
 */

export type WeakPoint =
  // Masculino
  | 'peitoral' | 'costas' | 'ombros' | 'bracos' | 'posteriores' | 'panturrilhas'
  // Feminino
  | 'gluteos' | 'posteriores' | 'quadriceps' | 'abdomen'
  // Neutro
  | 'fullbody' | null;

export type Gender = 'male' | 'female' | null;
export type PrimaryGoal = 'hypertrophy' | 'weight_loss' | 'definition' | 'strength' | 'recomposition';

export interface WorkoutBlueprint {
  splitType: 'fullbody' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'gluteo_focus';
  splitLabel: string;
  daysPerWeek: number;
  muscleFrequency: Record<string, number>; // muscle → sessions/week
  priorityMuscles: string[]; // ordered by volume priority
  repRanges: { compound: [number, number]; isolation: [number, number] };
  restSeconds: { compound: number; isolation: number };
  setsPerSession: { compound: number; isolation: number };
  intensityFocus: string;
  specialNotes: string[];
  whyThisPrescription: string;
}

// ── Main prescription function ────────────────────────────────────────────────
export function prescribeWorkoutBlueprint(params: {
  gender: Gender;
  primaryGoal: PrimaryGoal;
  aestheticGoal: string | null;
  weakPoint: WeakPoint;
  bodyFatPct: number | null;
  experience: 'beginner' | 'intermediate' | 'advanced';
  daysPerWeek: number;
  bmi: number | null;
}): WorkoutBlueprint {
  const { gender, primaryGoal, weakPoint, bodyFatPct, experience, daysPerWeek, bmi } = params;

  // ── Effective goal (BF override) ────────────────────────────────────────────
  const effectiveGoal: PrimaryGoal =
    (bodyFatPct && bodyFatPct >= 28) ? 'weight_loss' :
    (bodyFatPct && bodyFatPct >= 22 && primaryGoal === 'hypertrophy') ? 'recomposition' :
    primaryGoal;

  // ── Split selection ──────────────────────────────────────────────────────────
  let splitType: WorkoutBlueprint['splitType'];
  if (gender === 'female' && (weakPoint === 'gluteos' || weakPoint === 'posteriores' || weakPoint === 'quadriceps')) {
    splitType = 'gluteo_focus';
  } else if (daysPerWeek <= 3 || effectiveGoal === 'weight_loss' || experience === 'beginner') {
    splitType = 'fullbody';
  } else if (daysPerWeek === 4) {
    splitType = 'upper_lower';
  } else if (daysPerWeek >= 5) {
    splitType = experience === 'advanced' ? 'push_pull_legs' : 'upper_lower';
  } else {
    splitType = 'upper_lower';
  }

  const SPLIT_LABELS: Record<string, string> = {
    fullbody: 'Full Body',
    upper_lower: 'Upper/Lower',
    push_pull_legs: 'Push/Pull/Legs',
    bro_split: 'Bro Split',
    gluteo_focus: 'Glúteo Focus',
  };

  // ── Priority muscles by goal + gender + weak point ───────────────────────────
  const baseMuscles = gender === 'female'
    ? ['gluteos', 'quadriceps', 'posteriores', 'abdomen', 'ombros', 'costas', 'peitoral']
    : ['costas', 'peitoral', 'ombros', 'quadriceps', 'posteriores', 'biceps', 'triceps'];

  const priorityMuscles = weakPoint
    ? [weakPoint, ...baseMuscles.filter(m => m !== weakPoint)]
    : baseMuscles;

  // ── Volume + intensity by goal ───────────────────────────────────────────────
  type RepRange = [number, number];
  const goals: Record<PrimaryGoal, { compound: RepRange; isolation: RepRange; restC: number; restI: number; setsC: number; setsI: number; label: string }> = {
    weight_loss:    { compound: [12, 20], isolation: [15, 25], restC: 60,  restI: 45,  setsC: 3, setsI: 2, label: 'Alta densidade, descansos curtos, compostos multi-articulares' },
    definition:     { compound: [10, 15], isolation: [12, 20], restC: 75,  restI: 60,  setsC: 4, setsI: 3, label: 'Volume moderado, progressão linear de reps' },
    hypertrophy:    { compound: [6, 12],  isolation: [10, 15], restC: 90,  restI: 75,  setsC: 4, setsI: 3, label: 'Hipertrofia sarcoplasmática + miofibrilar' },
    strength:       { compound: [3, 6],   isolation: [6, 10],  restC: 180, restI: 120, setsC: 5, setsI: 4, label: 'Força máxima, cargas pesadas, descanso longo' },
    recomposition:  { compound: [8, 15],  isolation: [12, 18], restC: 75,  restI: 60,  setsC: 3, setsI: 3, label: 'Recomposição: déficit leve + alta proteína + progressão de carga' },
  };

  const g = goals[effectiveGoal] ?? goals.hypertrophy;

  // ── Frequency per muscle based on split ──────────────────────────────────────
  const muscleFreq: Record<string, number> = {};
  const topMuscles = priorityMuscles.slice(0, 3);
  for (const m of priorityMuscles) {
    muscleFreq[m] = topMuscles.includes(m) ? Math.min(3, Math.ceil(daysPerWeek / 2)) : Math.ceil(daysPerWeek / 3);
  }

  // ── Special notes ─────────────────────────────────────────────────────────────
  const notes: string[] = [];
  if (bodyFatPct && bodyFatPct >= 28) notes.push('BF elevado: priorize exercícios compostos com maior gasto metabólico.');
  if (bmi && bmi >= 28) notes.push('IMC elevado: prefira máquinas nos membros inferiores para proteger articulações.');
  if (weakPoint) notes.push(`Ponto fraco (${weakPoint}): +1 série extra e prioridade de posição nos dias de treino.`);
  if (experience === 'beginner') notes.push('Iniciante: evite exercícios marcados como [ADV]. Foco em técnica antes de carga.');
  if (splitType === 'gluteo_focus') notes.push('Glúteo Focus: Hip Thrust, Bulgarian Split Squat, RDL e Leg Press devem compor os primeiros exercícios de cada sessão.');
  if (effectiveGoal !== primaryGoal) notes.push(`Objetivo ajustado: BF ${bodyFatPct}% indica ${effectiveGoal} como prioridade antes de hipertrofia pura.`);

  // ── "Why this prescription" ──────────────────────────────────────────────────
  const why = [
    `**Split ${SPLIT_LABELS[splitType]}** — escolhido com base em ${daysPerWeek} dias/semana + experiência ${experience}.`,
    effectiveGoal !== primaryGoal
      ? `**Objetivo ajustado para ${effectiveGoal}** — BF ${bodyFatPct}% indica que emagrecimento deve preceder hipertrofia.`
      : `**Objetivo: ${effectiveGoal}** — rep ranges e descansos calibrados para o resultado esperado.`,
    weakPoint ? `**Ponto fraco prioritário: ${weakPoint}** — frequência e volume aumentados para acelerar desenvolvimento.` : '',
    gender === 'female' && splitType === 'gluteo_focus' ? '**Glúteo Focus ativado** — Hip Thrust, Bulgarian e RDL como base da prescrição.' : '',
  ].filter(Boolean).join(' ');

  return {
    splitType,
    splitLabel: SPLIT_LABELS[splitType],
    daysPerWeek,
    muscleFrequency: muscleFreq,
    priorityMuscles: priorityMuscles.slice(0, 5),
    repRanges: { compound: g.compound, isolation: g.isolation },
    restSeconds: { compound: g.restC, isolation: g.restI },
    setsPerSession: { compound: g.setsC, isolation: g.setsI },
    intensityFocus: g.label,
    specialNotes: notes,
    whyThisPrescription: why,
  };
}

// ── Prompt snippet for generate-workout ──────────────────────────────────────
export function blueprintToPromptSnippet(bp: WorkoutBlueprint): string {
  return `PRESCRIÇÃO V5 — ${bp.splitLabel} (${bp.daysPerWeek}x/sem)
Split: ${bp.splitType}
Prioridade muscular (ordem): ${bp.priorityMuscles.join(' > ')}
Repetições: compostos ${bp.repRanges.compound[0]}-${bp.repRanges.compound[1]} | isolados ${bp.repRanges.isolation[0]}-${bp.repRanges.isolation[1]}
Descanso: compostos ${bp.restSeconds.compound}s | isolados ${bp.restSeconds.isolation}s
Séries/exercício: compostos ${bp.setsPerSession.compound} | isolados ${bp.setsPerSession.isolation}
Foco: ${bp.intensityFocus}
${bp.specialNotes.length > 0 ? 'Notas: ' + bp.specialNotes.join('; ') : ''}`;
}
