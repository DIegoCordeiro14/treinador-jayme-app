// adaptive-energy-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §4 — Gasto energético de ATIVIDADE por prioridade de dados, sem
// dupla contagem.
//
// Prioridade: (1) calorias medidas por wearable; (2) sessões reais do Coach EDN
// (musculação/cardio) estimadas; (3) fator de atividade genérico. Cada atividade
// carrega origem e um flag `counted` para nunca somar a mesma sessão duas vezes.
// Puro/determinístico. NÃO recalcula TMB/macros — só o gasto de atividade.
// ─────────────────────────────────────────────────────────────────────────────

export type EnergySource = 'wearable' | 'edn_session' | 'estimated';

export interface ActivityRecord {
  id: string;
  dateISO: string;
  kind: 'strength' | 'cardio' | 'other';
  // se veio do wearable já com kcal medido
  measuredKcal?: number | null;
  // dados para estimativa quando não há kcal medido
  durationMin?: number | null;
  distanceKm?: number | null;
  volumeKg?: number | null;
  bodyWeightKg?: number | null;
  // chave para deduplicar (ex: external_id do wearable ou id da sessão)
  dedupeKey?: string | null;
}

export interface CountedActivity {
  id: string;
  dateISO: string;
  kind: ActivityRecord['kind'];
  energyKcal: number;
  source: EnergySource;
  counted: boolean;
  reason: string;
}

export interface AdaptiveEnergyResult {
  activities: CountedActivity[];
  weeklyActivityKcal: number;
  dailyAvgActivityKcal: number;
  doubleCountsAvoided: number;
  windowDays: number;
}

// estimativa de kcal de cardio por distância (corrida ~1 kcal/kg/km)
function estimateCardioKcal(a: ActivityRecord): number {
  const w = a.bodyWeightKg ?? 70;
  if (a.distanceKm && a.distanceKm > 0) return Math.round(a.distanceKm * w * 0.9);
  if (a.durationMin && a.durationMin > 0) return Math.round((a.durationMin / 60) * 8 * w); // ~8 MET
  return 0;
}
// estimativa de kcal de musculação (~5 MET por duração; ou por volume)
function estimateStrengthKcal(a: ActivityRecord): number {
  const w = a.bodyWeightKg ?? 70;
  if (a.durationMin && a.durationMin > 0) return Math.round((a.durationMin / 60) * 5 * w);
  if (a.volumeKg && a.volumeKg > 0) return Math.round(a.volumeKg * 0.03); // heurística leve
  return 0;
}

export function computeAdaptiveEnergy(records: ActivityRecord[], windowDays = 7): AdaptiveEnergyResult {
  const seen = new Set<string>();
  let doubleCountsAvoided = 0;
  const activities: CountedActivity[] = [];

  // ordena: wearable (medido) primeiro, para que a versão medida "ganhe" a chave de dedupe
  const ordered = [...records].sort((a, b) => {
    const aw = a.measuredKcal != null ? 0 : 1;
    const bw = b.measuredKcal != null ? 0 : 1;
    return aw - bw;
  });

  for (const a of ordered) {
    const key = a.dedupeKey ?? `${a.dateISO.slice(0, 10)}|${a.kind}|${a.distanceKm ?? ''}|${a.durationMin ?? ''}`;
    if (seen.has(key)) {
      doubleCountsAvoided++;
      activities.push({ id: a.id, dateISO: a.dateISO, kind: a.kind, energyKcal: 0, source: 'estimated', counted: false, reason: 'já contabilizada (evita dupla contagem)' });
      continue;
    }
    seen.add(key);

    let energyKcal: number; let source: EnergySource; let reason: string;
    if (a.measuredKcal != null && a.measuredKcal > 0) {
      energyKcal = Math.round(a.measuredKcal); source = 'wearable'; reason = 'kcal medido pelo wearable';
    } else {
      energyKcal = a.kind === 'strength' ? estimateStrengthKcal(a) : a.kind === 'cardio' ? estimateCardioKcal(a) : 0;
      source = 'edn_session'; reason = 'estimado a partir da sessão registrada';
    }
    activities.push({ id: a.id, dateISO: a.dateISO, kind: a.kind, energyKcal, source, counted: true, reason });
  }

  const weeklyActivityKcal = activities.filter((x) => x.counted).reduce((a, x) => a + x.energyKcal, 0);
  const dailyAvgActivityKcal = Math.round(weeklyActivityKcal / Math.max(1, windowDays));

  return { activities, weeklyActivityKcal, dailyAvgActivityKcal, doubleCountsAvoided, windowDays };
}
