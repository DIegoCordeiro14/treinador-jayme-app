'use client';

import { useEffect, useState } from 'react';
import { Trophy, Star, TrendingUp } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { LEAGUES, getLeagueInfo, type League } from '@/lib/edn/gamification';
import { LeagueBadge } from '@/components/gamification/edn-score-card';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';

interface LeaderboardEntry {
  user_id: string;
  score_total: number;
  score_consistency: number;
  score_progression: number;
  score_adherence: number;
  score_participation: number;
  workouts_count: number;
  rank_position: number | null;
  profile?: { name: string; avatar_url: string | null };
}

interface UserXpRow {
  user_id: string;
  edn_score: number;
  league: string;
  consistency_score: number;
  progression_score: number;
  nutrition_score: number;
  cardio_score: number;
  recovery_score: number;
  profile?: { name: string; avatar_url: string | null };
}

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function RankingPage() {
  const supabase = createClient();
  const [weekly, setWeekly] = useState<LeaderboardEntry[]>([]);
  const [ednRanking, setEdnRanking] = useState<UserXpRow[]>([]);
  const [myEdnRow, setMyEdnRow] = useState<UserXpRow | null>(null);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLeague, setSelectedLeague] = useState<League | 'all'>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Recalcula o ranking (semana + mês) a partir dos treinos reais antes de ler
    try { await supabase.rpc('refresh_leaderboards_now'); } catch { /* não-fatal */ }

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const now = new Date();
    const dow = now.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const weekStartStr = fmtLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday));

    const [{ data: weekData }, { data: ednData }] = await Promise.all([
      supabase.from('leaderboard').select('*, profiles(name, avatar_url)')
        .eq('period_type', 'weekly').gte('period_start', weekStartStr)
        .order('score_total', { ascending: false }).limit(20),
      supabase.from('user_xp').select('*, profiles(name, avatar_url)')
        .order('edn_score', { ascending: false }).limit(50),
    ]);

    const weekEntries = (weekData ?? []).map((d: any, i: number) => ({
      ...d, profile: d.profiles ?? undefined, rank_position: i + 1,
    })) as LeaderboardEntry[];

    setWeekly(weekEntries);
    setMyEntry(weekEntries.find((e) => e.user_id === user.id) ?? null);

    const ednRows = (ednData ?? []).map((d: any) => ({
      ...d, profile: d.profiles ?? undefined,
    })) as UserXpRow[];
    setEdnRanking(ednRows);
    setMyEdnRow(ednRows.find((r) => r.user_id === user.id) ?? null);
    setLoading(false);
  }

  const radarData = myEdnRow ? [
    { subject: 'Consistência', value: myEdnRow.consistency_score },
    { subject: 'Progressão',   value: myEdnRow.progression_score },
    { subject: 'Nutrição',     value: myEdnRow.nutrition_score   },
    { subject: 'Cárdio',       value: myEdnRow.cardio_score      },
    { subject: 'Recuperação',  value: myEdnRow.recovery_score    },
  ] : [];

  const filteredEdnRanking = selectedLeague === 'all'
    ? ednRanking
    : ednRanking.filter((r) => r.league === selectedLeague);

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Ranking</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Ligas EDN · Consistência 30% · Progressão 25% · Nutrição 20% · Cárdio 15% · Recuperação 10%</p>
      </div>

      {/* Meu Score EDN */}
      {myEdnRow && myEdnRow.edn_score > 0 && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold text-zinc-100 flex items-center gap-2">
              <Star className="h-4 w-4 text-[#D4853A]" /> Seu Score EDN
            </p>
            <LeagueBadge league={myEdnRow.league} score={myEdnRow.edn_score} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-4xl font-black text-[#D4853A]">{myEdnRow.edn_score}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Score Total</p>
              </div>
              {[
                { label: 'Consistência', v: myEdnRow.consistency_score, w: 30 },
                { label: 'Progressão',   v: myEdnRow.progression_score, w: 25 },
                { label: 'Nutrição',     v: myEdnRow.nutrition_score,   w: 20 },
                { label: 'Cárdio',       v: myEdnRow.cardio_score,      w: 15 },
                { label: 'Recuperação',  v: myEdnRow.recovery_score,    w: 10 },
              ].map((c) => (
                <div key={c.label} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-500">{c.label} ×{c.w}%</span>
                    <span className="text-zinc-400">{c.v}/100</span>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-[#D4853A]/60 transition-all" style={{ width: `${c.v}%` }} /></div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <RadarChart data={radarData} margin={{ top: 14, right: 44, bottom: 14, left: 44 }} outerRadius="68%">
                <PolarGrid stroke="#2C3E4A" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#607D8B', fontSize: 8 }} />
                <Radar dataKey="value" stroke="#D4853A" fill="#D4853A" fillOpacity={0.2} />
                <Tooltip contentStyle={{ background: '#0D1117', border: '1px solid #2C3E4A', fontSize: 10 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <Tabs defaultValue="edn">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="edn">Ligas EDN</TabsTrigger>
          <TabsTrigger value="weekly">Semanal</TabsTrigger>
        </TabsList>

        {/* EDN Liga Ranking */}
        <TabsContent value="edn" className="mt-4 space-y-3">
          {/* Liga filter pills */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedLeague('all')} className={cn('text-xs px-3 py-1 rounded-full border transition-colors', selectedLeague === 'all' ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700')}>
              Todas
            </button>
            {LEAGUES.map((l) => (
              <button key={l.id} onClick={() => setSelectedLeague(l.id)} className={cn('text-xs px-3 py-1 rounded-full border transition-colors', selectedLeague === l.id ? cn('border', l.borderColor, l.color, l.bgColor) : 'border-zinc-800 text-zinc-500 hover:border-zinc-700')}>
                {l.emoji} {l.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-800 animate-pulse" />)}</div>
          ) : filteredEdnRanking.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum atleta nesta liga ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEdnRanking.map((row, i) => {
                const info = getLeagueInfo(row.league as League);
                const name = row.profile?.name ?? 'Atleta';
                return (
                  <div key={row.user_id} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', i < 3 ? 'border-zinc-700 bg-zinc-800/80' : 'border-zinc-800 bg-zinc-900')}>
                    <div className="w-7 text-center shrink-0">
                      {RANK_MEDALS[i + 1] ? <span className="text-base">{RANK_MEDALS[i + 1]}</span> : <span className="text-sm font-bold text-zinc-500">#{i + 1}</span>}
                    </div>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={row.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-zinc-700 text-zinc-300 text-xs">{getInitials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-100 text-sm truncate">{name}</p>
                      <LeagueBadge league={row.league} size="xs" />
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('font-black text-lg leading-none', info.color)}>{row.edn_score}</p>
                      <p className="text-[10px] text-zinc-600">score</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Weekly leaderboard */}
        <TabsContent value="weekly" className="mt-4">
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-800 animate-pulse" />)}</div>
          ) : weekly.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sem dados de ranking esta semana.</p>
              <p className="text-xs mt-1">Complete treinos para aparecer!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {weekly.map((entry, i) => {
                const rank = entry.rank_position ?? i + 1;
                const name = entry.profile?.name ?? 'Atleta';
                return (
                  <div key={entry.user_id} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', rank <= 3 ? 'border-zinc-700 bg-zinc-800/80' : 'border-zinc-800 bg-zinc-900')}>
                    <div className="w-7 text-center shrink-0">
                      {RANK_MEDALS[rank] ? <span className="text-base">{RANK_MEDALS[rank]}</span> : <span className="text-sm font-bold text-zinc-500">#{rank}</span>}
                    </div>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={entry.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-zinc-700 text-zinc-300 text-xs">{getInitials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-100 text-sm truncate">{name}</p>
                      <p className="text-xs text-zinc-500">{entry.workouts_count} treinos</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-[#D4853A]">{entry.score_total.toFixed(1)}</p>
                      <p className="text-[10px] text-zinc-600">score</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
