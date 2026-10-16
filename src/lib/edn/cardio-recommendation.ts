// src/lib/edn/cardio-recommendation.ts
// Lógica PURA de alteração/remoção da recomendação de cardio do calendário
// (schedule_config.cardio). Sem IO — testável isoladamente.

export interface CardioDay { type: string; duration_min: number; intensity: string; when?: string; notes?: string }
export interface CardioRecommendation {
  training_days: CardioDay;
  rest_days: CardioDay;
  frequency_per_week?: number;
  general_notes?: string;
}

export interface CardioRecoPatchInput {
  remove?: boolean;
  trainingType?: string; trainingDurationMin?: number; trainingIntensity?: string;
  restType?: string; restDurationMin?: number; restIntensity?: string;
}

const DEFAULT_TRAIN: CardioDay = { type: 'Z2 LISS', duration_min: 20, intensity: 'leve', when: 'após treino', notes: '' };
const DEFAULT_REST: CardioDay = { type: 'Z2 LISS', duration_min: 30, intensity: 'leve', notes: '' };

/** Calcula o novo bloco cardio (ou null para remoção) preservando o que não foi informado. */
export function computeCardioRecommendationPatch(
  current: CardioRecommendation | null | undefined,
  input: CardioRecoPatchInput,
): CardioRecommendation | null {
  if (input.remove) return null;
  const cur = current ?? {} as Partial<CardioRecommendation>;
  const curTrain = cur.training_days ?? DEFAULT_TRAIN;
  const curRest = cur.rest_days ?? DEFAULT_REST;
  return {
    training_days: {
      type: input.trainingType ?? curTrain.type,
      duration_min: input.trainingDurationMin ?? curTrain.duration_min,
      intensity: input.trainingIntensity ?? curTrain.intensity,
      when: curTrain.when ?? 'após treino',
      notes: curTrain.notes ?? '',
    },
    rest_days: {
      type: input.restType ?? curRest.type,
      duration_min: input.restDurationMin ?? curRest.duration_min,
      intensity: input.restIntensity ?? curRest.intensity,
      notes: curRest.notes ?? '',
    },
    frequency_per_week: cur.frequency_per_week ?? 0,
    general_notes: cur.general_notes ?? '',
  };
}
