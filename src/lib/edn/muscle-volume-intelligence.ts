// muscle-volume-intelligence.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCOS 5, 6 e 7 — Inteligência de VOLUME e FREQUÊNCIA por grupo muscular.
//
// A partir do volume REAL recente (perMuscle do snapshot) e dos landmarks
// individuais (MEV/MAV/MRV), decide de forma determinística:
//   - status do volume atual (abaixo/ótimo/excesso)
//   - volume-alvo de séries/semana para o próximo bloco
//   - frequência recomendada (1x/2x/3x por semana)
// Respeita: pontos fracos (viés de volume ↑), recuperação baixa e interferência
// de cardio (viés ↓). Não inventa números — usa landmarks + regras.
// ─────────────────────────────────────────────────────────────────────────────

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export interface VolumeLandmarks {
  mev: number; // minimum effective volume (sets/week)
  mav: number; // maximum adaptive volume
  mrv: number; // maximum recoverable volume
}

export interface MuscleVolumeState {
  muscle_group: string;
  weekly_sets: number;      // volume real recente
  sessions_per_week: number;
}

export type VolumeStatus =
  | 'below_mev'
  | 'at_mev'
  | 'optimal'
  | 'near_mrv'
  | 'over_mrv';

export interface MuscleVolumePlan {
  muscle_group: string;
  current_weekly_sets: number;
  status: VolumeStatus;
  landmarks: VolumeLandmarks;
  target_weekly_sets: number;
  recommended_frequency: 1 | 2 | 3;
  is_weak_point: boolean;
  reason: string;
}

export interface VolumeIntelligenceInput {
  muscles: MuscleVolumeState[];
  experience: ExperienceLevel;
  weakPoints?: string[];                       // grupos priorizados
  recovery?: RecoveryCategory;
  cardioInterferenceMuscles?: string[];        // grupos afetados por cardio
  individualLandmarks?: Record<string, VolumeLandmarks>; // override do training-response-profile
}

// Landmarks base (intermediário) em séries/semana. Fonte: literatura de
// hipertrofia (faixas conservadoras). São ajustados por experiência.
const BASE_LANDMARKS: Record<string, VolumeLandmarks> = {
  chest: { mev: 10, mav: 16, mrv: 22 },
  back: { mev: 10, mav: 18, mrv: 25 },
  shoulders: { mev: 8, mav: 16, mrv: 24 },
  biceps: { mev: 8, mav: 14, mrv: 20 },
  triceps: { mev: 8, mav: 14, mrv: 20 },
  legs: { mev: 10, mav: 18, mrv: 25 },
  glutes: { mev: 6, mav: 12, mrv: 18 },
  abs: { mev: 6, mav: 16, mrv: 25 },
  calves: { mev: 8, mav: 14, mrv: 20 },
  forearms: { mev: 6, mav: 12, mrv: 18 },
  full_body: { mev: 10, mav: 18, mrv: 25 },
};

const DEFAULT_LM: VolumeLandmarks = { mev: 8, mav: 14, mrv: 20 };

function experienceScale(exp: ExperienceLevel): number {
  // iniciantes toleram/precisam menos volume; avançados um pouco mais
  if (exp === 'beginner') return 0.7;
  if (exp === 'advanced') return 1.1;
  return 1.0;
}

export function landmarksFor(
  muscle: string,
  exp: ExperienceLevel,
  override?: VolumeLandmarks
): VolumeLandmarks {
  if (override) return override;
  const base = BASE_LANDMARKS[muscle] ?? DEFAULT_LM;
  const s = experienceScale(exp);
  return {
    mev: Math.round(base.mev * s),
    mav: Math.round(base.mav * s),
    mrv: Math.round(base.mrv * s),
  };
}

function statusFor(sets: number, lm: VolumeLandmarks): VolumeStatus {
  if (sets < lm.mev) return 'below_mev';
  if (sets < lm.mev + 2) return 'at_mev';
  if (sets <= lm.mav) return 'optimal';
  if (sets <= lm.mrv) return 'near_mrv';
  return 'over_mrv';
}

function frequencyForSets(sets: number): 1 | 2 | 3 {
  // manter ~6-9 séries de qualidade por sessão
  if (sets <= 9) return 1;
  if (sets <= 16) return 2;
  return 3;
}

export function planMuscleVolume(input: VolumeIntelligenceInput): MuscleVolumePlan[] {
  const recovery = input.recovery ?? 'good';
  const weak = new Set(input.weakPoints ?? []);
  const cardioHit = new Set(input.cardioInterferenceMuscles ?? []);
  const recoveryPoor = recovery === 'low' || recovery === 'critical';

  return input.muscles.map((m) => {
    const lm = landmarksFor(m.muscle_group, input.experience, input.individualLandmarks?.[m.muscle_group]);
    const status = statusFor(m.weekly_sets, lm);
    const isWeak = weak.has(m.muscle_group);
    const cardioAffected = cardioHit.has(m.muscle_group);

    // volume-alvo base: caminhar em direção a MAV, sem ultrapassar MRV
    let target: number;
    const reasons: string[] = [];

    if (status === 'below_mev') {
      target = lm.mev + 2;
      reasons.push(`Abaixo do MEV (${lm.mev}) — subir para estímulo mínimo efetivo.`);
    } else if (status === 'at_mev' || status === 'optimal') {
      // progressão de volume: +1 a +2 séries rumo ao MAV
      target = Math.min(lm.mav, m.weekly_sets + 2);
      reasons.push(`Na faixa produtiva — progredir volume rumo ao MAV (${lm.mav}).`);
    } else if (status === 'near_mrv') {
      target = lm.mav; // recuar para MAV
      reasons.push(`Perto do MRV (${lm.mrv}) — recuar para MAV (${lm.mav}) para sustentar.`);
    } else {
      target = lm.mev; // acima do MRV: deload de volume
      reasons.push(`Acima do MRV (${lm.mrv}) — deload de volume para MEV.`);
    }

    // ponto fraco: viés para o topo da faixa produtiva
    if (isWeak && status !== 'over_mrv') {
      target = Math.min(lm.mrv, Math.max(target, lm.mav));
      reasons.push('Ponto fraco — priorizar volume no topo da faixa adaptativa.');
    }

    // recuperação baixa: conter
    if (recoveryPoor) {
      target = Math.max(lm.mev, target - 2);
      reasons.push('Recuperação baixa — conter volume nesta semana.');
    }

    // cardio interfere (ex.: pernas em corredor): conter levemente
    if (cardioAffected) {
      target = Math.max(lm.mev, target - 1);
      reasons.push('Cardio interfere neste grupo — leve redução de volume.');
    }

    target = Math.max(0, Math.round(target));
    const frequency = frequencyForSets(target);

    return {
      muscle_group: m.muscle_group,
      current_weekly_sets: m.weekly_sets,
      status,
      landmarks: lm,
      target_weekly_sets: target,
      recommended_frequency: frequency,
      is_weak_point: isWeak,
      reason: reasons.join(' '),
    };
  });
}
