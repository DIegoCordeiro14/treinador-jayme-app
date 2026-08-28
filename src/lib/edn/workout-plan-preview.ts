// workout-plan-preview.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCOS 20, 21 e 22 — Preview/simulação do plano, "Por que este treino?" e
// diff entre versões.
//
// Consolida um resumo legível ANTES de salvar: distribuição por dia, volume e
// frequência por grupo, quality score e a justificativa (bullets vindos dos
// motores). E compara com o plano anterior para mostrar o que mudou e por quê.
// Puro/determinístico — só formata dados já computados.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkoutQualityScore } from './workout-quality-score';

export interface PreviewExercise {
  exercise_id: string;
  name: string;
  muscle_group: string;
  sets: number;
}

export interface PreviewDay { label: string; exercises: PreviewExercise[]; }

export interface PlanPreviewInput {
  days: PreviewDay[];
  quality: WorkoutQualityScore;
  rationaleBullets: string[];     // vindos do snapshot + motores
}

export interface PlanPreview {
  total_exercises: number;
  total_weekly_sets: number;
  weekly_volume: Record<string, number>;
  weekly_frequency: Record<string, number>;
  quality_score: number;
  why_bullets: string[];
  warnings: string[];
}

export function buildPlanPreview(input: PlanPreviewInput): PlanPreview {
  const weekly: Record<string, number> = {};
  const freq: Record<string, number> = {};
  let totalEx = 0;
  let totalSets = 0;

  for (const d of input.days) {
    const seen = new Set<string>();
    for (const e of d.exercises) {
      totalEx++;
      totalSets += e.sets ?? 0;
      weekly[e.muscle_group] = (weekly[e.muscle_group] ?? 0) + (e.sets ?? 0);
      if (!seen.has(e.muscle_group)) { freq[e.muscle_group] = (freq[e.muscle_group] ?? 0) + 1; seen.add(e.muscle_group); }
    }
  }

  const warnings = input.quality.issues
    .filter((i) => i.severity !== 'low')
    .map((i) => i.message);

  return {
    total_exercises: totalEx,
    total_weekly_sets: totalSets,
    weekly_volume: weekly,
    weekly_frequency: freq,
    quality_score: input.quality.score,
    why_bullets: input.rationaleBullets,
    warnings,
  };
}

// ── Bloco 22 — diff entre versões ────────────────────────────────────────────

export interface VersionExercise { exercise_id: string; name: string; muscle_group: string; }

export interface PlanDiff {
  added: VersionExercise[];
  removed: VersionExercise[];
  kept: VersionExercise[];
  change_ratio: number;           // fração alterada
  summary: string;
}

export function diffPlans(
  previous: VersionExercise[],
  next: VersionExercise[],
  reasonsByExercise?: Record<string, string>
): PlanDiff {
  const prevIds = new Set(previous.map((e) => e.exercise_id));
  const nextIds = new Set(next.map((e) => e.exercise_id));
  const added = next.filter((e) => !prevIds.has(e.exercise_id));
  const removed = previous.filter((e) => !nextIds.has(e.exercise_id));
  const kept = next.filter((e) => prevIds.has(e.exercise_id));
  const base = Math.max(1, previous.length);
  const change_ratio = Math.round((Math.max(added.length, removed.length) / base) * 100) / 100;

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} adicionado(s)`);
  if (removed.length) parts.push(`${removed.length} removido(s)`);
  parts.push(`${kept.length} mantido(s)`);
  let summary = parts.join(', ') + '.';
  if (reasonsByExercise) {
    const notes = removed
      .map((e) => reasonsByExercise[e.exercise_id])
      .filter(Boolean);
    if (notes.length) summary += ' Motivos: ' + notes.slice(0, 3).join('; ') + '.';
  }

  return { added, removed, kept, change_ratio, summary };
}
