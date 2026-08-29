// workout-complexity-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §26 — Overcomplexity detection.
//
// Penaliza planos complexos demais: exercícios em excesso, muitas técnicas
// avançadas, sessões longas, excesso de variações, baixa repetibilidade. Princípio
// EDN: o melhor treino é o que produz progresso sustentável, não o mais complexo.
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplexityInput {
  exercisesPerSession: number;
  advancedTechniquesCount: number;   // dropsets, restpause, etc
  sessionDurationMin: number;
  distinctExercisesInPlan: number;
  totalExerciseSlots: number;        // soma de exercícios em todos os dias
  experience: 'beginner' | 'intermediate' | 'advanced';
}

export interface ComplexityResult {
  score: number;                     // 0..100 (maior = mais complexo)
  level: 'simple' | 'balanced' | 'complex' | 'overcomplex';
  penalties: string[];
  repeatability: number;             // 0..1 (quanto se repete entre sessões)
}

export function analyzeComplexity(i: ComplexityInput): ComplexityResult {
  const penalties: string[] = [];
  let score = 0;

  const maxEx = i.experience === 'advanced' ? 8 : i.experience === 'intermediate' ? 7 : 6;
  if (i.exercisesPerSession > maxEx) { score += (i.exercisesPerSession - maxEx) * 8; penalties.push(`exercícios/sessão acima do ideal (${i.exercisesPerSession} > ${maxEx})`); }

  const maxTech = i.experience === 'advanced' ? 3 : i.experience === 'intermediate' ? 2 : 0;
  if (i.advancedTechniquesCount > maxTech) { score += (i.advancedTechniquesCount - maxTech) * 10; penalties.push('técnicas avançadas em excesso'); }

  if (i.sessionDurationMin > 90) { score += Math.min(30, (i.sessionDurationMin - 90) * 0.6); penalties.push('sessão longa (> 90 min)'); }

  // repetibilidade: menos exercícios distintos por slot => mais repetível => melhor
  const repeatability = i.totalExerciseSlots > 0 ? Math.max(0, Math.min(1, 1 - (i.distinctExercisesInPlan / i.totalExerciseSlots - 0.5))) : 1;
  if (i.distinctExercisesInPlan > i.totalExerciseSlots * 0.85) { score += 15; penalties.push('baixa repetibilidade (variações demais)'); }

  score = Math.round(Math.max(0, Math.min(100, score)));
  const level = score >= 55 ? 'overcomplex' : score >= 30 ? 'complex' : score >= 12 ? 'balanced' : 'simple';
  return { score, level, penalties, repeatability: Math.round(repeatability * 100) / 100 };
}
