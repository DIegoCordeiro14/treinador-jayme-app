/**
 * Seleção do treino de "hoje" e do "próximo" a partir do schedule_config.
 * Lógica única usada pelo card do Dashboard (no CLIENTE, com a data do
 * aparelho) para casar exatamente com o Calendário.
 */

export interface SimpleExercise { exercise?: { muscle_group?: string | null } | null }
export interface SimpleDay {
  id: string;
  name: string;
  order_index: number;
  day_of_week?: number | null;
  workout_exercises?: SimpleExercise[] | null;
}
export interface Schedule {
  start_date?: string;
  pattern?: number[];
  day_assignments?: Record<string, string>;
}

const WEEKDAY_PT = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];

export function jsToEdn(jsDay: number): number { return jsDay === 0 ? 7 : jsDay; }

const norm = (x: string) => x.toLowerCase().trim();

function matchByLabel(days: SimpleDay[], label: string | null): SimpleDay | null {
  if (!label) return null;
  const byName = days.find((d) => norm(d.name) === norm(label) || norm(d.name).includes(norm(label)) || norm(label).includes(norm(d.name)));
  if (byName) return byName;
  const tokens = norm(label).split(/[/+,&\s]+/).filter(Boolean);
  let best: { day: SimpleDay; score: number } | null = null;
  for (const d of days) {
    const exs = d.workout_exercises ?? [];
    const score = exs.filter((we) => tokens.some((t) => (we.exercise?.muscle_group ?? '').startsWith(t.slice(0, 4)))).length;
    if (score > 0 && (!best || score > best.score)) best = { day: d, score };
  }
  return best?.day ?? null;
}

/** Treino de hoje conforme a agenda. jsDay = Date.getDay() (0=Dom..6=Sáb). */
export function selectTodayWorkout(days: SimpleDay[], schedule: Schedule | null, jsDay: number): SimpleDay | null {
  const sorted = [...days].sort((a, b) => a.order_index - b.order_index);
  const ednDay = jsToEdn(jsDay);
  if (schedule?.pattern?.length) {
    if (!schedule.pattern.includes(ednDay)) return null; // descanso
    const label = schedule.day_assignments?.[String(ednDay)] ?? null;
    const matched = matchByLabel(sorted, label);
    if (matched) return matched;
    const idx = [...schedule.pattern].sort((a, b) => a - b).indexOf(ednDay);
    return sorted[idx % sorted.length] ?? null;
  }
  const byDow = sorted.find((d) => d.day_of_week === jsDay);
  return byDow ?? null;
}

/** Próximo treino agendado (informativo). */
export function selectNextWorkout(
  days: SimpleDay[],
  schedule: Schedule | null,
  jsDay: number,
): { weekday: string; name: string; label?: string | null } | null {
  const sorted = [...days].sort((a, b) => a.order_index - b.order_index);
  if (!schedule?.pattern?.length || sorted.length === 0) {
    return sorted.length ? { weekday: 'próxima sessão', name: sorted[0].name } : null;
  }
  const ednToday = jsToEdn(jsDay);
  const sortedPattern = [...schedule.pattern].sort((a, b) => a - b);
  const nextEdn = sortedPattern.find((d) => d > ednToday) ?? sortedPattern[0];
  if (nextEdn === undefined) return null;
  const label = schedule.day_assignments?.[String(nextEdn)] ?? null;
  const matched = matchByLabel(sorted, label) ?? sorted[sortedPattern.indexOf(nextEdn) % sorted.length] ?? null;
  return matched ? { weekday: WEEKDAY_PT[nextEdn], name: matched.name, label } : null;
}
