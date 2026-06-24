/**
 * Cardio Progression Engine — EDN V8 Módulo 13
 * Metas de corrida baseadas no HISTÓRICO real do atleta (não fixas).
 * Calcula recordes pessoais, tendências (pace/FC/volume), próximas metas
 * progressivas (com deload) e a regra "não subir carga sem validação".
 * 100% determinístico.
 */

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export interface CardioRun { dateMs: number; km: number; durationMin: number; avgHr: number | null; }

export interface PersonalRecord { distanceKm: number; label: string; timeMin: number; paceMinPerKm: number; dateMs: number; }

export interface WeekTarget { week: number; km: number; type: 'progressao' | 'consolidacao' | 'deload'; note: string; }

export interface CardioEvolution {
  weeklyVolumeKm: number;
  paceTrendPct: number | null;     // - = mais rápido (melhor)
  hrTrendPct: number | null;       // - = menos esforço (melhor)
  efficiency: 'melhorando' | 'estavel' | 'piorando' | 'sem_dados';
  records: PersonalRecord[];
  validateIncrease: boolean;       // pode subir volume?
  nextTargets: WeekTarget[];
  report: { positives: string[]; limiter: string | null; nextStrategy: string };
}

const BUCKETS: { km: number; label: string }[] = [
  { km: 5, label: '5km' }, { km: 10, label: '10km' }, { km: 15, label: '15km' }, { km: 21.1, label: '21km' }, { km: 42.2, label: '42km' },
];

export function detectPersonalRecords(runs: CardioRun[]): PersonalRecord[] {
  const prs: PersonalRecord[] = [];
  for (const b of BUCKETS) {
    let best: PersonalRecord | null = null;
    for (const r of runs) {
      if (r.km <= 0 || r.durationMin <= 0) continue;
      // corrida cobre a distância do recorde (com leve tolerância)
      if (r.km >= b.km * 0.97) {
        const pace = r.durationMin / r.km;          // min/km
        const timeAtDist = pace * b.km;             // tempo estimado para a distância do PR
        if (!best || timeAtDist < best.timeMin) {
          best = { distanceKm: b.km, label: b.label, timeMin: Math.round(timeAtDist * 10) / 10, paceMinPerKm: Math.round(pace * 100) / 100, dateMs: r.dateMs };
        }
      }
    }
    if (best) prs.push(best);
  }
  return prs;
}

function avg(arr: number[]): number | null { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

export interface CardioEvolutionInput {
  runs: CardioRun[];               // últimos ~90 dias, qualquer ordem
  recoveryCategory: RecoveryCategory;
  goal: string | null;             // fat_loss | hypertrophy | performance | ...
}

export function computeCardioEvolution(i: CardioEvolutionInput): CardioEvolution {
  const runs = [...i.runs].sort((a, b) => a.dateMs - b.dateMs);
  const now = runs.length ? runs[runs.length - 1].dateMs : Date.now();
  const kmIn = (d: number) => runs.filter(r => r.dateMs >= now - d * 86400000).reduce((a, r) => a + r.km, 0);
  const km7 = kmIn(7), km28 = kmIn(28), km90 = kmIn(90);
  const weeklyVolumeKm = Math.round((km90 / Math.max(1, Math.ceil(90 / 7))) * 10) / 10;

  // Tendências: metade antiga vs recente
  let paceTrendPct: number | null = null, hrTrendPct: number | null = null;
  if (runs.length >= 4) {
    const mid = Math.floor(runs.length / 2);
    const p1 = avg(runs.slice(0, mid).filter(r => r.km > 0).map(r => r.durationMin / r.km));
    const p2 = avg(runs.slice(mid).filter(r => r.km > 0).map(r => r.durationMin / r.km));
    const h1 = avg(runs.slice(0, mid).filter(r => r.avgHr).map(r => r.avgHr as number));
    const h2 = avg(runs.slice(mid).filter(r => r.avgHr).map(r => r.avgHr as number));
    if (p1 && p2) paceTrendPct = Math.round(((p2 - p1) / p1) * 1000) / 10;
    if (h1 && h2) hrTrendPct = Math.round(((h2 - h1) / h1) * 1000) / 10;
  }

  const efficiency: CardioEvolution['efficiency'] = paceTrendPct == null ? 'sem_dados'
    : (paceTrendPct <= -2 || (hrTrendPct != null && hrTrendPct <= -3)) ? 'melhorando'
    : (paceTrendPct >= 3 && (hrTrendPct ?? 0) >= 2) ? 'piorando' : 'estavel';

  // Regra 13.5: não subir carga se volume↑>10% + FC↑ + pace↓
  const chronicWeekly = km28 > 0 ? km28 / 4 : 0;
  const rampPct = chronicWeekly > 0 ? ((km7 - chronicWeekly) / chronicWeekly) * 100 : 0;
  const lowRec = i.recoveryCategory === 'low' || i.recoveryCategory === 'critical';
  const validateIncrease = !(rampPct > 10 && (hrTrendPct ?? 0) > 0 && (paceTrendPct ?? 0) > 0) && !lowRec;

  // Metas das próximas 4 semanas
  const base = weeklyVolumeKm > 0 ? weeklyVolumeKm : (km7 > 0 ? km7 : 10);
  const nextTargets: WeekTarget[] = [];
  if (!validateIncrease) {
    for (let w = 1; w <= 3; w++) nextTargets.push({ week: w, km: Math.round(base), type: 'consolidacao', note: 'Consolidar o volume atual antes de progredir (adaptação/recuperação).' });
    nextTargets.push({ week: 4, km: Math.round(base * 0.6), type: 'deload', note: 'Deload: reduzir ~40% para supercompensar.' });
  } else {
    let km = base;
    for (let w = 1; w <= 3; w++) { km = Math.round(km * 1.1); nextTargets.push({ week: w, km, type: 'progressao', note: `+10% de volume (semana ${w}).` }); }
    nextTargets.push({ week: 4, km: Math.round(base * 0.6), type: 'deload', note: 'Deload: reduzir ~40% para supercompensar.' });
  }

  // Relatório de evolução
  const positives: string[] = [];
  if (paceTrendPct != null && paceTrendPct <= -2) positives.push(`Pace ${Math.abs(paceTrendPct)}% mais rápido`);
  if (hrTrendPct != null && hrTrendPct <= -3) positives.push(`FC ${Math.abs(hrTrendPct)}% menor (eficiência aeróbica)`);
  if (km90 > 0 && km7 > chronicWeekly && chronicWeekly > 0) positives.push('Volume crescente');
  let limiter: string | null = null;
  if (paceTrendPct != null && paceTrendPct <= -2 && (km7 <= chronicWeekly)) limiter = 'Velocidade evoluindo mais rápido que a resistência';
  else if (lowRec) limiter = 'Recuperação';
  else if (!validateIncrease) limiter = 'Carga/adaptação (segurar progressão)';
  const nextStrategy = limiter && limiter.includes('resistência') ? 'Adicionar uma corrida longa (Z2) semanal.'
    : lowRec ? 'Reduzir intensidade e priorizar Z2/recuperação.'
    : !validateIncrease ? 'Manter o volume atual por 1–2 semanas e reavaliar.'
    : 'Progressão de +10%/semana com 1 sessão de qualidade (limiar/intervalado).';

  return { weeklyVolumeKm, paceTrendPct, hrTrendPct, efficiency, records: detectPersonalRecords(runs), validateIncrease, nextTargets, report: { positives, limiter, nextStrategy } };
}
