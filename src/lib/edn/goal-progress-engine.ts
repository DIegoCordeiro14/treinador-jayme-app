// goal-progress-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 (itens 4 e 5) — Evolução por objetivo + Goal Progress Score.
//
// O MESMO conjunto de dados é interpretado de forma diferente conforme o objetivo
// oficial do atleta (cutting, hipertrofia, lean bulk, recomposição, performance,
// manutenção). Produz um Goal Progress Score 0-100 com 4 componentes ponderados:
// composição 40% + performance 30% + consistência 15% + recuperação 15%, além do
// principal avanço e do principal limitador. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type Goal =
  | 'cutting' | 'hypertrophy' | 'lean_bulk' | 'recomposition'
  | 'performance' | 'maintenance';

// normaliza objetivos livres do perfil para os canônicos
export function normalizeGoal(raw: string | null | undefined): Goal {
  const g = (raw ?? '').toLowerCase();
  if (/fat|emagre|defin|cut|weight_loss/.test(g)) return 'cutting';
  if (/lean|bulk_limpo|lean_bulk/.test(g)) return 'lean_bulk';
  if (/recomp/.test(g)) return 'recomposition';
  if (/perf|running|corrida|endurance|cardio/.test(g)) return 'performance';
  if (/manut|maint|health|saude/.test(g)) return 'maintenance';
  if (/hyper|hipert|massa|bulk|ganho/.test(g)) return 'hypertrophy';
  return 'hypertrophy';
}

export interface GoalProgressInput {
  goal: Goal;
  // Composição (deltas no período)
  weightDeltaKg: number | null;
  bodyFatDeltaPct: number | null;
  leanDeltaKg: number | null;
  // Performance
  strengthDeltaPct: number | null;   // topset médio %
  volumeDeltaPct: number | null;
  cardioDeltaPct?: number | null;    // performance cardiovascular %
  // Consistência
  sessionsDone: number;
  sessionsPlanned: number;
  // Recuperação (0..100; maior = melhor)
  recoveryScore: number | null;
}

export interface GoalProgressResult {
  goal: Goal;
  score: number;                 // 0..100
  components: { composition: number; performance: number; consistency: number; recovery: number };
  topAdvance: string;
  topLimiter: string;
  onTrack: boolean;
  summary: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Componente de COMPOSIÇÃO: 0..1, avaliado conforme o objetivo.
function compositionScore(i: GoalProgressInput): { s: number; note: string } {
  const w = i.weightDeltaKg ?? 0;
  const bf = i.bodyFatDeltaPct ?? 0;
  const lean = i.leanDeltaKg ?? 0;
  switch (i.goal) {
    case 'cutting': {
      // quer BF↓ e peso↓, magra preservada
      const fat = clamp01((-bf) / 1.5);                 // -1.5pp no período = ótimo
      const preserve = lean >= -0.3 ? 1 : clamp01(1 + lean); // penaliza perda magra
      return { s: 0.6 * fat + 0.4 * preserve, note: 'perda de gordura com preservação de massa' };
    }
    case 'hypertrophy':
    case 'lean_bulk': {
      const gain = clamp01(lean / 1.0);                 // +1kg magra = ótimo
      const control = bf <= 1.0 ? 1 : clamp01(1 - (bf - 1) / 2); // ganho de gordura controlado
      return { s: 0.7 * gain + 0.3 * control, note: 'ganho de massa magra controlado' };
    }
    case 'recomposition': {
      const fat = clamp01((-bf) / 1.0);
      const lean2 = clamp01((lean + 0.5) / 1.0);
      return { s: 0.5 * fat + 0.5 * lean2, note: 'gordura↓ com massa↑ a peso estável' };
    }
    case 'performance':
      return { s: bf <= 0.5 ? 0.8 : 0.6, note: 'composição de suporte à performance' };
    case 'maintenance': {
      const stable = clamp01(1 - Math.abs(w) / 2);      // manter peso
      return { s: stable, note: 'estabilidade corporal' };
    }
  }
}

function performanceScore(i: GoalProgressInput): { s: number; note: string } {
  const str = i.strengthDeltaPct ?? 0;
  const vol = i.volumeDeltaPct ?? 0;
  const cardio = i.cardioDeltaPct ?? 0;
  if (i.goal === 'performance') {
    const c = clamp01((cardio + str) / 12);
    return { s: c, note: 'performance específica (cardio+força)' };
  }
  const s = clamp01((str / 8) * 0.6 + (vol / 12) * 0.4);
  return { s, note: 'progressão de carga e volume' };
}

function consistencyScore(i: GoalProgressInput): number {
  if (i.sessionsPlanned <= 0) return clamp01(i.sessionsDone / 12);
  return clamp01(i.sessionsDone / i.sessionsPlanned);
}

function recoveryComponent(i: GoalProgressInput): number {
  if (i.recoveryScore == null) return 0.6; // neutro
  return clamp01(i.recoveryScore / 100);
}

export function computeGoalProgress(i: GoalProgressInput): GoalProgressResult {
  const comp = compositionScore(i);
  const perf = performanceScore(i);
  const cons = consistencyScore(i);
  const rec = recoveryComponent(i);

  const components = {
    composition: Math.round(comp.s * 100),
    performance: Math.round(perf.s * 100),
    consistency: Math.round(cons * 100),
    recovery: Math.round(rec * 100),
  };

  const score = Math.round((0.4 * comp.s + 0.3 * perf.s + 0.15 * cons + 0.15 * rec) * 100);

  // principal avanço e limitador = maior e menor componente ponderado
  const weighted: [string, number][] = [
    ['Composição corporal', comp.s * 0.4],
    ['Performance', perf.s * 0.3],
    ['Consistência', cons * 0.15],
    ['Recuperação', rec * 0.15],
  ];
  const byRaw: [string, number][] = [
    ['Composição corporal', comp.s],
    ['Performance', perf.s],
    ['Consistência', cons],
    ['Recuperação', rec],
  ];
  const topAdvance = [...byRaw].sort((a, b) => b[1] - a[1])[0][0];
  const topLimiter = [...byRaw].sort((a, b) => a[1] - b[1])[0][0];
  const onTrack = score >= 65;

  return {
    goal: i.goal,
    score,
    components,
    topAdvance,
    topLimiter,
    onTrack,
    summary: onTrack
      ? `Você está no caminho esperado para ${i.goal}. Principal avanço: ${topAdvance}. Principal limitador: ${topLimiter}.`
      : `Progresso abaixo do esperado para ${i.goal}. Principal limitador: ${topLimiter}. Focar aqui no próximo ciclo.`,
  };
}
