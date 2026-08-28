// exercise-suitability-score.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 9 — Exercise Suitability Score (0..100).
//
// Score determinístico de quão adequado é UM exercício para ESTE atleta AGORA.
// Complementa o exercise-selector: aqui isolamos a pontuação para reuso no
// preview, no "por que este treino" e no ranking passado à IA. Segurança já foi
// aplicada antes (o exercício restrito nem chega aqui); ainda assim penalizamos
// caso um flag de cautela venha marcado.
// ─────────────────────────────────────────────────────────────────────────────

export interface SuitabilityExercise {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  difficulty: string;             // beginner | intermediate | advanced
  is_compound?: boolean;
  objective_tags?: string[];
}

export interface SuitabilityContext {
  objective: string;
  experience: string;             // beginner | intermediate | advanced
  available_equipment?: string[]; // vazio => tudo disponível
  muscle_priority?: string[];     // ordem de prioridade dos grupos
  weak_points?: string[];
  liked_ids?: string[];
  disliked_ids?: string[];
  retained_ids?: string[];        // exercícios que devem ser mantidos (Bloco 3)
  recent_ids?: string[];          // usados recentemente (penaliza p/ variar)
  caution_ids?: string[];         // flag de cautela física
}

export interface SuitabilityScore {
  id: string;
  name: string;
  score: number;                  // 0..100
  factors: Record<string, number>;
  reason: string;
}

const DIFF_RANK: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

export function scoreExercise(ex: SuitabilityExercise, ctx: SuitabilityContext): SuitabilityScore {
  const f: Record<string, number> = {};
  const reasons: string[] = [];

  // base
  f.base = 50;

  // objetivo (tags)
  if (ex.objective_tags?.includes(ctx.objective)) { f.objective = 12; reasons.push('Alinhado ao objetivo.'); }
  else f.objective = 0;

  // dificuldade x experiência
  const exp = DIFF_RANK[ctx.experience] ?? 2;
  const diff = DIFF_RANK[ex.difficulty] ?? 2;
  if (diff <= exp) { f.difficulty = 8; }
  else { f.difficulty = -12; reasons.push('Mais avançado que o nível atual.'); }

  // equipamento disponível
  const equip = ctx.available_equipment;
  if (!equip || equip.length === 0 || equip.includes(ex.equipment)) f.equipment = 0;
  else { f.equipment = -100; reasons.push('Equipamento indisponível.'); }

  // prioridade do grupo muscular
  const idx = ctx.muscle_priority?.indexOf(ex.muscle_group) ?? -1;
  if (idx >= 0) { f.muscle = Math.max(0, 12 - idx * 2); }
  else f.muscle = 0;

  // ponto fraco
  if (ctx.weak_points?.includes(ex.muscle_group)) { f.weak = 12; reasons.push('Trabalha ponto fraco.'); }
  else f.weak = 0;

  // composto tende a ter prioridade
  if (ex.is_compound) { f.compound = 6; }
  else f.compound = 0;

  // preferências
  if (ctx.liked_ids?.includes(ex.id)) { f.liked = 8; reasons.push('Exercício preferido.'); }
  else f.liked = 0;
  if (ctx.disliked_ids?.includes(ex.id)) { f.disliked = -15; reasons.push('Exercício rejeitado.'); }
  else f.disliked = 0;

  // retenção (mantém quem progride)
  if (ctx.retained_ids?.includes(ex.id)) { f.retained = 14; reasons.push('Retido por boa progressão.'); }
  else f.retained = 0;

  // variação: penaliza uso recente se NÃO for retido
  if (ctx.recent_ids?.includes(ex.id) && !ctx.retained_ids?.includes(ex.id)) {
    f.freshness = -6; reasons.push('Usado recentemente — variar.');
  } else f.freshness = 0;

  // cautela física
  if (ctx.caution_ids?.includes(ex.id)) { f.caution = -18; reasons.push('Cautela física neste movimento.'); }
  else f.caution = 0;

  const raw = Object.values(f).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return { id: ex.id, name: ex.name, score, factors: f, reason: reasons.join(' ') || 'Adequado ao perfil.' };
}

export function rankBySuitability(
  exercises: SuitabilityExercise[],
  ctx: SuitabilityContext
): SuitabilityScore[] {
  return exercises.map((e) => scoreExercise(e, ctx)).sort((a, b) => b.score - a.score);
}
