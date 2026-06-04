'use client';

import { LEAGUES, getLeagueInfo, type EdnScoreBreakdown } from '@/lib/edn/gamification';
import { cn } from '@/lib/utils';
import { TrendingUp, ChevronRight } from 'lucide-react';

interface EdnScoreCardProps {
  breakdown: EdnScoreBreakdown;
  compact?: boolean;
}

export function EdnScoreCard({ breakdown, compact = false }: EdnScoreCardProps) {
  const league = getLeagueInfo(breakdown.league);

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', league.bgColor, league.borderColor)}>
        <span className="text-xl">{league.emoji}</span>
        <div>
          <p className={cn('text-sm font-bold leading-none', league.color)}>{breakdown.total}/100</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">{league.label}</p>
        </div>
      </div>
    );
  }

  const components = Object.values(breakdown.components);

  return (
    <div className={cn('rounded-xl border p-5 space-y-4', league.bgColor, league.borderColor)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{league.emoji}</span>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">Score EDN</p>
            <p className={cn('text-3xl font-black leading-none', league.color)}>{breakdown.total}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={cn('font-bold text-sm', league.color)}>{league.label}</p>
          {breakdown.nextLeague && (
            <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1 justify-end">
              <TrendingUp className="h-3 w-3" />
              +{breakdown.pointsToNext} para {breakdown.nextLeague.label}
            </p>
          )}
        </div>
      </div>

      {/* Liga progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>{breakdown.league.charAt(0).toUpperCase() + breakdown.league.slice(1)} ({LEAGUES.find(l => l.id === breakdown.league)!.min})</span>
          {breakdown.nextLeague && <span>{breakdown.nextLeague.label} ({breakdown.nextLeague.min})</span>}
        </div>
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', getProgressBarColor(breakdown.league))}
            style={{
              width: `${Math.min(100, breakdown.nextLeague
                ? ((breakdown.total - LEAGUES.find(l => l.id === breakdown.league)!.min) /
                   (breakdown.nextLeague.min - LEAGUES.find(l => l.id === breakdown.league)!.min)) * 100
                : 100)}%`
            }}
          />
        </div>
      </div>

      {/* Component breakdown */}
      <div className="space-y-2">
        {components.map((c) => {
          const contribution = Math.round(c.score * c.weight / 100);
          return (
            <div key={c.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{c.label} <span className="text-zinc-600">×{c.weight}%</span></span>
                <span className="font-medium text-zinc-300">{c.score}/100 <span className="text-zinc-600">= +{contribution}pts</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#D4853A]/70 transition-all duration-500"
                  style={{ width: `${c.score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getProgressBarColor(league: string): string {
  switch (league) {
    case 'bronze':   return 'bg-amber-700';
    case 'prata':    return 'bg-zinc-400';
    case 'ouro':     return 'bg-yellow-400';
    case 'platina':  return 'bg-cyan-400';
    case 'diamante': return 'bg-[#D4853A]';
    case 'elite':    return 'bg-violet-400';
    default:         return 'bg-[#D4853A]';
  }
}

// ── League Badge (inline) ─────────────────────────────────────────────────────
export function LeagueBadge({ league, score, size = 'sm' }: {
  league: string; score?: number; size?: 'xs' | 'sm' | 'md';
}) {
  const info = getLeagueInfo(league as any);
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-semibold',
      info.bgColor, info.borderColor, info.color,
      size === 'xs' ? 'text-[10px] px-1.5 py-0.5' :
      size === 'sm' ? 'text-xs px-2 py-1' :
      'text-sm px-3 py-1.5'
    )}>
      {info.emoji} {info.label}{score !== undefined && <span className="opacity-70 ml-0.5">{score}</span>}
    </span>
  );
}
