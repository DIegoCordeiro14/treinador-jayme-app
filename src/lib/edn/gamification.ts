/**
 * Gamificação V6.5 — Pilar 8 (Score EDN 360°)
 * EDN Score 0–100 + Ligas Comportamentais + explicação do limitador.
 * Calculado pelo Performance Engine, persistido em user_xp.
 */

export type League = 'bronze' | 'prata' | 'ouro' | 'platina' | 'diamante' | 'elite';

export interface LeagueInfo {
  id: League;
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  min: number;
  max: number;
}

export const LEAGUES: LeagueInfo[] = [
  { id: 'bronze',   label: 'Bronze',      emoji: '🥉', color: 'text-amber-700',   bgColor: 'bg-amber-900/20',  borderColor: 'border-amber-700/40',  min: 0,  max: 39  },
  { id: 'prata',    label: 'Prata',       emoji: '🥈', color: 'text-zinc-300',    bgColor: 'bg-zinc-700/20',   borderColor: 'border-zinc-500/40',   min: 40, max: 59  },
  { id: 'ouro',     label: 'Ouro',        emoji: '🥇', color: 'text-yellow-400',  bgColor: 'bg-yellow-900/20', borderColor: 'border-yellow-600/40', min: 60, max: 74  },
  { id: 'platina',  label: 'Platina',     emoji: '💎', color: 'text-cyan-300',    bgColor: 'bg-cyan-900/20',   borderColor: 'border-cyan-500/40',   min: 75, max: 84  },
  { id: 'diamante', label: 'Diamante',    emoji: '💠', color: 'text-blue-300',    bgColor: 'bg-blue-900/20',   borderColor: 'border-blue-500/40',   min: 85, max: 94  },
  { id: 'elite',    label: 'Elite EDN',   emoji: '⚡', color: 'text-violet-400',  bgColor: 'bg-violet-900/20', borderColor: 'border-violet-500/40', min: 95, max: 100 },
];

export function getLeagueInfo(league: League): LeagueInfo {
  return LEAGUES.find((l) => l.id === league) ?? LEAGUES[0];
}

export function scoreToLeague(score: number): League {
  if (score >= 95) return 'elite';
  if (score >= 85) return 'diamante';
  if (score >= 75) return 'platina';
  if (score >= 60) return 'ouro';
  if (score >= 40) return 'prata';
  return 'bronze';
}

export type EdnComponentKey = 'consistency' | 'progression' | 'nutrition' | 'cardio' | 'recovery';

export interface EdnScoreBreakdown {
  total: number;
  league: League;
  components: {
    consistency:  { score: number; weight: number; label: string };
    progression:  { score: number; weight: number; label: string };
    nutrition:    { score: number; weight: number; label: string };
    cardio:       { score: number; weight: number; label: string };
    recovery:     { score: number; weight: number; label: string };
  };
  nextLeague: LeagueInfo | null;
  pointsToNext: number;
  // V6.5 — Pilar 8: o sistema explica o que mais limita o score
  weakest: { key: EdnComponentKey; label: string; score: number } | null;
  limiterInsight: string;
}

// Ação concreta para destravar cada componente (Camada 3)
const LIMITER_ACTIONS: Record<EdnComponentKey, string> = {
  consistency: 'cumpra os treinos planejados da semana — consistência vale 30% do score',
  progression: 'busque progressão de carga ou um PR nos compostos principais',
  nutrition:   'registre suas refeições e bata a meta diária de proteína',
  cardio:      'adicione sessões de cardio Zona 2 até a meta semanal',
  recovery:    'melhore sono e gestão de estresse — e respeite os descansos do plano',
};

export function buildEdnBreakdown(
  consistency: number,
  progression: number,
  nutrition: number,
  cardio: number,
  recovery: number,
): EdnScoreBreakdown {
  const total = Math.round(
    consistency * 0.30 +
    progression * 0.25 +
    nutrition   * 0.20 +
    cardio      * 0.15 +
    recovery    * 0.10,
  );
  const league = scoreToLeague(total);
  const currentLeagueIdx = LEAGUES.findIndex((l) => l.id === league);
  const nextLeague = currentLeagueIdx < LEAGUES.length - 1 ? LEAGUES[currentLeagueIdx + 1] : null;
  const pointsToNext = nextLeague ? nextLeague.min - total : 0;

  const components = {
    consistency: { score: consistency, weight: 30, label: 'Consistência' },
    progression: { score: progression, weight: 25, label: 'Progressão'  },
    nutrition:   { score: nutrition,   weight: 20, label: 'Nutrição'    },
    cardio:      { score: cardio,      weight: 15, label: 'Cárdio'      },
    recovery:    { score: recovery,    weight: 10, label: 'Recuperação' },
  } as const;

  // ── V6.5: limitador = componente com maior perda PONDERADA de pontos ──────
  const allZero = consistency === 0 && progression === 0 && nutrition === 0 && cardio === 0 && recovery === 0;
  let weakest: EdnScoreBreakdown['weakest'] = null;
  let limiterInsight: string;

  if (allZero) {
    limiterInsight = 'Seu Score começa em 0 — registre seu primeiro treino para começar a pontuar.';
  } else {
    const losses = (Object.entries(components) as Array<[EdnComponentKey, { score: number; weight: number; label: string }]>)
      .map(([key, c]) => ({ key, label: c.label, score: c.score, weightedLoss: (100 - c.score) * (c.weight / 100) }))
      .sort((a, b) => b.weightedLoss - a.weightedLoss);
    const top = losses[0];
    weakest = { key: top.key, label: top.label, score: top.score };
    limiterInsight = top.weightedLoss < 3
      ? `Score ${total}/100 — todos os pilares estão saudáveis. Mantenha o ritmo.`
      : `Seu principal limitador atual é ${top.label} (${top.score}/100): ${LIMITER_ACTIONS[top.key]}.`;
  }

  return {
    total,
    league,
    components: components as EdnScoreBreakdown['components'],
    nextLeague,
    pointsToNext,
    weakest,
    limiterInsight,
  };
}
