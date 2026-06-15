'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Utensils, Apple, Zap, Droplets, Clock, CheckCircle2, Sparkles,
  RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  AlertTriangle, Target, Scale, Activity, BarChart2, Plus, X,
  Flame, Info, ArrowRight, Award, Brain,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { createClient } from '@/lib/supabase/client';
import { useLatestMetrics } from '@/hooks/useLatestMetrics';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import AutopilotCard from '@/components/edn/autopilot-card';

// ── Types ─────────────────────────────────────────────────────────────────────
interface NutritionPlan {
  strategy: string; daily_calories: string;
  protein_g_per_kg: number; carbs_pct: number; fat_pct: number;
  pre_workout: string; post_workout: string; rest_day_strategy: string;
  meals?: Array<{ name: string; time: string; calories_pct: number; focus: string; example: string }>;
  key_tips: string[];
}

interface CoachAnalysis {
  status: 'otimo' | 'bom' | 'atencao' | 'critico';
  headline: string; summary: string;
  calorie_recommendation: { tdee: number; target: number; surplus_deficit: number; rationale: string };
  macro_targets: { protein_g: number; carbs_g: number; fat_g: number; protein_per_kg: number };
  carb_cycling: { heavy_training: number; light_training: number; rest_day: number; rationale: string };
  alerts: Array<{ type: 'warning' | 'info' | 'danger'; message: string }>;
  plateau_detected: boolean; plateau_reason: string | null;
  weight_projection: { in_30d: number; in_60d: number; in_90d: number };
  nutrient_timing: { pre_workout: string; post_workout: string; rest_day: string; before_bed: string };
  priority_action: string;
  edn_principle: string;
}

interface SmartMacros { tdee: number; target_calories: number; protein_g: number; carbs_g: number; fat_g: number; }

interface WeightLog { id: string; log_date: string; weight_kg: number; body_fat_pct: number | null; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function MacroRing({ pct, color, label, value }: { pct: number; color: string; label: string; value?: string }) {
  const r = 28; const circ = 2 * Math.PI * r; const dash = Math.min(pct / 100, 1) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#1C2933" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className={color} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-100">{pct}%</span>
      </div>
      <span className="text-[11px] text-zinc-400 font-medium">{label}</span>
      {value && <span className="text-[10px] text-zinc-600">{value}</span>}
    </div>
  );
}

const STATUS_CONFIG = {
  otimo: { color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', icon: <CheckCircle2 className="h-4 w-4" /> },
  bom: { color: 'text-[#D4853A]', bg: 'bg-[#D4853A]/10 border-[#D4853A]/60/20', icon: <Info className="h-4 w-4" /> },
  atencao: { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', icon: <AlertTriangle className="h-4 w-4" /> },
  critico: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', icon: <AlertTriangle className="h-4 w-4" /> },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function NutricaoPage() {
  const supabase = createClient();
  const { metrics: bodyMetrics, loading: metricsLoading, refetch: refetchMetrics } = useLatestMetrics();
  const [plan, setPlan] = useState<NutritionPlan | null>(() => {
    try { const s = typeof window !== 'undefined' ? localStorage.getItem('edn_nutrition_plan') : null; return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [activeGoal, setActiveGoal] = useState('');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [coachData, setCoachData] = useState<{ analysis: CoachAnalysis; smart_macros: SmartMacros; current_weight: number | null; target_weight: number | null; weight_trend: number | null; bio: any } | null>(() => {
    try { const s = typeof window !== 'undefined' ? localStorage.getItem('edn_coach_data') : null; return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [showMeals, setShowMeals] = useState(true);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightForm, setWeightForm] = useState({ weight_kg: '', body_fat_pct: '' });
  const [savingWeight, setSavingWeight] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [mealForm, setMealForm] = useState({ name: '', time: '', calories_pct: '', focus: '', example: '' });
  const [activeTab, setActiveTab] = useState('coach');
  const [profile, setProfile] = useState<{ weight_kg: number | null; height_cm: number | null; age: number | null; gender: string | null; weekly_frequency: number | null; goal: string | null } | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: planData }, { data: logs }, { data: profileData }] = await Promise.all([
      supabase.from('workout_plans').select('id, schedule_config, goal').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('body_weight_logs').select('*').eq('user_id', user.id).order('log_date', { ascending: false }).limit(30),
      supabase.from('profiles').select('weight_kg, height_cm, age, gender, weekly_frequency, goal').eq('id', user.id).single(),
    ]);
    if (profileData) setProfile(profileData as any);
    // DB tem prioridade; se DB não tiver plano, manter o que já está no state (localStorage)
    const dbPlan = (planData?.schedule_config as any)?.nutrition ?? null;
    if (dbPlan) {
      setPlan(dbPlan);
      try { localStorage.setItem('edn_nutrition_plan', JSON.stringify(dbPlan)); } catch {}
    }
    // Se dbPlan=null, manter plan do state (já carregado do localStorage no useState)
    setActiveGoal(planData?.goal ?? '');
    setActivePlanId(planData?.id ?? null);
    setWeightLogs((logs as WeightLog[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Auto-trigger: Coach IA sempre roda (dados em tempo real); Plano só se não houver nenhum
  const hasRunCoach = useRef(false);
  const hasRunPlan  = useRef(false);
  const planRef = useRef<NutritionPlan | null>(null);

  // Mantém planRef sincronizado com o state sem adicionar "plan" como dep do useEffect
  useEffect(() => { planRef.current = plan; }, [plan]);

  // coachDataRef para verificar no effect sem adicionar ao dep array
  const coachDataRef = useRef<typeof coachData>(coachData);
  useEffect(() => { coachDataRef.current = coachData; }, [coachData]);

  useEffect(() => {
    if (loading) return;
    if (activeTab === 'coach' && !hasRunCoach.current) {
      hasRunCoach.current = true;
      // Só re-analisa se não há cache válido (< 30 min)
      const cacheTs = (() => { try { return parseInt(localStorage.getItem('edn_coach_ts') ?? '0'); } catch { return 0; } })();
      const cacheAge = Date.now() - cacheTs;
      // Só re-analisa se não há dados — nunca re-analisa automaticamente por timer
      if (!coachDataRef.current) {
        runCoachAnalysis();
      }
    } else if (activeTab === 'plano' && !hasRunPlan.current) {
      hasRunPlan.current = true;
      if (!planRef.current) generateNutrition();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading]);

  async function generateNutrition() {
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-nutrition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: activePlanId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPlan(data.nutrition);
      try { localStorage.setItem('edn_nutrition_plan', JSON.stringify(data.nutrition)); } catch {}
      toast.success('Plano nutricional atualizado!');
    } catch (err: any) { toast.error(err.message); }
    finally { setGenerating(false); }
  }

  async function runCoachAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/nutrition-coach', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCoachData(data);
      try {
        localStorage.setItem('edn_coach_data', JSON.stringify(data));
        localStorage.setItem('edn_coach_ts', String(Date.now()));
      } catch {}
      toast.success('Análise do Nutricionista IA concluída!');
    } catch (err: any) { toast.error(err.message); }
    finally { setAnalyzing(false); }
  }

  async function logWeight() {
    if (!weightForm.weight_kg) return;
    setSavingWeight(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('body_weight_logs').upsert({
      user_id: user.id, log_date: format(new Date(), 'yyyy-MM-dd'),
      weight_kg: parseFloat(weightForm.weight_kg),
      body_fat_pct: weightForm.body_fat_pct ? parseFloat(weightForm.body_fat_pct) : null,
    }, { onConflict: 'user_id,log_date' });
    setSavingWeight(false);
    if (error) { toast.error('Erro ao registrar'); return; }
    toast.success('Peso registrado!');
    setWeightForm({ weight_kg: '', body_fat_pct: '' });
    setShowWeightModal(false);
    load();
  }

  async function persistMeals(newMeals: NonNullable<NutritionPlan['meals']>) {
    if (!activePlanId) { toast.error('Nenhum plano ativo'); return false; }
    const { data: row } = await supabase.from('workout_plans').select('schedule_config').eq('id', activePlanId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = ((row as any)?.schedule_config) ?? {};
    const nutrition = { ...(cfg.nutrition ?? plan ?? {}), meals: newMeals };
    const { error } = await supabase.from('workout_plans').update({ schedule_config: { ...cfg, nutrition } }).eq('id', activePlanId);
    if (error) { toast.error('Erro ao salvar refeição'); return false; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPlan(prev => ({ ...((prev ?? {}) as any), meals: newMeals }));
    return true;
  }
  async function addMeal() {
    const name = mealForm.name.trim();
    if (!name) { toast.error('Informe o nome da refeição'); return; }
    setSavingMeal(true);
    const meal = { name, time: mealForm.time.trim() || '—', calories_pct: parseInt(mealForm.calories_pct) || 0, focus: mealForm.focus.trim(), example: mealForm.example.trim() };
    const ok = await persistMeals([...(plan?.meals ?? []), meal]);
    setSavingMeal(false);
    if (ok) { toast.success('Refeição adicionada!'); setMealForm({ name: '', time: '', calories_pct: '', focus: '', example: '' }); setShowMealModal(false); }
  }
  async function deleteMeal(idx: number) {
    const ok = await persistMeals((plan?.meals ?? []).filter((_, i) => i !== idx));
    if (ok) toast.success('Refeição removida');
  }

  const goalColors: Record<string, string> = {
    weight_loss: 'from-orange-600 to-red-500', definition: 'from-[#D4853A] to-cyan-500',
    hypertrophy: 'from-green-600 to-emerald-500', strength: 'from-purple-600 to-violet-500',
  };
  const gradientClass = goalColors[activeGoal] ?? 'from-green-600 to-emerald-500';

  // Weight chart data
  const weightChartData = [...weightLogs].reverse().slice(-14).map(l => ({
    date: format(parseISO(l.log_date), 'dd/MM', { locale: ptBR }),
    peso: l.weight_kg,
    bf: l.body_fat_pct,
  }));

  const currentWeight = weightLogs[0]?.weight_kg ?? coachData?.current_weight ?? null;
  const analysis = coachData?.analysis;
  const smartMacros = coachData?.smart_macros;

  // Cálculo local do TDEE quando a análise IA ainda não foi executada
  // Priorizar TMB da bioimpedância (mais preciso que fórmula)
  const localTdee = (() => {
    // 1. TMB direto da bioimpedância × fator atividade
    if (bodyMetrics.basal_metabolic_rate_kcal) {
      const freq = profile?.weekly_frequency ?? 3;
      const factor = freq >= 5 ? 1.55 : freq >= 3 ? 1.375 : 1.2;
      return Math.round(bodyMetrics.basal_metabolic_rate_kcal * factor);
    }
    // 2. Fallback: Harris-Benedict com dados do perfil
    const w = bodyMetrics.weight_kg ?? currentWeight ?? profile?.weight_kg;
    const h = profile?.height_cm;
    const a = profile?.age;
    const g = profile?.gender;
    const freq = profile?.weekly_frequency ?? 3;
    if (!w || !h || !a) return null;
    const bmr = g === 'female' || g === 'feminino'
      ? 655 + 9.6 * w + 1.8 * h - 4.7 * a
      : 88.36 + 13.4 * w + 4.8 * h - 5.7 * a;
    const factor = freq >= 5 ? 1.55 : freq >= 3 ? 1.375 : 1.2;
    return Math.round(bmr * factor);
  })();
  const displayTdee = smartMacros?.tdee ?? localTdee;

  // Verificar se dados estão desatualizados (> 60 dias)
  const metricsStale = bodyMetrics.is_stale;
  const hasBodyMetrics = !!bodyMetrics.weight_kg;
  const metricsDate = bodyMetrics.measured_at
    ? format(parseISO(bodyMetrics.measured_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })
    : null;

  return (
    <div className="space-y-5 animate-in fade-in-0 duration-300 pb-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Nutrição</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Nutricionista IA da Escola dos Naturais</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowWeightModal(true)} className="gap-1.5">
            <Scale className="h-3.5 w-3.5" /> Peso
          </Button>
        </div>
      </div>

      <AutopilotCard mode="nutrition" />

      {/* ── Macro hero card ──────────────────────────────────────── */}
      {/* Banner de fonte de dados corporais */}
      {hasBodyMetrics && !metricsStale && (
        <div className="rounded-xl border border-[#D4853A]/20 bg-[#D4853A]/5 p-3 flex items-start gap-3">
          <span className="shrink-0 mt-0.5 text-base">📊</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#E09B5A]">Dados corporais obtidos automaticamente</p>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              {bodyMetrics.source === 'bioimpedance' ? 'Última bioimpedância' : 'Última medição'}:{' '}
              <span className="text-zinc-200">{metricsDate}</span>
              {bodyMetrics.weight_kg ? <> · Peso <span className="text-zinc-200">{bodyMetrics.weight_kg}kg</span></> : null}
              {bodyMetrics.body_fat_pct ? <> · Gordura <span className="text-zinc-200">{bodyMetrics.body_fat_pct}%</span></> : null}
              {bodyMetrics.basal_metabolic_rate_kcal ? <> · TMB <span className="text-zinc-200">{bodyMetrics.basal_metabolic_rate_kcal}kcal</span></> : null}
            </p>
          </div>
          <a href="/app/evolucao" className="shrink-0 text-[10px] text-[#D4853A] hover:text-[#E09B5A] underline whitespace-nowrap mt-0.5">Atualizar</a>
        </div>
      )}
      {metricsStale && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-center gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-yellow-300">Avaliação corporal desatualizada</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Última medição há {bodyMetrics.days_since_measurement} dias. Recomendamos atualizar para macros precisos.</p>
          </div>
          <a href="/app/evolucao" className="shrink-0 text-xs font-semibold text-yellow-400 border border-yellow-500/30 rounded-lg px-2.5 py-1.5">Atualizar</a>
        </div>
      )}
      {!hasBodyMetrics && !metricsLoading && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 flex items-center gap-3">
          <span className="text-lg shrink-0">📏</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-zinc-300">Sem avaliação corporal registrada</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Registre sua bioimpedância em Evolução para personalizar seus macros automaticamente.</p>
          </div>
          <a href="/app/evolucao" className="shrink-0 text-xs font-semibold text-[#D4853A] border border-[#D4853A]/30 rounded-lg px-2.5 py-1.5">Registrar</a>
        </div>
      )}

      <div className={cn('rounded-2xl bg-gradient-to-br p-5 text-white shadow-xl', gradientClass)}>
        <div className="flex items-center gap-2 mb-3">
          <Utensils className="h-5 w-5" />
          <span className="text-sm font-semibold opacity-90">Macros do Plano</span>
          {plan && <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">{plan.strategy}</span>}
        </div>
        {plan ? (
          <div className="flex justify-around mt-2">
            <MacroRing pct={plan.carbs_pct} color="text-yellow-300" label="Carbs" value={smartMacros ? smartMacros.carbs_g + 'g' : undefined} />
            <MacroRing pct={(plan as any).protein_pct ?? Math.min(Math.round((plan.protein_g_per_kg ?? 0) * 15), 100)} color="text-[#E09B5A]" label="Proteína" value={smartMacros ? smartMacros.protein_g + 'g' : undefined} />
            <MacroRing pct={plan.fat_pct} color="text-pink-300" label="Gordura" value={smartMacros ? smartMacros.fat_g + 'g' : undefined} />
          </div>
        ) : (
          <div className="text-center py-4 opacity-60">
            <p className="text-sm">Nenhum plano gerado</p>
            <p className="text-xs mt-1">Use o Coach IA abaixo</p>
          </div>
        )}
        {(smartMacros || plan) && (
          <div className="flex justify-between mt-4 pt-3 border-t border-white/20 text-xs">
            <span className="opacity-70">TDEE estimado</span>
            <span className="font-bold">{displayTdee ? displayTdee + ' kcal' : '—'}</span>
            <span className="opacity-70">Meta</span>
            <span className="font-bold">{smartMacros?.target_calories ?? plan?.daily_calories ?? '—'} {smartMacros ? 'kcal' : ''}</span>
          </div>
        )}
      </div>


      {/* ── Refeições: sempre visíveis acima das tabs ─────────────────────── */}
      {plan && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide"
              onClick={() => setShowMeals(v => !v)}
            >
              <span>Distribuição de Refeições ({plan.meals?.length ?? 0}x/dia)</span>
              {showMeals ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <Button size="sm" variant="outline" onClick={() => setShowMealModal(true)} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Refeição
            </Button>
          </div>
          {showMeals && ((plan.meals?.length ?? 0) === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4 border border-dashed border-zinc-800 rounded-xl">Nenhuma refeição cadastrada. Toque em "+ Refeição" para adicionar.</p>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
              {plan.meals!.map((meal, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-[11px] font-bold">{i + 1}</span>
                      <span className="text-sm font-semibold text-zinc-200">{meal.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="h-3 w-3" /><span>{meal.time}</span>
                      <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-medium">{meal.calories_pct}%</span>
                      <button onClick={() => deleteMeal(i)} title="Remover" className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 ml-7 mb-0.5">{meal.focus}</p>
                  {meal.example && <p className="text-xs text-zinc-600 ml-7 italic">{meal.example}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Spinner enquanto gera automaticamente (sem plano ainda) */}
      {!plan && generating && (
        <div className="flex items-center justify-center gap-3 py-4 text-zinc-400 rounded-xl border border-zinc-800 bg-zinc-900">
          <RefreshCw className="h-4 w-4 animate-spin text-[#D4853A]" />
          <span className="text-sm">Gerando plano nutricional...</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
          <TabsTrigger value="coach" className="flex-1 text-xs gap-1"><Brain className="h-3 w-3" />Coach IA</TabsTrigger>
          <TabsTrigger value="plano" className="flex-1 text-xs gap-1"><Utensils className="h-3 w-3" />Plano</TabsTrigger>
          <TabsTrigger value="evolucao" className="flex-1 text-xs gap-1"><TrendingUp className="h-3 w-3" />Evolucao</TabsTrigger>
          <TabsTrigger value="timing" className="flex-1 text-xs gap-1"><Clock className="h-3 w-3" />Timing</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════
            TAB COACH IA
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="coach" className="mt-4 space-y-4">

          {/* Loading state — exibido enquanto a análise automática roda */}
          {analyzing && (
            <div className="flex items-center justify-center gap-3 py-6 text-zinc-400">
              <RefreshCw className="h-5 w-5 animate-spin text-[#D4853A]" />
              <span className="text-sm">Analisando com Nutricionista IA EDN...</span>
            </div>
          )}

          {/* Re-análise — só aparece depois que já há dados */}
          {coachData && !analyzing && (
            <Button onClick={runCoachAnalysis} disabled={analyzing} className="w-full gap-2" variant="outline" size="sm">
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar análise
            </Button>
          )}

          {analysis && (
            <>
              {/* Status card */}
              {(() => {
                const cfg = STATUS_CONFIG[analysis.status] ?? STATUS_CONFIG.bom;
                return (
                  <div className={cn('rounded-xl border p-4', cfg.bg)}>
                    <div className={cn('flex items-center gap-2 mb-2', cfg.color)}>
                      {cfg.icon}
                      <span className="text-sm font-bold">{analysis.headline}</span>
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{analysis.summary}</p>
                    {analysis.priority_action && (
                      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/10">
                        <ArrowRight className={cn('h-4 w-4 shrink-0 mt-0.5', cfg.color)} />
                        <p className="text-xs text-zinc-300">{analysis.priority_action}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Alerts */}
              {analysis.alerts.length > 0 && (
                <div className="space-y-2">
                  {analysis.alerts.map((alert, i) => (
                    <div key={i} className={cn('flex items-start gap-2.5 rounded-xl border p-3.5',
                      alert.type === 'danger' ? 'border-red-500/30 bg-red-500/5' :
                      alert.type === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
                      'border-[#D4853A]/30 bg-[#D4853A]/5'
                    )}>
                      <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5',
                        alert.type === 'danger' ? 'text-red-400' :
                        alert.type === 'warning' ? 'text-yellow-400' : 'text-[#D4853A]'
                      )} />
                      <p className="text-xs text-zinc-300">{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Plateau warning */}
              {analysis.plateau_detected && (
                <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                  <Activity className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-orange-300 mb-1">Plato Detectado</p>
                    <p className="text-xs text-zinc-400">{analysis.plateau_reason}</p>
                  </div>
                </div>
              )}

              {/* Smart calorie & macro targets */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Prescricao de Macros</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Calorias', value: analysis.calorie_recommendation.target, unit: 'kcal', color: 'text-orange-400' },
                    { label: 'Proteina', value: analysis.macro_targets.protein_g, unit: 'g', color: 'text-[#D4853A]' },
                    { label: 'Carbs', value: analysis.macro_targets.carbs_g, unit: 'g', color: 'text-yellow-400' },
                    { label: 'Gordura', value: analysis.macro_targets.fat_g, unit: 'g', color: 'text-pink-400' },
                  ].map(m => (
                    <div key={m.label} className="bg-zinc-800 rounded-lg p-2.5">
                      <p className={cn('text-lg font-black', m.color)}>{m.value}</p>
                      <p className="text-[9px] text-zinc-600">{m.unit}</p>
                      <p className="text-[10px] text-zinc-500">{m.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{analysis.calorie_recommendation.rationale}</p>
                {analysis.calorie_recommendation.surplus_deficit !== 0 && (
                  <div className={cn('flex items-center gap-2 text-xs font-semibold',
                    analysis.calorie_recommendation.surplus_deficit > 0 ? 'text-green-400' : 'text-orange-400'
                  )}>
                    {analysis.calorie_recommendation.surplus_deficit > 0
                      ? <><TrendingUp className="h-3.5 w-3.5" /> Superavit de {analysis.calorie_recommendation.surplus_deficit} kcal</>
                      : <><TrendingDown className="h-3.5 w-3.5" /> Deficit de {Math.abs(analysis.calorie_recommendation.surplus_deficit)} kcal</>
                    }
                  </div>
                )}
              </div>

              {/* Carb cycling */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Ciclagem de Carboidratos</p>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  {[
                    { label: 'Treino Pesado', value: analysis.carb_cycling.heavy_training, color: 'text-green-400' },
                    { label: 'Treino Leve', value: analysis.carb_cycling.light_training, color: 'text-yellow-400' },
                    { label: 'Descanso', value: analysis.carb_cycling.rest_day, color: 'text-[#D4853A]' },
                  ].map(c => (
                    <div key={c.label} className="bg-zinc-800 rounded-lg p-2.5">
                      <p className={cn('text-xl font-black', c.color)}>{c.value}<span className="text-xs font-normal text-zinc-500">g</span></p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">{c.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500">{analysis.carb_cycling.rationale}</p>
              </div>

              {/* Weight projection */}
              {currentWeight && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Previsao de Resultado</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: '30 dias', value: analysis.weight_projection.in_30d },
                      { label: '60 dias', value: analysis.weight_projection.in_60d },
                      { label: '90 dias', value: analysis.weight_projection.in_90d },
                    ].map(p => (
                      <div key={p.label} className="bg-zinc-800 rounded-lg p-3">
                        <p className="text-lg font-bold text-zinc-100">{p.value} kg</p>
                        <p className={cn('text-[10px] font-semibold',
                          p.value < currentWeight ? 'text-orange-400' : p.value > currentWeight ? 'text-green-400' : 'text-zinc-500'
                        )}>
                          {p.value < currentWeight ? `−${(currentWeight - p.value).toFixed(1)}` : p.value > currentWeight ? `+${(p.value - currentWeight).toFixed(1)}` : '—'} kg
                        </p>
                        <p className="text-[9px] text-zinc-600">{p.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EDN principle */}
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-purple-400 shrink-0" />
                  <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Principio EDN</p>
                </div>
                <p className="text-sm text-zinc-300 italic">"{analysis.edn_principle}"</p>
              </div>
            </>
          )}

          {/* Sem dados e não está analisando — mostra skeleton discreto */}
          {!analysis && !analyzing && (
            <div className="space-y-2 opacity-40">
              <div className="h-16 rounded-xl bg-zinc-800 animate-pulse" />
              <div className="h-10 rounded-xl bg-zinc-800 animate-pulse" />
              <div className="h-24 rounded-xl bg-zinc-800 animate-pulse" />
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB PLANO
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="plano" className="mt-4 space-y-4">
          {/* Regenerar plano */}
          {plan && (
            <Button onClick={generateNutrition} disabled={generating} className="w-full gap-2" variant="outline" size="sm">
              {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {generating ? 'Atualizando...' : 'Regenerar plano'}
            </Button>
          )}

          {/* Refeições movidas para acima das tabs */}

          {plan && (
            <>
              {/* Macros breakdown */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Macros do Plano</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Calorias diarias</span>
                  <span className="text-zinc-200 font-medium">{plan.daily_calories}</span>
                </div>
                {[
                  { label: 'Carboidratos', pct: plan.carbs_pct, color: 'bg-yellow-500' },
                  { label: 'Proteínas', pct: (plan as any).protein_pct ?? Math.min(Math.round((plan.protein_g_per_kg ?? 0) * 15), 100), color: 'bg-[#D4853A]' },
                  { label: 'Gorduras', pct: plan.fat_pct, color: 'bg-pink-500' },
                ].map(m => (
                  <div key={m.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{m.label}</span>
                      <span className="text-zinc-300">{m.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div className={cn('h-full rounded-full', m.color)} style={{ width: `${Math.min(m.pct, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Ciclagem de Carboidratos */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-200 mb-1">📊 Ciclagem de Carboidratos</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[#D4853A]/10 border border-[#D4853A]/20 p-3">
                    <p className="text-xs font-bold text-[#E09B5A] mb-2">🏋️ Dia de Treino</p>
                    <p className="text-xs text-zinc-400">Carbs <span className="text-zinc-100 font-bold">{Math.min(plan.carbs_pct + 10, 65)}%</span></p>
                    <p className="text-xs text-zinc-400">Proteína <span className="text-zinc-100 font-bold">{(plan as any).protein_pct ?? 35}%</span></p>
                    <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">{plan.pre_workout ?? 'Carbs complexos + proteína 1-2h antes'}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3">
                    <p className="text-xs font-bold text-zinc-300 mb-2">😴 Dia de Descanso</p>
                    <p className="text-xs text-zinc-400">Carbs <span className="text-zinc-100 font-bold">{Math.max(plan.carbs_pct - 10, 20)}%</span></p>
                    <p className="text-xs text-zinc-400">Gordura <span className="text-zinc-100 font-bold">{Math.min(plan.fat_pct + 5, 40)}%</span></p>
                    <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">{plan.rest_day_strategy ?? 'Reduzir carbs, manter proteína elevada'}</p>
                  </div>
                </div>
                {plan.post_workout && (
                  <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2.5">
                    <p className="text-[10px] font-bold text-green-400 mb-0.5">Pós-treino</p>
                    <p className="text-[10px] text-zinc-400">{plan.post_workout}</p>
                  </div>
                )}
              </div>

              {/* Key tips */}
              {plan.key_tips?.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Dicas do Coach EDN</p>
                  {plan.key_tips.map((tip, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-[11px] font-bold">{i + 1}</div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Plano ainda não gerado — mensagem dentro da aba */}
          {!plan && !generating && (
            <div className="text-center py-8 text-zinc-500">
              <p className="text-sm">Plano sendo preparado...</p>
              <p className="text-xs mt-1 text-zinc-600">Se não carregar, clique em Regenerar acima</p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB EVOLUCAO
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="evolucao" className="mt-4 space-y-4">

          {/* Weight log button */}
          <button onClick={() => setShowWeightModal(true)}
            className="w-full flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors">
            <div className="flex items-center gap-3">
              <Scale className="h-5 w-5 text-[#D4853A]" />
              <div className="text-left">
                <p className="text-sm font-semibold text-zinc-100">Registrar Peso de Hoje</p>
                <p className="text-xs text-zinc-500">Peso + % gordura corporal</p>
              </div>
            </div>
            <Plus className="h-4 w-4 text-zinc-500" />
          </button>

          {/* Current stats */}
          {weightLogs.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Peso Atual', value: weightLogs[0].weight_kg + ' kg', icon: <Scale className="h-4 w-4" />, color: 'text-[#D4853A]' },
                { label: 'BF Atual', value: weightLogs[0].body_fat_pct ? weightLogs[0].body_fat_pct + '%' : '—', icon: <Activity className="h-4 w-4" />, color: 'text-orange-400' },
                { label: 'Peso Meta', value: coachData?.target_weight ? coachData.target_weight + ' kg' : '—', icon: <Target className="h-4 w-4" />, color: 'text-green-400' },
                { label: 'Tendencia 14d', value: coachData?.weight_trend != null ? (coachData.weight_trend > 0 ? '+' : '') + coachData.weight_trend.toFixed(1) + ' kg' : '—', icon: coachData?.weight_trend != null && coachData.weight_trend < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />, color: coachData?.weight_trend != null && coachData.weight_trend < 0 ? 'text-orange-400' : 'text-green-400' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className={cn('mb-1', s.color)}>{s.icon}</div>
                  <p className="text-xl font-bold text-zinc-100">{s.value}</p>
                  <p className="text-xs text-zinc-500">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Weight chart */}
          {weightChartData.length >= 2 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm font-semibold text-zinc-200 mb-1">Evolucao do Peso</p>
              <p className="text-xs text-zinc-500 mb-4">Ultimas {weightChartData.length} medicoes</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={weightChartData} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2933" />
                  <XAxis dataKey="date" tick={{ fill: '#607D8B', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#607D8B', fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#0D1117', border: '1px solid #2C3E4A', borderRadius: 8 }} labelStyle={{ color: '#D7E0E5' }} itemStyle={{ color: '#E09B5A' }} formatter={(v: number) => [v + ' kg', 'Peso']} />
                  <Line type="monotone" dataKey="peso" stroke="#E09B5A" strokeWidth={2} dot={{ fill: '#E09B5A', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
              <Scale className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">Registre seu peso diariamente para ver o grafico de evolucao</p>
            </div>
          )}

          {/* Weight log history */}
          {weightLogs.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Historico de Peso</p>
              </div>
              <div className="divide-y divide-zinc-800">
                {weightLogs.slice(0, 7).map(l => (
                  <div key={l.id} className="flex items-center justify-between px-4 py-3">
                    <p className="text-xs text-zinc-500">{format(parseISO(l.log_date), "EEE, dd 'de' MMM", { locale: ptBR })}</p>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-semibold text-zinc-100">{l.weight_kg} kg</span>
                      {l.body_fat_pct && <span className="text-xs text-zinc-500">{l.body_fat_pct}% BF</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB TIMING
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="timing" className="mt-4 space-y-4">

          {/* Nutrient timing from coach */}
          {analysis?.nutrient_timing ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
              {[
                { label: 'Pre-treino', value: analysis.nutrient_timing.pre_workout, icon: <Zap className="h-4 w-4 text-yellow-400" />, accent: 'border-l-yellow-500' },
                { label: 'Pos-treino', value: analysis.nutrient_timing.post_workout, icon: <CheckCircle2 className="h-4 w-4 text-green-400" />, accent: 'border-l-green-500' },
                { label: 'Dia de descanso', value: analysis.nutrient_timing.rest_day, icon: <Apple className="h-4 w-4 text-[#D4853A]" />, accent: 'border-l-[#D4853A]' },
                { label: 'Antes de dormir', value: analysis.nutrient_timing.before_bed, icon: <Clock className="h-4 w-4 text-purple-400" />, accent: 'border-l-purple-500' },
              ].map(item => (
                <div key={item.label} className={cn('flex gap-3 px-4 py-4 border-l-2', item.accent)}>
                  <div className="shrink-0 mt-0.5">{item.icon}</div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-300 mb-1">{item.label}</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : plan ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
              {[
                { label: 'Pre-treino', value: plan.pre_workout, icon: <Zap className="h-4 w-4 text-yellow-400" />, accent: 'border-l-yellow-500' },
                { label: 'Pos-treino', value: plan.post_workout, icon: <CheckCircle2 className="h-4 w-4 text-green-400" />, accent: 'border-l-green-500' },
                { label: 'Dia de descanso', value: plan.rest_day_strategy, icon: <Apple className="h-4 w-4 text-[#D4853A]" />, accent: 'border-l-[#D4853A]' },
              ].map(item => (
                <div key={item.label} className={cn('flex gap-3 px-4 py-4 border-l-2', item.accent)}>
                  <div className="shrink-0 mt-0.5">{item.icon}</div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-300 mb-1">{item.label}</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
              <Clock className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">Gere um plano nutricional ou use o Coach IA para ver o timing de nutrientes</p>
            </div>
          )}

          {/* Hydration */}
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="h-5 w-5 text-cyan-400" />
              <p className="text-sm font-semibold text-zinc-100">Hidratacao de Alta Performance</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center mb-3">
              {[
                { label: 'Agua base', value: '35-40ml/kg' },
                { label: 'Por hora de treino', value: '+500-750ml' },
                { label: 'Pre-treino', value: '400-600ml' },
                { label: 'Pos-treino', value: '150% perdido' },
              ].map(h => (
                <div key={h.label} className="bg-zinc-800/50 rounded-lg p-2.5">
                  <p className="text-sm font-bold text-cyan-400">{h.value}</p>
                  <p className="text-[10px] text-zinc-500">{h.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-zinc-300">Eletrólitos em dias de treino intenso:</p>
              <div className="flex flex-wrap gap-2">
                {['Sodio 500-1000mg', 'Potassio 200-400mg', 'Magnesio 200-400mg'].map(e => (
                  <span key={e} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full">{e}</span>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Weight log modal ──────────────────────────────────── */}
      {showWeightModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-zinc-100">Registrar Peso</p>
              <button onClick={() => setShowWeightModal(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Peso (kg) *</label>
                <input type="number" step="0.1" placeholder="85.5" value={weightForm.weight_kg}
                  onChange={e => setWeightForm(f => ({ ...f, weight_kg: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Gordura Corporal (%) — opcional</label>
                <input type="number" step="0.1" placeholder="18.5" value={weightForm.body_fat_pct}
                  onChange={e => setWeightForm(f => ({ ...f, body_fat_pct: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowWeightModal(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={logWeight} disabled={savingWeight || !weightForm.weight_kg}>
                  {savingWeight ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMealModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-zinc-100">Nova refeição</p>
              <button onClick={() => setShowMealModal(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-zinc-400 block mb-1.5">Nome *</label>
                <input type="text" placeholder="Ex.: Almoço" value={mealForm.name} onChange={e => setMealForm(f => ({ ...f, name: e.target.value }))} className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-zinc-400 block mb-1.5">Horário</label>
                  <input type="text" placeholder="12h30" value={mealForm.time} onChange={e => setMealForm(f => ({ ...f, time: e.target.value }))} className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" /></div>
                <div><label className="text-xs text-zinc-400 block mb-1.5">% calorias</label>
                  <input type="number" min="0" max="100" placeholder="30" value={mealForm.calories_pct} onChange={e => setMealForm(f => ({ ...f, calories_pct: e.target.value }))} className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" /></div>
              </div>
              <div><label className="text-xs text-zinc-400 block mb-1.5">Foco — opcional</label>
                <input type="text" placeholder="Proteína + carbo complexo" value={mealForm.focus} onChange={e => setMealForm(f => ({ ...f, focus: e.target.value }))} className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" /></div>
              <div><label className="text-xs text-zinc-400 block mb-1.5">Exemplo de alimentos — opcional</label>
                <input type="text" placeholder="150g frango, arroz, salada" value={mealForm.example} onChange={e => setMealForm(f => ({ ...f, example: e.target.value }))} className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" /></div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowMealModal(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={addMeal} disabled={savingMeal || !mealForm.name.trim()}>{savingMeal ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Adicionar'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
