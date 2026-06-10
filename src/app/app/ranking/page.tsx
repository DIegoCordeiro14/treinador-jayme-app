'use client';

import { useEffect, useState } from 'react';
import { Trophy, Medal, TrendingUp, Users, Star } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { cn, getInitials } from '@/lib/utils';
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

const RANK_MEDALS: Record<number, { icon: string; color: string }> = {
  1: { icon: '🥇', color: 'text-yellow-400' },
  2: { icon: '🥈', color: 'text-zinc-300' },
  3: { icon: '🥉', color: 'text-amber-700' },
};

export default function RankingPage() {
  const supabase = createClient();
  const [weekly, setWeekly] = useState<LeaderboardEntry[]>([]);
  const [monthly, setMonthly] = useState<LeaderboardEntry[]>([]);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Recalcula o ranking (semana + mês) a partir dos treinos reais antes de ler
    try { await supabase.rpc('refresh_leaderboards_now'); } catch { /* não-fatal */ }

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const now = new Date();
    const dow = now.getDay(); // 0=Dom .. 6=Sáb
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const weekStartStr = fmtLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday));
    const monthStartStr = fmtLocal(new Date(now.getFullYear(), now.getMonth(), 1));

    const [{ data: weekData }, { data: monthData }] = await Promise.all([
      supabase
        .from('leaderboard')
        .select('*, profiles(name, avatar_url)')
        .eq('period_type', 'weekly')
        .gte('period_start', weekStartStr)
        .order('score_total', { ascending: false })
        .limit(20),
      supabase
        .from('leaderboard')
        .select('*, profiles(name, avatar_url)')
        .eq('period_type', 'monthly')
        .gte('period_start', monthStartStr)
        .order('score_total', { ascending: false })
        .limit(20),
    ]);

    const mapEntry = (d: Record<string, unknown>, i: number): LeaderboardEntry => ({
      ...(d as unknown as LeaderboardEntry),
      profile: (d.profiles as { name: string; avatar_url: string | null }) ?? undefined,
      rank_position: i + 1,
    });

    const weekEntries = (weekData ?? []).map(mapEntry);
    const monthEntries = (monthData ?? []).map(mapEntry);

    setWeekly(weekEntries);
    setMonthly(monthEntries);

    const mine = weekEntries.find((e) => e.user_id === user.id);
    setMyEntry(mine ?? null);
    setLoading(false);
  }

  const radarData = myEntry
    ? [
        { subject: 'Consist.', value: myEntry.score_consistency },
        { subject: 'Progr.', value: myEntry.score_progression },
        { subject: 'Ader.', value: myEntry.score_adherence },
        { subject: 'Particip.', value: myEntry.score_participation },
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Ranking</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Score EDN: 40% Consistência · 30% Progressão · 20% Aderência · 10% Participação
        </p>
      </div>

      {/* My score */}
      {myEntry && (
        <div className="rounded-xl border border-[#D4853A]/30 bg-[#D4853A]/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold text-zinc-100 flex items-center gap-2">
              <Star className="h-4 w-4 text-[#D4853A]" /> Seu Score
            </p>
            <Badge variant="secondary" className="text-[#D4853A]">
              #{myEntry.rank_position ?? '—'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold text-[#D4853A]">{myEntry.score_total.toFixed(1)}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Score Total (semana)</p>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <RadarChart data={radarData} margin={{ top: 12, right: 42, bottom: 12, left: 42 }} outerRadius="70%">
                <PolarGrid stroke="#2C3E4A" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 9 }} />
                <Radar dataKey="value" stroke="#D4853A" fill="#D4853A" fillOpacity={0.2} />
                <Tooltip contentStyle={{ background: '#0D1117', border: '1px solid #2C3E4A', fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <Tabs defaultValue="weekly">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="weekly">Semana</TabsTrigger>
          <TabsTrigger value="monthly">Mês</TabsTrigger>
        </TabsList>

        {(['weekly', 'monthly'] as const).map((period) => (
          <TabsContent key={period} value={period} className="mt-4">
            <LeaderboardList entries={period === 'weekly' ? weekly : monthly} loading={loading} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function LeaderboardList({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhum dado de ranking disponível ainda.</p>
        <p className="text-xs mt-1">Complete treinos para aparecer no ranking!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => {
        const rank = entry.rank_position ?? i + 1;
        const medal = RANK_MEDALS[rank];
        const name = entry.profile?.name ?? 'Atleta';
        return (
          <div
            key={entry.user_id}
            className={cn(
              'flex items-center gap-4 rounded-xl border px-4 py-3 transition-all',
              rank <= 3
                ? 'border-zinc-700 bg-zinc-800/80'
                : 'border-zinc-800 bg-zinc-900'
            )}
          >
            <div className="w-8 text-center">
              {medal ? (
                <span className="text-lg">{medal.icon}</span>
              ) : (
                <span className="text-sm font-bold text-zinc-500">#{rank}</span>
              )}
            </div>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={entry.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-zinc-700 text-zinc-300 text-xs">
                {getInitials(name)}
              </AvatarFallback>
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
  );
}
