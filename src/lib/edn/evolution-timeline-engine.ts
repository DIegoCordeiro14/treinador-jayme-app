// evolution-timeline-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 (item 10) — Timeline de evolução (o que -> por que -> decisão -> resultado).
//
// Constrói uma linha do tempo tipada e ordenada a partir de eventos brutos
// (PRs, mudanças de BF, deloads, quedas de recuperação, decisões da IA). Agrupa
// por mês e classifica a "cor" de cada evento. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineKind =
  | 'pr' | 'body_change' | 'recovery_drop' | 'recovery_up'
  | 'deload' | 'decision' | 'decision_result' | 'plateau' | 'milestone';

export type TimelineTone = 'positive' | 'warning' | 'neutral' | 'info';

export interface TimelineEventInput {
  dateISO: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
}

export interface TimelineEvent extends TimelineEventInput {
  tone: TimelineTone;
  emoji: string;
  monthKey: string;               // YYYY-MM
}

const TONE_BY_KIND: Record<TimelineKind, TimelineTone> = {
  pr: 'positive', body_change: 'positive', recovery_up: 'positive', milestone: 'positive',
  recovery_drop: 'warning', plateau: 'warning',
  deload: 'info', decision: 'info',
  decision_result: 'neutral',
};

const EMOJI_BY_TONE: Record<TimelineTone, string> = {
  positive: '🟢', warning: '🟡', neutral: '🔵', info: '⚪',
};

const MONTH_PT = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

export interface TimelineMonth {
  monthKey: string;
  label: string;                  // "AGOSTO 2026"
  events: TimelineEvent[];
}

export function buildTimeline(inputs: TimelineEventInput[]): TimelineEvent[] {
  return inputs
    .filter((e) => e.dateISO && !Number.isNaN(new Date(e.dateISO).getTime()))
    .map((e) => {
      const tone = TONE_BY_KIND[e.kind] ?? 'neutral';
      return { ...e, tone, emoji: EMOJI_BY_TONE[tone], monthKey: e.dateISO.slice(0, 7) };
    })
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO)); // mais recente primeiro
}

export function groupTimelineByMonth(events: TimelineEvent[]): TimelineMonth[] {
  const byMonth = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const arr = byMonth.get(e.monthKey) ?? [];
    arr.push(e);
    byMonth.set(e.monthKey, arr);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, evs]) => {
      const [y, m] = monthKey.split('-');
      return { monthKey, label: `${MONTH_PT[Number(m) - 1]} ${y}`, events: evs };
    });
}

// Liga uma decisão ao seu resultado (para a narrativa o que->decisão->resultado).
export interface DecisionNarrative {
  decisionDateISO: string;
  decision: string;
  cause: string;
  resultDateISO: string | null;
  result: string | null;
  verdict: 'positive' | 'neutral' | 'negative' | 'pending';
}

export function narrateDecision(n: DecisionNarrative): string {
  const parts = [`${n.cause} → decidimos: ${n.decision}`];
  if (n.result) parts.push(`resultado: ${n.result} (${n.verdict})`);
  else parts.push('aguardando resultado');
  return parts.join(' → ');
}
