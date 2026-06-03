/**
 * Gamificação V3 — Bloco H
 * EDN Score 0–100 + Ligas Comportamentais
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
}

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

  return {
    total,
    league,
    components: {
      consistency: { score: consistency, weight: 30, label: 'Consistência' },
      progression: { score: progression, weight: 25, label: 'Progressão'  },
      nutrition:   { score: nutrition,   weight: 20, label: 'Nutrição'    },
      cardio:      { score: cardio,      weight: 15, label: 'Cárdio'      },
      recovery:    { score: recovery,    weight: 10, label: 'Recuperação' },
    },
    nextLeague,
    pointsToNext,
  };
}
