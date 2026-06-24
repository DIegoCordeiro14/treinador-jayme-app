/**
 * Volume Analysis — EDN V8
 * Monitora volume por grupo muscular (séries semanais, frequência) e detecta
 * excesso/insuficiência, recomendando séries-alvo. Determinístico.
 * Faixas de referência (séries efetivas/semana, naturais): MEV ~8, MAV 12–18, MRV ~22.
 */

export interface MuscleWeekVolume {
  muscle: string;
  setsThisWeek: number;
  setsPrevWeek: number | null;
  frequency: number;           // nº de dias que treinou o grupo na semana
  perfTrendPct: number | null; // tendência de performance (volume de carga) — opcional
}

export interface MuscleVolumeVerdict {
  muscle: string;
  setsThisWeek: number;
  changePct: number | null;
  status: 'abaixo' | 'ideal' | 'alto' | 'excessivo';
  recommendedSets: number;
  note: string;
}

const MUSCLE_LABEL: Record<string, string> = {
  chest: 'Peito', back: 'Costas', legs: 'Pernas', shoulders: 'Ombros',
  biceps: 'Bíceps', triceps: 'Tríceps', glutes: 'Glúteos', hamstrings: 'Posteriores',
  quads: 'Quadríceps', calves: 'Panturrilhas', abs: 'Abdômen', forearms: 'Antebraços',
};
const label = (m: string) => MUSCLE_LABEL[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : m);

const MEV = 8, MAV_LOW = 12, MAV_HIGH = 18, MRV = 22;

export function analyzeMuscleVolume(m: MuscleWeekVolume): MuscleVolumeVerdict {
  const changePct = m.setsPrevWeek && m.setsPrevWeek > 0
    ? Math.round(((m.setsThisWeek - m.setsPrevWeek) / m.setsPrevWeek) * 100)
    : null;

  let status: MuscleVolumeVerdict['status'];
  let recommendedSets: number;
  let note: string;

  // Excessivo: acima do MRV OU saltou muito e a performance caiu
  if (m.setsThisWeek > MRV || (changePct != null && changePct >= 60 && (m.perfTrendPct ?? 0) < 0)) {
    status = 'excessivo';
    recommendedSets = MAV_HIGH;
    note = `${label(m.muscle)}: ${m.setsThisWeek} séries${changePct != null ? ` (${changePct > 0 ? '+' : ''}${changePct}%)` : ''}${(m.perfTrendPct ?? 0) < 0 ? ' e performance caindo' : ''}. Reduzir para ~${recommendedSets} séries efetivas.`;
  } else if (m.setsThisWeek >= MAV_LOW && m.setsThisWeek <= MRV) {
    status = m.setsThisWeek > MAV_HIGH ? 'alto' : 'ideal';
    recommendedSets = m.setsThisWeek;
    note = `${label(m.muscle)}: ${m.setsThisWeek} séries/sem — dentro da faixa produtiva${m.frequency < 2 ? '; suba a frequência p/ 2x/sem' : ''}.`;
  } else {
    status = 'abaixo';
    recommendedSets = MAV_LOW;
    note = `${label(m.muscle)}: só ${m.setsThisWeek} séries/sem — abaixo do ideal. Subir para ~${recommendedSets} (idealmente 2x/sem).`;
  }

  return { muscle: label(m.muscle), setsThisWeek: m.setsThisWeek, changePct, status, recommendedSets, note };
}

export function analyzeAllVolume(muscles: MuscleWeekVolume[]): MuscleVolumeVerdict[] {
  return muscles.map(analyzeMuscleVolume).sort((a, b) => {
    const order = { excessivo: 0, abaixo: 1, alto: 2, ideal: 3 } as const;
    return order[a.status] - order[b.status];
  });
}
