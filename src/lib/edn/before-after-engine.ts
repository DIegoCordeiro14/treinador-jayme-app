// before-after-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 (item 12) — Comparativo "Antes vs Depois" automático.
//
// Compara os últimos N dias com os N dias anteriores para cada métrica e devolve
// valores + delta + direção, prontos para o card comparativo. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface BeforeAfterMetricInput {
  label: string;
  unit: string;
  // valor representativo de cada janela (média ou último ponto)
  before: number | null;
  after: number | null;
  higherIsBetter: boolean;      // p/ colorir direção
}

export interface BeforeAfterMetric {
  label: string;
  unit: string;
  before: number | null;
  after: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat' | 'na';
  good: boolean | null;         // a mudança é positiva p/ o atleta?
}

export interface BeforeAfterResult {
  windowDays: number;
  metrics: BeforeAfterMetric[];
  summary: string;
}

export function compareBeforeAfter(
  windowDays: number,
  inputs: BeforeAfterMetricInput[]
): BeforeAfterResult {
  const metrics: BeforeAfterMetric[] = inputs.map((m) => {
    if (m.before == null || m.after == null) {
      return { label: m.label, unit: m.unit, before: m.before, after: m.after,
        deltaAbs: null, deltaPct: null, direction: 'na', good: null };
    }
    const deltaAbs = Math.round((m.after - m.before) * 100) / 100;
    const deltaPct = m.before !== 0 ? Math.round((deltaAbs / Math.abs(m.before)) * 1000) / 10 : null;
    const direction = deltaAbs > 0 ? 'up' : deltaAbs < 0 ? 'down' : 'flat';
    const good = direction === 'flat' ? null : (direction === 'up') === m.higherIsBetter;
    return { label: m.label, unit: m.unit, before: m.before, after: m.after, deltaAbs, deltaPct, direction, good };
  });

  const goods = metrics.filter((m) => m.good === true).length;
  const bads = metrics.filter((m) => m.good === false).length;
  const summary = goods >= bads
    ? `Balanço positivo: ${goods} métrica(s) melhoraram vs ${bads} pioraram no período.`
    : `Atenção: ${bads} métrica(s) pioraram vs ${goods} melhoraram no período.`;

  return { windowDays, metrics, summary };
}
