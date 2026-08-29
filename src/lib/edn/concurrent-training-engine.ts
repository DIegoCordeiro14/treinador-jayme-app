// concurrent-training-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §3/§4 — Concurrent Training Engine (atleta híbrido).
//
// Detecta interferência entre força e endurance, calcula loads e risco, e sugere
// distribuição/ordem/distância entre sessões concorrentes (ex: afastar intervalado
// 24h de perna pesada). Puro/determinístico. Alimenta o Athlete OS.
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionSlot {
  weekday: number;                 // 0..6
  kind: 'strength_legs' | 'strength_upper' | 'run_easy' | 'run_interval' | 'run_long' | 'cycling' | 'swimming' | 'rest';
  intensity?: 'low' | 'moderate' | 'high';
}

export interface ConcurrentInput {
  sessions: SessionSlot[];
  priority: 'hypertrophy_first' | 'race_first' | 'balanced';
  recentLegVolumeHigh?: boolean;
  doms?: boolean;                  // dor muscular tardia ativa
}

export type InterferenceRisk = 'low' | 'moderate' | 'high';

export interface ConcurrentResult {
  concurrentLoad: number;          // 0..100
  strengthLoad: number;
  enduranceLoad: number;
  interferenceRisk: InterferenceRisk;
  conflicts: { dayA: number; dayB: number; reason: string }[];
  recommendations: string[];
}

const LOAD: Record<SessionSlot['kind'], { s: number; e: number }> = {
  strength_legs: { s: 30, e: 0 }, strength_upper: { s: 20, e: 0 },
  run_easy: { s: 0, e: 12 }, run_interval: { s: 5, e: 28 }, run_long: { s: 8, e: 25 },
  cycling: { s: 5, e: 18 }, swimming: { s: 0, e: 15 }, rest: { s: 0, e: 0 },
};

const dayDist = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

export function analyzeConcurrent(i: ConcurrentInput): ConcurrentResult {
  const sessions = i.sessions ?? [];
  let strengthLoad = 0, enduranceLoad = 0;
  for (const s of sessions) { const l = LOAD[s.kind] ?? { s: 0, e: 0 }; strengthLoad += l.s; enduranceLoad += l.e; }
  strengthLoad = Math.min(100, strengthLoad); enduranceLoad = Math.min(100, enduranceLoad);
  const concurrentLoad = Math.min(100, Math.round(strengthLoad * 0.5 + enduranceLoad * 0.5 + Math.min(strengthLoad, enduranceLoad) * 0.2));

  // conflitos: interferência neuromuscular = perna pesada + intervalado/longão a <24h
  const conflicts: ConcurrentResult['conflicts'] = [];
  const legs = sessions.filter((s) => s.kind === 'strength_legs');
  const hardRun = sessions.filter((s) => s.kind === 'run_interval' || s.kind === 'run_long');
  for (const L of legs) for (const R of hardRun) {
    if (dayDist(L.weekday, R.weekday) <= 1) {
      conflicts.push({ dayA: L.weekday, dayB: R.weekday, reason: 'Perna pesada e corrida forte a menos de 24h — alta interferência neuromuscular.' });
    }
  }

  let interferenceRisk: InterferenceRisk = 'low';
  if (conflicts.length >= 2 || (conflicts.length && (i.recentLegVolumeHigh || i.doms))) interferenceRisk = 'high';
  else if (conflicts.length === 1) interferenceRisk = 'moderate';
  else if (concurrentLoad >= 75) interferenceRisk = 'moderate';

  const recommendations: string[] = [];
  if (conflicts.length) {
    recommendations.push('Afastar a sessão de corrida forte pelo menos 24h do treino de pernas pesado.');
    if (i.priority === 'hypertrophy_first') recommendations.push('Hipertrofia é prioridade: no dia seguinte à perna, corrida leve Z2 (não intervalado).');
    if (i.priority === 'race_first') recommendations.push('Prova é prioridade: reduzir volume de pernas na semana da sessão-chave de corrida.');
  }
  if (i.doms) recommendations.push('DOMS ativo — evitar cargas altas de impacto até a recuperação.');
  if (!recommendations.length) recommendations.push('Distribuição concorrente equilibrada — manter.');

  return { concurrentLoad, strengthLoad, enduranceLoad, interferenceRisk, conflicts, recommendations };
}
