'use client';

import { useEffect, useState } from 'react';
import { Users, Plus, Search, Crown, LogIn, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Team {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  max_members: number;
  total_xp: number;
  is_public: boolean;
  created_by: string;
  member_count?: number;
  is_member?: boolean;
}

export default function EquipesPage() {
  const supabase = createClient();
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: publicTeams }, { data: myMemberships }] = await Promise.all([
      supabase.from('teams').select('*, team_members(count)').eq('is_public', true).order('total_xp', { ascending: false }).limit(20),
      supabase.from('team_members').select('team_id').eq('user_id', user.id),
    ]);

    const myTeamIds = new Set((myMemberships ?? []).map((m: { team_id: string }) => m.team_id));
    const mapped = (publicTeams ?? []).map((t: Record<string, unknown>) => ({
      ...t,
      member_count: (t.team_members as { count: number }[])?.[0]?.count ?? 0,
      is_member: myTeamIds.has(t.id as string),
    })) as Team[];

    setTeams(mapped);
    setMyTeams(mapped.filter((t) => t.is_member));
    setLoading(false);
  }

  async function createTeam() {
    if (!createForm.name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: team, error } = await supabase
      .from('teams')
      .insert({ name: createForm.name, description: createForm.description, created_by: user.id })
      .select()
      .single();

    if (error) { toast.error('Erro ao criar equipe'); return; }

    // Auto-join as owner
    await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' });
    toast.success('Equipe criada!');
    setShowCreate(false);
    setCreateForm({ name: '', description: '' });
    load();
  }

  async function joinTeam(teamId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('team_members').insert({ team_id: teamId, user_id: user.id });
    if (error) { toast.error('Erro ao entrar na equipe'); return; }
    toast.success('Você entrou na equipe!');
    load();
  }

  async function joinByCode() {
    if (!joinCode.trim()) return;
    const { data: team } = await supabase.from('teams').select('id').eq('invite_code', joinCode.trim()).single();
    if (!team) { toast.error('Código inválido'); return; }
    await joinTeam(team.id);
    setShowJoin(false);
    setJoinCode('');
  }

  async function leaveTeam(teamId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', user.id);
    toast.success('Saiu da equipe');
    load();
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
          <h1 className="text-2xl font-bold text-zinc-100">Equipes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Treine junto com a comunidade EDN</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowJoin(true)} className="gap-1.5">
            <LogIn className="h-3.5 w-3.5" /> Entrar
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Criar
          </Button>
        </div>
      </div>

      {/* My teams */}
      {myTeams.length > 0 && (
        <div>
          <h2 className="font-semibold text-zinc-100 mb-3">Minhas Equipes</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {myTeams.map((team) => (
              <TeamCard key={team.id} team={team} isMember onLeave={() => leaveTeam(team.id)} onCopyCode={() => copyCode(team.invite_code)} copied={copiedCode === team.invite_code} />
            ))}
          </div>
        </div>
      )}

      {/* Public teams */}
      <div>
        <h2 className="font-semibold text-zinc-100 mb-3">Equipes Públicas</h2>
        {loading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-zinc-800 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} isMember={team.is_member} onJoin={() => joinTeam(team.id)} onLeave={() => leaveTeam(team.id)} onCopyCode={() => copyCode(team.invite_code)} copied={copiedCode === team.invite_code} />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader><DialogTitle>Criar Equipe</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nome da equipe</Label>
              <input value={createForm.name} onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Naturais do Rio" className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <textarea value={createForm.description} onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Descreva sua equipe…" rows={2} className="flex w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none" />
            </div>
            <Button className="w-full" onClick={createTeam}>Criar Equipe</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join by code */}
      <Dialog open={showJoin} onOpenChange={setShowJoin}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle>Entrar com Código</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Código de convite (8 chars)" className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono text-center tracking-widest" maxLength={8} />
            <Button className="w-full" onClick={joinByCode}>Entrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamCard({ team, isMember, onJoin, onLeave, onCopyCode, copied }: {
  team: Team; isMember?: boolean;
  onJoin?: () => void; onLeave?: () => void; onCopyCode?: () => void; copied?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border p-4 transition-all', isMember ? 'border-blue-600/30 bg-blue-600/5' : 'border-zinc-800 bg-zinc-900')}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-lg">
            {team.name[0]?.toUpperCase() ?? '?'}
          </div>
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
          <Button size="sm" onClick={onJoin} className="h-7 text-xs gap-1.5 flex-1">
            <Users className="h-3 w-3" /> Entrar
          </Button>
        )}
      </div>
    </div>
  );
}
