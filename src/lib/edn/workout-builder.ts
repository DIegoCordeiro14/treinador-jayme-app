/**
 * Workout Builder V3 — Motor Inteligente EDN
 * Decisões estruturais 100% determinísticas, sem depender de IA.
 * A IA recebe este output como contexto para selecionar exercícios do catálogo.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type GoalType = 'hypertrophy' | 'weight_loss' | 'definition' | 'strength' | 'recomp' | 'running' | 'health';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'abs' | 'calves' | 'forearms';
export type DifficultyLabel = 'Fácil' | 'Moderado' | 'Difícil' | 'Elite';

export interface BuilderInput {
  // Perfil
  sex?: 'male' | 'female' | 'other';
  age?: number;
  weight_kg?: number;
  height_cm?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
  experience_level: ExperienceLevel;
  training_years?: number;

  // Objetivo
  goal: GoalType;

  // Disponibilidade
  days_per_week: number;
  minutes_per_session?: number;   // 30–90; default 60

  // Recuperação
  sleep_hours?: number;           // <6 = baixa recuperação
  resting_hr?: number;            // >70 = estresse elevado
  recovery_score?: number;        // 0–100 do Performance Engine

  // Histórico
  has_pr_last_4_weeks?: boolean;
  stagnant_exercises?: string[];
  favorite_exercises?: string[];
  injuries?: string[];            // ex: ['knee', 'shoulder']
  days_since_last_workout?: number;

  // Especialização
  focus_muscle?: MuscleGroup | null;
}

export interface SessionTemplate {
  day_index: number;
  focus_label: string;
  muscle_groups: MuscleGroup[];
  intensity: 'high' | 'medium' | 'low';
  is_focus_day: boolean;          // true se inclui o grupo de especialização
}

export interface BuilderOutput {
  // Estrutura
  split_type: string;
  difficulty_score: number;       // 0–100
  difficulty_label: DifficultyLabel;

  // Specs por sessão
  exercises_per_session: number;
  sets_per_compound: number;
  sets_per_isolation: number;

  // Intensidade
  rep_range: { min: number; max: number };
  rir_target: number;
  rest_compound_s: number;
  rest_isolation_s: number;

  // Volume semanal por grupo (séries/semana)
  volume_map: Partial<Record<MuscleGroup, number>>;
  priority_muscles: MuscleGroup[];

  // Templates das sessões
  sessions: SessionTemplate[];

  // Raciocínio do Jayme
  reasoning: string;              // parágrafo principal
  reasoning_points: string[];     // bullets adicionais
  jayme_quote: string;            // frase curta de abertura

  // Adaptação automática (próximo mesociclo)
  adaptation_hint?: string;
}

// ── Difficulty Score ──────────────────────────────────────────────────────────

function computeDifficultyScore(input: BuilderInput): number {
  let score = 0;

  // Base por nível de experiência
  const base = { beginner: 15, intermediate: 45, advanced: 72 };
  score += base[input.experience_level] ?? 15;

  // Anos de treino (+5 por ano extra, cap +15)
  if (input.training_years) {
    const extra = input.experience_level === 'beginner' ? 0
      : input.experience_level === 'intermediate' ? Math.min(input.training_years - 1, 2) * 5
      : Math.min(input.training_years - 3, 3) * 3;
    score += extra;
  }

  // Recovery score do Performance Engine
  if (input.recovery_score !== undefined) {
    if (input.recovery_score >= 80)      score += 8;
    else if (input.recovery_score >= 60) score += 3;
    else if (input.recovery_score < 40)  score -= 10;
    else if (input.recovery_score < 55)  score -= 5;
  }

  // Sono
  if (input.sleep_hours !== undefined) {
    if (input.sleep_hours >= 8)       score += 5;
    else if (input.sleep_hours < 6)   score -= 12;
    else if (input.sleep_hours < 7)   score -= 6;
  }

  // FC de repouso alta = estresse elevado
  if (input.resting_hr !== undefined && input.resting_hr > 70) score -= 8;

  // PRs recentes = progressão ativa
  if (input.has_pr_last_4_weeks) score += 7;

  // Muito tempo sem treinar
  if (input.days_since_last_workout !== undefined) {
    if (input.days_since_last_workout >= 14) score -= 15;
    else if (input.days_since_last_workout >= 7) score -= 7;
  }

  // Lesões ativas
  if (input.injuries && input.injuries.length > 0) score -= input.injuries.length * 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function difficultyLabel(score: number): DifficultyLabel {
  if (score >= 81) return 'Elite';
  if (score >= 61) return 'Difícil';
  if (score >= 31) return 'Moderado';
  return 'Fácil';
}

// ── Intensity Specs ───────────────────────────────────────────────────────────

interface IntensitySpec {
  rep_range: { min: number; max: number };
  rir_target: number;
  rest_compound_s: number;
  rest_isolation_s: number;
  sets_compound: number;
  sets_isolation: number;
  exercises_per_session: number;
}

function computeIntensitySpecs(goal: GoalType, score: number, level: ExperienceLevel, mins: number): IntensitySpec {
  const timeMultiplier = mins < 45 ? 0.7 : mins < 60 ? 0.85 : 1.0;

  // Base por objetivo
  const goalSpecs: Record<GoalType, Omit<IntensitySpec, 'sets_compound' | 'sets_isolation' | 'exercises_per_session'>> = {
    hypertrophy: { rep_range: { min: 8,  max: 15 }, rir_target: 2, rest_compound_s: 120, rest_isolation_s: 75  },
    strength:    { rep_range: { min: 3,  max: 6  }, rir_target: 1, rest_compound_s: 180, rest_isolation_s: 120 },
    weight_loss: { rep_range: { min: 12, max: 20 }, rir_target: 2, rest_compound_s: 75,  rest_isolation_s: 45  },
    definition:  { rep_range: { min: 10, max: 18 }, rir_target: 2, rest_compound_s: 90,  rest_isolation_s: 60  },
    recomp:      { rep_range: { min: 8,  max: 15 }, rir_target: 2, rest_compound_s: 90,  rest_isolation_s: 60  },
    running:     { rep_range: { min: 12, max: 20 }, rir_target: 3, rest_compound_s: 60,  rest_isolation_s: 45  },
    health:      { rep_range: { min: 10, max: 15 }, rir_target: 3, rest_compound_s: 90,  rest_isolation_s: 60  },
  };

  const base = goalSpecs[goal] ?? goalSpecs.hypertrophy;

  // Ajuste de RIR por score de dificuldade
  let rirAdjust = 0;
  if (score <= 30)      rirAdjust = +1;
  else if (score >= 81) rirAdjust = -1;
  const rir = Math.max(0, Math.min(4, base.rir_target + rirAdjust));

  // Séries por exercício por nível
  const setsCompound = { beginner: 3, intermediate: 4, advanced: 5 }[level] ?? 3;
  const setsIsolation = { beginner: 2, intermediate: 3, advanced: 4 }[level] ?? 2;

  // Exercícios por sessão por nível e tempo
  const exBase = { beginner: 5, intermediate: 6, advanced: 7 }[level] ?? 5;
  const exercises = Math.round(exBase * timeMultiplier);

  return {
    ...base,
    rir_target: rir,
    sets_compound: setsCompound,
    sets_isolation: setsIsolation,
    exercises_per_session: Math.max(4, Math.min(8, exercises)),
  };
}

// ── Split Selection ───────────────────────────────────────────────────────────

function selectSplit(days: number, level: ExperienceLevel, goal: GoalType): string {
  if (days <= 2) return 'Full Body A/B';
  if (days === 3) {
    if (level === 'beginner') return 'Full Body A/B/C';
    if (goal === 'strength')  return 'Push/Pull/Legs';
    return 'Upper/Lower/Full Body';
  }
  if (days === 4) {
    if (level === 'beginner')     return 'Full Body 4x';
    if (level === 'intermediate') return 'Upper/Lower';
    return 'Upper/Lower (frequência 2)';
  }
  if (days === 5) {
    if (level === 'beginner')     return 'Full Body 5x';
    if (level === 'intermediate') return 'Push/Pull/Legs + Upper/Lower';
    return 'PPL + Upper/Lower';
  }
  if (days === 6) {
    if (level === 'advanced') return 'Push/Pull/Legs × 2';
    return 'Upper/Lower × 3';
  }
  return 'Full Body';
}

// ── Volume Map ────────────────────────────────────────────────────────────────

function buildVolumeMap(
  goal: GoalType,
  score: number,
  level: ExperienceLevel,
  focus: MuscleGroup | null | undefined,
): Partial<Record<MuscleGroup, number>> {

  // Sets/semana base por nível
  const base = {
    beginner:     { compound: 8,  isolation: 6  },
    intermediate: { compound: 12, isolation: 10 },
    advanced:     { compound: 16, isolation: 14 },
  }[level] ?? { compound: 8, isolation: 6 };

  // Multiplicador por objetivo
  const mult: Record<GoalType, number> = {
    hypertrophy: 1.2,
    strength:    0.85,
    weight_loss: 0.9,
    definition:  1.0,
    recomp:      1.0,
    running:     0.75,
    health:      0.8,
  };
  const m = mult[goal] ?? 1.0;

  // Multiplicador por score
  const scoreMult = score <= 30 ? 0.8 : score >= 81 ? 1.15 : 1.0;
  const c = Math.round(base.compound * m * scoreMult);
  const iso = Math.round(base.isolation * m * scoreMult);

  const map: Partial<Record<MuscleGroup, number>> = {
    chest: c, back: c, legs: c, glutes: c,
    shoulders: Math.round(iso * 1.1), biceps: iso, triceps: iso,
    abs: iso, calves: iso, forearms: Math.round(iso * 0.6),
  };

  // Especialização: +40% no grupo foco
  if (focus && map[focus] !== undefined) {
    map[focus] = Math.round((map[focus] as number) * 1.4);
  }

  return map;
}

// ── Priority Muscles ──────────────────────────────────────────────────────────

function buildPriorityMuscles(goal: GoalType, focus: MuscleGroup | null | undefined): MuscleGroup[] {
  const goalPriority: Record<GoalType, MuscleGroup[]> = {
    hypertrophy: ['back', 'chest', 'legs', 'shoulders', 'biceps', 'triceps', 'glutes', 'abs'],
    strength:    ['legs', 'back', 'chest', 'shoulders', 'biceps', 'triceps', 'abs'],
    weight_loss: ['back', 'legs', 'chest', 'glutes', 'shoulders', 'biceps', 'triceps', 'abs'],
    definition:  ['back', 'chest', 'legs', 'glutes', 'shoulders', 'abs', 'biceps', 'triceps'],
    recomp:      ['back', 'legs', 'chest', 'glutes', 'shoulders', 'biceps', 'triceps', 'abs'],
    running:     ['legs', 'glutes', 'back', 'abs', 'chest', 'shoulders'],
    health:      ['back', 'legs', 'chest', 'abs', 'shoulders', 'glutes'],
  };
  const list = [...(goalPriority[goal] ?? goalPriority.hypertrophy)];
  if (focus) {
    const idx = list.indexOf(focus);
    if (idx > 0) { list.splice(idx, 1); list.unshift(focus); }
  }
  return list;
}

// ── Session Templates ─────────────────────────────────────────────────────────

function buildSessionTemplates(
  days: number,
  split: string,
  priority: MuscleGroup[],
  focus: MuscleGroup | null | undefined,
): SessionTemplate[] {
  const templates: SessionTemplate[] = [];

  const UPPER: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
  const LOWER: MuscleGroup[] = ['legs', 'glutes', 'calves', 'abs'];
  const PUSH:  MuscleGroup[] = ['chest', 'shoulders', 'triceps'];
  const PULL:  MuscleGroup[] = ['back', 'biceps', 'forearms'];

  const hasFocus = (groups: MuscleGroup[]) => !!focus && groups.includes(focus);

  if (split.startsWith('Full Body')) {
    const emphases: { label: string; extra: MuscleGroup[] }[] = [
      { label: 'Full Body A — ênfase Peito/Costas',   extra: ['chest', 'back'] },
      { label: 'Full Body B — ênfase Pernas/Glúteos', extra: ['legs', 'glutes'] },
      { label: 'Full Body C — ênfase Ombros/Braços',  extra: ['shoulders', 'biceps', 'triceps'] },
    ];
    for (let i = 0; i < Math.min(days, 3); i++) {
      const e = emphases[i % emphases.length];
      const groups: MuscleGroup[] = [...(e.extra as MuscleGroup[]), ...UPPER.filter(m => !e.extra.includes(m)), ...LOWER.filter(m => !e.extra.includes(m))];
      templates.push({ day_index: i, focus_label: e.label, muscle_groups: groups.slice(0, 6) as MuscleGroup[], intensity: i === 0 ? 'high' : 'medium', is_focus_day: hasFocus(groups) });
    }
    for (let i = 3; i < days; i++) {
      const e = emphases[i % emphases.length];
      templates.push({ day_index: i, focus_label: `Full Body ${String.fromCharCode(65 + i)} — ênfase ${e.label.split(' — ênfase ')[1]}`, muscle_groups: [...e.extra as MuscleGroup[], 'back', 'legs'] as MuscleGroup[], intensity: 'medium', is_focus_day: hasFocus([...(e.extra as MuscleGroup[])]) });
    }
  } else if (split.includes('Upper/Lower') && !split.includes('PPL')) {
    const pairs = [
      { label: 'Upper A — Peito/Costas', groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] as MuscleGroup[], intensity: 'high' as const },
      { label: 'Lower A — Quad/Glúteos', groups: ['legs', 'glutes', 'calves', 'abs'] as MuscleGroup[], intensity: 'high' as const },
      { label: 'Upper B — Costas/Ombros', groups: ['back', 'chest', 'shoulders', 'triceps', 'biceps'] as MuscleGroup[], intensity: 'medium' as const },
      { label: 'Lower B — Post/Panturrilha', groups: ['legs', 'glutes', 'calves', 'abs'] as MuscleGroup[], intensity: 'medium' as const },
    ];
    for (let i = 0; i < days; i++) {
      const t = pairs[i % pairs.length];
      templates.push({ day_index: i, focus_label: t.label, muscle_groups: t.groups, intensity: t.intensity, is_focus_day: hasFocus(t.groups) });
    }
  } else if (split.includes('Push/Pull/Legs') || split.includes('PPL')) {
    const cycle = [
      { label: 'Push — Peito/Ombros/Tríceps', groups: PUSH, intensity: 'high' as const },
      { label: 'Pull — Costas/Bíceps',        groups: PULL, intensity: 'high' as const },
      { label: 'Legs — Pernas/Glúteos',       groups: LOWER, intensity: 'high' as const },
      { label: 'Push B — Volume',             groups: PUSH, intensity: 'medium' as const },
      { label: 'Pull B — Volume',             groups: PULL, intensity: 'medium' as const },
      { label: 'Legs B + Abs',                groups: [...LOWER, 'abs'] as MuscleGroup[], intensity: 'medium' as const },
    ];
    for (let i = 0; i < days; i++) {
      const t = cycle[i % cycle.length];
      templates.push({ day_index: i, focus_label: t.label, muscle_groups: t.groups as MuscleGroup[], intensity: t.intensity, is_focus_day: hasFocus(t.groups as MuscleGroup[]) });
    }
  } else {
    // Fallback: alternating upper/lower
    for (let i = 0; i < days; i++) {
      const isUpper = i % 2 === 0;
      const groups = isUpper ? UPPER : LOWER;
      templates.push({ day_index: i, focus_label: isUpper ? `Upper ${String.fromCharCode(65 + Math.floor(i / 2))}` : `Lower ${String.fromCharCode(65 + Math.floor(i / 2))}`, muscle_groups: groups as MuscleGroup[], intensity: i < 2 ? 'high' : 'medium', is_focus_day: hasFocus(groups as MuscleGroup[]) });
    }
  }

  // Se há foco muscular e nenhuma sessão é focus_day, adicionar ao primeiro dia
  if (focus && !templates.some(t => t.is_focus_day)) {
    const first = templates[0];
    if (!first.muscle_groups.includes(focus)) {
      first.muscle_groups.unshift(focus);
      first.focus_label += ` +${focusLabel(focus)}`;
      first.is_focus_day = true;
    }
  }

  return templates;
}

function focusLabel(m: MuscleGroup): string {
  const map: Record<MuscleGroup, string> = { chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', legs: 'Pernas', glutes: 'Glúteos', abs: 'Abdômen', calves: 'Panturrilha', forearms: 'Antebraço' };
  return map[m] ?? m;
}

// ── Reasoning Generator ───────────────────────────────────────────────────────

function buildReasoning(input: BuilderInput, output: Omit<BuilderOutput, 'reasoning' | 'reasoning_points' | 'jayme_quote' | 'adaptation_hint'>): { reasoning: string; reasoning_points: string[]; jayme_quote: string; adaptation_hint?: string } {
  const levelPt = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' }[input.experience_level] ?? 'Iniciante';
  const goalPt  = { hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', definition: 'Definição', strength: 'Força', recomp: 'Recomposição Corporal', running: 'Corrida', health: 'Saúde' }[input.goal] ?? input.goal;
  const splitName = output.split_type;

  const reasoning = `Você recebeu uma divisão ${splitName} porque possui nível ${levelPt}, treina ${input.days_per_week}x por semana e seu objetivo é ${goalPt}. O score de dificuldade calculado é ${output.difficulty_score}/100 (${output.difficulty_label}), considerando seu histórico de recuperação, progressão recente e disponibilidade.`;

  const points: string[] = [];

  // Split rationale
  if (input.days_per_week >= 4 && input.experience_level !== 'beginner') {
    points.push(`Frequência 2 aplicada: cada grupo muscular é treinado ${input.experience_level === 'advanced' ? '2×' : '1–2×'} por semana para maximizar a síntese proteica sem comprometer a recuperação.`);
  }

  // Volume
  const weeklyChestSets = output.volume_map.chest ?? 0;
  if (weeklyChestSets > 0) {
    points.push(`Volume semanal alvo: ${weeklyChestSets} séries para grupos compostos principais — dentro da faixa ótima para atletas naturais.`);
  }

  // RIR
  points.push(`Intensidade: RIR ${output.rir_target} (${output.rir_target === 0 ? 'falha' : output.rir_target === 1 ? 'muito próximo da falha' : output.rir_target <= 2 ? '1–2 reps na reserva' : '3–4 reps na reserva — ênfase em técnica'}) por série de trabalho.`);

  // Recovery
  if (input.sleep_hours !== undefined && input.sleep_hours < 7) {
    points.push(`Sono abaixo do ideal (${input.sleep_hours}h): volume reduzido automaticamente para respeitar a capacidade de recuperação atual.`);
  }
  if (input.recovery_score !== undefined && input.recovery_score < 50) {
    points.push(`Recovery Score baixo (${input.recovery_score}/100): dificuldade reduzida para evitar sobretreinamento.`);
  }

  // Focus muscle
  if (input.focus_muscle) {
    points.push(`Especialização em ${focusLabel(input.focus_muscle)}: volume +40% e prioridade de posição nas sessões.`);
  }

  // Goal-specific
  if (input.goal === 'weight_loss' || input.goal === 'definition') {
    points.push('Descanso encurtado entre séries para elevar o gasto calórico da sessão sem sacrificar carga.');
  }
  if (input.goal === 'hypertrophy' && input.experience_level === 'advanced') {
    points.push('Top Sets + Back-Off Sets aplicados nos compostos principais: máxima tensão mecânica + volume acumulado na mesma sessão.');
  }
  if (input.goal === 'strength') {
    points.push('Ênfase em cargas elevadas (3–6 reps) com longas recuperações para permitir expressão máxima de força.');
  }

  // Injuries
  if (input.injuries && input.injuries.length > 0) {
    points.push(`Lesões registradas (${input.injuries.join(', ')}): exercícios de alto impacto articular serão substituídos automaticamente.`);
  }

  // Jayme quote
  let quote = `Com base no seu objetivo, experiência, composição corporal e recuperação, este é o treino que maximiza seus resultados como atleta natural.`;
  if (input.goal === 'hypertrophy' && input.experience_level === 'advanced') quote = `Você está no nível onde os detalhes importam. Volume controlado, Top Sets executados perto da falha e recuperação completa entre os ciclos.`;
  if (input.goal === 'weight_loss') quote = `Preservar músculo e aumentar gasto energético. Esse é o caminho mais eficiente para o emagrecimento sustentável como atleta natural.`;
  if (input.experience_level === 'beginner') quote = `No começo, qualquer progressão bem feita funciona. Foco na técnica, consistência e progressão linear — esses três pilares mudam tudo.`;

  // Adaptation hint para próximo mesociclo
  let adaptHint: string | undefined;
  if (input.has_pr_last_4_weeks && input.recovery_score && input.recovery_score >= 70) {
    adaptHint = 'No próximo mesociclo: adicionar +1 série por grupo principal e elevar a meta de progressão de carga em 2,5kg nos compostos.';
  } else if (!input.has_pr_last_4_weeks && input.recovery_score && input.recovery_score >= 60) {
    adaptHint = 'Sem PRs recentes com boa recuperação: próximo mesociclo deve focar em deload 1 semana seguido de re-teste de cargas máximas.';
  } else if (input.recovery_score !== undefined && input.recovery_score < 50) {
    adaptHint = 'Recuperação comprometida: manter volume atual por mais 2 semanas antes de progredir. Priorizar sono e nutrição.';
  }

  return { reasoning, reasoning_points: points, jayme_quote: quote, adaptation_hint: adaptHint };
}

// ── Main Builder ──────────────────────────────────────────────────────────────

export function buildWorkout(input: BuilderInput): BuilderOutput {
  const score = computeDifficultyScore(input);
  const label = difficultyLabel(score);
  const mins  = input.minutes_per_session ?? 60;

  const specs   = computeIntensitySpecs(input.goal, score, input.experience_level, mins);
  const split   = selectSplit(input.days_per_week, input.experience_level, input.goal);
  const volMap  = buildVolumeMap(input.goal, score, input.experience_level, input.focus_muscle);
  const prio    = buildPriorityMuscles(input.goal, input.focus_muscle);
  const sessions= buildSessionTemplates(input.days_per_week, split, prio, input.focus_muscle ?? null);

  const partial: Omit<BuilderOutput, 'reasoning' | 'reasoning_points' | 'jayme_quote' | 'adaptation_hint'> = {
    split_type: split,
    difficulty_score: score,
    difficulty_label: label,
    exercises_per_session: specs.exercises_per_session,
    sets_per_compound: specs.sets_compound,
    sets_per_isolation: specs.sets_isolation,
    rep_range: specs.rep_range,
    rir_target: specs.rir_target,
    rest_compound_s: specs.rest_compound_s,
    rest_isolation_s: specs.rest_isolation_s,
    volume_map: volMap,
    priority_muscles: prio,
    sessions,
  };

  const { reasoning, reasoning_points, jayme_quote, adaptation_hint } = buildReasoning(input, partial);

  return { ...partial, reasoning, reasoning_points, jayme_quote, adaptation_hint };
}

// ── Format for AI prompt ──────────────────────────────────────────────────────

export function formatBuilderOutputForAI(out: BuilderOutput, input: BuilderInput): string {
  const focusPt = input.focus_muscle ? `Especialização: ${focusLabel(input.focus_muscle)} (prioridade máxima).` : '';
  const injuryPt = input.injuries?.length ? `Lesões/restrições: ${input.injuries.join(', ')}.` : '';
  const lines = [
    `PLANO ESTRUTURADO EDN:`,
    `Divisão: ${out.split_type} | Score: ${out.difficulty_score}/100 (${out.difficulty_label})`,
    `Séries/compostos: ${out.sets_per_compound} | Séries/isolados: ${out.sets_per_isolation}`,
    `Reps: ${out.rep_range.min}–${out.rep_range.max} | RIR alvo: ${out.rir_target}`,
    `Descanso: compostos=${out.rest_compound_s}s isolados=${out.rest_isolation_s}s`,
    `Exercícios/sessão: ${out.exercises_per_session}`,
    `Músculos prioritários: ${out.priority_muscles.slice(0, 5).map(focusLabel).join(' > ')}`,
    focusPt, injuryPt,
    `SESSÕES:`,
    ...out.sessions.map(s => `  Dia ${s.day_index}: ${s.focus_label} [${s.intensity.toUpperCase()}] grupos: ${s.muscle_groups.map(focusLabel).join(', ')}`),
  ].filter(Boolean);
  return lines.join('\n');
}
