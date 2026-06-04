'use client';
/**
 * Feed Social EDN — V5.0 Pillar 8
 * Strava dos naturais: treinos, PRs, conquistas, evolução corporal, desafios.
 */
import { useEffect, useState, useCallback } from 'react';
import { Dumbbell, TrendingUp, Trophy, Star, Zap, Heart, MessageCircle, Users, Plus, ChevronRight, Flame } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';

interface FeedItem {
  id: string;
  user_id: string;
  type: string;
  data: Record<string, any>;
  created_at: string;
  profiles?: { name: string; avatar_url: string | null };
  likes?: number;
  userLiked?: boolean;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  workout_complete: { icon: <Dumbbell className="h-4 w-4" />, color: 'text-[#D4853A]',   bg: 'bg-[#D4853A]/10',   label: 'Treino concluído' },
  new_pr:          { icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-400', bg: 'bg-green-400/10', label: 'Novo PR' },
  achievement:     { icon: <Trophy className="h-4 w-4" />,     color: 'text-yellow-400',bg: 'bg-yellow-400/10',label: 'Conquista' },
  body_update:     { icon: <Star className="h-4 w-4" />,       color: 'text-purple-400',bg: 'bg-purple-400/10',label: 'Evolução corporal' },
  challenge_done:  { icon: <Zap className="h-4 w-4" />,        color: 'text-orange-400',bg: 'bg-orange-400/10',label: 'Desafio concluído' },
  join_team:       { icon: <Users className="h-4 w-4" />,      color: 'text-zinc-400',  bg: 'bg-zinc-400/10',  label: 'Entrou em equipe' },
  streak:          { icon: <Flame className="h-4 w-4" />,      color: 'text-red-400',   bg: 'bg-red-400/10',   label: 'Sequência' },
};

function FeedCard({ item, onLike }: { item: FeedItem; onLike: (id: string) => void }) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.workout_complete;
  const name = item.profiles?.name?.split(' ')[0] ?? 'Atleta';
  const d = item.data ?? {};
  const timeAgo = formatDistanceToNow(parseISO(item.created_at), { locale: ptBR, addSuffix: true });

  let headline = '';
  let detail = '';

  switch (item.type) {
    case 'workout_complete':
      headline = `${name} concluiu ${d.workout_name ?? 'um treino'}`;
      detail = [d.volume_kg && `Volume: ${Math.round(d.volume_kg).toLocaleString('pt-BR')}kg`, d.duration_min && `${d.duration_min}min`, d.volume_delta && `${d.volume_delta > 0 ? '+' : ''}${d.volume_delta}% vs semana passada`].filter(Boolean).join(' · ');
      break;
    case 'new_pr':
      headline = `${name} bateu um PR em ${d.exercise_name ?? 'um exercício'}`;
      detail = d.weight_kg ? `${d.weight_kg}kg × ${d.reps ?? '?'} reps` : '';
      break;
    case 'achievement':
      headline = `${name} desbloqueou: ${d.title ?? 'Conquista'}`;
      detail = d.description ?? '';
      break;
    case 'body_update':
      headline = `${name} registrou evolução corporal`;
      detail = [d.weight_kg && `Peso: ${d.weight_kg}kg`, d.body_fat_pct && `BF: ${d.body_fat_pct}%`, d.muscle_kg && `Músculo: ${d.muscle_kg}kg`].filter(Boolean).join(' · ');
      break;
    case 'challenge_done':
      headline = `${name} completou o desafio: ${d.challenge_title ?? ''}`;
      detail = d.xp_reward ? `+${d.xp_reward} XP ganhos` : '';
      break;
    case 'join_team':
      headline = `${name} entrou na equipe ${d.team_name ?? ''}`;
      break;
    case 'streak':
      headline = `${name} está em sequência de ${d.days ?? '?'} dias!`;
      detail = `🔥 Consistência é o maior diferencial.`;
      break;
    default:
      headline = `${name} teve atividade`;
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', cfg.bg, cfg.color)}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100 leading-tight">{headline}</p>
          {detail && <p className="text-xs text-zinc-500 mt-0.5">{detail}</p>}
        </div>
        <span className="text-[10px] text-zinc-600 shrink-0">{timeAgo}</span>
      </div>

      {/* Type badge */}
      <div className="flex items-center justify-between">
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
          {cfg.label}
        </span>

        {/* Like button */}
        <button
          onClick={() => onLike(item.id)}
          className={cn('flex items-center gap-1.5 text-xs rounded-full px-3 py-1 transition-colors', item.userLiked ? 'text-red-400 bg-red-400/10' : 'text-zinc-500 hover:text-red-400 hover:bg-red-400/10')}
        >
          <Heart className={cn('h-3.5 w-3.5', item.userLiked && 'fill-current')} />
          {(item.likes ?? 0) > 0 && <span>{item.likes}</span>}
        </button>
      </div>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center space-y-3">
      <Dumbbell className="h-10 w-10 text-zinc-600 mx-auto" />
      <div>
        <p className="font-semibold text-zinc-300">Nenhuma atividade ainda</p>
        <p className="text-sm text-zinc-500 mt-1">Complete um treino, bata um PR ou entre em uma equipe para aparecer aqui.</p>
      </div>
      <div className="flex gap-2 justify-center">
        <Link href="/app/treinos"><Button size="sm" variant="outline" className="gap-1.5 text-xs"><Dumbbell className="h-3.5 w-3.5" />Treinos</Button></Link>
        <Link href="/app/equipes"><Button size="sm" variant="outline" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Equipes</Button></Link>
      </div>
    </div>
  );
}

export default function FeedPage() {
  const supabase = createClient();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 15;

  const loadFeed = useCallback(async (reset = false) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);

    const offset = reset ? 0 : page * PAGE_SIZE;

    const { data: items } = await supabase
      .from('activity_feed')
      .select('id, user_id, type, data, created_at, profiles(name, avatar_url)')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (!items) { setLoading(false); return; }

    // Get likes from localStorage (lightweight — no likes table in schema)
    const liked = JSON.parse(localStorage.getItem('edn_liked_items') ?? '{}');

    // Count likes from localStorage across all users (simplified)
    const feedWithMeta = items.map(item => ({
      ...item,
      profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
      likes: parseInt(localStorage.getItem(`like_${item.id}`) ?? '0'),
      userLiked: !!liked[item.id],
    })) as FeedItem[];

    if (reset) {
      setFeed(feedWithMeta);
      setPage(1);
    } else {
      setFeed(prev => [...prev, ...feedWithMeta]);
      setPage(p => p + 1);
    }
    setHasMore(items.length === PAGE_SIZE);
    setLoading(false);
  }, [page]);

  useEffect(() => { loadFeed(true); }, []);

  function handleLike(itemId: string) {
    const liked = JSON.parse(localStorage.getItem('edn_liked_items') ?? '{}');
    const wasLiked = !!liked[itemId];
    if (wasLiked) {
      delete liked[itemId];
    } else {
      liked[itemId] = true;
    }
    localStorage.setItem('edn_liked_items', JSON.stringify(liked));

    // Update count in storage
    const currentCount = parseInt(localStorage.getItem(`like_${itemId}`) ?? '0');
    localStorage.setItem(`like_${itemId}`, String(Math.max(0, currentCount + (wasLiked ? -1 : 1))));

    setFeed(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, userLiked: !wasLiked, likes: Math.max(0, (item.likes ?? 0) + (wasLiked ? -1 : 1)) }
        : item
    ));
  }

  async function postActivity() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Auto-post based on recent data
    const { data: lastSession } = await supabase
      .from('workout_sessions')
      .select('id, finished_at, total_volume_kg, workout_days(name)')
      .eq('user_id', user.id)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1)
      .single();

    if (lastSession) {
      await supabase.from('activity_feed').insert({
        user_id: user.id,
        type: 'workout_complete',
        data: {
          workout_name: (lastSession.workout_days as any)?.name ?? 'Treino',
          volume_kg: lastSession.total_volume_kg,
        },
      });
      toast.success('Atividade publicada no feed!');
      loadFeed(true);
    } else {
      toast.error('Nenhum treino recente para publicar.');
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Feed EDN</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Comunidade de atletas naturais</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={postActivity} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Publicar treino
          </Button>
          <Link href="/app/equipes">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Equipes
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Publicações', value: feed.length.toString(), icon: <Dumbbell className="h-3.5 w-3.5" /> },
          { label: 'PRs da semana', value: feed.filter(f => f.type === 'new_pr').length.toString(), icon: <TrendingUp className="h-3.5 w-3.5" /> },
          { label: 'Conquistas', value: feed.filter(f => f.type === 'achievement').length.toString(), icon: <Trophy className="h-3.5 w-3.5" /> },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-center">
            <div className="flex justify-center text-zinc-500 mb-1">{s.icon}</div>
            <p className="text-lg font-bold text-zinc-100">{s.value}</p>
            <p className="text-[10px] text-zinc-600">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-zinc-800 animate-pulse" />)}
        </div>
      ) : feed.length === 0 ? (
        <EmptyFeed />
      ) : (
        <div className="space-y-3">
          {feed.map(item => (
            <FeedCard key={item.id} item={item} onLike={handleLike} />
          ))}
          {hasMore && (
            <button onClick={() => loadFeed(false)} className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-3 flex items-center justify-center gap-1 transition-colors">
              Carregar mais <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
