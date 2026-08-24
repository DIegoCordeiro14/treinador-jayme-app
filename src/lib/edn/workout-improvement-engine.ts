/**
 * Workout Improvement Engine (§24) — melhora um treino IMPORTADO preservando a maior
 * parte da estrutura original e EXPLICANDO cada mudança, com base em: volume por
 * grupo muscular, ponto fraco, objetivo e frequência. Determinístico e testável.
 * Não altera nada sozinho — produz um plano proposto + diff para confirmação.
 */

export interface ImportedExercise { name: string; muscleGroup: string; sets: number; repsMin: number; repsMax: number }
export interface ImportedDay { name: string; exercises: ImportedExercise[] }

export interface ImprovementSignals {
  weakPointMuscle?: string | null;     // músculo atrasado (Weak Point Engine)
  overtrainedMuscles?: string[];       // acima do MRV
  goal?: string | null;                // 'hypertrophy' | 'fat_loss' | ...
  minSetsPerMuscle?: number;           // MEV alvo (default 8/semana)
}

export type ChangeType = 'increase_volume' | 'reduce_volume' | 'add_exercise_slot' | 'adjust_reps' | 'keep';
export interface PlanChange { day: string; target: string; type: ChangeType; from?: string; to?: string; reason: string }

export interface ImprovementResult {
  days: ImportedDay[];
  changes: PlanChange[];
  structureKeptPct: number;   // % de exercícios preservados sem alteração
  summary: string;
}

function weeklySetsByMuscle(days: ImportedDay[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of days) for (const e of d.exercises) m[e.muscleGroup] = (m[e.muscleGroup] ?? 0) + e.sets;
  return m;
}

export function improveImportedWorkout(days: ImportedDay[], signals: ImprovementSignals = {}): ImprovementResult {
  const minSets = signals.minSetsPerMuscle ?? 8;
  const goal = signals.goal ?? 'hypertrophy';
  const isCut = ['fat_loss', 'definition', 'weight_loss'].includes(goal);
  const changes: PlanChange[] = [];
  // cópia profunda para não mutar a original
  const out: ImportedDay[] = days.map(d => ({ name: d.name, exercises: d.exercises.map(e => ({ ...e })) }));

  let totalEx = 0, touched = 0;
  for (const d of out) totalEx += d.exercises.length;

  const weekly = weeklySetsByMuscle(out);
  const weak = signals.weakPointMuscle ?? null;

  // 1. Ponto fraco: reforçar volume onde há exercícios do músculo atrasado
  if (weak) {
    for (const d of out) for (const e of d.exercises) {
      if (e.muscleGroup === weak && (weekly[weak] ?? 0) < minSets + 4) {
        const from = `${e.sets}x`; e.sets += 1; touched++;
        changes.push({ day: d.name, target: e.name, type: 'increase_volume', from, to: `${e.sets}x`, reason: `${weak} é seu ponto fraco — +1 série para acelerar a evolução.` });
      }
    }
  }

  // 2. Músculos acima do MRV: aparar a última série dos isolados
  for (const mg of (signals.overtrainedMuscles ?? [])) {
    for (const d of out) for (const e of d.exercises) {
      if (e.muscleGroup === mg && e.sets > 3) {
        const from = `${e.sets}x`; e.sets -= 1; touched++;
        changes.push({ day: d.name, target: e.name, type: 'reduce_volume', from, to: `${e.sets}x`, reason: `${mg} está acima do volume ótimo (MRV) — reduzir 1 série evita fadiga sem perder estímulo.` });
      }
    }
  }

  // 3. Faixa de reps por objetivo: cutting favorece reps um pouco mais altas nos isolados
  if (isCut) {
    for (const d of out) for (const e of d.exercises) {
      if (e.repsMax < 12) {
        const from = `${e.repsMin}-${e.repsMax}`; e.repsMax = Math.min(15, e.repsMax + 3); touched++;
        changes.push({ day: d.name, target: e.name, type: 'adjust_reps', from, to: `${e.repsMin}-${e.repsMax}`, reason: 'Objetivo de emagrecimento: faixa de reps um pouco mais alta aumenta o gasto e a densidade do treino.' });
      }
    }
  }

  // 4. Músculo abaixo do MEV e presente no plano: sinalizar necessidade de mais um slot
  const weekly2 = weeklySetsByMuscle(out);
  for (const [mg, sets] of Object.entries(weekly2)) {
    if (sets < minSets) {
      changes.push({ day: '—', target: mg, type: 'add_exercise_slot', reason: `${mg} está abaixo do volume mínimo (${sets}/${minSets} séries/semana) — considere adicionar um exercício.` });
    }
  }

  const structureKeptPct = totalEx > 0 ? Math.round(((totalEx - touched) / totalEx) * 100) : 100;
  const summary = changes.length === 0
    ? 'O treino importado já está bem estruturado para seu perfil — nenhuma mudança necessária.'
    : `Mantive ${structureKeptPct}% da estrutura original e ajustei ${touched} exercício(s): ${[...new Set(changes.map(c => c.reason.split(' —')[0].split(':')[0]))].slice(0, 3).join('; ')}.`;
  return { days: out, changes, structureKeptPct, summary };
}
