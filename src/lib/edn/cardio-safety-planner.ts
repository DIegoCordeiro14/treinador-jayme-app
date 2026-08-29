// cardio-safety-planner.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §15 — Cardio Safety Planner.
//
// A partir das condições físicas ativas, classifica cada modalidade de cardio como
// restricted / caution / compatible e sugere a alternativa mais segura. NUNCA
// prescreve conduta clínica nem substitui médico. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type SafetyLevel = 'restricted' | 'caution' | 'compatible';

export interface PhysicalConditionLite {
  bodyRegion: string;              // ex: joelho, tornozelo, pe, lombar, ombro
  status: string;                  // injury | rehab | recovery | acute...
  active: boolean;
}

export type CardioModalityKey = 'running' | 'walking' | 'cycling' | 'swimming' | 'elliptical' | 'rowing';

export interface CardioModalitySafety { modality: CardioModalityKey; level: SafetyLevel; reason: string; }

export interface CardioSafetyResult {
  modalities: CardioModalitySafety[];
  safestAlternatives: CardioModalityKey[];
  hasRestriction: boolean;
  disclaimer: string;
}

// impacto de cada modalidade sobre regiões (para inferir risco)
const IMPACT: Record<CardioModalityKey, { lower: number; lumbar: number; upper: number }> = {
  running: { lower: 1.0, lumbar: 0.4, upper: 0.1 },
  walking: { lower: 0.5, lumbar: 0.2, upper: 0.05 },
  cycling: { lower: 0.4, lumbar: 0.5, upper: 0.1 },
  swimming: { lower: 0.1, lumbar: 0.2, upper: 0.5 },
  elliptical: { lower: 0.5, lumbar: 0.2, upper: 0.1 },
  rowing: { lower: 0.3, lumbar: 0.7, upper: 0.5 },
};

const REGION_LOWER = /joelho|tornozelo|\bpe\b|pé|perna|coxa|quadril|panturr|canela|tibia/i;
const REGION_LUMBAR = /lombar|coluna|costas baixa|hernia/i;
const REGION_UPPER = /ombro|braco|braço|cotovelo|punho|mao|mão/i;
const ACTIVE_STATUS = /injur|lesa|lesã|rehab|reabil|recover|recupera|acute|agud|fratura|entorse/i;

export function planCardioSafety(conditions: PhysicalConditionLite[]): CardioSafetyResult {
  const active = (conditions ?? []).filter((c) => c.active && ACTIVE_STATUS.test(String(c.status ?? '')));
  const severe = (c: PhysicalConditionLite) => /acute|agud|fratura|injur|lesa|lesã/.test(String(c.status ?? ''));

  const modalities: CardioModalitySafety[] = (Object.keys(IMPACT) as CardioModalityKey[]).map((m) => {
    let level: SafetyLevel = 'compatible';
    let reason = 'Sem conflito com as condições ativas.';
    for (const c of active) {
      const region = REGION_LUMBAR.test(c.bodyRegion) ? 'lumbar' : REGION_UPPER.test(c.bodyRegion) ? 'upper' : REGION_LOWER.test(c.bodyRegion) ? 'lower' : 'lower';
      const load = IMPACT[m][region as 'lower' | 'lumbar' | 'upper'] ?? 0;
      if (load >= 0.7 && severe(c)) { level = 'restricted'; reason = `${c.bodyRegion} (${c.status}) — evitar ${m} por alto impacto na região.`; break; }
      else if (load >= 0.7) { level = 'caution'; reason = `${c.bodyRegion} — usar ${m} com cautela.`; }
      else if (load >= 0.4 && severe(c)) { if (level === 'compatible') { level = 'caution'; reason = `${c.bodyRegion} — ${m} com cautela.`; } }
    }
    return { modality: m, level, reason };
  });

  const safestAlternatives = modalities.filter((m) => m.level === 'compatible').map((m) => m.modality);
  const hasRestriction = modalities.some((m) => m.level !== 'compatible');
  return {
    modalities, safestAlternatives, hasRestriction,
    disclaimer: 'Sugestão de adaptação, não orientação clínica. Consulte um profissional de saúde antes de retomar.',
  };
}
