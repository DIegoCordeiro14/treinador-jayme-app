// training-response-derivation.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §9 (write path) — Deriva o Training Response Profile a partir do histórico.
//
// A partir de janelas recentes por grupo muscular (volume aplicado x desfecho de
// progressão), produz observações e chama learnResponseProfile para estimar
// MEV/MAV/MRV individuais + tipo de resposta + confiança. Puro/determinístico.
// A rota persiste o resultado em training_response_profiles.
// ─────────────────────────────────────────────────────────────────────────────

import { learnResponseProfile, type ResponseObservation, type MuscleResponseProfile, type VolumeLandmarks } from './training-response-profile';

export interface MuscleBlockPoint {
  muscle_group: string;
  weekly_sets: number;
  outcome: 'progressed' | 'maintained' | 'regressed';
  recovery_ok: boolean;
}

export interface DerivationInput {
  baseLandmarks: Record<string, VolumeLandmarks>;   // dos landmarks populacionais
  blocks: MuscleBlockPoint[];                        // observações por bloco/janela
}

export interface DerivedProfileRow {
  muscle_group: string;
  estimated_mev: number;
  estimated_mav: number;
  estimated_mrv: number;
  volume_response: string;      // responder type
  confidence_score: number;     // 0..100
  observations: number;
}

export function deriveResponseProfiles(input: DerivationInput): DerivedProfileRow[] {
  const observations: ResponseObservation[] = input.blocks.map((b) => ({
    muscle_group: b.muscle_group, weekly_sets: b.weekly_sets, outcome: b.outcome, recovery_ok: b.recovery_ok,
  }));
  const profiles = learnResponseProfile({ baseLandmarks: input.baseLandmarks, observations });

  const countByMuscle = new Map<string, number>();
  for (const b of input.blocks) countByMuscle.set(b.muscle_group, (countByMuscle.get(b.muscle_group) ?? 0) + 1);

  const rows: DerivedProfileRow[] = [];
  for (const [mg, p] of Object.entries(profiles)) {
    const obs = countByMuscle.get(mg) ?? 0;
    if (obs === 0) continue; // só persiste grupos com evidência
    rows.push({
      muscle_group: mg,
      estimated_mev: p.individual_landmarks.mev,
      estimated_mav: p.individual_landmarks.mav,
      estimated_mrv: p.individual_landmarks.mrv,
      volume_response: p.responder,
      confidence_score: Math.round(p.confidence * 100),
      observations: obs,
    });
  }
  return rows;
}

// Converte linhas persistidas de volta em landmarks individuais para a geração.
export function rowsToIndividualLandmarks(
  rows: { muscle_group: string; estimated_mev: number | null; estimated_mav: number | null; estimated_mrv: number | null; confidence_score: number | null }[]
): Record<string, VolumeLandmarks> {
  const out: Record<string, VolumeLandmarks> = {};
  for (const r of rows) {
    if ((r.confidence_score ?? 0) < 40) continue; // baixa confiança usa populacional
    if (r.estimated_mev == null || r.estimated_mav == null || r.estimated_mrv == null) continue;
    out[r.muscle_group] = { mev: r.estimated_mev, mav: r.estimated_mav, mrv: r.estimated_mrv };
  }
  return out;
}
