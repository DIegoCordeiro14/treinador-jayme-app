// exercise-rotation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 4 — Rotação de exercícios PRESERVANDO o padrão biomecânico.
//
// Quando a inteligência de histórico decide rotacionar/substituir um exercício,
// este motor escolhe um substituto do MESMO padrão de movimento (supino
// inclinado com barra → supino inclinado com halteres, NÃO → crucifixo).
// Determinístico: classifica padrão por palavras-chave + grupo + composto, e
// pontua candidatos por compatibilidade.
// ─────────────────────────────────────────────────────────────────────────────

export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'isolation'
  | 'other';

export type AngleTag = 'incline' | 'flat' | 'decline' | null;

export interface RotationCandidate {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  is_compound?: boolean;
}

export interface PatternProfile {
  pattern: MovementPattern;
  angle: AngleTag;
  compound: boolean;
  muscle_group: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function classifyPattern(ex: RotationCandidate): PatternProfile {
  const n = norm(ex.name);
  const compound = ex.is_compound ?? false;

  let angle: AngleTag = null;
  if (/inclinad|incline/.test(n)) angle = 'incline';
  else if (/declinad|decline/.test(n)) angle = 'decline';
  else if (/reto|flat|horizontal/.test(n)) angle = 'flat';

  let pattern: MovementPattern = 'other';

  // Empurrar vertical (ombro)
  if (/desenvolvimento|militar|overhead|arnold|elevacao.*(frontal|lateral)?\s*acima|shoulder press/.test(n)) {
    pattern = /elevacao (lateral|frontal)/.test(n) ? 'isolation' : 'vertical_push';
  }
  // Empurrar horizontal (peito)
  else if (/supino|press de peito|chest press|crossover|voador|crucifixo|fly|peck/.test(n)) {
    pattern = /crucifixo|fly|voador|peck|crossover/.test(n) ? 'isolation' : 'horizontal_push';
  }
  else if (/press/.test(n) && ex.muscle_group === 'chest') {
    pattern = 'horizontal_push';
  }
  // Puxar vertical (dorsal alto)
  else if (/puxada|pulldown|barra fixa|pull-?up|pull up/.test(n)) {
    pattern = 'vertical_pull';
  }
  // Puxar horizontal (remadas)
  else if (/remada|row|serrote/.test(n)) {
    pattern = 'horizontal_pull';
  }
  // Agachamento / dominância de joelho
  else if (/agachamento|squat|leg press|hack|cadeira extensora|extensora/.test(n)) {
    pattern = /cadeira extensora|extensora/.test(n) ? 'isolation' : 'squat';
  }
  // Dobradiça de quadril
  else if (/terra|deadlift|stiff|levantamento|good ?morning|mesa flexora|flexora|elevacao pelvica|hip thrust/.test(n)) {
    pattern = /mesa flexora|flexora/.test(n) ? 'isolation' : 'hinge';
  }
  // Passada / unilateral
  else if (/afundo|passada|lunge|bulgaro|bulgara|avanco/.test(n)) {
    pattern = 'lunge';
  }
  // Isolamentos clássicos
  else if (/rosca|triceps|extensao|panturrilha|calf|abdominal|prancha|elevacao lateral|elevacao frontal|encolhimento|shrug/.test(n)) {
    pattern = 'isolation';
  }

  // fallback por composto
  if (pattern === 'other') pattern = compound ? 'horizontal_push' : 'isolation';

  return { pattern, angle, compound, muscle_group: ex.muscle_group };
}

export interface RotationResult {
  replacement: RotationCandidate | null;
  score: number;             // 0..100 do escolhido
  reason: string;
  ranked: { candidate: RotationCandidate; score: number }[];
}

function scoreCandidate(target: PatternProfile, cand: RotationCandidate, targetId: string): number {
  if (cand.id === targetId) return -1; // nunca o mesmo
  const cp = classifyPattern(cand);
  let score = 0;

  // grupo muscular igual é obrigatório para pontuar alto
  if (cp.muscle_group === target.muscle_group) score += 40;
  else return 0;

  // mesmo padrão de movimento é o mais importante
  if (cp.pattern === target.pattern) score += 35;
  else if (isRelatedPattern(cp.pattern, target.pattern)) score += 12;

  // mesmo ângulo (inclinado/reto/declinado) preserva ênfase
  if (target.angle && cp.angle === target.angle) score += 15;
  else if (target.angle && cp.angle && cp.angle !== target.angle) score += 2;
  else if (!target.angle && !cp.angle) score += 8;

  // manter composto↔composto / isolamento↔isolamento
  if (cp.compound === target.compound) score += 10;

  return score;
}

function isRelatedPattern(a: MovementPattern, b: MovementPattern): boolean {
  const push = new Set<MovementPattern>(['horizontal_push', 'vertical_push']);
  const pull = new Set<MovementPattern>(['horizontal_pull', 'vertical_pull']);
  const legs = new Set<MovementPattern>(['squat', 'hinge', 'lunge']);
  return (
    (push.has(a) && push.has(b)) ||
    (pull.has(a) && pull.has(b)) ||
    (legs.has(a) && legs.has(b))
  );
}

export function pickRotation(
  target: RotationCandidate,
  candidates: RotationCandidate[],
  excludeIds: string[] = []
): RotationResult {
  const tp = classifyPattern(target);
  const exclude = new Set([target.id, ...excludeIds]);
  const ranked = candidates
    .filter((c) => !exclude.has(c.id))
    .map((c) => ({ candidate: c, score: scoreCandidate(tp, c, target.id) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      replacement: null,
      score: 0,
      reason: `Sem substituto do mesmo padrão (${tp.pattern}) disponível — manter o exercício.`,
      ranked: [],
    };
  }
  const best = ranked[0];
  return {
    replacement: best.candidate,
    score: best.score,
    reason: `Substituto do mesmo padrão (${tp.pattern}${tp.angle ? '/' + tp.angle : ''}) preservando o estímulo.`,
    ranked,
  };
}
