// nutrition-confidence-system.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §2 — Data Confidence (elimina defaults silenciosos).
//
// Cada dado importante carrega valor + fonte + confiança. O sistema agrega um
// score de confiança do cálculo nutricional e nunca esconde que um dado foi
// estimado. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type DataSource = 'bioimpedance' | 'profile' | 'wearable' | 'measured' | 'estimated';

export interface DataValue<T> {
  value: T;
  source: DataSource;
  confidence: number;   // 0..1
}

// confiança por fonte (heurística)
const SOURCE_CONFIDENCE: Record<DataSource, number> = {
  bioimpedance: 0.95, measured: 0.9, wearable: 0.85, profile: 0.7, estimated: 0.35,
};

export function dv<T>(value: T, source: DataSource, confidence?: number): DataValue<T> {
  return { value, source, confidence: confidence ?? SOURCE_CONFIDENCE[source] };
}

export type ConfidenceLevel = 'high' | 'moderate' | 'low';

export interface NutritionConfidence {
  score: number;                 // 0..100
  level: ConfidenceLevel;
  missingFields: string[];
  estimatedFields: string[];
  recommendations: string[];
}

// Campos que mais impactam a precisão do cálculo nutricional e seu peso.
const FIELD_WEIGHTS: Record<string, number> = {
  weight: 0.25, height: 0.15, age: 0.1, bodyFat: 0.2, tmb: 0.15, activity: 0.15,
};

const FIELD_LABEL: Record<string, string> = {
  weight: 'peso', height: 'altura', age: 'idade', bodyFat: 'percentual de gordura',
  tmb: 'TMB (bioimpedância)', activity: 'nível de atividade',
};

export interface ConfidenceInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: Record<string, DataValue<any> | null | undefined>;
}

export function computeNutritionConfidence(input: ConfidenceInput): NutritionConfidence {
  const missingFields: string[] = [];
  const estimatedFields: string[] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    totalWeight += weight;
    const d = input.fields[field];
    if (!d || d.value == null) { missingFields.push(FIELD_LABEL[field] ?? field); continue; }
    if (d.source === 'estimated') estimatedFields.push(FIELD_LABEL[field] ?? field);
    weighted += weight * d.confidence;
  }

  const score = Math.round((totalWeight > 0 ? weighted / totalWeight : 0) * 100);
  const level: ConfidenceLevel = score >= 80 ? 'high' : score >= 55 ? 'moderate' : 'low';

  const recommendations: string[] = [];
  if (missingFields.length) recommendations.push(`Adicione ${missingFields.slice(0, 3).join(', ')} para melhorar a precisão.`);
  if (estimatedFields.length) recommendations.push(`Alguns valores são estimativas (${estimatedFields.slice(0, 3).join(', ')}); medições reais aumentam a confiança.`);
  if (!recommendations.length) recommendations.push('Dados completos — metas com alta precisão.');

  return { score, level, missingFields, estimatedFields, recommendations };
}

export function confidenceBadge(level: ConfidenceLevel): { emoji: string; label: string } {
  if (level === 'high') return { emoji: '🟢', label: 'Alta precisão' };
  if (level === 'moderate') return { emoji: '🟡', label: 'Precisão moderada' };
  return { emoji: '🔴', label: 'Dados insuficientes' };
}
