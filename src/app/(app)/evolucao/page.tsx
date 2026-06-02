'use client';

import { useEffect, useState } from 'react';
import { Scale, TrendingUp, BarChart2, Dumbbell, Plus, Activity, Droplets, Flame, Heart, Upload, Loader2, Sparkles, FileText, CheckCircle2, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Measurement {
  id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  arm_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  thigh_cm: number | null;
}

interface SessionVolume {
  started_at: string;
  total_volume_kg: number;
}

interface BioimpedanceData {
  id: string;
  measured_at: string;
  source: string | null;
  body_score: number | null;
  body_type: string | null;
  weight_kg: number | null;
  bmi: number | null;
  body_fat_pct: number | null;
  water_pct: number | null;
  basal_metabolic_rate_kcal: number | null;
  visceral_fat_level: number | null;
  bone_mass_kg: number | null;
  protein_pct: number | null;
  skeletal_muscle_mass_kg: number | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
}

interface WeeklyReport {
  period: string;
  sessions_count: number;
  total_volume_kg: number;
  total_cardio_km: number;
  summary: string;
  volume_assessment: string;
  muscle_groups_trained: string[];
  progression: { positive: string[]; to_improve: string[]; };
  suggestions: Array<{ category: string; title: string; description: string; priority: string; }>;
  next_week_focus: string;
  edn_tip: string;
}

const EMPTY_BIO: Omit<BioimpedanceData, 'id' | 'measured_at'> = {
  source: 'Zepp Life',
  body_score: null, body_type: '',
  weight_kg: null, bmi: null, body_fat_pct: null, water_pct: null,
  basal_metabolic_rate_kcal: null, visceral_fat_level: null,
  bone_mass_kg: null, protein_pct: null, skeletal_muscle_mass_kg: null,
  lean_mass_kg: null, fat_mass_kg: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusBadge(value: number | null, thresholds: { ok: number; warn: number }, labels: [string, string, string], invert = false) {
  if (value === null) return null;
  const idx = invert
    ? (value <= thresholds.ok ? 0 : value <= thresholds.warn ? 1 : 2)
    : (value <= thresholds.ok ? 0 : value <= thresholds.warn ? 1 : 2);
  const colors = ['text-green-400 bg-green-400/10', 'text-yellow-400 bg-yellow-400/10', 'text-red-400 bg-red-400/10'];
  return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', colors[idx])}>{labels[idx]}</span>;
}

function NumInput({ label, field, placeholder, form, setForm, step = '0.1' }: {
  label: string; field: string; placeholder: string;
  form: Record<string, string>; setForm: (fn: (f: Record<string, string>) => Record<string, string>) => void; step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-400">{label}</Label>
      <input
        type="number" step={step} placeholder={placeholder}
        value={form[field] ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EvolucaoPage() {
  const supabase = createClient();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [sessions, setSessions] = useState<SessionVolume[]>([]);
  const [bioList, setBioList] = useState<BioimpedanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('bioimpedancia');

  // dialogs
  const [showMeasDialog, setShowMeasDialog] = useState(false);
  const [showBioDialog, setShowBioDialog] = useState(false);

  // image extraction
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // forms
  const [measForm, setMeasForm] = useState({ weight_kg: '', body_fat_pct: '', arm_cm: '', chest_cm: '', waist_cm: '', thigh_cm: '' });
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null);

  const [bioForm, setBioForm] = useState<Record<string, string>>({
    source: 'Zepp Life', body_score: '', body_type: '',
    weight_kg: '', bmi: '', body_fat_pct: '', water_pct: '',
    basal_metabolic_rate_kcal: '', visceral_fat_level: '',
    bone_mass_kg: '', protein_pct: '', skeletal_muscle_mass_kg: '',
    lean_mass_kg: '', fat_mass_kg: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: meas }, { data: sess }, { data: bio }] = await Promise.all([
      supabase.from('body_measurements').select('*').eq('user_id', user.id).order('date', { ascending: true }).limit(90),
      supabase.from('profiles').select('goal').eq('id', user.id).single(),
      supabase.from('workout_sessions').select('started_at, total_volume_kg').eq('user_id', user.id).order('started_at', { ascending: true }).limit(90),
      supabase.from('bioimpedance_data').select('*').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(20),
    ]);
    setMeasurements(meas ?? []);
    setSessions(sess ?? []);
    setBioList(bio ?? []);
    setLoading(false);
  }

  async function saveMeasurement() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload: Record<string, number | string | null> = { user_id: user.id };
    if (measForm.weight_kg) payload.weight_kg = parseFloat(measForm.weight_kg);
    if (measForm.body_fat_pct) payload.body_fat_pct = parseFloat(measForm.body_fat_pct);
    if (measForm.arm_cm) payload.arm_cm = parseFloat(measForm.arm_cm);
    if (measForm.chest_cm) payload.chest_cm = parseFloat(measForm.chest_cm);
    if (measForm.waist_cm) payload.waist_cm = parseFloat(measForm.waist_cm);
    if (measForm.thigh_cm) payload.thigh_cm = parseFloat(measForm.thigh_cm);
    const { error } = await supabase.from('body_measurements').insert(payload);
    if (error) { toast.error('Erro ao salvar medidas'); return; }
    toast.success('Medidas registradas!');
    setShowMeasDialog(false);
    setMeasForm({ weight_kg: '', body_fat_pct: '', arm_cm: '', chest_cm: '', waist_cm: '', thigh_cm: '' });
    load();
  }

  async function handleFileUpload(file: File) {
    setIsExtracting(true);
    setExtractError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/extract-bioimpedance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      });
      if (!res.ok) throw new Error('Falha na extração');
      const { data } = await res.json();
      const s = (v: unknown) => (v != null ? String(v) : '');
      setBioForm((f) => ({
        ...f,
        ...(data.source ? { source: data.source } : {}),
        ...(data.body_score != null ? { body_score: s(data.body_score) } : {}),
        ...(data.body_type ? { body_type: data.body_type } : {}),
        ...(data.weight_kg != null ? { weight_kg: s(data.weight_kg) } : {}),
        ...(data.bmi != null ? { bmi: s(data.bmi) } : {}),
        ...(data.body_fat_pct != null ? { body_fat_pct: s(data.body_fat_pct) } : {}),
        ...(data.water_pct != null ? { water_pct: s(data.water_pct) } : {}),
        ...(data.basal_metabolic_rate_kcal != null ? { basal_metabolic_rate_kcal: s(data.basal_metabolic_rate_kcal) } : {}),
        ...(data.visceral_fat_level != null ? { visceral_fat_level: s(data.visceral_fat_level) } : {}),
        ...(data.bone_mass_kg != null ? { bone_mass_kg: s(data.bone_mass_kg) } : {}),
        ...(data.protein_pct != null ? { protein_pct: s(data.protein_pct) } : {}),
        ...(data.skeletal_muscle_mass_kg != null ? { skeletal_muscle_mass_kg: s(data.skeletal_muscle_mass_kg) } : {}),
        ...(data.lean_mass_kg != null ? { lean_mass_kg: s(data.lean_mass_kg) } : {}),
        ...(data.fat_mass_kg != null ? { fat_mass_kg: s(data.fat_mass_kg) } : {}),
      }));
      toast.success('Dados extraídos! Revise e salve.');
    } catch {
      setExtractError('Não foi possível extrair os dados. Preencha manualmente.');
    } finally {
      setIsExtracting(false);
    }
  }

  async function saveBioimpedance() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const num = (k: string) => bioForm[k] ? parseFloat(bioForm[k]) : null;
    const payload: Record<string, unknown> = {
      user_id: user.id,
      source: bioForm.source || 'Zepp Life',
      body_score: num('body_score'),
      body_type: bioForm.body_type || null,
      weight_kg: num('weight_kg'),
      bmi: num('bmi'),
      body_fat_pct: num('body_fat_pct'),
      water_pct: num('water_pct'),
      basal_metabolic_rate_kcal: num('basal_metabolic_rate_kcal') ? Math.round(num('basal_metabolic_rate_kcal')!) : null,
      visceral_fat_level: num('visceral_fat_level') ? Math.round(num('visceral_fat_level')!) : null,
      bone_mass_kg: num('bone_mass_kg'),
      protein_pct: num('protein_pct'),
      skeletal_muscle_mass_kg: num('skeletal_muscle_mass_kg'),
      lean_mass_kg: num('lean_mass_kg'),
      fat_mass_kg: num('fat_mass_kg'),
    };
    const { error } = await supabase.from('bioimpedance_data').insert(payload);
    if (error) { toast.error('Erro ao salvar bioimpedância: ' + error.message); return; }
    toast.success('Bioimpedância registrada! Recalculando macros nutricionais…');
    setShowBioDialog(false);
    // Disparar recálculo automático de nutrição em background
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      const activePlan = await supabase
        .from('workout_plans')
        .select('id')
        .eq('user_id', u.id)
        .eq('is_active', true)
        .maybeSingle();
      if (activePlan.data?.id) {
        fetch('/api/generate-nutrition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: activePlan.data.id, auto_trigger: true }),
        }).catch(() => {}); // silencioso — não bloqueia a UI
      }
    }
    setBioForm({ source: 'Zepp Life', body_score: '', body_type: '', weight_kg: '', bmi: '', body_fat_pct: '', water_pct: '', basal_metabolic_rate_kcal: '', visceral_fat_level: '', bone_mass_kg: '', protein_pct: '', skeletal_muscle_mass_kg: '', lean_mass_kg: '', fat_mass_kg: '' });
    load();
  }

  // ── Derived data ────────────────────────────────────────────
  const weightData = measurements.filter((m) => m.weight_kg).map((m) => ({ date: format(parseISO(m.date), 'dd/MM', { locale: ptBR }), peso: m.weight_kg }));
  const volumeData = sessions.slice(-20).map((s) => ({ date: format(parseISO(s.started_at), 'dd/MM', { locale: ptBR }), volume: Math.round(s.total_volume_kg) }));
  const latest = measurements[measurements.length - 1];
  const prev = measurements[measurements.length - 2];
  const weightDelta = latest?.weight_kg && prev?.weight_kg ? latest.weight_kg - prev.weight_kg : null;
  const totalVolume = sessions.reduce((s, sess) => s + (sess.total_volume_kg ?? 0), 0);
  const latestBio = bioList[0] ?? null;

  async function generateReport() {
    setReportLoading(true);
    try {
      const res = await fetch('/api/generate-weekly-report', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar relatorio');
      setReport(data.report);
      setReportGeneratedAt(data.generated_at);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setReportLoading(false);
    }
  }

  const bioChartData = [...bioList].reverse().map((b) => ({
    date: format(parseISO(b.measured_at), 'dd/MM', { locale: ptBR }),
    gordura: b.body_fat_pct,
    musculo: b.skeletal_muscle_mass_kg,
    peso: b.weight_kg,
  }));

  // Calcular meta de gordura corporal baseada no objetivo
  const latestBioForGoal = bioList[0];
  const gorduraMeta = latestBioForGoal?.body_fat_pct
    ? (profile?.goal === 'weight_loss' || profile?.goal === 'cutting' ? Math.max(latestBioForGoal.body_fat_pct - 5, 8)
      : profile?.goal === 'hypertrophy' ? latestBioForGoal.body_fat_pct - 2
      : latestBioForGoal.body_fat_pct - 3)
    : null;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Evolução</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Progresso físico, composição corporal e treino</p>
        </div>
        <Button size="sm" onClick={() => activeTab === 'bioimpedancia' ? setShowBioDialog(true) : setShowMeasDialog(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Registrar
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Peso', value: latestBio?.weight_kg ? `${latestBio.weight_kg}kg` : latest?.weight_kg ? `${latest.weight_kg}kg` : '—', delta: weightDelta, icon: <Scale className="h-4 w-4" />, color: 'text-blue-400' },
          { label: 'Gordura', value: latestBio?.body_fat_pct ? `${latestBio.body_fat_pct}%` : latest?.body_fat_pct ? `${latest.body_fat_pct}%` : '—', icon: <TrendingUp className="h-4 w-4" />, color: 'text-orange-400' },
          { label: 'Músculo', value: latestBio?.skeletal_muscle_mass_kg ? `${latestBio.skeletal_muscle_mass_kg}kg` : '—', icon: <Dumbbell className="h-4 w-4" />, color: 'text-green-400' },
          { label: 'Sessões', value: sessions.length, icon: <BarChart2 className="h-4 w-4" />, color: 'text-purple-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className={cn('mb-2', stat.color)}>{stat.icon}</div>
            <p className="text-xl font-bold text-zinc-100">{stat.value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{stat.label}</p>
            {stat.delta !== undefined && stat.delta !== null && (
              <p className={cn('text-xs mt-1 font-medium', stat.delta > 0 ? 'text-red-400' : 'text-green-400')}>
                {stat.delta > 0 ? '+' : ''}{stat.delta.toFixed(1)}kg
              </p>
            )}
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="bioimpedancia">Bioimpedância</TabsTrigger>
          <TabsTrigger value="peso">Peso</TabsTrigger>
          <TabsTrigger value="volume">Volume</TabsTrigger>
          <TabsTrigger value="medidas">Medidas</TabsTrigger>
          <TabsTrigger value="relatorio" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Relatorio</TabsTrigger>
        </TabsList>

        {/* ── Bioimpedância tab ────────────────────────────── */}
        <TabsContent value="bioimpedancia" className="mt-4 space-y-4">
          {latestBio ? (
            <>
              {/* Latest measurement card */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs text-zinc-500">{latestBio.source ?? 'Bioimpedância'} · {format(parseISO(latestBio.measured_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                    {latestBio.body_type && <p className="text-sm text-zinc-400 mt-0.5">Tipo: <span className="text-zinc-200 font-medium">{latestBio.body_type}</span></p>}
                  </div>
                  {latestBio.body_score !== null && (
                    <div className="text-center">
                      <p className="text-3xl font-bold text-blue-400">{latestBio.body_score}</p>
                      <p className="text-[10px] text-zinc-500">Pontuação</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Peso', value: latestBio.weight_kg ? `${latestBio.weight_kg} kg` : null, icon: <Scale className="h-3.5 w-3.5" />, color: 'text-blue-400', badge: null },
                    { label: 'IMC', value: latestBio.bmi ? `${latestBio.bmi}` : null, icon: <Activity className="h-3.5 w-3.5" />, color: 'text-yellow-400', badge: latestBio.bmi !== null ? (() => { const b = latestBio.bmi!; return b < 25 ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">Meta atingida</span> : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">Meta: &lt; 25</span>; })() : null },
                    { label: 'Gordura Corporal', value: latestBio.body_fat_pct ? `${latestBio.body_fat_pct}%` : null, icon: <TrendingUp className="h-3.5 w-3.5" />, color: 'text-orange-400', badge: statusBadge(latestBio.body_fat_pct, { ok: 20, warn: 25 }, ['Normal', 'Alta', 'Muito alta']) },
                    { label: 'Músculo', value: latestBio.skeletal_muscle_mass_kg ? `${latestBio.skeletal_muscle_mass_kg} kg` : null, icon: <Dumbbell className="h-3.5 w-3.5" />, color: 'text-green-400', badge: null },
                    { label: 'Água Corporal', value: latestBio.water_pct ? `${latestBio.water_pct}%` : null, icon: <Droplets className="h-3.5 w-3.5" />, color: 'text-cyan-400', badge: statusBadge(latestBio.water_pct, { ok: 50, warn: 45 }, ['Normal', 'Baixa', 'Muito baixa'], true) },
                    { label: 'Metabolismo Basal', value: latestBio.basal_metabolic_rate_kcal ? `${latestBio.basal_metabolic_rate_kcal} kcal` : null, icon: <Flame className="h-3.5 w-3.5" />, color: 'text-red-400', badge: null },
                    { label: 'Gordura Visceral', value: latestBio.visceral_fat_level ? `Nível ${latestBio.visceral_fat_level}` : null, icon: <Heart className="h-3.5 w-3.5" />, color: 'text-pink-400', badge: statusBadge(latestBio.visceral_fat_level, { ok: 9, warn: 14 }, ['Normal', 'Alta', 'Muito alta']) },
                    { label: 'Massa Óssea', value: latestBio.bone_mass_kg ? `${latestBio.bone_mass_kg} kg` : null, icon: <Activity className="h-3.5 w-3.5" />, color: 'text-zinc-400', badge: null },
                    { label: 'Proteína corporal', value: latestBio.protein_pct ? `${latestBio.protein_pct}%` : null, icon: <Activity className="h-3.5 w-3.5" />, color: 'text-purple-400', badge: latestBio.protein_pct !== null ? (latestBio.protein_pct < 18 ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400">Aumentar proteína</span> : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">Normal</span>) : null },
                  ].filter((item) => item.value !== null).map((item) => (
                    <div key={item.label} className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
                      <div className={cn('flex items-center gap-1.5 mb-1', item.color)}>
                        {item.icon}
                        <span className="text-[11px] font-medium text-zinc-400">{item.label}</span>
                      </div>
                      <p className="text-base font-semibold text-zinc-100">{item.value}</p>
                      {item.badge && <div className="mt-1">{item.badge}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* History */}
              {bioList.length > 1 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-300">Histórico</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          {['Data', 'Peso', 'Gordura%', 'Músculo', 'Água%', 'Visceral', 'Pont.'].map((h) => (
                            <th key={h} className="text-left px-3 py-2.5 text-zinc-500 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bioList.map((b) => (
                          <tr key={b.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                            <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{format(parseISO(b.measured_at), 'dd/MM/yy')}</td>
                            <td className="px-3 py-2.5 text-zinc-100">{b.weight_kg ? `${b.weight_kg}kg` : '—'}</td>
                            <td className="px-3 py-2.5 text-orange-400">{b.body_fat_pct ? `${b.body_fat_pct}%` : '—'}</td>
                            <td className="px-3 py-2.5 text-green-400">{b.skeletal_muscle_mass_kg ? `${b.skeletal_muscle_mass_kg}kg` : '—'}</td>
                            <td className="px-3 py-2.5 text-cyan-400">{b.water_pct ? `${b.water_pct}%` : '—'}</td>
                            <td className="px-3 py-2.5 text-pink-400">{b.visceral_fat_level ?? '—'}</td>
                            <td className="px-3 py-2.5 text-blue-400 font-semibold">{b.body_score ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Evolution charts */}
              {bioChartData.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-6">
                  <h3 className="text-sm font-semibold text-zinc-300">Evolução</h3>
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Gordura (%) e Músculo (kg)</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={bioChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11 }} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', fontSize: 12 }} />
                        <Line type="monotone" dataKey="gordura" name="Gordura%" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} connectNulls />
                        <Line type="monotone" dataKey="musculo" name="Músculo kg" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} connectNulls />
                        {gorduraMeta !== null && (
                          <ReferenceLine y={gorduraMeta} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: `Meta ${gorduraMeta?.toFixed(1)}%`, fill: '#f97316', fontSize: 10, position: 'insideTopRight' }} />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Peso (kg)</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={bioChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11 }} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', fontSize: 12 }} />
                        <Line type="monotone" dataKey="peso" name="Peso kg" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
              <Activity className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-300 mb-1">Nenhuma bioimpedância registrada</p>
              <p className="text-xs text-zinc-500 mb-4">Registre os dados do Zepp Life, InBody ou qualquer balança de bioimpedância</p>
              <Button size="sm" onClick={() => setShowBioDialog(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Registrar agora
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Peso tab */}
        <TabsContent value="peso" className="mt-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="font-semibold text-zinc-100 mb-4">Evolução do Peso (kg)</h3>
            {weightData.length < 2 ? (
              <p className="text-sm text-zinc-500 py-8 text-center">Registre pelo menos 2 medições para ver o gráfico</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', fontSize: 12 }} />
                  <Line type="monotone" dataKey="peso" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </TabsContent>

        {/* Volume tab */}
        <TabsContent value="volume" className="mt-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="font-semibold text-zinc-100 mb-4">Volume por Sessão (kg)</h3>
            {volumeData.length === 0 ? (
              <p className="text-sm text-zinc-500 py-8 text-center">Nenhuma sessão registrada ainda</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', fontSize: 12 }} />
                  <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </TabsContent>

        {/* Medidas tab */}
        <TabsContent value="medidas" className="mt-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            {measurements.length === 0 ? (
              <p className="text-sm text-zinc-500 py-8 text-center">Nenhuma medida registrada ainda</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {['Data', 'Peso', 'BF%', 'Braço', 'Peito', 'Cintura', 'Coxa'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-zinc-500 font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...measurements].reverse().slice(0, 20).map((m) => (
                    <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 text-zinc-300">{format(parseISO(m.date), 'dd/MM/yy')}</td>
                      <td className="px-4 py-3 text-zinc-100">{m.weight_kg ? `${m.weight_kg}kg` : '—'}</td>
                      <td className="px-4 py-3 text-zinc-400">{m.body_fat_pct ? `${m.body_fat_pct}%` : '—'}</td>
                      <td className="px-4 py-3 text-zinc-400">{m.arm_cm ? `${m.arm_cm}cm` : '—'}</td>
                      <td className="px-4 py-3 text-zinc-400">{m.chest_cm ? `${m.chest_cm}cm` : '—'}</td>
                      <td className="px-4 py-3 text-zinc-400">{m.waist_cm ? `${m.waist_cm}cm` : '—'}</td>
                      <td className="px-4 py-3 text-zinc-400">{m.thigh_cm ? `${m.thigh_cm}cm` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
        {/* Relatorio Semanal tab */}
        <TabsContent value="relatorio" className="mt-4 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20">
                <Sparkles className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-zinc-100">Relatorio Semanal IA</p>
                <p className="text-xs text-zinc-500">Analise tecnica dos ultimos 7 dias com sugestoes EDN</p>
              </div>
            </div>
            <button
              onClick={generateReport}
              disabled={reportLoading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {reportLoading ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando relatorio...</>
              ) : (
                <><Sparkles className="h-4 w-4" /> {report ? 'Regenerar relatorio' : 'Gerar relatorio da semana'}</>
              )}
            </button>
            {reportGeneratedAt && (
              <p className="text-[10px] text-zinc-600 text-center mt-2">
                Gerado em {new Date(reportGeneratedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          {report && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Sessoes', value: report.sessions_count, icon: <Dumbbell className="h-4 w-4" />, color: 'text-blue-400' },
                  { label: 'Volume', value: report.total_volume_kg > 0 ? report.total_volume_kg + 'kg' : '—', icon: <BarChart2 className="h-4 w-4" />, color: 'text-green-400' },
                  { label: 'Cardio', value: report.total_cardio_km > 0 ? report.total_cardio_km + 'km' : '—', icon: <Activity className="h-4 w-4" />, color: 'text-orange-400' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-center">
                    <div className={cn('flex justify-center mb-1', s.color)}>{s.icon}</div>
                    <p className="text-lg font-bold text-zinc-100">{s.value}</p>
                    <p className="text-[10px] text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-blue-600/30 bg-blue-600/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
                  <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">{report.period}</p>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed">{report.summary}</p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Avaliacao de Volume</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{report.volume_assessment}</p>
                {report.muscle_groups_trained.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {report.muscle_groups_trained.map((mg: string) => (
                      <span key={mg} className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{mg}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Progressao</p>
                {report.progression.positive.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-zinc-300">{item}</p>
                  </div>
                ))}
                {report.progression.to_improve.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                    {report.progression.to_improve.map((item: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-zinc-300">{item}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Sugestoes de Evolucao</p>
                {(report.suggestions ?? []).map((s: any, i: number) => {
                  const ps = s.priority === 'alta' ? 'border-red-500/40 bg-red-500/5' : s.priority === 'media' ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-blue-500/40 bg-blue-500/5';
                  const pb = s.priority === 'alta' ? 'text-red-400 bg-red-500/10' : s.priority === 'media' ? 'text-yellow-400 bg-yellow-500/10' : 'text-blue-400 bg-blue-500/10';
                  return (
                    <div key={i} className={cn('rounded-xl border p-4', ps)}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', pb)}>{s.priority}</span>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{s.category}</span>
                      </div>
                      <p className="text-sm font-semibold text-zinc-100 mb-1">{s.title}</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">{s.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-green-600/30 bg-green-600/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRight className="h-4 w-4 text-green-400 shrink-0" />
                  <p className="text-xs font-semibold text-green-300 uppercase tracking-wide">Foco da Proxima Semana</p>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed">{report.next_week_focus}</p>
              </div>

              <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                  <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Dica EDN do Jayme</p>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed italic">"{report.edn_tip}"</p>
              </div>
            </>
          )}

          {!report && !reportLoading && (
            <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
              <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 mb-1">Nenhum relatorio gerado</p>
              <p className="text-xs text-zinc-600">O Jayme vai analisar todos os seus treinos, cardio e biometria da semana</p>
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* Dialog: Medidas Corporais */}
      <Dialog open={showMeasDialog} onOpenChange={setShowMeasDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader><DialogTitle>Registrar Medidas</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            {[
              { key: 'weight_kg', label: 'Peso (kg)', placeholder: '75.0' },
              { key: 'body_fat_pct', label: 'Gordura (%)', placeholder: '15' },
              { key: 'arm_cm', label: 'Braço (cm)', placeholder: '38' },
              { key: 'chest_cm', label: 'Peito (cm)', placeholder: '100' },
              { key: 'waist_cm', label: 'Cintura (cm)', placeholder: '80' },
              { key: 'thigh_cm', label: 'Coxa (cm)', placeholder: '58' },
            ].map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs text-zinc-400">{field.label}</Label>
                <input type="number" step="0.1" placeholder={field.placeholder}
                  value={measForm[field.key as keyof typeof measForm]}
                  onChange={(e) => setMeasForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
                />
              </div>
            ))}
          </div>
          <Button className="w-full mt-2" onClick={saveMeasurement}>Salvar</Button>
        </DialogContent>
      </Dialog>

      {/* Dialog: Bioimpedância */}
      <Dialog open={showBioDialog} onOpenChange={setShowBioDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Bioimpedância</DialogTitle>
            <p className="text-xs text-zinc-500 pt-1">Importe uma foto/PDF ou preencha manualmente</p>
          </DialogHeader>

          {/* Upload area */}
          <label className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 cursor-pointer transition-colors',
            isExtracting ? 'border-blue-600/50 bg-blue-950/20 cursor-wait' : 'border-zinc-700 hover:border-blue-600/60 hover:bg-zinc-800/40'
          )}>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={isExtracting}
              onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
            />
            {isExtracting ? (
              <>
                <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                <p className="text-xs text-blue-400 font-medium">Extraindo dados da imagem…</p>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-zinc-500" />
                <div className="text-center">
                  <p className="text-xs text-zinc-300 font-medium">Importar foto ou PDF</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Print do Zepp Life, InBody, etc. — campos preenchidos automaticamente</p>
                </div>
              </>
            )}
          </label>
          {extractError && <p className="text-xs text-red-400 -mt-1">{extractError}</p>}

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Dispositivo / App</Label>
            <input type="text" placeholder="Zepp Life, InBody 270..."
              value={bioForm.source}
              onChange={(e) => setBioForm((f) => ({ ...f, source: e.target.value }))}
              className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Pontuação Corporal" field="body_score" placeholder="47" form={bioForm} setForm={setBioForm} step="1" />
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Tipo de Corpo</Label>
              <input type="text" placeholder="Grosso-conjunto, Padrão..."
                value={bioForm.body_type}
                onChange={(e) => setBioForm((f) => ({ ...f, body_type: e.target.value }))}
                className="flex h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
              />
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-3">
            <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Composição Corporal</p>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Peso (kg)" field="weight_kg" placeholder="91.65" form={bioForm} setForm={setBioForm} />
              <NumInput label="IMC" field="bmi" placeholder="30.2" form={bioForm} setForm={setBioForm} />
              <NumInput label="Gordura Corporal (%)" field="body_fat_pct" placeholder="31.5" form={bioForm} setForm={setBioForm} />
              <NumInput label="Músculo (kg)" field="skeletal_muscle_mass_kg" placeholder="59.56" form={bioForm} setForm={setBioForm} />
              <NumInput label="Massa Magra (kg)" field="lean_mass_kg" placeholder="62.8" form={bioForm} setForm={setBioForm} />
              <NumInput label="Massa de Gordura (kg)" field="fat_mass_kg" placeholder="28.8" form={bioForm} setForm={setBioForm} />
              <NumInput label="Água Corporal (%)" field="water_pct" placeholder="48.8" form={bioForm} setForm={setBioForm} />
              <NumInput label="Proteína (%)" field="protein_pct" placeholder="16.0" form={bioForm} setForm={setBioForm} />
              <NumInput label="Massa Óssea (kg)" field="bone_mass_kg" placeholder="3.19" form={bioForm} setForm={setBioForm} />
              <NumInput label="Gordura Visceral (1-20)" field="visceral_fat_level" placeholder="12" form={bioForm} setForm={setBioForm} step="1" />
              <NumInput label="Metabolismo Basal (kcal)" field="basal_metabolic_rate_kcal" placeholder="1876" form={bioForm} setForm={setBioForm} step="1" />
            </div>
          </div>

          <Button className="w-full mt-2" onClick={saveBioimpedance}>Salvar Bioimpedância</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

