'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Search, LogIn, Copy, Check, Heart, MessageCircle, Trophy, Dumbbell, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LeagueBadge } from '@/components/gamification/edn-score-card';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Team {
  id: string; name: string; description: string; invite_code: string;
  max_members: number; total_xp: number; is_public: boolean; created_by: string;
  member_count?: number; is_member?: boolean;
}

interface ActivityItem {
  id: string; user_id: string; team_id: string | null; type: string;
  data: Record<string, unknown>; created_at: string;
  profile?: { name: string; avatar_url: string | null; league?: string };
  reaction_count: number; comment_count: number; user_reacted: boolean;
  comments?: { id: string; user_id: string; content: string; created_at: string; profile?: { name: string } }[];
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EquipesPage() {
  const supabase = createClient();
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    await Promise.all([loadTeams(user.id), loadFeed(user.id)]);
  }

  async function loadTeams(userId: string) {
    const [{ data: publicTeams }, { data: myMemberships }] = await Promise.all([
      supabase.from('teams').select('*, team_members(count)').eq('is_public', true).order('total_xp', { ascending: false }).limit(20),
      supabase.from('team_members').select('team_id').eq('user_id', userId),
    ]);
    const myIds = new Set((myMemberships ?? []).map((m: any) => m.team_id));
    const mapped = (publicTeams ?? []).map((t: any) => ({
      ...t, member_count: t.team_members?.[0]?.count ?? 0, is_member: myIds.has(t.id),
    })) as Team[];
    const DEFAULT_TEAMS: Team[] = [
      { id: 'edn-init',  name: 'EDN Iniciantes',    description: 'Para quem está começando. Progressão linear, 3-4x/semana.',                  invite_code: 'EDNINIT',  max_members: 50, total_xp: 0, is_public: true, created_by: 'system', member_count: 0, is_member: false },
      { id: 'edn-inter', name: 'EDN Intermediários', description: 'Dupla progressão e mesociclos estruturados, 1-3 anos de treino.',             invite_code: 'EDNINTER', max_members: 50, total_xp: 0, is_public: true, created_by: 'system', member_count: 0, is_member: false },
      { id: 'edn-adv',   name: 'EDN Avançados',      description: 'Naturais de elite. Periodização avançada e Top Set profissional.',           invite_code: 'EDNADV',   max_members: 30, total_xp: 0, is_public: true, created_by: 'system', member_count: 0, is_member: false },
    ];
    setTeams(mapped.length > 0 ? mapped : DEFAULT_TEAMS);
    setMyTeams(mapped.filter((t) => t.is_member));
    setLoading(false);
  }

  async function loadFeed(userId: string) {
    setFeedLoading(true);
    const { data: activities } = await supabase
      .from('activity_feed')
      .select(`*, profiles(name, avatar_url), activity_reactions(user_id), activity_comments(count)`)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!activities) { setFeedLoading(false); return; }

    const items: ActivityItem[] = activities.map((a: any) => ({
      ...a,
      profile: a.profiles ?? undefined,
      reaction_count: a.activity_reactions?.length ?? 0,
      comment_count: a.activity_comments?.[0]?.count ?? 0,
      user_reacted: (a.activity_reactions ?? []).some((r: any) => r.user_id === userId),
    }));
    setFeed(items);
    setFeedLoading(false);
  }

  async function toggleReaction(activityId: string, currentlyReacted: boolean) {
    if (!currentUserId) return;
    if (currentlyReacted) {
      await supabase.from('activity_reactions').delete().eq('activity_id', activityId).eq('user_id', currentUserId);
    } else {
      await supabase.from('activity_reactions').insert({ activity_id: activityId, user_id: currentUserId });
    }
    setFeed((prev) => prev.map((item) =>
      item.id === activityId
        ? { ...item, user_reacted: !currentlyReacted, reaction_count: item.reaction_count + (currentlyReacted ? -1 : 1) }
        : item
    ));
  }

  async function loadComments(activityId: string) {
    const { data } = await supabase
      .from('activity_comments')
      .select('*, profiles(name)')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true });
    setFeed((prev) => prev.map((item) =>
      item.id === activityId ? { ...item, comments: data ?? [] } : item
    ));
  }

  async function sendComment(activityId: string) {
    if (!currentUserId || !commentInput[activityId]?.trim()) return;
    await supabase.from('activity_comments').insert({ activity_id: activityId, user_id: currentUserId, content: commentInput[activityId].trim() });
    setCommentInput((prev) => ({ ...prev, [activityId]: '' }));
    await loadComments(activityId);
  }

  function toggleComments(activityId: string) {
    const nowOpen = !openComments[activityId];
    setOpenComments((prev) => ({ ...prev, [activityId]: nowOpen }));
    if (nowOpen) loadComments(activityId);
  }

  async function createTeam() {
    if (!createForm.name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: team, error } = await supabase.from('teams').insert({ name: createForm.name, description: createForm.description, created_by: user.id }).select().single();
    if (error) { toast.error('Erro ao criar equipe'); return; }
    await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' });
    // Post activity
    await supabase.from('activity_feed').insert({ user_id: user.id, type: 'join_team', data: { team_name: team.name, team_id: team.id } });
    toast.success('Equipe criada!');
    setShowCreate(false);
    setCreateForm({ name: '', description: '' });
    await loadTeams(user.id);
  }

  async function joinTeam(teamId: string, teamName?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('team_members').insert({ team_id: teamId, user_id: user.id });
    if (error) { toast.error('Erro ao entrar na equipe'); return; }
    await supabase.from('activity_feed').insert({ user_id: user.id, type: 'join_team', data: { team_name: teamName ?? 'Equipe', team_id: teamId } });
    toast.success('Você entrou na equipe!');
    await loadTeams(user.id);
  }

  async function joinByCode() {
    if (!joinCode.trim()) return;
    const { data: team } = await supabase.from('teams').select('id, name').eq('invite_code', joinCode.trim()).single();
    if (!team) { toast.error('Código inválido'); return; }
    await joinTeam(team.id, team.name);
    setShowJoin(false); setJoinCode('');
  }

  async function leaveTeam(teamId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', user.id);
    toast.success('Saiu da equipe');
    await loadTeams(user.id);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Comunidade</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Treine junto com a EDN</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowJoin(true)} className="gap-1.5"><LogIn className="h-3.5 w-3.5" /> Entrar</Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Criar</Button>
        </div>
      </div>

      <Tabs defaultValue="feed">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
        </TabsList>

        {/* ── FEED ── */}
        <TabsContent value="feed" className="mt-4 space-y-3">
          {feedLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-zinc-800 animate-pulse" />)}</div>
          ) : feed.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
              <Users className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">Nenhuma atividade ainda</p>
              <p className="text-xs text-zinc-600 mt-1">Complete um treino para aparecer no feed!</p>
            </div>
          ) : (
            feed.map((item) => (
              <ActivityCard
                key={item.id}
                item={item}
                currentUserId={currentUserId ?? ''}
                onReact={() => toggleReaction(item.id, item.user_reacted)}
                onToggleComments={() => toggleComments(item.id)}
                commentsOpen={!!openComments[item.id]}
                commentInput={commentInput[item.id] ?? ''}
                onCommentChange={(v) => setCommentInput((prev) => ({ ...prev, [item.id]: v }))}
                onCommentSend={() => sendComment(item.id)}
              />
            ))
          )}
        </TabsContent>

        {/* ── EQUIPES ── */}
        <TabsContent value="equipes" className="mt-4 space-y-4">
          {myTeams.length > 0 && (
            <div>
              <h2 className="font-semibold text-zinc-100 mb-3">Minhas Equipes</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {myTeams.map((team) => <TeamCard key={team.id} team={team} isMember onLeave={() => leaveTeam(team.id)} onCopyCode={() => copyCode(team.invite_code)} copied={copiedCode === team.invite_code} />)}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-zinc-100">Equipes Públicas</h2></div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar equipe…" className="w-full h-9 rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            {loading ? (
              <div className="grid sm:grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-zinc-800 animate-pulse" />)}</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())).map((team) => (
                  <TeamCard key={team.id} team={team} isMember={team.is_member} onJoin={() => joinTeam(team.id, team.name)} onLeave={() => leaveTeam(team.id)} onCopyCode={() => copyCode(team.invite_code)} copied={copiedCode === team.invite_code} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader><DialogTitle>Criar Equipe</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nome da equipe</Label>
              <input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Naturais do Rio" className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <textarea value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} placeholder="Descreva sua equipe…" rows={2} className="flex w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none" />
            </div>
            <Button className="w-full" onClick={createTeam}>Criar Equipe</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showJoin} onOpenChange={setShowJoin}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle>Entrar com Código</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Código de convite" className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono text-center tracking-widest" maxLength={8} />
            <Button className="w-full" onClick={joinByCode}>Entrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Activity Card ─────────────────────────────────────────────────────────────
function ActivityCard({ item, currentUserId, onReact, onToggleComments, commentsOpen, commentInput, onCommentChange, onCommentSend }: {
  item: ActivityItem; currentUserId: string;
  onReact: () => void; onToggleComments: () => void;
  commentsOpen: boolean; commentInput: string;
  onCommentChange: (v: string) => void; onCommentSend: () => void;
}) {
  const name = item.profile?.name ?? 'Atleta';
  const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR });

  const renderContent = () => {
    const d = item.data;
    switch (item.type) {
      case 'workout':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="font-semibold text-zinc-100 text-sm">
                {d.workout_name as string ?? 'Treino'} concluído
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
              {d.duration_min && <span>⏱ {d.duration_min as number}min</span>}
              {d.total_volume_kg && <span>🏋️ {Number(d.total_volume_kg).toFixed(0)}kg volume</span>}
              {d.sets_count && <span>📋 {d.sets_count as number} séries</span>}
              {(d.volume_change_pct as number) > 0 && (
                <span className="text-green-400">+{(d.volume_change_pct as number).toFixed(0)}% vs semana passada</span>
              )}
            </div>
          </div>
        );
      case 'pr':
        return (
          <div className="flex items-start gap-2">
            <Trophy className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-zinc-100 text-sm">🏆 Novo PR — {d.exercise_name as string}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{d.type === 'load' ? `${d.new_value}kg × ${d.reps as number} reps` : `${d.new_value} ${d.type}`} <span className="text-green-400">+{(d.improvement_pct as number)?.toFixed(1)}%</span></p>
            </div>
          </div>
        );
      case 'achievement':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xl">{d.icon as string ?? '🏅'}</span>
            <div>
              <p className="font-semibold text-zinc-100 text-sm">Conquista: {d.title as string}</p>
              <p className="text-xs text-zinc-400">{d.description as string}</p>
            </div>
          </div>
        );
      case 'join_team':
        return (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-green-400 shrink-0" />
            <p className="text-sm text-zinc-100">Entrou em <span className="font-semibold">{d.team_name as string}</span></p>
          </div>
        );
      default:
        return <p className="text-sm text-zinc-400">{item.type}</p>;
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={item.profile?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-zinc-700 text-zinc-300 text-xs">{getInitials(name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-zinc-100 text-sm">{name}</p>
            {item.profile?.league && <LeagueBadge league={item.profile.league} size="xs" />}
          </div>
          <p className="text-xs text-zinc-500">{timeAgo}</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">{renderContent()}</div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-zinc-800">
        <button onClick={onReact} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', item.user_reacted ? 'text-red-400 bg-red-600/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800')}>
          <Heart className={cn('h-3.5 w-3.5', item.user_reacted && 'fill-current')} />
          {item.reaction_count > 0 && item.reaction_count}
        </button>
        <button onClick={onToggleComments} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', commentsOpen ? 'text-blue-400 bg-blue-600/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800')}>
          <MessageCircle className="h-3.5 w-3.5" />
          {item.comment_count > 0 && item.comment_count}
        </button>
      </div>

      {/* Comments */}
      {commentsOpen && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
          {(item.comments ?? []).map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 shrink-0 text-[10px] font-bold text-zinc-300">
                {getInitials(c.profile?.name ?? 'A')}
              </div>
              <div className="flex-1 bg-zinc-800 rounded-lg px-3 py-1.5">
                <p className="text-xs font-semibold text-zinc-300">{c.profile?.name ?? 'Atleta'}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={commentInput} onChange={(e) => onCommentChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCommentSend()}
              placeholder="Comentar…"
              className="flex-1 h-8 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <Button size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onCommentSend} disabled={!commentInput.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team Card ─────────────────────────────────────────────────────────────────
function TeamCard({ team, isMember, onJoin, onLeave, onCopyCode, copied }: {
  team: Team; isMember?: boolean; onJoin?: () => void; onLeave?: () => void; onCopyCode?: () => void; copied?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border p-4 transition-all', isMember ? 'border-blue-600/30 bg-blue-600/5' : 'border-zinc-800 bg-zinc-900')}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-lg font-bold text-zinc-100">{team.name[0]?.toUpperCase()}</div>
          <div>
            <p className="font-semibold text-zinc-100 text-sm">{team.name}</p>
            <p className="text-xs text-zinc-500">{team.member_count ?? 0} membros</p>
          </div>
        </div>
        <span className="text-xs text-yellow-400 font-medium">{team.total_xp} XP</span>
      </div>
      {team.description && <p className="text-xs text-zinc-400 mb-3 leading-relaxed">{team.description}</p>}
      <div className="flex gap-2">
        {isMember ? (
          <>
            <Button size="sm" variant="ghost" onClick={onCopyCode} className="gap-1.5 text-xs h-7 flex-1">
              {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copiado!' : team.invite_code}
            </Button>
            <Button size="sm" variant="ghost" onClick={onLeave} className="text-xs h-7 text-red-400 hover:text-red-300 hover:bg-red-600/10">Sair</Button>
          </>
        ) : (
          <Button size="sm" onClick={onJoin} className="h-7 text-xs gap-1.5 flex-1"><Users className="h-3 w-3" /> Entrar</Button>
        )}
      </div>
    </div>
  );
}
