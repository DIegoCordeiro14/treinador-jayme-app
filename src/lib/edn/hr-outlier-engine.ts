// hr-outlier-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §8 — HR Outlier Engine.
//
// Nunca deixa "maior valor observado = FCmáx". Detecta leituras espúrias (saltos
// instantâneos, valores isolados, perda de contato do sensor, incompatíveis com a
// duração) e devolve uma série de FC limpa + a FC máx CONFIÁVEL. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface HrSample { tSec: number; bpm: number; }

export interface HrCleanResult {
  clean: HrSample[];
  removed: number;
  reliableMax: number | null;      // FCmáx confiável (após remover outliers)
  reliableAvg: number | null;
  flags: string[];
}

const HARD_MIN = 30;
const HARD_MAX = 230;

export function cleanHeartRate(samples: HrSample[], opts?: { historicalMax?: number | null }): HrCleanResult {
  const flags: string[] = [];
  const valid = samples.filter((s) => Number.isFinite(s.bpm) && s.bpm >= HARD_MIN && s.bpm <= HARD_MAX)
    .sort((a, b) => a.tSec - b.tSec);
  if (valid.length === 0) return { clean: [], removed: samples.length, reliableMax: null, reliableAvg: null, flags: ['sem amostras válidas'] };

  // mediana e desvio robusto (MAD) para detectar isolados
  const bpms = valid.map((s) => s.bpm).sort((a, b) => a - b);
  const median = bpms[Math.floor(bpms.length / 2)];
  const mad = bpms.map((b) => Math.abs(b - median)).sort((a, b) => a - b)[Math.floor(bpms.length / 2)] || 1;

  const clean: HrSample[] = [];
  let removed = 0;
  for (let k = 0; k < valid.length; k++) {
    const s = valid[k];
    const prev = k > 0 ? valid[k - 1] : null;
    const next = k < valid.length - 1 ? valid[k + 1] : null;

    // salto instantâneo: variação > 40 bpm em < 3 s vs vizinhos (e volta) → artefato
    let isJump = false;
    if (prev && next) {
      const dt = s.tSec - prev.tSec;
      if (dt > 0 && dt < 3 && Math.abs(s.bpm - prev.bpm) > 40 && Math.abs(next.bpm - prev.bpm) < 20) isJump = true;
    }
    // isolado extremo por MAD (robusto): |bpm-mediana| > 6*MAD e acima de 200
    const isRobustOutlier = Math.abs(s.bpm - median) > 6 * mad && (s.bpm > 200 || s.bpm < 45);

    if (isJump || isRobustOutlier) { removed++; if (isJump && !flags.includes('salto instantâneo removido')) flags.push('salto instantâneo removido'); if (isRobustOutlier && !flags.includes('valor isolado removido')) flags.push('valor isolado removido'); continue; }
    clean.push(s);
  }

  if (clean.length === 0) return { clean: [], removed, reliableMax: null, reliableAvg: null, flags: [...flags, 'todas as amostras suspeitas'] };

  // FCmáx confiável: maior valor SUSTENTADO (aparece em ≥2 amostras próximas) e coerente com histórico
  const sustainedMax = (() => {
    const sorted = [...clean].sort((a, b) => b.bpm - a.bpm);
    for (const cand of sorted) {
      const near = clean.filter((s) => Math.abs(s.bpm - cand.bpm) <= 3).length;
      if (near >= 2) return cand.bpm;
    }
    return sorted[0].bpm;
  })();
  let reliableMax = sustainedMax;
  if (opts?.historicalMax != null && sustainedMax > opts.historicalMax + 15) {
    reliableMax = opts.historicalMax;  // não deixa uma sessão inflar a FCmáx histórica
    flags.push('FCmáx desta sessão acima do histórico — mantido o histórico');
  }
  const reliableAvg = Math.round(clean.reduce((a, s) => a + s.bpm, 0) / clean.length);

  return { clean, removed, reliableMax, reliableAvg, flags };
}
