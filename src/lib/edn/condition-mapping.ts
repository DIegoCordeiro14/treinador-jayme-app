/**
 * Mapeamento canônico de condições físicas → restrições de exercício.
 * Unifica a nomenclatura do formulário (região do corpo) com as keywords de
 * exercícios a evitar. Determinístico. NÃO diagnostica — só relaciona região a
 * padrões de movimento tipicamente sensíveis, para o Safety Engine classificar.
 */

export type BodyRegion = 'shoulder' | 'elbow' | 'wrist' | 'spine' | 'hip' | 'knee' | 'ankle' | 'foot' | 'other';
export type Side = 'right' | 'left' | 'bilateral' | 'na';
export type ConditionStatus = 'recovering' | 'rehab' | 'cleared' | 'partial' | 'unknown';
export type ConditionType = 'injury' | 'surgery' | 'fracture' | 'pain' | 'orthopedic' | 'other';

export interface PhysicalCondition {
  id?: string;
  conditionType: ConditionType;
  bodyRegion: BodyRegion;
  side: Side;
  status: ConditionStatus;
  restrictedMovements?: string[]; // texto livre confirmado pelo usuário
  allowedMovements?: string[];
  userConfirmed?: boolean;
}

// Palavras-chave de exercícios tipicamente sensíveis por região (pt-BR, minúsculas)
export const REGION_SENSITIVE_KEYWORDS: Record<BodyRegion, string[]> = {
  shoulder: ['desenvolvimento', 'overhead', 'militar', 'elevação lateral', 'elevação frontal', 'arnold', 'crucifixo', 'supino inclinado', 'press acima'],
  elbow:    ['rosca direta', 'tríceps testa', 'francês', 'extensão', 'skull crusher'],
  wrist:    ['rosca direta', 'extensão punho', 'flexão punho', 'rosca inversa'],
  spine:    ['terra convencional', 'levantamento terra', 'good morning', 'hiperextensão', 'agachamento livre', 'remada curvada', 'stiff'],
  hip:      ['agachamento', 'afundo', 'lunge', 'búlgaro', 'terra', 'step up', 'hip thrust'],
  knee:     ['agachamento', 'afundo', 'lunge', 'step up', 'extensora', 'hack squat', 'leg press', 'pulo', 'salto', 'pistol'],
  ankle:    ['pulo', 'salto', 'corrida', 'panturrilha em pé', 'afundo', 'agachamento livre'],
  foot:     ['pulo', 'salto', 'corrida', 'panturrilha em pé'],
  other:    [],
};

// Modalidades de cardio tipicamente sensíveis por região (impacto)
export const REGION_SENSITIVE_CARDIO: Record<BodyRegion, string[]> = {
  knee:  ['corrida', 'esteira', 'pulo', 'hiit', 'escada'],
  ankle: ['corrida', 'esteira', 'pulo', 'hiit', 'escada'],
  foot:  ['corrida', 'esteira', 'pulo', 'hiit', 'escada'],
  hip:   ['corrida', 'escada'],
  spine: ['corrida', 'remo'],
  shoulder: ['remo', 'natação'],
  elbow: ['remo'],
  wrist: ['remo'],
  other: [],
};

// Cardio de baixo impacto sugerido por região (alternativas)
export const REGION_LOW_IMPACT_CARDIO: Record<BodyRegion, string[]> = {
  knee:  ['bicicleta', 'natação', 'elíptico', 'remo'],
  ankle: ['bicicleta', 'natação', 'remo'],
  foot:  ['bicicleta', 'natação'],
  hip:   ['bicicleta', 'natação', 'caminhada'],
  spine: ['bicicleta', 'caminhada', 'natação'],
  shoulder: ['bicicleta', 'caminhada', 'corrida'],
  elbow: ['bicicleta', 'corrida', 'caminhada'],
  wrist: ['bicicleta', 'corrida', 'caminhada'],
  other: [],
};

export const REGION_LABEL: Record<BodyRegion, string> = {
  shoulder: 'Ombro', elbow: 'Cotovelo', wrist: 'Punho', spine: 'Coluna', hip: 'Quadril',
  knee: 'Joelho', ankle: 'Tornozelo', foot: 'Pé', other: 'Outro',
};
export const SIDE_LABEL: Record<Side, string> = { right: 'Direito', left: 'Esquerdo', bilateral: 'Bilateral', na: '' };
export const STATUS_LABEL: Record<ConditionStatus, string> = {
  recovering: 'Em recuperação', rehab: 'Reabilitação', cleared: 'Liberado para treino', partial: 'Restrição parcial', unknown: 'Restrição desconhecida',
};

/** Normaliza strings livres para BodyRegion (usado ao interpretar documentos). */
export function normalizeRegion(raw: string | null | undefined): BodyRegion {
  const r = (raw ?? '').toLowerCase();
  if (/ombro|shoulder|manguito|deltoid/.test(r)) return 'shoulder';
  if (/cotovel|elbow|epicondil/.test(r)) return 'elbow';
  if (/punho|wrist|carpo/.test(r)) return 'wrist';
  if (/coluna|lombar|spine|vertebr|hérnia|disco|cervical/.test(r)) return 'spine';
  if (/quadril|hip|coxofemoral/.test(r)) return 'hip';
  if (/joelho|knee|lca|menisco|patela|ligamento cruzado/.test(r)) return 'knee';
  if (/tornozelo|ankle/.test(r)) return 'ankle';
  if (/\bpé\b|\bpe\b|foot|calcâneo|fascite/.test(r)) return 'foot';
  return 'other';
}

export function normalizeSide(raw: string | null | undefined): Side {
  const r = (raw ?? '').toLowerCase();
  if (/bilateral|ambos|both/.test(r)) return 'bilateral';
  if (/direit|right|\bd\b/.test(r)) return 'right';
  if (/esquerd|left|\be\b/.test(r)) return 'left';
  return 'na';
}
