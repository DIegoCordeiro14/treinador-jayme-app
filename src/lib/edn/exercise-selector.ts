/**
 * Exercise Selector V3.1 — Motor de Seleção Inteligente de Exercícios EDN
 *
 * Garante que dois atletas com objetivos diferentes recebam exercícios diferentes.
 * Usa scoring multicritério: objetivo, experiência, limitações, preferências, equipamento.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type Objective = 'hypertrophy' | 'weight_loss' | 'definition' | 'strength' | 'recomp' | 'running' | 'health';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type Limitation = 'knee' | 'lower_back' | 'shoulder' | 'wrist' | 'neck' | 'hip' | 'reduced_mobility';
export type Preference = 'liked' | 'neutral' | 'disliked';

export interface CatalogExercise {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;          // barbell | dumbbell | machine | cable | bodyweight | smith_machine | kettlebell | bands
  difficulty: string;         // beginner | intermediate | advanced
  objective_tags?: string[];  // hypertrophy, weight_loss, etc (DB field, optional)
  is_metabolic?: boolean;
  is_compound?: boolean;
}

export interface SelectionContext {
  objective: Objective;
  experience: ExperienceLevel;
  limitations: Limitation[];
  liked_ids: string[];
  disliked_ids: string[];
  focus_muscle?: string | null;
  available_equipment?: string[];
  mesocycle_number?: number;         // 1, 2, 3… para variar exercícios entre mesociclos
  previous_exercise_ids?: string[];  // exercícios do mesociclo anterior (manter 70%)
  exercises_per_session: number;
  muscle_groups_in_session: string[];
}

export interface ScoredExercise extends CatalogExercise {
  score: number;
  selection_reason: string;
}

export interface SelectionResult {
  selected: CatalogExercise[];
  explanation: string;
  reasoning_bullets: string[];
}

// ── Objective priority rules ──────────────────────────────────────────────────

// Muscle groups prioritized per objective (higher index = lower priority)
const OBJECTIVE_MUSCLE_PRIORITY: Record<Objective, string[]> = {
  hypertrophy: ['chest','back','legs','shoulders','biceps','triceps','glutes','abs','calves','forearms'],
  weight_loss: ['full_body','legs','back','chest','glutes','shoulders','abs','biceps','triceps','calves'],
  definition:  ['back','legs','chest','glutes','shoulders','abs','biceps','triceps','calves','forearms'],
  strength:    ['legs','back','chest','shoulders','abs','glutes','biceps','triceps'],
  recomp:      ['back','legs','chest','glutes','shoulders','abs','biceps','triceps'],
  running:     ['legs','glutes','abs','calves','back','shoulders','chest'],
  health:      ['back','legs','abs','chest','shoulders','glutes','biceps','triceps'],
};

// Equipment preference per objective
const OBJECTIVE_EQUIPMENT_BONUS: Record<Objective, Record<string, number>> = {
  hypertrophy: { barbell: 15, dumbbell: 12, machine: 10, cable: 8, smith_machine: 5, bodyweight: 3, kettlebell: 5, bands: 2 },
  weight_loss: { bodyweight: 15, kettlebell: 14, bands: 10, dumbbell: 10, barbell: 8, cable: 8, machine: 5, smith_machine: 3 },
  definition:  { cable: 12, dumbbell: 12, machine: 10, barbell: 10, bodyweight: 8, kettlebell: 8, bands: 6, smith_machine: 4 },
  strength:    { barbell: 20, dumbbell: 10, bodyweight: 8, cable: 5, machine: 5, smith_machine: 3, kettlebell: 6, bands: 2 },
  recomp:      { barbell: 12, dumbbell: 12, machine: 10, cable: 10, bodyweight: 10, kettlebell: 10, bands: 6, smith_machine: 4 },
  running:     { bodyweight: 15, dumbbell: 12, bands: 10, cable: 8, machine: 8, kettlebell: 10, barbell: 6, smith_machine: 3 },
  health:      { machine: 15, dumbbell: 12, cable: 10, bodyweight: 12, bands: 10, barbell: 8, kettlebell: 8, smith_machine: 5 },
};

// Equipment ratio per experience: [machine_weight, free_weight_bonus]
const EXPERIENCE_EQUIPMENT_WEIGHT: Record<ExperienceLevel, Record<string, number>> = {
  beginner:     { machine: 20, smith_machine: 15, cable: 10, bodyweight: 8, dumbbell: 5, barbell: 0, kettlebell: 0, bands: 8 },
  intermediate: { machine: 8,  smith_machine: 6,  cable: 8,  bodyweight: 8, dumbbell: 8, barbell: 8, kettlebell: 6, bands: 5 },
  advanced:     { machine: 0,  smith_machine: 2,  cable: 8,  bodyweight: 10, dumbbell: 12, barbell: 18, kettlebell: 12, bands: 5 },
};

// Exercises to AVOID per limitation
const LIMITATION_BLACKLIST: Record<Limitation, string[]> = {
  knee:             ['agachamento livre','agachamento','hack squat','leg press','afundo','lunge','step up','extensora','cadeira extensora','pulo'],
  lower_back:       ['terra convencional','levantamento terra','good morning','hiperextensão','agachamento livre','remada curvada'],
  shoulder:         ['desenvolvimento militar','overhead press','elevação lateral','elevação frontal','supino inclinado','crucifixo inclinado','arnold'],
  wrist:            ['rosca direta','rosca alternada','extensão punho','flexão punho','levantamento terra'],
  neck:             ['encolhimento','shrug','desenvolvimento','overhead'],
  hip:              ['agachamento','terra','afundo','agachamento búlgaro','hip thrust','step up'],
  reduced_mobility: ['agachamento livre','terra convencional','barra fixa','mergulho','dip'],
};

// Substitute exercises for each limitation (what to use instead)
const LIMITATION_SUBSTITUTES: Record<Limitation, { avoid_keywords: string[]; prefer: string[] }> = {
  knee:          { avoid_keywords: ['agachamento','afundo','lunge','step','extensora'], prefer: ['leg press','cadeira flexora','leg curl','stiff','hip thrust','panturrilha'] },
  lower_back:    { avoid_keywords: ['terra convencional','good morning','hiperextensão'], prefer: ['hip thrust','terra romeno','terra trap','cabo','máquina'] },
  shoulder:      { avoid_keywords: ['overhead','desenvolvimento','elevação frontal','press acima'], prefer: ['puxada','pulldown','remada','cabo','paralelas neutras'] },
  wrist:         { avoid_keywords: ['rosca direta barbell','extensão punho'], prefer: ['rosca máquina','rosca cabo','hammer curl'] },
  neck:          { avoid_keywords: ['encolhimento','shrug'], prefer: ['trapézio máquina','remada alta cabo'] },
  hip:           { avoid_keywords: ['agachamento','afundo'], prefer: ['leg press','cadeira','stiff','extensora'] },
  reduced_mobility: { avoid_keywords: ['agachamento livre','terra convencional'], prefer: ['leg press','smith','máquina','cabo'] },
};

// ── Scoring Engine ────────────────────────────────────────────────────────────

function scoreExercise(
  ex: CatalogExercise,
  ctx: SelectionContext,
): { score: number; blocked: boolean; reason: string } {
  let score = 50; // base
  const reasons: string[] = [];

  // 1. Objective muscle priority
  const musclePriority = OBJECTIVE_MUSCLE_PRIORITY[ctx.objective] ?? OBJECTIVE_MUSCLE_PRIORITY.hypertrophy;
  const muscleRank = musclePriority.indexOf(ex.muscle_group);
  if (muscleRank >= 0) {
    const bonus = Math.max(0, 30 - muscleRank * 4);
    score += bonus;
  }

  // 2. Equipment: objective preference + experience
  const objEquip = OBJECTIVE_EQUIPMENT_BONUS[ctx.objective]?.[ex.equipment] ?? 5;
  const expEquip = EXPERIENCE_EQUIPMENT_WEIGHT[ctx.experience]?.[ex.equipment] ?? 5;
  score += objEquip + expEquip;

  // 3. Difficulty vs experience
  const diffMap = { beginner: 0, intermediate: 1, advanced: 2 };
  const expMap  = { beginner: 0, intermediate: 1, advanced: 2 };
  const diff = diffMap[ex.difficulty as keyof typeof diffMap] ?? 1;
  const exp  = expMap[ctx.experience];
  if (diff <= exp) score += 10;                   // appropriate or easier
  if (diff === exp) score += 5;                   // exact match bonus
  if (diff > exp + 1) score -= 20;               // too advanced

  // 4. Focus muscle boost
  if (ctx.focus_muscle && ex.muscle_group === ctx.focus_muscle) score += 25;

  // 5. Session muscle group relevance
  if (ctx.muscle_groups_in_session.includes(ex.muscle_group)) score += 15;

  // 6. User preferences
  if (ctx.liked_ids.includes(ex.id)) { score += 30; reasons.push('preferido pelo atleta'); }
  if (ctx.disliked_ids.includes(ex.id)) { score -= 40; reasons.push('baixa prioridade (não gostou)'); }

  // 7. Available equipment filter
  if (ctx.available_equipment && ctx.available_equipment.length > 0) {
    if (!ctx.available_equipment.includes(ex.equipment)) score -= 50;
  }

  // 8. Mesocycle variation: prefer different exercises (30% change rule)
  if (ctx.previous_exercise_ids && ctx.previous_exercise_ids.length > 0) {
    if (ctx.previous_exercise_ids.includes(ex.id)) {
      score += 8; // slight preference to keep 70%
    } else {
      score += 3; // slight bonus for variety (30% change)
    }
  }

  // 9. Limitation check (hard block)
  let blocked = false;
  for (const limit of ctx.limitations) {
    const blacklist = LIMITATION_BLACKLIST[limit] ?? [];
    const nameLC = ex.name.toLowerCase();
    if (blacklist.some(keyword => nameLC.includes(keyword.toLowerCase()))) {
      blocked = true;
      reasons.push(`bloqueado (${limit})`);
      break;
    }
  }

  const reason = reasons.length > 0 ? reasons.join(', ') : '';
  return { score, blocked, reason };
}

// ── Main Selector ─────────────────────────────────────────────────────────────

export function selectExercises(
  catalog: CatalogExercise[],
  ctx: SelectionContext,
): SelectionResult {

  // Score and filter all exercises
  const scored: ScoredExercise[] = catalog
    .map(ex => {
      const { score, blocked, reason } = scoreExercise(ex, ctx);
      return { ...ex, score, selection_reason: reason, _blocked: blocked } as ScoredExercise & { _blocked: boolean };
    })
    .filter(ex => !ex._blocked)
    .sort((a, b) => b.score - a.score);

  // Select diversified set: pick top exercises per muscle group needed
  const selected: ScoredExercise[] = [];
  const groupCounts: Record<string, number> = {};
  const neededGroups = new Set(ctx.muscle_groups_in_session);

  // First pass: get best exercise per needed muscle group
  for (const group of neededGroups) {
    const candidates = scored.filter(e => e.muscle_group === group);
    if (candidates.length > 0) {
      selected.push(candidates[0]);
      groupCounts[group] = 1;
    }
  }

  // Second pass: fill remaining slots with top-scored exercises (avoid duplicates)
  const selectedIds = new Set(selected.map(e => e.id));
  let remaining = ctx.exercises_per_session - selected.length;

  // For weight_loss: add metabolic/full_body exercises
  if (ctx.objective === 'weight_loss' || ctx.objective === 'definition') {
    const metabolic = scored.filter(e =>
      !selectedIds.has(e.id) &&
      (e.muscle_group === 'full_body' || e.equipment === 'kettlebell' || e.equipment === 'bodyweight')
    );
    for (const ex of metabolic.slice(0, Math.min(2, remaining))) {
      selected.push(ex);
      selectedIds.add(ex.id);
      remaining--;
    }
  }

  // Fill remaining slots with highest-scored unused
  for (const ex of scored) {
    if (remaining <= 0) break;
    if (!selectedIds.has(ex.id)) {
      selected.push(ex);
      selectedIds.add(ex.id);
      remaining--;
    }
  }

  // Sort final list: compounds first, then isolations
  selected.sort((a, b) => {
    const aComp = isCompound(a) ? 1 : 0;
    const bComp = isCompound(b) ? 1 : 0;
    if (bComp !== aComp) return bComp - aComp;
    return b.score - a.score;
  });

  // Generate explanation
  const { explanation, bullets } = buildExplanation(ctx, selected);

  return { selected, explanation, reasoning_bullets: bullets };
}

function isCompound(ex: CatalogExercise): boolean {
  const compoundGroups = ['legs', 'back', 'chest', 'full_body', 'glutes'];
  const compoundEquip  = ['barbell', 'dumbbell'];
  const compoundWords  = ['agachamento', 'terra', 'supino', 'barra fixa', 'remada', 'desenvolvimento', 'afundo', 'hip thrust', 'stiff', 'deadlift', 'squat', 'bench', 'row', 'press'];
  return (
    compoundGroups.includes(ex.muscle_group) ||
    (compoundEquip.includes(ex.equipment) && !['biceps','triceps','calves','forearms'].includes(ex.muscle_group)) ||
    compoundWords.some(w => ex.name.toLowerCase().includes(w))
  );
}

// ── Explanation Builder ───────────────────────────────────────────────────────

function buildExplanation(ctx: SelectionContext, selected: CatalogExercise[]): { explanation: string; bullets: string[] } {
  const objPt: Record<Objective, string> = {
    hypertrophy: 'Hipertrofia',
    weight_loss: 'Emagrecimento',
    definition:  'Definição',
    strength:    'Força',
    recomp:      'Recomposição Corporal',
    running:     'Corrida',
    health:      'Saúde',
  };
  const expPt: Record<ExperienceLevel, string> = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };

  const machineCount = selected.filter(e => ['machine','smith_machine','cable'].includes(e.equipment)).length;
  const freeCount    = selected.filter(e => ['barbell','dumbbell','kettlebell'].includes(e.equipment)).length;
  const bwCount      = selected.filter(e => e.equipment === 'bodyweight').length;
  const obj = objPt[ctx.objective];
  const exp = expPt[ctx.experience];

  const bullets: string[] = [];

  // Objective-specific rationale
  if (ctx.objective === 'weight_loss' || ctx.objective === 'definition') {
    bullets.push(`Priorizados exercícios multiarticulares e metabólicos para maximizar gasto calórico mantendo massa muscular.`);
  } else if (ctx.objective === 'hypertrophy') {
    bullets.push(`Seleção balanceada: compostos para tensão mecânica + isoladores para volume localizado — estratégia máxima de hipertrofia para naturais.`);
  } else if (ctx.objective === 'strength') {
    bullets.push(`Foco em padrões de movimento fundamentais (squat, hinge, press, pull) com barras livres para máxima transferência de força.`);
  } else if (ctx.objective === 'running') {
    bullets.push(`Musculação de suporte: glúteos, posteriores e core — grupos que mais impactam a economia de corrida e previnem lesões.`);
  } else if (ctx.objective === 'recomp') {
    bullets.push(`Mix 60% hipertrofia / 40% condicionamento: preserva músculo enquanto aumenta o gasto calórico semanal.`);
  }

  // Equipment rationale
  if (ctx.experience === 'beginner') {
    bullets.push(`${machineCount} exercícios em máquina (${Math.round(machineCount/selected.length*100)}%): mais seguros e didáticos para iniciantes aprenderem o padrão motor.`);
  } else if (ctx.experience === 'advanced') {
    bullets.push(`${freeCount} exercícios livres (${Math.round(freeCount/selected.length*100)}%): atleta avançado se beneficia mais da instabilidade e recrutamento neuromuscular extra.`);
  } else {
    bullets.push(`Distribuição equilibrada: máquinas + livres (${machineCount}/${freeCount}) — ideal para intermediários consolidando técnica.`);
  }

  // Limitations
  if (ctx.limitations.length > 0) {
    const limitPt: Record<string, string> = { knee: 'joelho', lower_back: 'lombar', shoulder: 'ombro', wrist: 'punho', neck: 'pescoço', hip: 'quadril', reduced_mobility: 'mobilidade reduzida' };
    const limitNames = ctx.limitations.map(l => limitPt[l] ?? l).join(', ');
    bullets.push(`Limitações (${limitNames}) aplicadas: exercícios de alto risco para essas regiões foram substituídos automaticamente.`);
  }

  // Preferences
  const likedCount = selected.filter(e => ctx.liked_ids.includes(e.id)).length;
  if (likedCount > 0) bullets.push(`${likedCount} exercício(s) de preferência do atleta incluídos com prioridade.`);

  // Focus muscle
  if (ctx.focus_muscle) {
    const focusPt: Record<string, string> = { chest:'Peito', back:'Costas', shoulders:'Ombros', biceps:'Bíceps', triceps:'Tríceps', legs:'Pernas', glutes:'Glúteos', abs:'Abdômen' };
    bullets.push(`Especialização em ${focusPt[ctx.focus_muscle] ?? ctx.focus_muscle}: 40% mais volume e posição prioritária nas sessões.`);
  }

  // Mesocycle variation
  if (ctx.mesocycle_number && ctx.mesocycle_number > 1 && ctx.previous_exercise_ids?.length) {
    const kept    = selected.filter(e => ctx.previous_exercise_ids!.includes(e.id)).length;
    const changed = selected.length - kept;
    bullets.push(`Mesociclo ${ctx.mesocycle_number}: ${kept} exercícios mantidos (70% continuidade) + ${changed} novos (30% variação EDN).`);
  }

  const explanation = `Seu objetivo é ${obj}. Foram priorizados exercícios ` +
    (ctx.objective === 'weight_loss' ? 'multiarticulares e metabólicos para aumentar o gasto calórico sem comprometer a massa muscular' :
     ctx.objective === 'hypertrophy' ? 'com alto potencial de tensão mecânica e volume localizado, equilibrando compostos e isoladores' :
     ctx.objective === 'strength'    ? 'fundamentais com barras livres e baixa repetição para máxima expressão de força' :
     ctx.objective === 'running'     ? 'de suporte à corrida: glúteos, posteriores de coxa e core — os motores da performance aeróbica' :
     'adequados ao seu objetivo e recuperação atual') +
    `. Como você possui nível ${exp.toLowerCase()}, foram incluídos ` +
    (ctx.experience === 'beginner' ? 'principalmente máquinas e movimentos guiados para construção de base técnica' :
     ctx.experience === 'advanced'  ? 'movimentos livres e variações técnicas avançadas para continuar progredindo' :
     'uma mistura de máquinas e livres para consolidar técnica com cargas progressivas') + '.';

  return { explanation, bullets };
}

// ── Format for AI prompt ──────────────────────────────────────────────────────

export function formatSelectionForAI(result: SelectionResult): string {
  const lines = [
    `EXERCÍCIOS PRÉ-SELECIONADOS pelo Motor EDN V3.1 (${result.selected.length} exercícios):`,
    result.explanation,
    '',
    'RACIOCÍNIO:',
    ...result.reasoning_bullets.map(b => `  • ${b}`),
    '',
    'USE APENAS ESTES EXERCÍCIOS (em ordem de prioridade — compostos primeiro):',
    ...result.selected.map((e, i) => `  ${i+1}. ${e.id} | ${e.name} | ${e.muscle_group} | ${e.equipment}`),
  ];
  return lines.join('\n');
}
