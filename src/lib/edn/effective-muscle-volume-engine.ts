// effective-muscle-volume-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §7 — Effective Muscle Volume (direto + contribuição indireta).
//
// Volume efetivo = séries diretas + contribuição indireta de compostos. Evita
// erros como inflar bíceps (que já recebe muito de puxadas/remadas) ou tríceps
// (de supinos/desenvolvimentos). Contribuições configuráveis e determinísticas.
// ─────────────────────────────────────────────────────────────────────────────

export type MovementKind =
  | 'horizontal_push' | 'vertical_push' | 'horizontal_pull' | 'vertical_pull'
  | 'squat' | 'hinge' | 'lunge' | 'isolation';

// Fração de estímulo indireto que cada padrão entrega a músculos secundários.
// (0..1 por série do exercício composto)
export const INDIRECT_CONTRIBUTION: Record<string, { muscle: string; fraction: number }[]> = {
  horizontal_push: [{ muscle: 'triceps', fraction: 0.5 }, { muscle: 'shoulders', fraction: 0.33 }],
  vertical_push: [{ muscle: 'triceps', fraction: 0.4 }],
  horizontal_pull: [{ muscle: 'biceps', fraction: 0.4 }, { muscle: 'forearms', fraction: 0.25 }],
  vertical_pull: [{ muscle: 'biceps', fraction: 0.5 }, { muscle: 'forearms', fraction: 0.25 }],
  squat: [{ muscle: 'glutes', fraction: 0.4 }, { muscle: 'calves', fraction: 0.15 }],
  hinge: [{ muscle: 'glutes', fraction: 0.5 }, { muscle: 'back', fraction: 0.25 }],
  lunge: [{ muscle: 'glutes', fraction: 0.45 }, { muscle: 'calves', fraction: 0.15 }],
  isolation: [],
};

export interface PlannedExerciseVolume {
  muscle_group: string;              // alvo primário
  pattern: MovementKind;
  sets: number;
}

export interface EffectiveVolumeResult {
  direct: Record<string, number>;    // séries diretas por grupo
  indirect: Record<string, number>; // séries efetivas indiretas por grupo
  effective: Record<string, number>; // direto + indireto (arredondado 0.1)
}

export function computeEffectiveVolume(exercises: PlannedExerciseVolume[]): EffectiveVolumeResult {
  const direct: Record<string, number> = {};
  const indirect: Record<string, number> = {};

  for (const ex of exercises) {
    direct[ex.muscle_group] = (direct[ex.muscle_group] ?? 0) + ex.sets;
    const contribs = INDIRECT_CONTRIBUTION[ex.pattern] ?? [];
    for (const c of contribs) {
      if (c.muscle === ex.muscle_group) continue; // não duplica no próprio alvo
      indirect[c.muscle] = (indirect[c.muscle] ?? 0) + ex.sets * c.fraction;
    }
  }

  const effective: Record<string, number> = {};
  const muscles = new Set([...Object.keys(direct), ...Object.keys(indirect)]);
  for (const m of muscles) {
    effective[m] = Math.round(((direct[m] ?? 0) + (indirect[m] ?? 0)) * 10) / 10;
  }
  // arredonda indireto p/ leitura
  for (const m of Object.keys(indirect)) indirect[m] = Math.round(indirect[m] * 10) / 10;

  return { direct, indirect, effective };
}

// Sugere quanto de volume DIRETO adicional um músculo precisa para atingir um
// alvo de volume EFETIVO, descontando o que já chega de indireto.
export function directSetsNeededForEffectiveTarget(
  muscle: string,
  effectiveTarget: number,
  current: EffectiveVolumeResult
): number {
  const indirect = current.indirect[muscle] ?? 0;
  const need = effectiveTarget - indirect;
  return Math.max(0, Math.round(need));
}
