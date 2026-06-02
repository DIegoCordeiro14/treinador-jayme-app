'use client';

import { useEffect, useState } from 'react';
import { User, Save, LogOut, Camera, Zap, Bell, Shield, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getInitials } from '@/lib/utils';
import { xpProgress } from '@/lib/edn/progression';
import type { Profile, GoalType, ExperienceLevel, GenderType } from '@/types';
import { GOAL_LABELS, EXPERIENCE_LABELS } from '@/types';

export default function PerfilPage() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [xp, setXp] = useState({ xp_total: 0, level: 1 });
  const [form, setForm] = useState({ name: '', age: '', gender: '', weight_kg: '', height_cm: '', body_fat_pct: '', goal: 'hypertrophy', experience_level: 'beginner', weekly_frequency: '3', meals_per_day: '3' });
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showInRanking, setShowInRanking] = useState(true);
  const [notifTraining, setNotifTraining] = useState(true);
  const [notifChallenge, setNotifChallenge] = useState(true);
  const [notifLevel, setNotifLevel] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');

      const [{ data: prof }, { data: xpData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('user_xp').select('xp_total, level').eq('user_id', user.id).single(),
      ]);

      if (prof) {
        setProfile(prof as Profile);
        setForm({
          name: prof.name ?? '',
          age: prof.age?.toString() ?? '',
          gender: prof.gender ?? '',
          weight_kg: prof.weight_kg?.toString() ?? '',
          height_cm: prof.height_cm?.toString() ?? '',
          body_fat_pct: '',
          goal: prof.goal ?? 'hypertrophy',
          experience_level: prof.experience_level ?? 'beginner',
          weekly_frequency: prof.weekly_frequency?.toString() ?? '3',
          meals_per_day: (prof as any).meals_per_day?.toString() ?? '3',
        });
      }
      if (xpData) setXp(xpData);
    }
    load();
  }, []);

  async function saveProfile() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      name: form.name,
      age: form.age ? parseInt(form.age) : null,
      gender: form.gender as GenderType || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      goal: form.goal as GoalType,
      experience_level: form.experience_level as ExperienceLevel,
      weekly_frequency: parseInt(form.weekly_frequency),
      meals_per_day: form.meals_per_day ? parseInt(form.meals_per_day) : 3,
    });

    setSaving(false);
    if (error) { toast.error('Erro ao salvar perfil'); return; }
    toast.success('Perfil salvo!');
  }

  async function handleAvatarUpload(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem válida'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem deve ter menos de 2MB'); return; }
    setUploadingAvatar(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingAvatar(false); return; }
    const ext = file.name.split('.').pop();
    const path = `avatars/${user.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) { toast.error('Erro ao enviar foto'); setUploadingAvatar(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
    setProfile(p => p ? { ...p, avatar_url: publicUrl } : p);
    toast.success('Foto atualizada!');
    setUploadingAvatar(false);
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setDeleting(false); return; }
    // Deletar dados do usuário e fazer logout
    await supabase.from('profiles').delete().eq('id', user.id);
    await supabase.auth.signOut();
    toast.success('Conta excluída');
    router.push('/');
    setDeleting(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const progress = xpProgress(xp.xp_total);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setInput = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100">Perfil</h1>

      {/* Avatar + XP */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-zinc-700 text-zinc-200 text-xl font-bold">
                {getInitials(form.name || 'Atleta')}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1">
            <p className="font-bold text-zinc-100 text-lg">{form.name || 'Atleta'}</p>
            <p className="text-sm text-zinc-500">{email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-blue-600/15 text-blue-400 border-blue-600/30">
                <Zap className="h-3 w-3 mr-1" />
                Nível {progress.level}
              </Badge>
              <span className="text-xs text-zinc-500">{xp.xp_total} XP total</span>
            </div>
            <div className="mt-2 h-1.5 w-48 rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress.pct}%` }} />
            </div>
            <p className="text-[10px] text-zinc-600 mt-0.5">{progress.current}/{progress.needed} XP para nível {progress.level + 1}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
        <h2 className="font-semibold text-zinc-100">Dados Pessoais</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome</Label>
            <input value={form.name} onChange={setInput('name')} placeholder="Seu nome" className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          {[
            { key: 'age', label: 'Idade', placeholder: '25', type: 'number' },
            { key: 'weight_kg', label: 'Peso (kg)', placeholder: '75', type: 'number' },
            { key: 'height_cm', label: 'Altura (cm)', placeholder: '175', type: 'number' },
            { key: 'weekly_frequency', label: 'Treinos/semana', placeholder: '4', type: 'number' },
            { key: 'meals_per_day', label: 'Refeições/dia', placeholder: '3', type: 'number' },
          ].map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <input
                type={f.type}
                value={form[f.key as keyof typeof form]}
                onChange={setInput(f.key)}
                placeholder={f.placeholder}
                min={1}
                className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Sexo</Label>
            <Select value={form.gender} onValueChange={set('gender')}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Selecionar…" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="male" className="text-zinc-100">Masculino</SelectItem>
                <SelectItem value="female" className="text-zinc-100">Feminino</SelectItem>
                <SelectItem value="other" className="text-zinc-100">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Objetivo</Label>
            <Select value={form.goal} onValueChange={set('goal')}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {Object.entries(GOAL_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-zinc-100">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nível de Experiência</Label>
            <Select value={form.experience_level} onValueChange={set('experience_level')}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {Object.entries(EXPERIENCE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-zinc-100">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button className="w-full gap-2" onClick={saveProfile} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? 'Salvando…' : 'Salvar Perfil'}
        </Button>
      </div>

      {/* Privacidade */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-zinc-400" /> Privacidade
        </h2>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm text-zinc-300">Aparecer no ranking público</p>
            <p className="text-xs text-zinc-500">Outros usuários poderão ver seu score</p>
          </div>
          <button
            onClick={() => setShowInRanking(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showInRanking ? 'bg-blue-600' : 'bg-zinc-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${showInRanking ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Notificações */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-zinc-400" /> Notificações
        </h2>
        <div className="space-y-3 divide-y divide-zinc-800">
          {[
            { label: 'Lembrete de treino', sub: 'Notificação diária para não perder o treino', state: notifTraining, set: setNotifTraining },
            { label: 'Desafio próximo do prazo', sub: 'Alerta quando um desafio vence em ≤ 2 dias', state: notifChallenge, set: setNotifChallenge },
            { label: 'Subiu de nível', sub: 'Comemoração ao atingir um novo nível de XP', state: notifLevel, set: setNotifLevel },
          ].map(n => (
            <div key={n.label} className="flex items-center justify-between py-2.5 first:pt-0">
              <div>
                <p className="text-sm text-zinc-300">{n.label}</p>
                <p className="text-xs text-zinc-500">{n.sub}</p>
              </div>
              <button
                onClick={() => n.set(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${n.state ? 'bg-blue-600' : 'bg-zinc-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${n.state ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-semibold text-zinc-100 mb-4">Conta</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-zinc-300">E-mail</p>
              <p className="text-xs text-zinc-500">{email}</p>
            </div>
          </div>
        </div>
        <Button variant="outline" className="w-full mt-4 gap-2 border-red-800 text-red-400 hover:bg-red-600/10" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> Sair da conta
        </Button>
        <div className="mt-3 pt-3 border-t border-zinc-800">
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="w-full text-xs text-zinc-600 hover:text-red-400 transition-colors py-1">
              Excluir minha conta
            </button>
          ) : (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-3">
              <p className="text-sm text-red-300 font-semibold">Tem certeza? Esta ação é irreversível.</p>
              <p className="text-xs text-zinc-500">Todos os seus dados (treinos, evolução, XP) serão excluídos permanentemente.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 transition-colors">Cancelar</button>
                <button onClick={handleDeleteAccount} disabled={deleting} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60">
                  <Trash2 className="h-3.5 w-3.5" /> {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
