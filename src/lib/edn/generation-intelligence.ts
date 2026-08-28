// generation-intelligence.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCOS 24 + integração — Orquestrador determinístico da GERAÇÃO v2.
//
// Compõe os motores das Etapas 1-5 numa única função pura. A rota busca os dados
// e a segurança JÁ filtrou o catálogo (só candidatos seguros chegam aqui). A
// saída é (a) um bloco de texto que a IA usa para ORGANIZAR candidatos já
// rankeados, e (b) um objeto estruturado para o preview/"por que este treino".
// A IA nunca inventa números: cargas/volumes/frequências vêm daqui.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildAthleteTrainingSnapshot,
  type SnapshotSetRow,
  type SnapshotProfile,
  type SnapshotConditionRestriction,
} from './athlete-training-snapshot';
import { analyzeExerciseHistory, retainedExerciseIds, exercisesToSwap } from './exercise-history-intelligence';
import { pickRotation, type RotationCandidate } from './exercise-rotation-engine';
import { planMuscleVolume, type VolumeLandmarks } from './muscle-volume-intelligence';
import { bestSplit } from './split-generation-engine';
import { rankBySuitability, type SuitabilityExercise } from './exercise-suitability-score';
import { analyzeStagnation } from './stagnation-engine';

export interface GenerationIntelligenceInput {
  profile: SnapshotProfile;
  sets: SnapshotSetRow[];
  candidates: (SuitabilityExercise & RotationCandidate)[]; // catálogo seguro
  weakPoints?: string[];
  recovery?: 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
  cardio?: { sessions_last_7d: number; minutes_last_7d: number; interfering_muscles: string[] };
  restrictions?: SnapshotConditionRestriction[];
  cautionExerciseIds?: string[];
  likedIds?: string[];
  dislikedIds?: string[];
  individualLandmarks?: Record<string, VolumeLandmarks>;
  nowMs?: number;
}

export interface SwapSuggestion {
  from_id: string;
  from_name: string;
  action: 'rotate' | 'replace';
  to_id: string | null;
  to_name: string | null;
  reason: string;
}

export interface GenerationIntelligence {
  promptBlock: string;
  snapshotBullets: string[];
  split: ReturnType<typeof bestSplit>;
  volumePlan: ReturnType<typeof planMuscleVolume>;
  retainedIds: string[];
  swaps: SwapSuggestion[];
  stagnation: ReturnType<typeof analyzeStagnation>;
  topSuitable: { id: string; name: string; score: number }[];
}

export function buildGenerationIntelligence(input: GenerationIntelligenceInput): GenerationIntelligence {
  const recovery = input.recovery ?? 'good';

  // 1) Snapshot
  const snapshot = buildAthleteTrainingSnapshot({
    profile: input.profile,
    sets: input.sets,
    recovery: { category: recovery },
    cardio: input.cardio,
    restrictions: input.restrictions,
    nowMs: input.nowMs,
  });

  // 2) Decisões por exercício + retenção
  const decisions = analyzeExerciseHistory({ exercises: snapshot.perExercise, recovery });
  const retainedIds = retainedExerciseIds(decisions);
  const toSwap = exercisesToSwap(decisions);

  // 3) Rotação para os que saem (preservando padrão biomecânico)
  const swaps: SwapSuggestion[] = toSwap.map((d) => {
    const target = input.candidates.find((c) => c.id === d.exercise_id) ?? {
      id: d.exercise_id, name: d.exercise_name, muscle_group: d.muscle_group, equipment: 'machine',
    };
    const rot = pickRotation(target as RotationCandidate, input.candidates, retainedIds);
    return {
      from_id: d.exercise_id,
      from_name: d.exercise_name,
      action: d.action === 'replace' ? 'replace' : 'rotate',
      to_id: rot.replacement?.id ?? null,
      to_name: rot.replacement?.name ?? null,
      reason: d.reason + (rot.replacement ? ` → ${rot.reason}` : ' (sem substituto ideal — manter).'),
    };
  });

  // 4) Volume + frequência por grupo
  const volumePlan = planMuscleVolume({
    muscles: snapshot.perMuscle.map((m) => ({
      muscle_group: m.muscle_group,
      weekly_sets: m.weekly_sets,
      sessions_per_week: m.sessions_per_week,
    })),
    experience: input.profile.experience,
    weakPoints: input.weakPoints,
    recovery,
    cardioInterferenceMuscles: snapshot.cardioInterferenceMuscles,
    individualLandmarks: input.individualLandmarks,
  });

  // 5) Split recomendado
  const split = bestSplit({
    days_per_week: input.profile.days_per_week,
    experience: input.profile.experience,
    recovery,
    cardio_days: input.cardio?.sessions_last_7d ?? 0,
    weak_point: input.weakPoints?.[0] ?? null,
  });

  // 6) Suitability dos candidatos
  const musclePriority = split ? Object.entries(split.weekly_frequency).sort((a, b) => b[1] - a[1]).map(([m]) => m) : [];
  const suitability = rankBySuitability(input.candidates, {
    objective: input.profile.objective,
    experience: input.profile.experience,
    available_equipment: input.profile.available_equipment,
    muscle_priority: musclePriority,
    weak_points: input.weakPoints,
    liked_ids: input.likedIds,
    disliked_ids: input.dislikedIds,
    retained_ids: retainedIds,
    recent_ids: snapshot.perExercise.map((e) => e.exercise_id),
    caution_ids: input.cautionExerciseIds,
  });
  const topSuitable = suitability.slice(0, 20).map((s) => ({ id: s.id, name: s.name, score: s.score }));

  // 7) Estagnação
  const stagnation = analyzeStagnation({
    exercises: snapshot.perExercise.map((e) => ({
      exercise_id: e.exercise_id, exercise_name: e.exercise_name, muscle_group: e.muscle_group,
      trend: e.trend, weeks_stagnant: e.weeks_stagnant,
    })),
    volume: volumePlan.map((v) => ({ muscle_group: v.muscle_group, status: v.status })),
    recovery,
    sleep_h: snapshot.recovery.sleep_h ?? null,
  });

  // ── Bloco de prompt (compacto) ──
  const lines: string[] = [];
  lines.push('INTELIGÊNCIA DE GERAÇÃO v2 (determinística — respeite estes números, NÃO invente):');
  if (split) {
    lines.push(`• Split recomendado: ${split.name}. ${split.reason}`);
  }
  const volLines = volumePlan
    .slice(0, 12)
    .map((v) => `${v.muscle_group}=${v.target_weekly_sets}séries/sem (${v.recommended_frequency}x)${v.is_weak_point ? ' [PONTO FRACO]' : ''}`);
  if (volLines.length) lines.push('• Volume-alvo por grupo: ' + volLines.join('; ') + '.');
  if (retainedIds.length) {
    const names = decisions.filter((d) => d.retain).slice(0, 10).map((d) => d.exercise_name);
    lines.push('• MANTER (boa progressão/familiaridade): ' + names.join(', ') + '.');
  }
  const realSwaps = swaps.filter((s) => s.to_id);
  if (realSwaps.length) {
    lines.push('• ROTACIONAR/SUBSTITUIR: ' + realSwaps.slice(0, 8).map((s) => `${s.from_name}→${s.to_name}`).join('; ') + '.');
  }
  if (topSuitable.length) {
    lines.push('• Candidatos mais adequados (id|nome|score): ' + topSuitable.slice(0, 12).map((s) => `${s.id}|${s.name}|${s.score}`).join(' , ') + '.');
  }
  if (stagnation.stagnated) {
    lines.push('• Estagnação: ' + stagnation.summary + ' Ordem de ação: ' + stagnation.actions.slice(0, 3).map((a) => a.kind).join(' → ') + '.');
  }
  for (const b of snapshot.summaryBullets) lines.push('• ' + b);

  return {
    promptBlock: '\n' + lines.join('\n'),
    snapshotBullets: snapshot.summaryBullets,
    split,
    volumePlan,
    retainedIds,
    swaps,
    stagnation,
    topSuitable,
  };
}
