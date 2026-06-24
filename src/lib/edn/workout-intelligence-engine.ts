/**
 * Workout Intelligence Engine — EDN V8.1
 * Análise determinística ANTES de gerar o treino: consolida perfil, corpo,
 * objetivo, histórico, ponto fraco, recuperação e equipamentos em DIRETRIZES
 * de prescrição (que a IA usa para montar o plano — sem inventar números).
 */

export interface WorkoutContext {
  sex: string | null;
  age: number | null;
  bodyFatPct: number | null;
  goal: string | null;                 // fat_loss | hypertrophy | recomposition | definition | ...
  experience: string | null;           // beginner | intermediate | advanced
  weeklyVolumeKg: number | null;
  volumeTrendPct: number | null;
  weakMuscle: string | null;           // grupo atrasado (Weak Point Engine)
  recoveryCategory: 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
  equipment: string | null;            // full_gym | home | minimal
  limitations: string | null;
}

export interface PrescriptionGuidelines {
  emphasis: string;                    // foco principal da prescrição
  repRange: string;                    // faixa de reps
  restSeconds: string;                 // descanso
  volumeNote: string;                  // ajuste de volume
  priorities: string[];                // grupos/ações priorizadas
  cautions: string[];                  // ressalvas (fadiga/limitação)
}

export function analyzeWorkoutContext(c: WorkoutContext): PrescriptionGuidelines {
  const cutting = c.goal === 'fat_loss' || c.goal === 'weight_loss' || c.goal === 'definition';
  const bulking = c.goal === 'hypertrophy' || c.goal === 'mass_gain' || c.goal === 'lean_bulk';
  const highBf = c.bodyFatPct != null && c.bodyFatPct >= 25;

  const priorities: string[] = [];
  const cautions: string[] = [];

  let emphasis: string;
  let repRange: string;
  let restSeconds: string;
  let volumeNote: string;

  if (cutting) {
    emphasis = highBf ? 'Recomposição: gasto energético alto preservando força' : 'Definição: preservar músculo em déficit';
    repRange = '10–15 (compostos 8–12)';
    restSeconds = '45–75s';
    volumeNote = 'Volume eficiente e controlado; densidade alta (descanso menor).';
    priorities.push('Manutenção de força nos compostos', 'Maior gasto energético (multiarticulares, super-sets)');
  } else if (bulking) {
    emphasis = 'Hipertrofia: volume efetivo e progressão';
    repRange = '8–15';
    restSeconds = '75–120s';
    volumeNote = 'Aumentar volume efetivo semana a semana; 2x/sem por grupo.';
    priorities.push('Progressão de carga', 'Frequência muscular 2x/semana');
  } else {
    emphasis = 'Equilíbrio força + hipertrofia';
    repRange = '6–12';
    restSeconds = '90–150s';
    volumeNote = 'Volume moderado com progressão.';
  }

  if (c.sex === 'female') priorities.push('Glúteos, posteriores e quadríceps');
  if (c.sex === 'male') priorities.push('Shape em V: dorsais, ombros, peito');

  if (c.weakMuscle) priorities.unshift(`Especializar ${c.weakMuscle} (+1 frequência, +volume)`);

  if (c.recoveryCategory === 'low' || c.recoveryCategory === 'critical') {
    volumeNote = 'Reduzir volume hoje (-1 série nos compostos) — recuperação baixa.';
    cautions.push('Recuperação baixa: evitar falhas e volume excessivo.');
  }
  if (c.volumeTrendPct != null && c.volumeTrendPct < -10) cautions.push('Volume em queda — verificar fadiga/aderência.');
  if (c.limitations) cautions.push(`Limitação declarada: ${c.limitations} — adaptar exercícios.`);
  if (c.equipment === 'home' || c.equipment === 'minimal') cautions.push('Equipamento limitado — priorizar halteres/peso corporal.');

  return { emphasis, repRange, restSeconds, volumeNote, priorities, cautions };
}
