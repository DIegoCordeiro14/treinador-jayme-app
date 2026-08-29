// plan-quality-validator.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §21 — Plan Quality Validator (a IA não é a última palavra).
//
// Pipeline determinístico pós-IA: schema → segurança → volume → prioridade →
// equilíbrio → recuperação → duração → padrões de movimento. Se falhar, indica
// reparo determinístico ou regeneração. Nunca aprova plano inválido.
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidatorPlanExercise {
  exerciseId: string;
  muscle_group: string;
  sets: number;
}

export interface ValidatorInput {
  days: { exercises: ValidatorPlanExercise[] }[];
  safeExerciseIds: string[];         // catálogo permitido
  forbiddenIds: string[];
  restrictedIds: string[];           // condições físicas
  volumeTargets: Record<string, number>;  // alvo/semana por grupo
  priorityMuscles: string[];
  balanced: boolean;                 // do muscle-balance-guard
  recoveryRespected: boolean;
  sessionDurationOk: boolean;
  patternCoverageOk: boolean;
}

export type ValidationStage =
  | 'schema' | 'safety' | 'volume' | 'priority' | 'balance' | 'recovery' | 'duration' | 'movement';

export interface ValidationIssue { stage: ValidationStage; severity: 'block' | 'repair'; message: string; }

export interface ValidationResult {
  valid: boolean;
  needsRepair: boolean;
  needsRegeneration: boolean;
  issues: ValidationIssue[];
  stagesPassed: ValidationStage[];
}

export function validatePlan(i: ValidatorInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const passed: ValidationStage[] = [];
  const allEx = i.days.flatMap((d) => d.exercises);

  // schema
  if (!i.days.length || allEx.length === 0) issues.push({ stage: 'schema', severity: 'block', message: 'Plano sem dias/exercícios.' });
  else passed.push('schema');

  // safety (bloqueio absoluto)
  const safe = new Set(i.safeExerciseIds);
  const forbidden = new Set(i.forbiddenIds);
  const restricted = new Set(i.restrictedIds);
  const unsafe = allEx.filter((e) => !safe.has(e.exerciseId) || forbidden.has(e.exerciseId) || restricted.has(e.exerciseId));
  if (unsafe.length) issues.push({ stage: 'safety', severity: 'block', message: `${unsafe.length} exercício(s) fora do catálogo seguro/restrito.` });
  else passed.push('safety');

  // volume por grupo
  const weekly: Record<string, number> = {};
  for (const e of allEx) weekly[e.muscle_group] = (weekly[e.muscle_group] ?? 0) + e.sets;
  for (const [mg, tgt] of Object.entries(i.volumeTargets)) {
    const got = weekly[mg] ?? 0;
    if (tgt > 0 && got === 0) issues.push({ stage: 'volume', severity: 'repair', message: `${mg} sem volume (alvo ${tgt}).` });
    else if (tgt > 0 && (got < tgt * 0.6 || got > tgt * 1.6)) issues.push({ stage: 'volume', severity: 'repair', message: `${mg} fora do alvo (${got} vs ${tgt}).` });
  }
  if (!issues.some((x) => x.stage === 'volume')) passed.push('volume');

  // prioridade coberta
  for (const pm of i.priorityMuscles) {
    if ((weekly[pm] ?? 0) < (i.volumeTargets[pm] ?? 1) * 0.8) issues.push({ stage: 'priority', severity: 'repair', message: `Prioridade ${pm} sub-treinada.` });
  }
  if (!issues.some((x) => x.stage === 'priority')) passed.push('priority');

  if (i.balanced) passed.push('balance'); else issues.push({ stage: 'balance', severity: 'repair', message: 'Desequilíbrio muscular.' });
  if (i.recoveryRespected) passed.push('recovery'); else issues.push({ stage: 'recovery', severity: 'repair', message: 'Recuperação não respeitada.' });
  if (i.sessionDurationOk) passed.push('duration'); else issues.push({ stage: 'duration', severity: 'repair', message: 'Sessão longa demais.' });
  if (i.patternCoverageOk) passed.push('movement'); else issues.push({ stage: 'movement', severity: 'repair', message: 'Cobertura de padrões inadequada.' });

  const needsRegeneration = issues.some((x) => x.severity === 'block');
  const needsRepair = !needsRegeneration && issues.some((x) => x.severity === 'repair');
  const valid = issues.length === 0;
  return { valid, needsRepair, needsRegeneration, issues, stagesPassed: passed };
}
