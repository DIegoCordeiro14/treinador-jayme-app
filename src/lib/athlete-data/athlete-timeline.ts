// src/lib/athlete-data/athlete-timeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// Athlete Timeline (§26) + detecção de interferência multi-domínio (§27). PURO.
//
// Unifica os eventos de todos os domínios num modelo único e ordenado, e detecta
// sobreposições de risco (ex.: Lower pesado + longão em dias adjacentes). Só
// sinaliza — a decisão de ajuste é do motor de treino/cardio.
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineKind =
  | 'WORKOUT' | 'CARDIO' | 'BIOIMPEDANCE' | 'WEIGHT' | 'PR' | 'DELOAD'
  | 'PLAN_CHANGE' | 'NUTRITION_CHANGE' | 'PHYSICAL_CONDITION' | 'DISCOMFORT' | 'RACE';

export interface AthleteTimelineEvent {
  date: string;            // yyyy-mm-dd
  kind: TimelineKind;
  label: string;
  icon: string;
  /** Peso relativo de fadiga do evento (0..1) — usado na interferência. */
  load?: number;
  meta?: Record<string, string | number | null>;
}

const ICON: Record<TimelineKind, string> = {
  WORKOUT: '🏋️', CARDIO: '🏃', BIOIMPEDANCE: '🧬', WEIGHT: '⚖️', PR: '🏆',
  DELOAD: '🌙', PLAN_CHANGE: '🔄', NUTRITION_CHANGE: '🥗', PHYSICAL_CONDITION: '🩹',
  DISCOMFORT: '⚠️', RACE: '🎽',
};

export interface TimelineInputs {
  workouts?: { date: string; label?: string; muscleFocus?: string | null; heavy?: boolean }[];
  cardios?: { date: string; label?: string; km?: number | null; long?: boolean }[];
  weights?: { date: string; kg?: number | null }[];
  bioimpedances?: { date: string }[];
  prs?: { date: string; label?: string }[];
  deloads?: { date: string }[];
  planChanges?: { date: string; label?: string }[];
  conditions?: { date: string; label?: string }[];
  discomforts?: { date: string; region?: string }[];
  races?: { date: string; label?: string }[];
}

const ev = (date: string, kind: TimelineKind, label: string, load?: number, meta?: AthleteTimelineEvent['meta']): AthleteTimelineEvent =>
  ({ date, kind, label, icon: ICON[kind], load, meta });

/** Constrói a timeline unificada e ordenada (asc por data). */
export function buildTimeline(i: TimelineInputs): AthleteTimelineEvent[] {
  const out: AthleteTimelineEvent[] = [];
  for (const w of i.workouts ?? []) out.push(ev(w.date, 'WORKOUT', w.label ?? 'Treino', w.heavy ? 0.9 : 0.6, { muscle: w.muscleFocus ?? null, heavy: w.heavy ? 1 : 0 }));
  for (const c of i.cardios ?? []) out.push(ev(c.date, 'CARDIO', c.label ?? 'Cardio', c.long ? 0.8 : 0.4, { km: c.km ?? null, long: c.long ? 1 : 0 }));
  for (const w of i.weights ?? []) out.push(ev(w.date, 'WEIGHT', 'Peso registrado', 0, { kg: w.kg ?? null }));
  for (const b of i.bioimpedances ?? []) out.push(ev(b.date, 'BIOIMPEDANCE', 'Bioimpedância', 0));
  for (const p of i.prs ?? []) out.push(ev(p.date, 'PR', p.label ?? 'Novo PR', 0));
  for (const d of i.deloads ?? []) out.push(ev(d.date, 'DELOAD', 'Deload', 0));
  for (const p of i.planChanges ?? []) out.push(ev(p.date, 'PLAN_CHANGE', p.label ?? 'Plano ajustado', 0));
  for (const c of i.conditions ?? []) out.push(ev(c.date, 'PHYSICAL_CONDITION', c.label ?? 'Condição física', 0));
  for (const d of i.discomforts ?? []) out.push(ev(d.date, 'DISCOMFORT', d.region ? `Desconforto: ${d.region}` : 'Desconforto', 0));
  for (const r of i.races ?? []) out.push(ev(r.date, 'RACE', r.label ?? 'Prova', 0));
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface InterferenceWarning {
  dateA: string; dateB: string;
  kindA: TimelineKind; kindB: TimelineKind;
  severity: 'watch' | 'high';
  reason: string;
}

const daysBetween = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

/**
 * Detecta interferência concorrente (§27): treino pesado de perna + longão de
 * corrida em janela curta comprometem a recuperação. Determinístico.
 */
export function detectInterference(events: AthleteTimelineEvent[], windowDays = 1.5): InterferenceWarning[] {
  const warns: InterferenceWarning[] = [];
  const heavyLower = events.filter((e) => e.kind === 'WORKOUT' && (e.meta?.heavy === 1) && /(perna|lower|inferior|quad|posterior)/i.test(String(e.meta?.muscle ?? e.label)));
  const longRuns = events.filter((e) => e.kind === 'CARDIO' && e.meta?.long === 1);
  for (const w of heavyLower) {
    for (const c of longRuns) {
      const d = daysBetween(w.date, c.date);
      if (d <= windowDays) {
        warns.push({
          dateA: w.date, dateB: c.date, kindA: 'WORKOUT', kindB: 'CARDIO',
          severity: d < 1 ? 'high' : 'watch',
          reason: 'Lower pesado e longão muito próximos — risco de sobreposição de fadiga; espace ou reduza o volume de um deles.',
        });
      }
    }
  }
  return warns;
}
