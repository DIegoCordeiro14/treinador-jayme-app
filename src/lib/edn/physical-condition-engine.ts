/**
 * Physical Condition & Training Safety Engine (determinístico).
 *
 * Classifica cada exercício em compatible | caution | restricted a partir das
 * condições físicas CONFIRMADAS pelo usuário. A IA nunca decide o status; ela só
 * interpreta documentos e explica. Este motor decide compatibilidade e substituição.
 *
 * Regras (conservadoras):
 *  - Condição com status 'cleared' (liberado) → não restringe (apenas cautela leve
 *    se houver movimento explicitamente restrito casando).
 *  - restrictedMovements confirmados que casam com o nome do exercício → restricted.
 *  - Região sensível + status recovering/rehab/partial/unknown → restricted se o
 *    exercício bate nas keywords da região; caution se status é parcial/desconhecido
 *    e o casamento é fraco.
 *  - Sem casamento → compatible.
 */
import {
  REGION_SENSITIVE_KEYWORDS, REGION_SENSITIVE_CARDIO,
  type PhysicalCondition, type BodyRegion,
} from './condition-mapping';

export type SafetyStatus = 'compatible' | 'caution' | 'restricted';

export interface SafetyResult {
  status: SafetyStatus;
  reasons: string[];
  restrictions: string[];          // condições que motivaram
  requiresProfessionalReview: boolean;
  matchedRegions: BodyRegion[];
}

function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function anyKeyword(haystack: string, keywords: string[]): string | null {
  const h = norm(haystack);
  for (const k of keywords) { if (h.includes(norm(k))) return k; }
  return null;
}

/** Avalia um exercício (por nome/grupo) contra as condições confirmadas. */
export function evaluateExerciseSafety(
  exercise: { name: string; muscle_group?: string | null },
  conditions: PhysicalCondition[],
): SafetyResult {
  const reasons: string[] = [];
  const restrictions: string[] = [];
  const matchedRegions: BodyRegion[] = [];
  let status: SafetyStatus = 'compatible';
  let requiresProfessionalReview = false;

  // Só considera condições ATIVAS e CONFIRMADAS pelo usuário.
  const active = (conditions ?? []).filter(c => c.userConfirmed !== false);

  for (const c of active) {
    // 1) Movimento explicitamente restrito confirmado
    const restrictedMatch = c.restrictedMovements?.map(m => anyKeyword(exercise.name, [m])).find(Boolean) ?? null;
    if (restrictedMatch) {
      status = 'restricted';
      reasons.push(`Movimento "${restrictedMatch}" está na lista de restritos (${c.bodyRegion}).`);
      restrictions.push(c.id ?? c.bodyRegion);
      matchedRegions.push(c.bodyRegion);
      continue;
    }

    // 2) Região sensível
    const kw = anyKeyword(exercise.name, REGION_SENSITIVE_KEYWORDS[c.bodyRegion] ?? []);
    if (!kw) continue;
    matchedRegions.push(c.bodyRegion);

    if (c.status === 'cleared') {
      // liberado: apenas cautela leve
      if (status === 'compatible') status = 'caution';
      reasons.push(`Região ${c.bodyRegion} liberada para treino, mas o exercício exige o padrão "${kw}" — atenção à técnica.`);
    } else if (c.status === 'partial' || c.status === 'unknown') {
      // restrição parcial/desconhecida → cautela (não bloqueia sozinho), pede revisão
      if (status !== 'restricted') status = 'caution';
      requiresProfessionalReview = c.status === 'unknown';
      reasons.push(`Condição em ${c.bodyRegion} (${c.status}) e o exercício usa "${kw}" — recomenda-se cautela/avaliação.`);
      restrictions.push(c.id ?? c.bodyRegion);
    } else {
      // recovering | rehab → restrito
      status = 'restricted';
      reasons.push(`Condição em recuperação/reabilitação na região ${c.bodyRegion} e o exercício exige "${kw}".`);
      restrictions.push(c.id ?? c.bodyRegion);
    }
  }

  return { status, reasons, restrictions, requiresProfessionalReview, matchedRegions };
}

/** Avalia uma modalidade de cardio contra as condições confirmadas. */
export function evaluateCardioSafety(
  cardioType: string,
  conditions: PhysicalCondition[],
): SafetyResult {
  const reasons: string[] = [];
  const restrictions: string[] = [];
  const matchedRegions: BodyRegion[] = [];
  let status: SafetyStatus = 'compatible';
  let requiresProfessionalReview = false;
  const active = (conditions ?? []).filter(c => c.userConfirmed !== false);

  for (const c of active) {
    const kw = anyKeyword(cardioType, REGION_SENSITIVE_CARDIO[c.bodyRegion] ?? []);
    if (!kw) continue;
    matchedRegions.push(c.bodyRegion);
    if (c.status === 'cleared') { if (status === 'compatible') status = 'caution'; reasons.push(`${cardioType}: região ${c.bodyRegion} liberada — atenção ao impacto.`); }
    else if (c.status === 'partial' || c.status === 'unknown') { if (status !== 'restricted') status = 'caution'; requiresProfessionalReview = c.status === 'unknown'; reasons.push(`${cardioType} tem impacto sobre ${c.bodyRegion} (${c.status}).`); restrictions.push(c.id ?? c.bodyRegion); }
    else { status = 'restricted'; reasons.push(`${cardioType} exige a região ${c.bodyRegion} em recuperação — priorizar baixo impacto.`); restrictions.push(c.id ?? c.bodyRegion); }
  }
  return { status, reasons, restrictions, requiresProfessionalReview, matchedRegions };
}

/** Resumo para o dashboard: 🟢 sem restrições / 🟡 acompanhamento / 🔴 restrições ativas. */
export function trainingSafetyStatus(conditions: PhysicalCondition[]): { level: 'none' | 'watch' | 'restricted'; activeCount: number; label: string } {
  const active = (conditions ?? []).filter(c => c.userConfirmed !== false);
  if (active.length === 0) return { level: 'none', activeCount: 0, label: 'Sem restrições ativas' };
  const hard = active.some(c => c.status === 'recovering' || c.status === 'rehab' || (c.restrictedMovements?.length ?? 0) > 0);
  if (hard) return { level: 'restricted', activeCount: active.length, label: 'Existem restrições que afetam o treino' };
  return { level: 'watch', activeCount: active.length, label: `${active.length} condição(ões) em acompanhamento` };
}
