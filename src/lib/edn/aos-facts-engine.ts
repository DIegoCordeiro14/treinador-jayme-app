// aos-facts-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hub P2 — Fatos REAIS para o Athlete OS (substitui os hardcoded).
//
// Deriva injuryRisk, inDeload, weeksOnPlan e experience de dados reais em vez de
// valores fixos (que enfraqueciam o AOS). Puro/determinístico — recebe sinais já
// buscados pela rota (condições físicas, desconforto, recuperação, versões do plano,
// histórico). Alimenta o orchestrate() do AOS.
// ─────────────────────────────────────────────────────────────────────────────

export type InjuryRisk = 'none' | 'low' | 'moderate' | 'high';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface AosFactsInput {
  activePhysicalConditions: number;      // condições ativas
  severePhysicalConditions: number;      // agudas/lesão
  recurringDiscomfort: boolean;          // desconforto recorrente detectado
  recoveryCategory: 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
  deloadSignalActive: boolean;           // do deload-engine
  planCreatedAtISO: string | null;       // início do bloco/plano (workout_plan_versions)
  declaredExperience: string | null;     // profiles.experience_level
  advancedPerformanceSignals: number;    // ex: nº de exercícios com boa progressão
  nowMs?: number;
}

export interface AosFacts {
  injuryRisk: InjuryRisk;
  inDeload: boolean;
  weeksOnPlan: number;
  experience: ExperienceLevel;
  reasons: string[];
}

export function deriveAosFacts(i: AosFactsInput): AosFacts {
  const reasons: string[] = [];
  const nowMs = i.nowMs ?? Date.now();

  // injuryRisk: condições físicas + desconforto + recuperação
  let injuryRisk: InjuryRisk = 'none';
  if (i.severePhysicalConditions > 0) { injuryRisk = 'high'; reasons.push('condição física aguda/lesão ativa'); }
  else if (i.activePhysicalConditions > 0 && (i.recurringDiscomfort || i.recoveryCategory === 'low' || i.recoveryCategory === 'critical')) { injuryRisk = 'moderate'; reasons.push('condição ativa + desconforto/recuperação baixa'); }
  else if (i.activePhysicalConditions > 0 || i.recurringDiscomfort) { injuryRisk = 'low'; reasons.push('condição ou desconforto presente'); }

  // inDeload: sinal do deload-engine OU recuperação crítica
  const inDeload = i.deloadSignalActive || i.recoveryCategory === 'critical';
  if (inDeload) reasons.push('em deload (sinal do motor de deload ou recuperação crítica)');

  // weeksOnPlan: do início do plano (versões)
  let weeksOnPlan = 0;
  if (i.planCreatedAtISO) {
    const t = new Date(i.planCreatedAtISO).getTime();
    if (!Number.isNaN(t)) weeksOnPlan = Math.max(0, Math.floor((nowMs - t) / (7 * 86400000)));
  }

  // experience: declarada, mas promove a avançado se há muitos sinais de boa progressão
  let experience: ExperienceLevel = /adv|avanç/i.test(String(i.declaredExperience ?? '')) ? 'advanced'
    : /inter/i.test(String(i.declaredExperience ?? '')) ? 'intermediate' : 'beginner';
  if (experience !== 'advanced' && i.advancedPerformanceSignals >= 5 && weeksOnPlan >= 8) { experience = 'advanced'; reasons.push('desempenho consistente promoveu nível para avançado'); }

  return { injuryRisk, inDeload, weeksOnPlan, experience, reasons };
}
