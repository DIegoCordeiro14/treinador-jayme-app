// adherence-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §25 — Aderência como sinal de qualidade.
//
// Um treino teoricamente perfeito que o atleta não executa não é bom. Avalia
// sessões concluídas, duração real, exercícios frequentemente pulados, séries
// não realizadas e dias perdidos — e investiga a provável CAUSA (duração/ordem/
// volume/praticidade) para melhorar a próxima geração. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdherenceInput {
  sessionsPlanned: number;
  sessionsCompleted: number;
  avgPlannedDurationMin: number | null;
  avgRealDurationMin: number | null;
  // exercícios pulados: fração de vezes que cada exercício foi pulado
  skippedByExercise?: { exerciseId: string; name: string; skipRate: number }[];
  // fração de sessões abandonadas no final (últimos exercícios não feitos)
  lateDropRate?: number | null;
}

export type AdherenceLevel = 'high' | 'moderate' | 'low';
export type AdherenceCause = 'duration' | 'order' | 'volume' | 'exercise_practicality' | 'none';

export interface AdherenceResult {
  completionRate: number;            // 0..1
  level: AdherenceLevel;
  likelyCauses: AdherenceCause[];
  frequentlySkipped: string[];
  recommendation: string;
}

export function analyzeAdherence(i: AdherenceInput): AdherenceResult {
  const completionRate = i.sessionsPlanned > 0 ? Math.min(1, i.sessionsCompleted / i.sessionsPlanned) : 1;
  const level: AdherenceLevel = completionRate >= 0.8 ? 'high' : completionRate >= 0.5 ? 'moderate' : 'low';

  const causes: AdherenceCause[] = [];
  // duração: sessão real muito menor que planejada, ou abandono no fim
  if (i.avgPlannedDurationMin != null && i.avgRealDurationMin != null && i.avgRealDurationMin < i.avgPlannedDurationMin * 0.8) causes.push('duration');
  if ((i.lateDropRate ?? 0) >= 0.3) { if (!causes.includes('duration')) causes.push('duration'); causes.push('order'); }

  const frequentlySkipped = (i.skippedByExercise ?? []).filter((e) => e.skipRate >= 0.4).map((e) => e.name);
  if (frequentlySkipped.length) causes.push('exercise_practicality');
  if (level !== 'high' && (i.avgRealDurationMin ?? 0) > (i.avgPlannedDurationMin ?? 999)) causes.push('volume');
  if (causes.length === 0) causes.push('none');

  let recommendation: string;
  if (level === 'high') recommendation = 'Boa aderência — manter a estrutura.';
  else if (causes.includes('duration') || causes.includes('order'))
    recommendation = 'Encurtar a sessão e mover exercícios importantes para o início (atleta abandona o final).';
  else if (causes.includes('exercise_practicality'))
    recommendation = `Trocar exercícios frequentemente pulados por alternativas mais práticas: ${frequentlySkipped.slice(0, 3).join(', ')}.`;
  else recommendation = 'Reduzir volume/complexidade para elevar a taxa de conclusão.';

  return { completionRate: Math.round(completionRate * 100) / 100, level, likelyCauses: causes, frequentlySkipped, recommendation };
}
