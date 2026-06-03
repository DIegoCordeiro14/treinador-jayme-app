'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, LogOut, Zap, Bell, Shield, Trash2, Activity, Target, Dumbbell, CalendarClock, HeartPulse, CheckCircle2, AlertCircle, User } from 'lucide-react';
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
import type { Profile, GenderType, MuscleGroup } from '@/types';
import {
  MAIN_GOAL_LABELS, AESTHETIC_GOAL_LABELS_MALE, AESTHETIC_GOAL_LABELS_FEMALE,
  EXPERIENCE_LABELS, MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS,
  TRAINING_YEARS_LABELS, SLEEP_HOURS_LABELS, SLEEP_QUALITY_LABELS,
  STRESS_LEVEL_LABELS, WORK_TYPE_LABELS, CARDIO_FREQUENCY_LABELS, CARDIO_TYPE_LABELS,
  TRAINING_LOCATION_LABELS, PREFERRED_TIME_LABELS, LIMITATION_LABELS,
  EDN_PHASE_LABELS, COMPLEXITY_LABELS,
} from '@/types';

// ────────────────────────────────────────────────────────────────────────────
// Módulo 0 — Perfil Inteligente (Anamnese Esportiva)
// 5 abas · indicador de completude · avaliação automática EDN
// ────────────────────────────────────────────────────────────────────────────

type TabKey = 'basico' | 'objetivos' | 'experiencia' | 'rotina' | 'saude';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'basico',      label: 'Básico',      icon: <User className="h-3.5 w-3.5" /> },
  { key: 'objetivos',   label: 'Objetivos',   icon: <Target className="h-3.5 w-3.5" /> },
  { key: 'experiencia', label: 'Experiência', icon: <Dumbbell className="h-3.5 w-3.5" /> },
  { key: 'rotina',      label: 'Rotina',      icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { key: 'saude',       label: 'Saúde',       icon: <HeartPulse className="h-3.5 w-3.5" /> },
];

const PRIORITY_MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs', 'calves'];

interface ExerciseLite { id: string; name: string; muscle_group: MuscleGroup; }

interface AnamneseForm {
  // Bloco 1 — Dados básicos
  name: string; age: string; gender: string; weight_kg: string; height_cm: string;
  // Bloco 3 — Objetivos
  main_goal: string; aesthetic_goal: string; priority_muscle_1: string; priority_muscle_2: string;
  // Bloco 4 — Experiência real
  experience_level: string; training_years: string;
  has_periodization_exp: boolean; knows_rir: boolean;
  has_used_top_set: boolean; has_used_back_off: boolean; has_used_deload: boolean;
  // Bloco 5 — Disponibilidade
  weekly_frequency: string; session_duration_min: string; preferred_time: string;
  // Bloco 6 — Estrutura
  training_location: string; available_equipment: string[];
  // Bloco 7 — Recuperação
  sleep_hours: string; sleep_quality: string; stress_level: string; work_type: string;
  // Bloco 8 — Cardio
  cardio_frequency: string; cardio_types: string[];
  // Bloco 9 — Limitações
  limitations: string[]; limitation_description: string;
  // Bloco 10 — Preferências
  favorite_exercises: string[]; disliked_exercises: string[]; forbidden_exercises: string[];
  // misc
  meals_per_day: string;
}

// Módulo 0: NADA vem pré-preenchido — o atleta informa tudo ativamente
const EMPTY_FORM: AnamneseForm = {
  name: '', age: '', gender: '', weight_kg: '', height_cm: '',
  main_goal: '', aesthetic_goal: '', priority_muscle_1: '', priority_muscle_2: '',
  experience_level: '', training_years: '',
  has_periodization_exp: false, knows_rir: false,
  has_used_top_set: false, has_used_back_off: false, has_used_deload: false,
  weekly_frequency: '', session_duration_min: '', preferred_time: '',
  training_location: '', available_equipment: [],
  sleep_hours: '', sleep_quality: '', stress_level: '', work_type: '',
  cardio_frequency: '', cardio_types: [],
  limitations: [], limitation_description: '',
  favorite_exercises: [], disliked_exercises: [], forbidden_exercises: [],
  meals_per_day: '',
};

// Sincroniza o campo legado `goal` (enum) a partir do main_goal da anamnese
function mainGoalToLegacyGoal(mainGoal: string): string | undefined {
  const map: Record<string, string> = {
    fat_loss: 'weight_loss',
    hypertrophy: 'hypertrophy',
    recomposition: 'definition',
    performance: 'strength',
  };
  return map[mainGoal];
}

export default function PerfilPage() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [xp, setXp] = useState({ xp_total: 0, level: 1 });
  const [email, setEmail] = useState('');
  const [tab, setTab] = useState<TabKey>('basico');
  const [form, setForm] = useState<AnamneseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [hasBio, setHasBio] = useState(false);
  const [bioSummary, setBioSummary] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<{ phase?: string; recovery_score?: number; progression_potential?: number; recommended_complexity?: string; profile_completion_pct?: number } | null>(null);
  const [exercises, setExercises] = useState<ExerciseLite[]>([]);
  const [exSearch, setExSearch] = useState('');
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

      const [{ data: prof }, { data: xpData }, { data: bio }, { data: exList }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('user_xp').select('xp_total, level').eq('user_id', user.id).single(),
        supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, skeletal_muscle_mass_kg, basal_metabolic_rate_kcal, measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('exercises').select('id, name, muscle_group').order('name'),
      ]);

      if (prof) {
        const p = prof as Profile;
        setProfile(p);
        setShowInRanking((prof as any).show_in_ranking ?? true);
        setNotifTraining((prof as any).notif_training ?? true);
        setNotifChallenge((prof as any).notif_challenge ?? true);
        setNotifLevel((prof as any).notif_level ?? true);
        setForm({
          name: p.name ?? '',
          age: p.age?.toString() ?? '',
          gender: p.gender ?? '',
          weight_kg: p.weight_kg?.toString() ?? '',
          height_cm: p.height_cm?.toString() ?? '',
          main_goal: p.main_goal ?? '',
          aesthetic_goal: p.aesthetic_goal ?? '',
          priority_muscle_1: p.priority_muscle_1 ?? '',
          priority_muscle_2: p.priority_muscle_2 ?? '',
          experience_level: p.experience_level ?? '',
          training_years: p.training_years ?? '',
          has_periodization_exp: p.has_periodization_exp ?? false,
          knows_rir: p.knows_rir ?? false,
          has_used_top_set: p.has_used_top_set ?? false,
          has_used_back_off: p.has_used_back_off ?? false,
          has_used_deload: p.has_used_deload ?? false,
          weekly_frequency: p.weekly_frequency?.toString() ?? '',
          session_duration_min: p.session_duration_min?.toString() ?? '',
          preferred_time: p.preferred_time ?? '',
          training_location: p.training_location ?? '',
          available_equipment: (p.available_equipment as string[]) ?? [],
          sleep_hours: p.sleep_hours ?? '',
          sleep_quality: p.sleep_quality ?? '',
          stress_level: p.stress_level ?? '',
          work_type: p.work_type ?? '',
          cardio_frequency: p.cardio_frequency ?? '',
          cardio_types: (p.cardio_types as string[]) ?? [],
          limitations: (p.limitations as string[]) ?? [],
          limitation_description: p.limitation_description ?? '',
          favorite_exercises: (p.favorite_exercises as string[]) ?? [],
          disliked_exercises: (p.disliked_exercises as string[]) ?? [],
          forbidden_exercises: (p.forbidden_exercises as string[]) ?? [],
          meals_per_day: p.meals_per_day?.toString() ?? '',
        });
        setEvaluation({
          phase: p.edn_phase ?? undefined,
          progression_potential: p.progression_potential ?? undefined,
          recommended_complexity: p.recommended_complexity ?? undefined,
          profile_completion_pct: p.profile_completion_pct ?? undefined,
        });
      }
      if (xpData) setXp(xpData);
      if (bio) {
        setHasBio(true);
        const parts = [
          bio.weight_kg ? `${bio.weight_kg}kg` : null,
          bio.body_fat_pct ? `BF ${bio.body_fat_pct}%` : null,
          bio.skeletal_muscle_mass_kg ? `músculo ${bio.skeletal_muscle_mass_kg}kg` : null,
          bio.basal_metabolic_rate_kcal ? `TMB ${bio.basal_metabolic_rate_kcal}kcal` : null,
        ].filter(Boolean);
        setBioSummary(parts.join(' · '));
      }
      if (exList) setExercises(exList as ExerciseLite[]);
    }
    load();
  }, []);

  const completionPct = evaluation?.profile_completion_pct ?? profile?.profile_completion_pct ?? 0;
  const profileReady = completionPct >= 80;

  const set = (k: keyof AnamneseForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setInput = (k: keyof AnamneseForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleBool = (k: keyof AnamneseForm) => setForm((f) => ({ ...f, [k]: !f[k] }));
  const toggleInList = (k: 'available_equipment' | 'cardio_types' | 'limitations' | 'favorite_exercises' | 'disliked_exercises' | 'forbidden_exercises', value: string) =>
    setForm((f) => {
      const list = f[k] as string[];
      return { ...f, [k]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] };
    });

  async function saveProfile() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    if (form.priority_muscle_1 && form.priority_muscle_1 === form.priority_muscle_2) {
      toast.error('As duas prioridades musculares devem ser diferentes');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      name: form.name,
      age: form.age ? parseInt(form.age) : null,
      gender: (form.gender as GenderType) || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      main_goal: form.main_goal || null,
      goal: form.main_goal ? mainGoalToLegacyGoal(form.main_goal) : undefined,
      aesthetic_goal: form.aesthetic_goal || null,
      priority_muscle_1: form.priority_muscle_1 || null,
      priority_muscle_2: form.priority_muscle_2 || null,
      experience_level: form.experience_level || null,
      training_years: form.training_years || null,
      has_periodization_exp: form.has_periodization_exp,
      knows_rir: form.knows_rir,
      has_used_top_set: form.has_used_top_set,
      has_used_back_off: form.has_used_back_off,
      has_used_deload: form.has_used_deload,
      weekly_frequency: form.weekly_frequency ? parseInt(form.weekly_frequency) : null,
      session_duration_min: form.session_duration_min ? parseInt(form.session_duration_min) : null,
      preferred_time: form.preferred_time || null,
      training_location: form.training_location || null,
      available_equipment: form.available_equipment,
      sleep_hours: form.sleep_hours || null,
      sleep_quality: form.sleep_quality || null,
      stress_level: form.stress_level || null,
      work_type: form.work_type || null,
      cardio_frequency: form.cardio_frequency || null,
      cardio_types: form.cardio_types,
      limitations: form.limitations,
      limitation_description: form.limitation_description || null,
      favorite_exercises: form.favorite_exercises,
      disliked_exercises: form.disliked_exercises,
      forbidden_exercises: form.forbidden_exercises,
      meals_per_day: form.meals_per_day ? parseInt(form.meals_per_day) : null,
    });

    if (error) { toast.error('Erro ao salvar perfil'); setSaving(false); return; }

    // Bloco 11 — Avaliação automática EDN
    const { data: evalData, error: evalErr } = await supabase.rpc('evaluate_athlete', { p_user_id: user.id });
    if (!evalErr && evalData) {
      setEvaluation(evalData as any);
      const pct = (evalData as any).profile_completion_pct ?? 0;
      if (pct >= 80) toast.success(`Perfil salvo! Anamnese ${pct}% completa — Coach EDN liberado para prescrição personalizada.`);
      else toast.success(`Perfil salvo! Anamnese ${pct}% completa — complete 80% para liberar treinos altamente personalizados.`);
    } else {
      toast.success('Perfil salvo!');
    }
    setSaving(false);
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setDeleting(false); return; }
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

  const aestheticLabels = form.gender === 'female' ? AESTHETIC_GOAL_LABELS_FEMALE : AESTHETIC_GOAL_LABELS_MALE;

  const filteredExercises = useMemo(() => {
    const q = exSearch.trim().toLowerCase();
    if (!q) return [];
    return exercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
  }, [exSearch, exercises]);

  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? '—';

  const inputCls = 'flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600';
  const chipCls = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'}`;

  function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: Record<string, string>; placeholder?: string }) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
            <SelectValue placeholder={placeholder ?? 'Selecionar…'} />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {Object.entries(options).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-zinc-100">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  function BoolToggle({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle} className={chipCls(value)}>
        {value ? '✓ ' : ''}{label}
      </button>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100">Perfil</h1>

      {/* Avatar + XP */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-zinc-700 text-zinc-200 text-xl font-bold">
              {getInitials(form.name || 'Atleta')}
            </AvatarFallback>
          </Avatar>
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

      {/* Módulo 0 — Indicador de Perfil Completo */}
      <div className={`rounded-xl border p-5 ${profileReady ? 'border-emerald-700/40 bg-emerald-950/20' : 'border-amber-700/40 bg-amber-950/20'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {profileReady
              ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              : <AlertCircle className="h-4 w-4 text-amber-400" />}
            <p className="text-sm font-semibold text-zinc-100">Perfil Completo: {completionPct}%</p>
          </div>
          <span className={`text-[11px] font-medium ${profileReady ? 'text-emerald-400' : 'text-amber-400'}`}>
            {profileReady ? 'Anamnese liberada para o Coach EDN' : 'Mínimo 80% para treinos personalizados'}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${profileReady ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${completionPct}%` }} />
        </div>
        {evaluation?.phase && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge className="bg-blue-600/15 text-blue-400 border-blue-600/30">
              <Activity className="h-3 w-3 mr-1" /> Fase: {EDN_PHASE_LABELS[evaluation.phase as keyof typeof EDN_PHASE_LABELS] ?? evaluation.phase}
            </Badge>
            {typeof evaluation.recovery_score === 'number' && (
              <Badge className="bg-purple-600/15 text-purple-400 border-purple-600/30">Recovery {evaluation.recovery_score}/100</Badge>
            )}
            {typeof evaluation.progression_potential === 'number' && (
              <Badge className="bg-emerald-600/15 text-emerald-400 border-emerald-600/30">Potencial {evaluation.progression_potential}/100</Badge>
            )}
            {evaluation.recommended_complexity && (
              <Badge className="bg-zinc-600/15 text-zinc-300 border-zinc-600/30">
                Complexidade: {COMPLEXITY_LABELS[evaluation.recommended_complexity as keyof typeof COMPLEXITY_LABELS] ?? evaluation.recommended_complexity}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Wizard — Anamnese Esportiva */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Aba 1: Básico (Blocos 1 + 2) ── */}
        {tab === 'basico' && (
          <div className="space-y-5">
            <h2 className="font-semibold text-zinc-100">Dados Básicos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nome</Label>
                <input value={form.name} onChange={setInput('name')} placeholder="Seu nome" className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label>Idade</Label>
                <input type="number" value={form.age} onChange={setInput('age')} placeholder="25" min={1} className={inputCls} />
              </div>
              <SelectField label="Sexo" value={form.gender} onChange={set('gender')} options={{ male: 'Masculino', female: 'Feminino', other: 'Outro' }} />
              <div className="space-y-1.5">
                <Label>Peso (kg)</Label>
                <input type="number" value={form.weight_kg} onChange={setInput('weight_kg')} placeholder="75" min={1} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label>Altura (cm)</Label>
                <input type="number" value={form.height_cm} onChange={setInput('height_cm')} placeholder="175" min={1} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label>Refeições/dia</Label>
                <input type="number" value={form.meals_per_day} onChange={setInput('meals_per_day')} placeholder="3" min={1} className={inputCls} />
              </div>
            </div>

            {/* Bloco 2 — Composição corporal */}
            <div className={`rounded-lg border p-4 ${hasBio ? 'border-emerald-700/40 bg-emerald-950/15' : 'border-zinc-700 bg-zinc-800/50'}`}>
              <p className="text-sm font-semibold text-zinc-100 mb-1">Composição Corporal</p>
              {hasBio ? (
                <>
                  <p className="text-xs text-emerald-400">✓ Bioimpedância encontrada — dados usados automaticamente pelo Coach EDN</p>
                  {bioSummary && <p className="text-xs text-zinc-400 mt-1">{bioSummary}</p>}
                </>
              ) : (
                <p className="text-xs text-amber-400">Composição Corporal Parcial — sem bioimpedância. Importe uma na aba Evolução ou mantenha o peso atualizado.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Aba 2: Objetivos (Bloco 3) ── */}
        {tab === 'objetivos' && (
          <div className="space-y-5">
            <h2 className="font-semibold text-zinc-100">Objetivos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Objetivo Principal" value={form.main_goal} onChange={set('main_goal')} options={MAIN_GOAL_LABELS as Record<string, string>} />
              <SelectField label="Objetivo Estético" value={form.aesthetic_goal} onChange={set('aesthetic_goal')} options={aestheticLabels as Record<string, string>} placeholder={form.gender ? 'Selecionar…' : 'Informe o sexo primeiro'} />
            </div>
            <div>
              <Label className="mb-2 block">Prioridades Musculares (até 2 — recebem mais frequência e volume)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField label="Prioridade 1" value={form.priority_muscle_1} onChange={set('priority_muscle_1')} options={Object.fromEntries(PRIORITY_MUSCLES.map((m) => [m, MUSCLE_GROUP_LABELS[m]]))} />
                <SelectField label="Prioridade 2" value={form.priority_muscle_2} onChange={set('priority_muscle_2')} options={Object.fromEntries(PRIORITY_MUSCLES.filter((m) => m !== form.priority_muscle_1).map((m) => [m, MUSCLE_GROUP_LABELS[m]]))} />
              </div>
            </div>
          </div>
        )}

        {/* ── Aba 3: Experiência (Bloco 4) ── */}
        {tab === 'experiencia' && (
          <div className="space-y-5">
            <h2 className="font-semibold text-zinc-100">Experiência Real</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Nível" value={form.experience_level} onChange={set('experience_level')} options={EXPERIENCE_LABELS as Record<string, string>} />
              <SelectField label="Tempo de treino" value={form.training_years} onChange={set('training_years')} options={TRAINING_YEARS_LABELS as Record<string, string>} />
            </div>
            <div className="space-y-2">
              <Label>Conhecimento técnico</Label>
              <div className="flex flex-wrap gap-2">
                <BoolToggle label="Já treinou com periodização" value={form.has_periodization_exp} onToggle={() => toggleBool('has_periodization_exp')} />
                <BoolToggle label="Conhece RIR" value={form.knows_rir} onToggle={() => toggleBool('knows_rir')} />
                <BoolToggle label="Já usou Top Set" value={form.has_used_top_set} onToggle={() => toggleBool('has_used_top_set')} />
                <BoolToggle label="Já usou Back Off" value={form.has_used_back_off} onToggle={() => toggleBool('has_used_back_off')} />
                <BoolToggle label="Já usou Deload" value={form.has_used_deload} onToggle={() => toggleBool('has_used_deload')} />
              </div>
            </div>
          </div>
        )}

        {/* ── Aba 4: Rotina (Blocos 5 + 6 + 8) ── */}
        {tab === 'rotina' && (
          <div className="space-y-5">
            <h2 className="font-semibold text-zinc-100">Disponibilidade</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectField label="Treinos/semana" value={form.weekly_frequency} onChange={set('weekly_frequency')} options={{ '2': '2', '3': '3', '4': '4', '5': '5', '6': '6' }} />
              <SelectField label="Tempo por sessão" value={form.session_duration_min} onChange={set('session_duration_min')} options={{ '30': '30 min', '45': '45 min', '60': '60 min', '75': '75 min', '90': '90 min' }} />
              <SelectField label="Horário habitual" value={form.preferred_time} onChange={set('preferred_time')} options={PREFERRED_TIME_LABELS as Record<string, string>} />
            </div>

            <h2 className="font-semibold text-zinc-100 pt-2">Estrutura Disponível</h2>
            <SelectField label="Onde treina?" value={form.training_location} onChange={set('training_location')} options={TRAINING_LOCATION_LABELS as Record<string, string>} />
            <div className="space-y-2">
              <Label>Equipamentos disponíveis</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(EQUIPMENT_LABELS).map(([k, v]) => (
                  <button key={k} onClick={() => toggleInList('available_equipment', k)} className={chipCls(form.available_equipment.includes(k))}>{v}</button>
                ))}
              </div>
            </div>

            <h2 className="font-semibold text-zinc-100 pt-2">Cardio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Frequência atual" value={form.cardio_frequency} onChange={set('cardio_frequency')} options={CARDIO_FREQUENCY_LABELS as Record<string, string>} />
              <div className="space-y-2">
                <Label>Tipos</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(CARDIO_TYPE_LABELS).map(([k, v]) => (
                    <button key={k} onClick={() => toggleInList('cardio_types', k)} className={chipCls(form.cardio_types.includes(k))}>{v}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Aba 5: Saúde (Blocos 7 + 9 + 10) ── */}
        {tab === 'saude' && (
          <div className="space-y-5">
            <h2 className="font-semibold text-zinc-100">Recuperação</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Horas de sono" value={form.sleep_hours} onChange={set('sleep_hours')} options={SLEEP_HOURS_LABELS as Record<string, string>} />
              <SelectField label="Qualidade do sono" value={form.sleep_quality} onChange={set('sleep_quality')} options={SLEEP_QUALITY_LABELS as Record<string, string>} />
              <SelectField label="Nível de estresse" value={form.stress_level} onChange={set('stress_level')} options={STRESS_LEVEL_LABELS as Record<string, string>} />
              <SelectField label="Tipo de trabalho" value={form.work_type} onChange={set('work_type')} options={WORK_TYPE_LABELS as Record<string, string>} />
            </div>

            <h2 className="font-semibold text-zinc-100 pt-2">Limitações</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LIMITATION_LABELS).map(([k, v]) => (
                <button key={k} onClick={() => toggleInList('limitations', k)} className={chipCls(form.limitations.includes(k))}>{v}</button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Descreva sua limitação (opcional)</Label>
              <textarea
                value={form.limitation_description}
                onChange={(e) => setForm((f) => ({ ...f, limitation_description: e.target.value }))}
                placeholder="Ex: dor no ombro direito ao elevar acima de 90°"
                rows={2}
                className="flex w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
              />
            </div>

            <h2 className="font-semibold text-zinc-100 pt-2">Preferências de Exercícios</h2>
            <div className="space-y-1.5">
              <Label>Buscar exercício na biblioteca</Label>
              <input value={exSearch} onChange={(e) => setExSearch(e.target.value)} placeholder="Ex: barra fixa, supino…" className={inputCls} />
              {filteredExercises.length > 0 && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800 divide-y divide-zinc-700/60 overflow-hidden">
                  {filteredExercises.map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between px-3 py-2 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{ex.name}</p>
                        <p className="text-[10px] text-zinc-500">{MUSCLE_GROUP_LABELS[ex.muscle_group]}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button title="Favorito" onClick={() => toggleInList('favorite_exercises', ex.id)} className={`px-2 py-1 rounded text-[10px] font-semibold border ${form.favorite_exercises.includes(ex.id) ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' : 'bg-zinc-900 text-zinc-500 border-zinc-700'}`}>♥</button>
                        <button title="Não gosto" onClick={() => toggleInList('disliked_exercises', ex.id)} className={`px-2 py-1 rounded text-[10px] font-semibold border ${form.disliked_exercises.includes(ex.id) ? 'bg-amber-600/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 text-zinc-500 border-zinc-700'}`}>✕</button>
                        <button title="Proibido (nunca sugerir)" onClick={() => toggleInList('forbidden_exercises', ex.id)} className={`px-2 py-1 rounded text-[10px] font-semibold border ${form.forbidden_exercises.includes(ex.id) ? 'bg-red-600/20 text-red-300 border-red-500/40' : 'bg-zinc-900 text-zinc-500 border-zinc-700'}`}>⛔</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {([['favorite_exercises', 'Favoritos', 'text-emerald-400'], ['disliked_exercises', 'Não gosta', 'text-amber-400'], ['forbidden_exercises', 'Proibidos — nunca sugeridos', 'text-red-400']] as const).map(([key, label, color]) => (
              (form[key] as string[]).length > 0 && (
                <div key={key} className="space-y-1.5">
                  <p className={`text-xs font-semibold ${color}`}>{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(form[key] as string[]).map((id) => (
                      <button key={id} onClick={() => toggleInList(key, id)} className="px-2.5 py-1 rounded-full text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-red-500/50">
                        {exName(id)} ✕
                      </button>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}

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
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hove