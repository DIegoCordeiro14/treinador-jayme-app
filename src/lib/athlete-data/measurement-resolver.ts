// src/lib/athlete-data/measurement-resolver.ts
// ─────────────────────────────────────────────────────────────────────────────
// Resolução determinística de conflitos entre fontes (§5/§6). PURO.
//
// Regras (nesta ordem):
//   1. Descarta valores nulos/inválidos.
//   2. Marca como SUSPECT valores fora da faixa fisiológica OU com variação
//      extrema num curto intervalo (ex.: 80kg → 150kg em minutos). NUNCA apaga.
//   3. Entre os válidos, escolhe o canônico: mais recente vence (janela de 12h);
//      empate técnico → maior confiança de fonte. Recência tem prioridade sobre
//      confiança (uma pesagem manual de hoje > bioimpedância de 90 dias).
//   4. Os demais válidos viram SUPERSEDED.
//
// A IA nunca entra aqui — toda a decisão é aritmética.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BodyMetric, DataConfidence, DataSource, Measurement, MeasurementStatus,
  PlausibilityRange, ResolvedMeasurement,
} from './types';

const MS_DAY = 86_400_000;
const RECENCY_WINDOW_MS = MS_DAY / 2; // 12h: dentro disso, desempata por confiança

// Confiança default por fonte quando o registro não a traz explícita.
const SOURCE_CONFIDENCE: Record<DataSource, DataConfidence> = {
  bioimpedance: 'high', wearable: 'high', health_connect: 'high',
  manual: 'medium', profile: 'medium', evolution: 'medium', nutrition: 'medium',
  coach_action: 'medium', import: 'medium', estimated: 'low',
};

const CONF_RANK: Record<DataConfidence, number> = { high: 3, medium: 2, low: 1, unknown: 0 };

// Faixas fisiológicas conservadoras (adultos). Servem só para SINALIZAR, não bloquear.
const PLAUSIBLE: Partial<Record<BodyMetric, PlausibilityRange>> = {
  weight: { min: 25, max: 400 },
  bodyFat: { min: 2, max: 75 },
  leanMass: { min: 15, max: 200 },
  muscleMass: { min: 10, max: 120 },
  visceralFat: { min: 1, max: 60 },
  bodyWater: { min: 20, max: 80 },
  bmr: { min: 600, max: 4500 },
  restingHeartRate: { min: 25, max: 220 },
};

// Variação máxima "fisiologicamente plausível" de PESO por hora (kg/h). Acima
// disso, entre duas pesagens muito próximas, a mais nova é marcada suspect.
const MAX_WEIGHT_KG_PER_HOUR = 3;

const tms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

const confOf = (m: Measurement): DataConfidence => m.confidence ?? SOURCE_CONFIDENCE[m.source] ?? 'unknown';

function isImplausible(metric: BodyMetric, value: number): boolean {
  const r = PLAUSIBLE[metric];
  return !!r && (value < r.min || value > r.max);
}

/**
 * Resolve uma única métrica a partir de todas as medições conhecidas dela.
 * Retorna o valor canônico + contagem de descartes p/ auditoria.
 */
export function resolveMeasurement(metric: BodyMetric, all: Measurement[], nowMs = Date.now()): ResolvedMeasurement | null {
  const mine = all.filter((m) => m.metric === metric && m.value != null && Number.isFinite(m.value as number));
  if (mine.length === 0) return null;

  // classifica plausibilidade fisiológica
  type Tagged = { m: Measurement; t: number; suspect: boolean };
  const tagged: Tagged[] = mine.map((m) => ({
    m, t: tms(m.measuredAt) ?? 0, suspect: isImplausible(metric, m.value as number),
  }));

  // detecção de salto extremo entre pesagens próximas (só p/ peso)
  if (metric === 'weight') {
    const ordered = [...tagged].sort((a, b) => a.t - b.t);
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1], cur = ordered[i];
      const dtH = Math.abs(cur.t - prev.t) / 3_600_000;
      if (dtH > 0 && dtH < 6) {
        const dKg = Math.abs((cur.m.value as number) - (prev.m.value as number));
        if (dKg / dtH > MAX_WEIGHT_KG_PER_HOUR) cur.suspect = true; // o registro mais novo é o suspeito
      }
    }
  }

  const plausible = tagged.filter((x) => !x.suspect);
  // se TUDO ficou suspeito (ex.: única leitura fora de faixa), ainda resolvemos
  // sobre o conjunto completo, mas o status final carrega 'suspect'.
  const pool = plausible.length > 0 ? plausible : tagged;

  const best = pool.reduce((a, b) => {
    if (Math.abs(a.t - b.t) > RECENCY_WINDOW_MS) return b.t > a.t ? b : a;          // mais recente
    return CONF_RANK[confOf(b.m)] > CONF_RANK[confOf(a.m)] ? b : a;                 // empate → confiança
  });

  const suspectCount = tagged.filter((x) => x.suspect).length;
  const status: MeasurementStatus = best.suspect ? 'suspect' : 'valid';
  const value = Math.round((best.m.value as number) * 100) / 100;
  const ageDays = best.t ? Math.max(0, Math.floor((nowMs - best.t) / MS_DAY)) : null;

  return {
    metric, value, source: best.m.source, measuredAt: best.m.measuredAt,
    confidence: confOf(best.m), status, ageDays,
    supersededCount: Math.max(0, pool.length - 1),
    suspectCount,
  };
}

/** Resolve todas as métricas presentes na lista. */
export function resolveAllMeasurements(all: Measurement[], nowMs = Date.now()): Partial<Record<BodyMetric, ResolvedMeasurement>> {
  const out: Partial<Record<BodyMetric, ResolvedMeasurement>> = {};
  const metrics = new Set(all.map((m) => m.metric));
  for (const metric of metrics) {
    const r = resolveMeasurement(metric, all, nowMs);
    if (r) out[metric] = r;
  }
  return out;
}

export const __internals = { SOURCE_CONFIDENCE, PLAUSIBLE, MAX_WEIGHT_KG_PER_HOUR };
