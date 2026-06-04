'use client';
/**
 * Feed Social EDN — V6.5 Pilar 12
 * Strava dos Naturais: treinos, PRs, conquistas, evolução corporal, desafios.
 * Eventos publicados AUTOMATICAMENTE por triggers no Supabase.
 * Curtidas e comentários 100% persistidos no Supabase (sem localStorage).
 */
import { useEffect, useState, useCallback } from 'react';
import { Dumbbell, TrendingUp, Trophy, Star, Zap, Heart, MessageCircle, Users, ChevronRight, Flame, Send, Crown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';

interface FeedComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: { name: string } | null;
}

interface FeedItem {
  id: string;
  user_id: string;
  type: string;
  data: Record<string, any>;
  created_at: string;
  profiles?: { name: string; avatar_url: string | null };
  likes: number;
  userLiked: boolean;
  commentsCount: number;
  comments: FeedComment[];
  commentsOpen: boolean;
}

interface RankEntry { user_id: string; xp_total: number; name: string; }

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  workout_complete: { icon: <Dumbbell className="h-4 w-4" />, color: 'text-blue-400',   bg: 'bg-blue-400/10',   label: 'Treino concluído' },
  new_pr:          { icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-400', bg: 'bg-green-400/10', label: 'Novo PR' },
  achievement:     { icon: <Trophy className="h-4 w-4" />,     color: 'text-yellow-400',bg: 'bg-yellow-400/10',label: 'Conquista' },
  body_update:     { icon: <Star className="h-4 w-4" />,       color: 'text-purple-400',bg: 'bg-purple-400/10',label: 'Evolução corporal' },
  challenge_done:  { icon: <Zap className="h-4 w-4" />,        color: 'text-orange-400',bg: 'bg-orange-400/10',label: 'Desafio concluído' },
  join_team:       { icon: <Users className="h-4 w-4" />,      color: 'text-zinc-400',  bg: 'bg-zinc-400/10',  label: 'Entrou em equipe' },
  streak:          { icon: <Flame className="h-4 w-4" />,      color: 'text-red-400',   bg: 'bg-red-400/10',   label: 'Sequência' },
};

const LIKE_EMOJI = '❤️';

function headlineFor(item: FeedItem): { headline: string; detail: string } {
  const name = item.profiles?.name?.split(' ')[0] ?? 'Atleta';
  const d = item.data ?? {};
  switch (item.type) {
    case 'workout_complete':
      return {
        headline: `${name} concluiu ${d.workout_name ?? 'um treino'}`,
        detail: [d.volume_kg && `Volume: ${Math.round(d.volume_kg).toLocaleString('pt-BR')}kg`, d.duration_min && `${d.duration_min}min`].filter(Boolean).join(' · '),
      };
    case 'new_pr':
      return {
        headline: `${name} bateu um PR em ${d.exercise_name ?? 'um exercício'}`,
        detail: [d.weight_kg && `${d.weight_kg}kg`, d.improvement_pct && `+${d.improvement_pct}%`].filter(Boolean).join(' · '),
      };
    case 'achievement':
      return { headline: `${name} desbloqueou: ${d.icon ?? '🏆'} ${d.title ?? 'Conquista'}`, detail: d.description ?? '' };
    case 'body_update':
      return {
        headline: `${name} registrou evolução corporal`,
        detail: [d.weight_kg && `Peso: ${d.weight_kg}kg`, d.body_fat_pct && `BF: ${d.body_fat_pct}%`, d.muscle_kg && `Músculo: ${d.muscle_kg}kg`].filter(Boolean).join(' · '),
      };
    case 'challenge_done':
      return { headline: `${name} completou o desafio: ${d.challenge_title ?? ''}`, detail: d.xp_reward ? `+${d.xp_reward} XP ganhos` : '' };
    case 'join_team':
      return { headline: `${name} entrou na equipe ${d.team_name ?? ''}`, detail: '' };
    case 'streak':
      return { headline: `${name} está em sequência de ${d.days ?? '?'} dias!`, detail: '🔥 Consistência é o maior diferencial.' };
    default:
      return { headline: `${name} teve atividade`, detail: '' };
  }
}

export default function FeedPage() {
  const supabase = createClient();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
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

    // Curtidas e comentários — persistidos no Supabase
    const ids = items.map(i => i.id);
    const [{ data: reactions }, { data: commentRows }] = await Promise.all([
      ids.length ? supabase.from('activity_reactions').select('activity_id, user_id').in('activity_id', ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from('activity_comments').select('id, activity_id, user_id, content, created_at, profiles(name)').in('activity_id', ids).order('created_at', { ascending: true }) : Promise.resolve({ data: [] as any[] }),
    ]);

    const likesById = new Map<string, { count: number; mine: boolean }>();
    (reactions ?? []).forEach((r: any) => {
      const e = likesById.get(r.activity_id) ?? { count: 0, mine: false };
      e.count += 1;
      if (r.user_id === user.id) e.mine = true;
      likesById.set(r.activity_id, e);
    });

    const commentsById = new Map<string, FeedComment[]>();
    (commentRows ?? []).forEach((c: any) => {
      const list = commentsById.get(c.activity_id) ?? [];
      list.push({ ...c, profiles: Array.isArray(c.profiles) ? c.profiles[0] : c.profiles });
      commentsById.set(c.activity_id, list);
    });

    const feedWithMeta = items.map(item => {
      const lk = likesById.get(item.id) ?? { count: 0, mine: false };
      const cm = commentsById.get(item.id) ?? [];
      return {
        ...item,
        profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
        likes: lk.count,
        userLiked: lk.mine,
        commentsCount: cm.length,
        comments: cm,
        commentsOpen: false,
      };
    }) as FeedItem[];

    if (reset) { setFeed(feedWithMeta); setPage(1); }
    else { setFeed(prev => [...prev, ...feedWithMeta]); setPage(p => p + 1); }
    setHasMore(items.length === PAGE_SIZE);
    setLoading(false);
  }, [page]);

  const loadRanking = useCallback(async () => {
    const { data } = await supabase
      .from('user_xp')
      .select('user_id, xp_total, profiles(name)')
      .order('xp_total', { ascending: false })
      .limit(3);
    if (data) {
      setRanking(data.map((r: any) => ({
        user_id: r.user_id,
        xp_total: r.xp_total ?? 0,
        name: (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.name?.split(' ')[0] ?? 'Atleta',
      })));
    }
  }, []);

  useEffect(() => { loadFeed(true); loadRanking(); }, []);

  // ── Curtir / descurtir — Supabase (activity_reactions) ─────────────────────
  async function handleLike(itemId: string) {
    if (!myUserId) return;
    const item = feed.find(i => i.id === itemId);
    if (!item) return;

    // Otimista
    setFeed(prev => prev.map(i => i.id === itemId
      ? { ...i, userLiked: !i.userLiked, likes: Math.max(0, i.likes + (i.userLiked ? -1 : 1)) }
      : i));

    if (item.userLiked) {
      const { error } = await supabase.from('activity_reactions').delete().eq('activity_id', itemId).eq('user_id', myUserId);
      if (error) { toast.error('Erro ao remover curtida'); loadFeed(true); }
    } else {
      const { error } = await supabase.from('activity_reactions').insert({ activity_id: itemId, user_id: myUserId, emoji: LIKE_EMOJI });
      if (error) { toast.error('Erro ao curtir'); loadFeed(true); }
    }
  }

  // ── Comentários — Supabase (activity_comments) ─────────────────────────────
  function toggleComments(itemId: string) {
    setFeed(prev => prev.map(i => i.id === itemId ? { ...i, commentsOpen: !i.commentsOpen } : i));
  }

  async function submitComment(itemId: string) {
    if (!myUserId) return;
    const content = (commentDrafts[itemId] ?? '').trim();
    if (!content) return;
    const { data, error } = await supabase
      .from('activity_comments')
      .insert({ activity_id: itemId, user_id: myUserId, content })
      .select('id, user_id, content, created_at')
      .single();
    if (error || !data) { toast.error('Erro ao comentar'); return; }
    setCommentDrafts(p => ({ ...p, [itemId]: '' }));
    setFeed(prev => prev.map(i => i.id === itemId
      ? { ...i, comments: [...i.comments, { ...data, profiles: { name: 'Você' } }], commentsCount: i.commentsCount + 1, commentsOpen: true }
      : i));
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Feed EDN</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Comunidade de atletas naturais — treinos, PRs e conquistas aparecem aqui automaticamente</p>
        </div>
        <Link href="/app/equipes" className="shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            Equipes
          </Button>
        </Link>
      </div>

      {/* Ranking entre amigos */}
      {ranking.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-yellow-400" />
              <p className="text-xs font-bold text-zinc-300 uppercase tracking-wide">Ranking da comunidade</p>
            </div>
            <Link href="/app/ranking" className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5">
              ver completo <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ranking.map((r, i) => (
              <div key={r.user_id} className={cn('rounded-lg p-2.5 text-center border', i === 0 ? 'border-yellow-600/30 bg-yellow-600/5' : 'border-zinc-800 bg-zinc-800/40')}>
                <p className="text-base">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</p>
                <p className="text-xs font-semibold text-zinc-200 truncate">{r.name}</p>
                <p className="text-[10px] text-zinc-500">{r.xp_total.toLocaleString('pt-BR')} XP</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Publicações', value: feed.length.toString(), icon: <Dumbbell className="h-3.5 w-3.5" /> },
          { label: 'PRs recentes', value: feed.filter(f => f.type === 'new_pr').length.toString(), icon: <TrendingUp className="h-3.5 w-3.5" /> },
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
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center space-y-3">
          <Dumbbell className="h-10 w-10 text-zinc-600 mx-auto" />
          <div>
            <p className="font-semibold text-zinc-300">Nenhuma atividade ainda</p>
            <p className="text-sm text-zinc-500 mt-1">Complete um treino, bata um PR ou entre em uma equipe — o feed publica automaticamente.</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Link href="/app/treinos"><Button size="sm" variant="outline" className="gap-1.5 text-xs"><Dumbbell className="h-3.5 w-3.5" />Treinos</Button></Link>
            <Link href="/app/equipes"><Button size="sm" variant="outline" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Equipes</Button></Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {feed.map(item => {
            const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.workout_complete;
            const { headline, detail } = headlineFor(item);
            const timeAgo = formatDistanceToNow(parseISO(item.created_at), { locale: ptBR, addSuffix: true });
            return (
              <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
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

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                    {cfg.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleComments(item.id)}
                      className={cn('flex items-center gap-1.5 text-xs rounded-full px-3 py-1 transition-colors', item.commentsOpen ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10')}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {item.commentsCount > 0 && <span>{item.commentsCount}</span>}
                    </button>
                    <button
                      onClick={() => handleLike(item.id)}
                      className={cn('flex items-center gap-1.5 text-xs rounded-full px-3 py-1 transition-colors', item.userLiked ? 'text-red-400 bg-red-400/10' : 'text-zinc-500 hover:text-red-400 hover:bg-red-400/10')}
                    >
                      <Heart className={cn('h-3.5 w-3.5', item.userLiked && 'fill-current')} />
                      {item.likes > 0 && <span>{item.likes}</span>}
                    </button>
                  </div>
                </div>

                {/* Comments */}
                {item.commentsOpen && (
                  <div className="border-t border-zinc-800 pt-3 space-y-2.5">
                    {item.comments.map(c => (
                      <div key={c.id} className="flex items-start gap-2">
                        <span className="text-xs font-semibold text-zinc-300 shrink-0">{c.profiles?.name?.split(' ')[0] ?? 'Atleta'}:</span>
                        <p className="text-xs text-zinc-400 leading-relaxed break-words min-w-0">{c.content}</p>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        value={commentDrafts[item.id] ?? ''}
                        onChange={e => setCommentDrafts(p => ({ ...p, [item.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') submitComment(item.id); }}
                        placeholder="Comentar…"
                        className="flex-1 h-8 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                      <button
                        onClick={() => submitComment(item.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
