'use client';

import { useEffect, useState, useCallback } from 'react';
import { Zap, Trophy, Clock, CheckCircle2, Sparkles, Loader2, Star, TrendingUp, Dumbbell, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, parseISO, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: string;
  tracking_type: string;
  tracking_period: string;
  target_value: number;
  target_unit: string;
  xp_reward: number;
  difficulty_level: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  user_id: string | null;
  current_value?: number;
  completed?: boolean;
}

const TYPE_ICONS: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  consistency:  { icon: <Zap className="h-4 w-4" />,       color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  progression:  { icon: <TrendingUp className="h-4 w-4" />, color: 'text-[#D4853A]',   bg: 'bg-[#D4853A]/10' },
  volume:       { icon: <Dumbbell className="h-4 w-4" />,   color: 'text-purple-400', bg: 'bg-purple-400/10' },
  frequency:    { icon: <Calendar className="h-4 w-4" />,   color: 'text-green-400',  bg: 'bg-green-400/10' },
};

const DIFF_LABELS = ['', 'Iniciante', 'Intermediário', 'Avançado', 'Expert', 'Elite'];
const DIFF_COLORS = ['', 'text-green-400', 'text-[#D4853A]', 'text-yellow-400', 'text-orange-400', 'text-red-400'];

function periodRange(period: string, startDate: string) {
  if (period === 'monthly') {
    const d = parseISO(startDate);
    return { start: startOfMonth(d), end: endOfMonth(d) };
  }
  const d = parseISO(startDate);
  return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
}

export default function DesafiosPage() {
  const supabase = createClient();
  const [personal, setPersonal] = useState<Challenge[]>([]);
  const [community, setCommunity] = useState<Challenge[]>([]);
  const [userLevel, setUserLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [awardingIds, setAwardingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: xp }, { data: challenges }, { data: sessions }] = await Promise.all([
      supabase.from('user_xp').select('level').eq('user_id', user.id).single(),
      supabase.from('challenges').select('*').eq('is_active', true).order('end_date', { ascending: true }),
      supabase.from('workout_sessions')
        .select('started_at, total_volume_kg')
        .eq('user_id', user.id)
        .gte('started_at', format(startOfMonth(new Date()), 'yyyy-MM-dd')),
    ]);

    setUserLevel(xp?.level ?? 1);

    const { data: myPart } = await supabase
      .from('challenge_participants')
      .select('challenge_id, current_value, completed')
      .eq('user_id', user.id);
    const myMap = new Map((myPart ?? []).map((p: { challenge_id: string; current_value: number; completed: boolean }) => [p.challenge_id, p]));

    const allSessions = sessions ?? [];

    const withProgress = (challenges ?? []).map((c: Record<string, unknown>) => {
      const part = myMap.get(c.id as string);
      let currentValue = part?.current_value ?? 0;

      // Auto-calculate progress for personal challenges
      if (c.user_id === user.id && c.tracking_type && !part?.completed) {
        const range = periodRange(c.tracking_period as string, c.start_date as string);
        const rangeEnd = new Date() < range.end ? new Date() : range.end;
        const periodSessions = allSessions.filter(s => {
          const d = parseISO(s.started_at);
          return d >= range.start && d <= rangeEnd;
        });

        if (c.tracking_type === 'sessions_count') {
          currentValue = periodSessions.length;
        } else if (c.tracking_type === 'volume_kg') {
          currentValue = Math.round(periodSessions.reduce((s, ws) => s + (ws.total_volume_kg ?? 0), 0));
        } else if (c.tracking_type === 'days_active') {
          const uniqueDays = new Set(periodSessions.map(s => s.started_at.slice(0, 10)));
          currentValue = uniqueDays.size;
        }
      }

      return {
        ...(c as unknown as Challenge),
        current_value: currentValue,
        completed: part?.completed ?? (currentValue >= (c.target_value as number)),
      };
    });

    setPersonal(withProgress.filter(c => c.user_id === user.id));
    setCommunity(withProgress.filter(c => c.user_id === null));
    setLoading(false);

    // Award XP for newly completed personal challenges
    const newlyCompleted = withProgress.filter(
      c => c.user_id === user.id && c.completed && !(myMap.get(c.id)?.completed)
    );
    for (const c of newlyCompleted) {
      await awardXp(user.id, c);
    }
  }, []);

  async function awardXp(userId: string, challenge: Challenge) {
    if (awardingIds.has(challenge.id)) return;
    setAwardingIds(prev => new Set(prev).add(challenge.id));
    try {
      await Promise.all([
        supabase.from('challenge_participants')
          .update({ completed: true, current_value: challenge.current_value })
          .eq('challenge_id', challenge.id)
          .eq('user_id', userId),
        supabase.from('xp_logs').insert({
          user_id: userId, xp_earned: challenge.xp_reward,
          reason: 'Desafio concluido: ' + challenge.title,
        }),
        supabase.from('user_xp').select('xp_total').eq('user_id', userId).single().then(({ data }) => {
          if (data) supabase.from('user_xp').update({ xp_total: (data.xp_total ?? 0) + challenge.xp_reward }).eq('user_id', userId).then(() => {});
        }),
      ]);
      toast.success('+' + challenge.xp_reward + ' XP! Desafio concluido: ' + challenge.title, { icon: '🏆' });
    } finally {
      setAwardingIds(prev => { const s = new Set(prev); s.delete(challenge.id); return s; });
    }
  }

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-challenges', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.challenges + ' desafios gerados! Dificuldade: ' + DIFF_LABELS[data.difficulty_level]);
      await load();
    } catch (err: any) {
      toast.error('Erro ao gerar desafios: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function joinCommunity(challengeId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('challenge_participants').insert({ challenge_id: challengeId, user_id: user.id });
    if (error) { toast.error('Erro ao entrar no desafio'); return; }
    toast.success('Voce entrou no desafio!');
    load();
  }

  const allPersonalDone = personal.length > 0 && personal.every(c => c.completed);

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-zinc-800 animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Desafios</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Complete desafios, ganhe XP e evolua</p>
        </div>
        <Button onClick={handleGenerate} disabled={generating} className="gap-2 shrink-0">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {personal.length === 0 ? 'Gerar Desafios' : allPersonalDone ? 'Novos Desafios' : 'Regenerar'}
        </Button>
      </div>

      {/* Personal challenges */}
      {personal.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Meus Desafios</h2>
            <span className={cn('text-xs font-semibold', DIFF_COLORS[personal[0]?.difficulty_level ?? 1])}>
              {DIFF_LABELS[personal[0]?.difficulty_level ?? 1]}
            </span>
          </div>

          {allPersonalDone && (
            <div className="rounded-xl border border-green-600/30 bg-green-600/5 p-4 flex items-center gap-3">
              <Trophy className="h-5 w-5 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-300">Todos os desafios concluidos!</p>
                <p className="text-xs text-zinc-500 mt-0.5">Gere novos desafios com maior dificuldade</p>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            {personal.map(c => <ChallengeCard key={c.id} challenge={c} />)}
          </div>
        </div>
      )}

      {personal.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-10 text-center">
          <Star className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="font-semibold text-zinc-300">Nenhum desafio pessoal</p>
          <p className="text-sm text-zinc-500 mt-1">Clique em "Gerar Desafios" para o Coach EDN criar metas para o seu nivel</p>
        </div>
      )}

      {/* Community challenges */}
      {community.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Desafios da Comunidade</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {community.map(c => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                onJoin={c.current_value === undefined ? () => joinCommunity(c.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChallengeCard({ challenge: c, onJoin }: { challenge: Challenge; onJoin?: () => void }) {
  const daysLeft = differenceInDays(parseISO(c.end_date), new Date());
  const progress = c.target_value > 0 ? Math.min(100, ((c.current_value ?? 0) / c.target_value) * 100) : 0;
  const isParticipating = c.current_value !== undefined;
  const meta = TYPE_ICONS[c.type] ?? TYPE_ICONS.consistency;

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      c.completed ? 'border-green-600/30 bg-green-600/5' :
      isParticipating ? 'border-[#D4853A]/20 bg-zinc-900' :
      'border-zinc-800 bg-zinc-900'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', meta.bg, meta.color)}>
            {meta.icon}
          </div>
          <div>
            <p className="font-semibold text-zinc-100 text-sm leading-tight">{c.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-yellow-400 font-semibold">+{c.xp_reward} XP</span>
              {c.difficulty_level > 0 && (
                <span className={cn('text-[10px] font-medium', DIFF_COLORS[c.difficulty_level])}>
                  · {DIFF_LABELS[c.difficulty_level]}
                </span>
              )}
            </div>
          </div>
        </div>
        {c.completed && <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />}
      </div>

      <p className="text-xs text-zinc-400 mb-3 leading-relaxed">{c.description}</p>

      {isParticipating && !c.completed && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
            <span>Progresso</span>
            <span className="font-medium text-zinc-300">{c.current_value ?? 0} / {c.target_value} {c.target_unit}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {c.completed && (
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-zinc-500">{c.current_value} / {c.target_value} {c.target_unit}</span>
          <span className="text-green-400 font-semibold">Concluido!</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Clock className="h-3 w-3" />
          <span>{daysLeft > 0 ? daysLeft + ' dias restantes' : 'Encerrado'}</span>
          <span>· ate {format(parseISO(c.end_date), 'dd/MM', { locale: ptBR })}</span>
        </div>
        {onJoin && daysLeft > 0 && (
          <Button size="sm" onClick={onJoin} className="h-7 text-xs gap-1">
            <Zap className="h-3 w-3" /> Participar
          </Button>
        )}
      </div>
    </div>
  );
}
