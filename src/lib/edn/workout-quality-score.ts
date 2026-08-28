// workout-quality-score.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 25 — Workout Quality Score (0..100) de um plano JÁ montado.
//
// Avalia o plano gerado de forma determinística ANTES de salvar: volume por
// grupo dentro da faixa, frequência adequada, cobertura do ponto fraco, presença
// de compostos, ausência de exercícios restritos e equilíbrio empurrar/puxar.
// Retorna nota + detalhamento + problemas encontrados (para o preview e a IA).
// ─────────────────────────────────────────────────────────────────────────────

export interface QAExercise {
  exercise_id: string;
  name: string;
  muscle_group: string;
  sets: number;
  is_compound?: boolean;
  pattern?: 'push' | 'pull' | 'legs' | 'other';
}

export interface QATargets {
  // volume-alvo por grupo (do muscle-volume-intelligence)
  target_weekly_sets: Record<string, number>;
  weak_points?: string[];
  restricted_exercise_ids?: string[];
}

export interface QualityIssue { severity: 'high' | 'medium' | 'low'; message: string; }

export interface WorkoutQualityScore {
  score: number;                  // 0..100
  breakdown: Record<string, number>;
  issues: QualityIssue[];
  weekly_volume: Record<string, number>;
}

export function scoreWorkoutQuality(exercises: QAExercise[], targets: QATargets): WorkoutQualityScore {
  const issues: QualityIssue[] = [];
  const weekly: Record<string, number> = {};
  for (const e of exercises) weekly[e.muscle_group] = (weekly[e.muscle_group] ?? 0) + (e.sets ?? 0);

  const b: Record<string, number> = {};

  // 1) Volume dentro do alvo (35 pts)
  const targetMuscles = Object.keys(targets.target_weekly_sets);
  let volHits = 0;
  for (const mg of targetMuscles) {
    const tgt = targets.target_weekly_sets[mg];
    const got = weekly[mg] ?? 0;
    const ratio = tgt > 0 ? got / tgt : 1;
    if (ratio >= 0.8 && ratio <= 1.25) volHits++;
    else if (got === 0 && tgt > 0) issues.push({ severity: 'high', message: `${mg} sem volume (alvo ${tgt}).` });
    else if (ratio > 1.5) issues.push({ severity: 'medium', message: `${mg} com volume acima do alvo (${got} vs ${tgt}).` });
    else issues.push({ severity: 'low', message: `${mg} fora do alvo (${got} vs ${tgt}).` });
  }
  b.volume = targetMuscles.length ? Math.round((volHits / targetMuscles.length) * 35) : 25;

  // 2) Ponto fraco coberto (15 pts)
  const weak = targets.weak_points ?? [];
  if (weak.length === 0) b.weak = 15;
  else {
    const covered = weak.filter((w) => (weekly[w] ?? 0) >= (targets.target_weekly_sets[w] ?? 1) * 0.8);
    b.weak = Math.round((covered.length / weak.length) * 15);
    for (const w of weak) if (!covered.includes(w)) issues.push({ severity: 'high', message: `Ponto fraco ${w} sub-treinado.` });
  }

  // 3) Compostos presentes (15 pts)
  const compoundRatio = exercises.length ? exercises.filter((e) => e.is_compound).length / exercises.length : 0;
  b.compound = compoundRatio >= 0.4 ? 15 : Math.round(compoundRatio * 30);
  if (compoundRatio < 0.3) issues.push({ severity: 'medium', message: 'Poucos exercícios compostos.' });

  // 4) Sem exercícios restritos (20 pts) — segurança
  const restricted = new Set(targets.restricted_exercise_ids ?? []);
  const violations = exercises.filter((e) => restricted.has(e.exercise_id));
  b.safety = violations.length === 0 ? 20 : 0;
  for (const v of violations) issues.push({ severity: 'high', message: `Exercício restrito no plano: ${v.name}.` });

  // 5) Equilíbrio empurrar/puxar (15 pts)
  const push = exercises.filter((e) => e.pattern === 'push').length;
  const pull = exercises.filter((e) => e.pattern === 'pull').length;
  if (push + pull === 0) b.balance = 10;
  else {
    const bal = 1 - Math.abs(push - pull) / (push + pull);
    b.balance = Math.round(bal * 15);
    if (bal < 0.5) issues.push({ severity: 'medium', message: `Desequilíbrio empurrar(${push})/puxar(${pull}).` });
  }

  const score = Math.max(0, Math.min(100, Object.values(b).reduce((a, c) => a + c, 0)));
  return { score, breakdown: b, issues: issues.sort((a, c) => sev(c.severity) - sev(a.severity)), weekly_volume: weekly };
}

function sev(s: QualityIssue['severity']): number { return s === 'high' ? 3 : s === 'medium' ? 2 : 1; }
