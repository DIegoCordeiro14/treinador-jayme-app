// training-response-profile.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCOS 12 e 23 — Aprendizado LONGITUDINAL da resposta individual.
//
// A partir de observações de blocos anteriores (volume aplicado x resultado),
// aprende os LANDMARKS INDIVIDUAIS (MEV/MAV/MRV) e o "tipo de resposta" de cada
// grupo: se o atleta responde a mais volume, se satura cedo, se recupera rápido.
// Alimenta a próxima geração (muscle-volume-intelligence.individualLandmarks).
// Determinístico: parte dos landmarks base e AJUSTA conforme evidência real.
// ─────────────────────────────────────────────────────────────────────────────

export interface VolumeLandmarks { mev: number; mav: number; mrv: number; }

export interface ResponseObservation {
  muscle_group: string;
  weekly_sets: number;
  outcome: 'progressed' | 'maintained' | 'regressed';
  recovery_ok: boolean;           // recuperação estava adequada no bloco?
}

export type ResponderType = 'high_responder' | 'normal_responder' | 'low_responder' | 'unknown';

export interface MuscleResponseProfile {
  muscle_group: string;
  responder: ResponderType;
  individual_landmarks: VolumeLandmarks;
  confidence: number;             // 0..1 (mais observações = maior)
  note: string;
}

export interface ResponseProfileInput {
  baseLandmarks: Record<string, VolumeLandmarks>;   // do muscle-volume-intelligence
  observations: ResponseObservation[];
}

function clampLandmarks(lm: VolumeLandmarks): VolumeLandmarks {
  const mev = Math.max(4, Math.round(lm.mev));
  const mav = Math.max(mev + 2, Math.round(lm.mav));
  const mrv = Math.max(mav + 2, Math.round(lm.mrv));
  return { mev, mav, mrv };
}

export function learnMuscleResponse(
  muscle: string,
  base: VolumeLandmarks,
  obs: ResponseObservation[]
): MuscleResponseProfile {
  if (obs.length === 0) {
    return { muscle_group: muscle, responder: 'unknown', individual_landmarks: base, confidence: 0, note: 'Sem dados — usando landmarks base.' };
  }

  // Evidências:
  //  - progrediu com volume ALTO e recuperação ok => tolera/precisa mais (high responder)
  //  - regrediu mesmo com recuperação ok => satura cedo (low responder) -> baixar MRV
  const progressedHigh = obs.filter((o) => o.outcome === 'progressed' && o.recovery_ok && o.weekly_sets >= base.mav);
  const regressedOk = obs.filter((o) => o.outcome === 'regressed' && o.recovery_ok);
  const progressedLow = obs.filter((o) => o.outcome === 'progressed' && o.weekly_sets <= base.mev + 2);

  let responder: ResponderType = 'normal_responder';
  let lm = { ...base };
  const notes: string[] = [];

  if (progressedHigh.length >= 2 && regressedOk.length === 0) {
    responder = 'high_responder';
    lm.mav = base.mav + 2;
    lm.mrv = base.mrv + 3;
    notes.push('Progrediu com volume alto sem regressão — tolera mais volume.');
  } else if (regressedOk.length >= 2) {
    responder = 'low_responder';
    lm.mav = base.mav - 2;
    lm.mrv = base.mrv - 3;
    notes.push('Regride com volume moderado apesar de recuperar bem — satura cedo.');
  } else if (progressedLow.length >= 2) {
    responder = 'low_responder';
    lm.mrv = base.mrv - 2;
    notes.push('Progride com pouco volume — não precisa de muito.');
  } else {
    notes.push('Resposta dentro do esperado — landmarks base mantidos.');
  }

  const confidence = Math.min(1, obs.length / 6);
  return {
    muscle_group: muscle,
    responder,
    individual_landmarks: clampLandmarks(lm),
    confidence: Math.round(confidence * 100) / 100,
    note: notes.join(' '),
  };
}

export function learnResponseProfile(input: ResponseProfileInput): Record<string, MuscleResponseProfile> {
  const byMuscle = new Map<string, ResponseObservation[]>();
  for (const o of input.observations) {
    const arr = byMuscle.get(o.muscle_group) ?? [];
    arr.push(o);
    byMuscle.set(o.muscle_group, arr);
  }
  const out: Record<string, MuscleResponseProfile> = {};
  const muscles = new Set([...Object.keys(input.baseLandmarks), ...byMuscle.keys()]);
  for (const mg of muscles) {
    const base = input.baseLandmarks[mg] ?? { mev: 8, mav: 14, mrv: 20 };
    out[mg] = learnMuscleResponse(mg, base, byMuscle.get(mg) ?? []);
  }
  return out;
}

// Conveniência: extrai só o mapa de landmarks individuais para o volume-engine.
export function toIndividualLandmarks(
  profiles: Record<string, MuscleResponseProfile>
): Record<string, VolumeLandmarks> {
  const out: Record<string, VolumeLandmarks> = {};
  for (const [mg, p] of Object.entries(profiles)) {
    if (p.confidence > 0) out[mg] = p.individual_landmarks;
  }
  return out;
}
