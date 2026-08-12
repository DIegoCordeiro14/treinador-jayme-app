/**
 * Fisiologia por série (Alteração 1 — V8.X).
 *
 * Motor DETERMINÍSTICO: dado o conjunto de amostras de FC/calorias do wearable
 * (com timestamp) e a janela de tempo de cada série de força, associa a cada
 * série a FC média/máx, o %FCmáx, a zona e uma estimativa de calorias.
 *
 * A IA NUNCA inventa esses números — eles vêm exclusivamente das amostras reais.
 * Quando não há amostras cobrindo a janela de uma série, os campos ficam null.
 */

export interface HrSample { t: number; bpm: number }
export interface CalorieSample { t: number; kcal: number } // kcal acumulados no intervalo terminando em t
export interface SetWindow { setNumber: number; startMs: number; endMs: number }

export type HrZone = 1 | 2 | 3 | 4 | 5;

export interface SetPhysiology {
  setNumber: number;
  avgHr: number | null;
  maxHr: number | null;
  pctHrMax: number | null; // 0..100
  zone: HrZone | null;
  calories: number | null;
  samples: number; // quantas amostras de FC caíram na janela
}

export function hrZoneFromPct(pct: number): HrZone {
  if (pct < 60) return 1;
  if (pct < 70) return 2;
  if (pct < 80) return 3;
  if (pct < 90) return 4;
  return 5;
}

/** FCmáx: usa o fornecido; senão 220 - idade; senão null. */
export function resolveMaxHr(providedMaxHr: number | null, age: number | null): number | null {
  if (providedMaxHr && providedMaxHr > 0) return Math.round(providedMaxHr);
  if (age && age > 0 && age < 120) return Math.round(220 - age);
  return null;
}

export interface MapPhysiologyInput {
  sets: SetWindow[];
  hrSamples: HrSample[];
  calorieSamples?: CalorieSample[];
  maxHr?: number | null;
  age?: number | null;
}

export function mapSetPhysiology(input: MapPhysiologyInput): SetPhysiology[] {
  const maxHr = resolveMaxHr(input.maxHr ?? null, input.age ?? null);
  const hr = (input.hrSamples ?? []).filter(s => Number.isFinite(s.bpm) && s.bpm > 0 && Number.isFinite(s.t)).sort((a, b) => a.t - b.t);
  const cal = (input.calorieSamples ?? []).filter(s => Number.isFinite(s.kcal) && s.kcal >= 0 && Number.isFinite(s.t)).sort((a, b) => a.t - b.t);

  return (input.sets ?? []).map(win => {
    const lo = Math.min(win.startMs, win.endMs);
    const hi = Math.max(win.startMs, win.endMs);
    const inWin = hr.filter(s => s.t >= lo && s.t <= hi);
    let avgHr: number | null = null, maxHrSet: number | null = null, pctHrMax: number | null = null, zone: HrZone | null = null;
    if (inWin.length) {
      avgHr = Math.round(inWin.reduce((a, s) => a + s.bpm, 0) / inWin.length);
      maxHrSet = Math.round(Math.max(...inWin.map(s => s.bpm)));
      if (maxHr) {
        pctHrMax = Math.round((avgHr / maxHr) * 100);
        zone = hrZoneFromPct(pctHrMax);
      }
    }
    // calorias: soma dos incrementos cujos timestamps caem na janela
    let calories: number | null = null;
    const calIn = cal.filter(s => s.t >= lo && s.t <= hi);
    if (calIn.length) calories = Math.round(calIn.reduce((a, s) => a + s.kcal, 0));
    return { setNumber: win.setNumber, avgHr, maxHr: maxHrSet, pctHrMax, zone, calories, samples: inWin.length };
  });
}

/** Resumo da sessão de força a partir das séries mapeadas. */
export interface StrengthSessionPhysiology {
  avgHr: number | null;
  peakHr: number | null;
  totalCalories: number | null;
  setsWithHr: number;
  avgPctHrMax: number | null;
}

export function summarizeStrengthPhysiology(sets: SetPhysiology[]): StrengthSessionPhysiology {
  const withHr = sets.filter(s => s.avgHr != null);
  const avgHr = withHr.length ? Math.round(withHr.reduce((a, s) => a + (s.avgHr as number), 0) / withHr.length) : null;
  const peaks = sets.map(s => s.maxHr).filter((v): v is number => v != null);
  const peakHr = peaks.length ? Math.max(...peaks) : null;
  const cals = sets.map(s => s.calories).filter((v): v is number => v != null);
  const totalCalories = cals.length ? cals.reduce((a, b) => a + b, 0) : null;
  const pcts = withHr.map(s => s.pctHrMax).filter((v): v is number => v != null);
  const avgPctHrMax = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  return { avgHr, peakHr, totalCalories, setsWithHr: withHr.length, avgPctHrMax };
}
