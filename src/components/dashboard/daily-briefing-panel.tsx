'use client';
/**
 * DailyBriefingPanel — V5.0 Pillar 3
 * Centro do Dashboard. Substitui o bloco estático por briefing IA dinâmico.
 */
import { useEffect, useState } from 'react';
import { Brain, RefreshCw, AlertTriangle, ChevronRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Briefing {
  greeting: string;
  highlights: string[];
  todayAction: string;
  alert: string | null;
  score: number;
  league: string;
  fromCache: boolean;
}

const LEAGUE_EMOJI: Record<string, string> = {
  bronze: '🥉', prata: '🥈', ouro: '🥇', platina: '💎', diamante: '🔷', elite: '👑',
};
const LEAGUE_COLOR: Record<string, string> = {
  bronze: 'text-amber-600', prata: 'text-zinc-400', ouro: 'text-yellow-400',
  platina: 'text-cyan-400', diamante: 'text-blue-400', elite: 'text-violet-400',
};

export function DailyBriefingPanel() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(force = false) {
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(force ? '/api/daily-briefing' : '/api/daily-briefing', {
        method: force ? 'POST' : 'GET',
      });
      if (res.ok) setBriefing(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-blue-600/20 bg-blue-600/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-blue-600/20 animate-pulse" />
          <div className="h-4 w-32 rounded bg-zinc-800 animate-pulse" />
        </div>
        {[...Array(3)].map((_, i) => <div key={i} className="h-3 rounded bg-zinc-800 animate-pulse" style={{ width: `${90 - i * 10}%` }} />)}
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className="rounded-xl border border-blue-600/20 bg-gradient-to-br from-blue-600/5 to-zinc-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/15 border border-blue-600/30 shrink-0">
            <Brain className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-zinc-100 text-base leading-tight">{briefing.greeting}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn('text-xs font-bold', LEAGUE_COLOR[briefing.league])}>
                {LEAGUE_EMOJI[briefing.league]} Score {briefing.score}
              </span>
              <span className="text-zinc-600 text-xs">·</span>
              <span className="text-xs text-zinc-500 capitalize">{briefing.league}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Alert */}
      {briefing.alert && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">{briefing.alert}</p>
        </div>
      )}

      {/* Highlights */}
      <div className="space-y-1.5">
        {briefing.highlights.map((h, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed">{h}</p>
        ))}
      </div>

      {/* Today's action */}
      <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2.5 flex items-start gap-2">
        <Zap className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-zinc-200 leading-relaxed">{briefing.todayAction}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <Link href="/app/ia" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
          Conversar com Coach EDN <ChevronRight className="h-3 w-3" />
        </Link>
        <Link href="/app/evolucao" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Ver evolução →
        </Link>
      </div>
    </div>
  );
}
