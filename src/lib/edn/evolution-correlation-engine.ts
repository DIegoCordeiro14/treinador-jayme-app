// evolution-correlation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 3 (item 14) — Correlation Engine.
//
// Detecta relações OBSERVADAS entre variáveis do atleta (sono↔performance,
// cardio↔recuperação, déficit↔performance, volume↔hipertrofia) via correlação
// de Pearson sobre pares alinhados no tempo. SEMPRE comunica como "correlação
// observada", nunca causalidade. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface PairedSample {
  x: number;   // ex: horas de sono
  y: number;   // ex: score de performance da sessão
}

export type CorrelationStrength = 'strong' | 'moderate' | 'weak' | 'none';

export interface CorrelationResult {
  key: string;
  n: number;
  r: number | null;             // -1..1
  strength: CorrelationStrength;
  direction: 'positive' | 'negative' | 'none';
  reliable: boolean;            // n suficiente?
  message: string;              // frase de "correlação observada"
}

// Pearson r
export function pearson(samples: PairedSample[]): number | null {
  const pts = samples.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

function strengthOf(r: number): CorrelationStrength {
  const a = Math.abs(r);
  if (a >= 0.6) return 'strong';
  if (a >= 0.4) return 'moderate';
  if (a >= 0.2) return 'weak';
  return 'none';
}

export interface CorrelationSpec {
  key: string;
  label: string;                // ex "sono -> performance"
  xName: string;                // "mais sono"
  yUpMeaning: string;           // "melhores sessões"
  minSamples?: number;
}

export function analyzeCorrelation(spec: CorrelationSpec, samples: PairedSample[]): CorrelationResult {
  const minSamples = spec.minSamples ?? 6;
  const r = pearson(samples);
  const n = samples.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y)).length;

  if (r == null) {
    return { key: spec.key, n, r: null, strength: 'none', direction: 'none', reliable: false,
      message: `Dados insuficientes para avaliar a relação ${spec.label}.` };
  }
  const strength = strengthOf(r);
  const direction = r > 0.05 ? 'positive' : r < -0.05 ? 'negative' : 'none';
  const reliable = n >= minSamples && strength !== 'none';

  let message: string;
  if (!reliable) {
    message = `Ainda sem evidência clara na relação ${spec.label} (${n} amostras).`;
  } else {
    const dirWord = direction === 'positive'
      ? `${spec.xName} coincidiu com ${spec.yUpMeaning}`
      : `${spec.xName} coincidiu com o oposto de ${spec.yUpMeaning}`;
    const strWord = strength === 'strong' ? 'forte' : strength === 'moderate' ? 'moderada' : 'fraca';
    message = `Correlação observada ${strWord} (r=${Math.round(r * 100) / 100}, n=${n}): ${dirWord}. Isto é uma associação, não prova de causa.`;
  }
  return { key: spec.key, n, r: Math.round(r * 1000) / 1000, strength, direction, reliable, message };
}

// Relações canônicas do domínio (para a rota alimentar com séries alinhadas).
export const CORRELATION_SPECS: Record<string, CorrelationSpec> = {
  sleep_performance: { key: 'sleep_performance', label: 'sono → performance', xName: 'Noites com mais sono', yUpMeaning: 'melhores sessões' },
  cardio_recovery: { key: 'cardio_recovery', label: 'cardio → recuperação', xName: 'Mais volume de cardio', yUpMeaning: 'melhor recuperação' },
  deficit_performance: { key: 'deficit_performance', label: 'déficit calórico → performance', xName: 'Maior déficit', yUpMeaning: 'melhor performance' },
  volume_hypertrophy: { key: 'volume_hypertrophy', label: 'volume → hipertrofia', xName: 'Mais volume', yUpMeaning: 'mais ganho de massa' },
};
