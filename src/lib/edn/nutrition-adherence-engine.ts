// nutrition-adherence-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §9 e §10 — Aderência (logging vs target) + tolerância dinâmica.
//
// Separa REGISTRAR (logging adherence) de SEGUIR (target adherence por macro),
// com tolerâncias que variam por objetivo/fase/modalidade (§10). "Registrou" não
// é o mesmo que "aderiu". Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import type { CanonicalGoal } from './nutrition-goal-map';

export interface DailyIntake {
  dateISO: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface MacroTargets { calories: number; protein: number; carbs: number; fat: number; }

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat';

export interface AdherenceTolerance { calories: number; protein: number; carbs: number; fat: number; }

// §10 — tolerâncias por objetivo (fração ± do alvo dentro da qual conta como "no alvo").
// Ex.: cutting prioriza proteína e calorias (tolerância menor); endurance libera carbo.
export function toleranceFor(goal: CanonicalGoal): AdherenceTolerance {
  switch (goal) {
    case 'weight_loss':
    case 'definition':
      return { calories: 0.10, protein: 0.08, carbs: 0.25, fat: 0.20 };
    case 'performance':
      return { calories: 0.12, protein: 0.12, carbs: 0.12, fat: 0.20 };
    case 'hypertrophy':
    case 'lean_bulk':
      return { calories: 0.12, protein: 0.10, carbs: 0.18, fat: 0.18 };
    case 'recomposition':
      return { calories: 0.10, protein: 0.08, carbs: 0.20, fat: 0.18 };
    case 'maintenance':
    default:
      return { calories: 0.12, protein: 0.10, carbs: 0.20, fat: 0.18 };
  }
}

export interface MacroAdherence { key: MacroKey; adherence: number; avgConsumed: number; target: number; withinToleranceDays: number; loggedDays: number; }

export interface AdherenceResult {
  loggingAdherence: number;            // dias com registro / período
  loggedDays: number;
  periodDays: number;
  perMacro: Record<MacroKey, MacroAdherence>;
  targetAdherence: number;             // média das aderências por macro (só dias logados)
  weakestMacro: MacroKey | null;
  note: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function analyzeNutritionAdherence(
  intake: DailyIntake[],
  targets: MacroTargets,
  goal: CanonicalGoal,
  periodDays: number
): AdherenceResult {
  const tol = toleranceFor(goal);
  const byDay = new Map<string, DailyIntake>();
  for (const d of intake) if (d.dateISO) byDay.set(d.dateISO.slice(0, 10), d);
  const days = [...byDay.values()];
  const loggedDays = days.length;

  const loggingAdherence = periodDays > 0 ? clamp01(loggedDays / periodDays) : 0;

  const macros: MacroKey[] = ['calories', 'protein', 'carbs', 'fat'];
  const perMacro = {} as Record<MacroKey, MacroAdherence>;
  for (const m of macros) {
    const target = targets[m];
    const vals = days.map((d) => d[m]).filter((v): v is number => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    let within = 0;
    for (const v of vals) {
      if (target <= 0) { within++; continue; }
      const ratio = v / target;
      // proteína: ficar ABAIXO penaliza; acima é tolerado (não conta como falha)
      if (m === 'protein') { if (ratio >= 1 - tol[m]) within++; }
      else if (Math.abs(ratio - 1) <= tol[m]) within++;
    }
    const adherence = vals.length ? clamp01(within / vals.length) : 0;
    perMacro[m] = { key: m, adherence: Math.round(adherence * 100) / 100, avgConsumed: Math.round(avg), target, withinToleranceDays: within, loggedDays: vals.length };
  }

  const targetAdherence = Math.round((macros.reduce((a, m) => a + perMacro[m].adherence, 0) / macros.length) * 100) / 100;
  let weakestMacro: MacroKey | null = null;
  if (loggedDays > 0) weakestMacro = macros.reduce((w, m) => (perMacro[m].adherence < perMacro[w].adherence ? m : w), macros[0]);

  const note = loggedDays === 0
    ? 'Sem registros no período.'
    : loggingAdherence < 0.6
      ? `Registro baixo (${Math.round(loggingAdherence * 100)}%) — melhorar a consistência de registro antes de julgar as metas.`
      : `Registro ${Math.round(loggingAdherence * 100)}% · aderência às metas ${Math.round(targetAdherence * 100)}%${weakestMacro ? ` (mais fraco: ${weakestMacro})` : ''}.`;

  return { loggingAdherence: Math.round(loggingAdherence * 100) / 100, loggedDays, periodDays, perMacro, targetAdherence, weakestMacro, note };
}
