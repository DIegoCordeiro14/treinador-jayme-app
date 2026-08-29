// workout-generation-orchestrator-v3.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §29 — Orquestrador central da geração (EDN Adaptive Workout Generation).
//
// Compõe os motores v3 num pipeline determinístico ANTES da IA e devolve:
//  (a) um bloco de prompt com alvos/regras/candidatos p/ a IA ORGANIZAR,
//  (b) um objeto estruturado para o "por que este plano",
//  (c) uma função validate(plan) para o gate determinístico PÓS-IA.
// Puro/sem I/O — a rota fornece os dados já buscados. Cada etapa é tolerante a
// dados incompletos; falhas individuais não impedem a geração (fallback), exceto
// segurança/proibidos/restrições, que são bloqueios absolutos.
// ─────────────────────────────────────────────────────────────────────────────

import { allocateAll, type PriorityInput, type PriorityAllocation } from './priority-allocation-engine';
import { computeRecoveryBudget, type RecoveryBudgetInput, type RecoveryBudget } from './priority-budget-engine';
import { checkBalance, type BalanceGuardResult } from './muscle-balance-guard';
import { computeEffectiveVolume, type PlannedExerciseVolume, type EffectiveVolumeResult } from './effective-muscle-volume-engine';
import { analyzeCoverage, type Pattern as CoveragePattern, type Objective as CoverageObjective, type CoverageResult } from './movement-pattern-engine';
import { computeEquilibriumScore, type EquilibriumInput, type EquilibriumResult } from './equilibrium-score-engine';
import { validatePlan, type ValidatorInput, type ValidationResult, type ValidatorPlanExercise } from './plan-quality-validator';

export interface OrchestratorInput {
  objective: CoverageObjective;
  experience: 'beginner' | 'intermediate' | 'advanced';
  priorities: PriorityInput[];
  budget: RecoveryBudgetInput;
  // volume-alvo por grupo (do muscle-volume-intelligence) e piso mínimo (MEV)
  volumeTargets: Record<string, number>;
  minFloor: Record<string, number>;
  // exercícios candidatos planejados (para volume efetivo e cobertura)
  plannedForVolume: PlannedExerciseVolume[];
  plannedPatterns: CoveragePattern[];
  // segurança
  safeExerciseIds: string[];
  forbiddenIds: string[];
  restrictedIds: string[];
}

export interface StepResult<T> { result: T; confidence: number; warnings: string[]; reasons: string[]; }

export interface GenerationV3 {
  priorityAllocations: PriorityAllocation[];
  recoveryBudget: RecoveryBudget;
  effectiveVolume: EffectiveVolumeResult;
  balance: BalanceGuardResult;
  coverage: CoverageResult;
  promptBlock: string;
  warnings: string[];
  // gate determinístico pós-IA
  validate: (planDays: { exercises: ValidatorPlanExercise[] }[], ctx?: { recoveryRespected?: boolean; sessionDurationOk?: boolean }) => { validation: ValidationResult; equilibrium: EquilibriumResult };
}

export function orchestrateGenerationV3(i: OrchestratorInput): GenerationV3 {
  const warnings: string[] = [];

  // 7. Priority allocation
  const priorityAllocations = safe(() => allocateAll(i.priorities), [] as PriorityAllocation[], warnings, 'priority');
  const priorityMuscles = priorityAllocations.filter((p) => p.level === 'PRIMARY' || p.level === 'HIGH').map((p) => p.muscle_group);

  // 8. Recovery capacity / budget
  const recoveryBudget = safe(() => computeRecoveryBudget(i.budget), { capacityScore: 50, verdict: 'redistribute', extraSetsAllowed: 0, reasons: [] } as RecoveryBudget, warnings, 'budget');

  // 9. Effective volume (direct + indirect)
  const effectiveVolume = safe(() => computeEffectiveVolume(i.plannedForVolume), { direct: {}, indirect: {}, effective: {} } as EffectiveVolumeResult, warnings, 'effective-volume');

  // 10. Muscle balance guard
  const balance = safe(() => checkBalance({ effectiveVolume: effectiveVolume.effective, minFloor: i.minFloor }), { pairs: [], floorViolations: [], balanced: true, adjustments: [] } as BalanceGuardResult, warnings, 'balance');

  // 16. Movement pattern coverage
  const coverage = safe(() => analyzeCoverage(i.objective, i.plannedPatterns), { expected: [], covered: [], missing: [], coveragePct: 100, adequate: true, note: '' } as CoverageResult, warnings, 'coverage');

  // ── Bloco de prompt (números vêm daqui; a IA só organiza) ──
  const lines: string[] = [];
  lines.push('INTELIGÊNCIA DE GERAÇÃO v3 (determinística — respeite estes limites, NÃO invente números):');
  if (priorityAllocations.length) {
    lines.push('• Prioridades: ' + priorityAllocations.slice(0, 4).map((p) => `${p.muscle_group}[${p.level}] via ${p.interventionOrder.join('>')}`).join('; ') + '.');
  }
  lines.push(`• Orçamento de recuperação: ${recoveryBudget.verdict} (capacidade ${recoveryBudget.capacityScore}/100, até +${recoveryBudget.extraSetsAllowed} séries). ${recoveryBudget.verdict === 'add_stimulus' ? 'Pode adicionar estímulo estratégico.' : 'NÃO inflar volume — redistribuir/estabilizar.'}`);
  const volLine = Object.entries(i.volumeTargets).slice(0, 12).map(([m, t]) => `${m}=${t}`);
  if (volLine.length) lines.push('• Volume-alvo/semana (efetivo, já considerando indireto): ' + volLine.join('; ') + '.');
  if (balance.adjustments.length) lines.push('• Equilíbrio a preservar: ' + balance.adjustments.slice(0, 4).join(' ') );
  if (!coverage.adequate) lines.push('• Cobrir padrões ausentes: ' + coverage.missing.join(', ') + '.');
  const promptBlock = '\n' + lines.join('\n');

  const validate = (planDays: { exercises: ValidatorPlanExercise[] }[], ctx?: { recoveryRespected?: boolean; sessionDurationOk?: boolean }) => {
    const vInput: ValidatorInput = {
      days: planDays,
      safeExerciseIds: i.safeExerciseIds,
      forbiddenIds: i.forbiddenIds,
      restrictedIds: i.restrictedIds,
      volumeTargets: i.volumeTargets,
      priorityMuscles,
      balanced: balance.balanced,
      recoveryRespected: ctx?.recoveryRespected ?? true,
      sessionDurationOk: ctx?.sessionDurationOk ?? true,
      patternCoverageOk: coverage.adequate,
    };
    const validation = validatePlan(vInput);
    const eqInput: EquilibriumInput = {
      priorityRespected: !validation.issues.some((x) => x.stage === 'priority'),
      muscleBalanced: balance.balanced,
      volumeWithinTargets: !validation.issues.some((x) => x.stage === 'volume'),
      frequencyAdequate: true,
      recoveryRespected: ctx?.recoveryRespected ?? true,
      sessionDurationOk: ctx?.sessionDurationOk ?? true,
      cardioConsidered: true,
      safetyRespected: !validation.issues.some((x) => x.stage === 'safety'),
      patternCoverageOk: coverage.adequate,
      historyRespected: true,
      adherenceFriendly: true,
    };
    const equilibrium = computeEquilibriumScore(eqInput);
    return { validation, equilibrium };
  };

  return { priorityAllocations, recoveryBudget, effectiveVolume, balance, coverage, promptBlock, warnings, validate };
}

function safe<T>(fn: () => T, fallback: T, warnings: string[], tag: string): T {
  try { return fn(); } catch { warnings.push(`falha no motor ${tag} — usando fallback`); return fallback; }
}
