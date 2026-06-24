'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Utensils, Apple, Zap, Droplets, Clock, CheckCircle2, Sparkles,
  RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  AlertTriangle, Target, Scale, Activity, BarChart2, Plus, X,
  Flame, Info, ArrowRight, Award, Brain, Heart,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils'; 
import { toast } from 'sonner';
import { autoSync, isNativeShell } from '@/lib/integrations/wearable-hub';
import { newId, insertOrQueue, flushQueue } from '@/lib/offline-queue';
import { format, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  sport_agent?: string;
  analysis?: string; interpretation?: string; strategy?: string; action?: string;
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
function MacroRing({ pct, color, label, value, labelColor }: { pct: number; color: string; label: string; value?: string; labelColor?: string }) {
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
      <span className={`text-[11px] font-bold ${labelColor ?? "text-zinc-400"}`}>{label}</span>
      {value && <span className="text-[10px] text-zinc-500">{value}</span>}
    </div>
  );
}

const STATUS_CONFIG = {
  otimo: { color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', icon: <CheckCircle2 className="h-4 w-4" /> },
  bom: { color: 'text-[#D4853A]', bg: 'bg-[#D4853A]/10 border-[#D4853A]/20', icon: <Info className="h-4 w-4" /> },
  atencao: { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', icon: <AlertTriangle className="h-4 w-4" /> },
  critico: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', icon: <AlertTriangle className="h-4 w-4" /> },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function NutricaoPage() {
  const supabase = createClient();
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [activeGoal, setActiveGoal] = useState('');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [coachData, setCoachData] = useState<{ analysis: CoachAnalysis; smart_macros: SmartMacros; current_weight: number | null; target_weight: number | null; weight_trend: number | null; bio: any } | null>(null);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bioWeights, setBioWeights] = useState<any[]>([]);
  const [showMeals, setShowMeals] = useState(true);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightForm, setWeightForm] = useState({ weight_kg: '', body_fat_pct: '' });
  const [savingWeight, setSavingWeight] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [mealForm, setMealForm] = useState({ name: '', time: '', calories_pct: '', focus: '', example: '' });
  const [activeTab, setActiveTab] = useState('coach');

  // ── Plano Nutricional EDN (card unificado) ──
  const [autoNutri, setAutoNutri] = useState<{
    tmbKcal: number; tdeeKcal: number; activityFactor: number; targetKcal: number;
    goalAdjustmentKcal: number; proteinG: number; proteinGPerKg: number; carbsG: number;
    fatG: number; waterMl: number; source: string; explanation: string[];
    phase?: string; phaseLabel?: string; phaseReason?: string; whyThisPlan?: string[];
    dayTypes?: { kind: string; label: string; kcal: number; carbsG: number; proteinG: number; fatG: number; note: string }[];
    trainingAlignment?: string | null;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nutriScore, setNutriScore] = useState<{ score: number; label: string; breakdown: { label: string; points: number; max: number }[] } | null>(null);
  const [nutriSignals, setNutriSignals] = useState<{ level: string; title: string; message: string }[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [intel, setIntel] = useState<any>(null);
  const [decisions, setDecisions] = useState<{ id: string; decided_at: string; change_applied: string; reason: string | null; result: string | null }[]>([]);
  const [showWhy, setShowWhy] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [raceDate, setRaceDate] = useState('');
  const [raceName, setRaceName] = useState('');
  const [savingRace, setSavingRace] = useState(false);
  const [sportSel, setSportSel] = useState('');
  const SPORTS: { v: string; l: string }[] = [
    { v: 'musculacao', l: 'Musculação' }, { v: 'corrida_recreativa', l: 'Corrida recreativa' },
    { v: 'meia_maratona', l: 'Meia maratona' }, { v: 'maratona', l: 'Maratona' },
    { v: 'triathlon', l: 'Triathlon' }, { v: 'ciclismo', l: 'Ciclismo' }, { v: 'natacao', l: 'Natação' },
    { v: 'futebol', l: 'Futebol' }, { v: 'artes_marciais', l: 'Artes marciais' },
    { v: 'cross_training', l: 'Cross training' }, { v: 'outro', l: 'Outro' },
  ];
  async function saveSport(v: string) {
    setSportSel(v);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ athlete_sport: v }).eq('id', user.id);
    if (error) { toast.error('Erro ao salvar esporte'); return; }
    toast.success('Esporte atualizado — especialista ajustado.');
    loadAutopilot();
  }
  async function saveRace(overrideDate?: string, overrideName?: string) {
    const dateVal = overrideDate !== undefined ? overrideDate : raceDate;
    const nameVal = overrideName !== undefined ? overrideName : raceName;
    setSavingRace(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingRace(false); return; }
    const { error } = await supabase.from('profiles').update({
      target_race_date: dateVal || null,
      target_race_name: nameVal || null,
    }).eq('id', user.id);
    setSavingRace(false);
    if (error) { toast.error('Erro ao salvar prova'); return; }
    toast.success(dateVal ? 'Prova salva — modo endurance ativado.' : 'Prova removida.');
    loadAutopilot();
  }
  const loadAutopilot = useCallback(() => {
    return fetch('/api/autopilot').then(r => r.json()).then(d => {
      setAutoNutri(d?.nutrition ?? null);
      setNutriScore(d?.nutritionScore ?? null);
      setNutriSignals(d?.nutritionSignals ?? []);
      setIntel(d?.intelligence ?? null);
      if (d?.intelligence?.race) { setRaceDate(d.intelligence.race.date ?? ''); setRaceName(d.intelligence.race.name ?? ''); }
      if (d?.intelligence?.sport?.sport) setSportSel(d.intelligence.sport.sport);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    (async () => {
      // Atualiza HRV/sono do dia (relógio) antes de calcular, no app nativo, 1x/dia
      try {
        if (isNativeShell()) {
          const KEY = 'wearable_autosync_date';
          const today = new Date().toISOString().slice(0, 10);
          if (localStorage.getItem(KEY) !== today) {
            const r = await autoSync();
            if (r.ok) localStorage.setItem(KEY, today);
          }
        }
      } catch { /* ignora — segue com o último dado disponível */ }
      await loadAutopilot();
    })();
    supabase.from('nutrition_decisions').select('id, decided_at, change_applied, reason, result').order('decided_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setDecisions(data); }, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: planData }, { data: logs }, { data: bio }] = await Promise.all([
      supabase.from('workout_plans').select('id, schedule_config, goal').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('body_weight_logs').select('*').eq('user_id', user.id).order('log_date', { ascending: false }).limit(30),
      supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(30),
    ]);
    setPlan((planData?.schedule_config as any)?.nutrition ?? null);
    setActiveGoal(planData?.goal ?? '');
    setActivePlanId(planData?.id ?? null);
    setWeightLogs((logs as WeightLog[]) ?? []);
    setBioWeights(bio ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function generateNutrition() {
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-nutrition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: activePlanId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPlan(data.nutrition);
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
      toast.success('Análise do Nutricionista IA concluída!');
    } catch (err: any) { toast.error(err.message); }
    finally { setAnalyzing(false); }
  }

  async function logWeight() {
    if (!weightForm.weight_kg) return;
    setSavingWeight(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const weightRow = {
      user_id: user.id, log_date: format(new Date(), 'yyyy-MM-dd'),
      weight_kg: parseFloat(weightForm.weight_kg),
      body_fat_pct: weightForm.body_fat_pct ? parseFloat(weightForm.body_fat_pct) : null,
    };
    const result = await insertOrQueue(supabase, [{ table: 'body_weight_logs', rows: [weightRow], onConflict: 'user_id,log_date' }], 'Peso');
    setSavingWeight(false);
    if (result === 'error') { toast.error('Erro ao registrar'); return; }
    toast.success(result === 'queued' ? 'Peso salvo offline — será enviado ao reconectar.' : 'Peso registrado!');
    if (result === 'sent') flushQueue(supabase).catch(() => {});
    setWeightForm({ weight_kg: '', body_fat_pct: '' });
    setShowWeightModal(false);
    load();
  }

  // ── Refeições do plano (schedule_config.nutrition.meals) ──────────────────
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

  // Mockup: hero escuro com borda âmbar para todos os objetivos
  const gradientClass = 'from-[#1A1005] to-[#0D1520] border border-[#D4853A]/25';

  // Peso unificado: registros manuais + histórico da BIOIMPEDÂNCIA (balança).
  // Bioimpedância tem prioridade no mesmo dia. Evita registrar peso 2x.
  const weightSeries = (() => {
    const byDay = new Map<string, { t: number; peso: number; bf: number | null }>();
    weightLogs.forEach(l => { if (l.weight_kg != null) { const d = parseISO(l.log_date); byDay.set(format(d, 'yyyy-MM-dd'), { t: d.getTime(), peso: l.weight_kg, bf: l.body_fat_pct ?? null }); } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bioWeights.forEach((b: any) => { if (b?.weight_kg != null && b?.measured_at) { const d = parseISO(b.measured_at); byDay.set(format(d, 'yyyy-MM-dd'), { t: d.getTime(), peso: Number(b.weight_kg), bf: b.body_fat_pct != null ? Number(b.body_fat_pct) : null }); } });
    return Array.from(byDay.values()).sort((a, b) => a.t - b.t);
  })();
  const latestWeightEntry = weightSeries.length ? weightSeries[weightSeries.length - 1] : null;

  // Weight chart data (série unificada)
  const weightChartData = weightSeries.slice(-14).map(x => ({
    date: format(new Date(x.t), 'dd/MM', { locale: ptBR }),
    peso: x.peso,
    bf: x.bf,
  }));

  const currentWeight = latestWeightEntry?.peso ?? coachData?.current_weight ?? null;
  const analysis = coachData?.analysis;
  const smartMacros = coachData?.smart_macros;

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
      {/* ════ Plano Nutricional EDN — card único ════ */}
      <div className={cn('rounded-2xl bg-gradient-to-br p-4 text-zinc-100', gradientClass)}>
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Utensils className="h-5 w-5 text-[#D4853A]" />
          <span className="text-base font-extrabold italic">Plano Nutricional EDN</span>
          <div className="ml-auto flex flex-wrap gap-1.5 justify-end">
            {autoNutri?.phaseLabel && <span className="text-[10px] bg-[#5A8A6A]/20 text-[#7FB58F] px-2 py-0.5 rounded-full font-bold">Fase: {autoNutri.phaseLabel}</span>}
            {plan && <span className="text-[10px] bg-[#D4853A]/15 text-[#D4853A] px-2 py-0.5 rounded-full font-semibold">{plan.strategy}</span>}
            {autoNutri?.source === 'bioimpedance_tmb' && (
              <span className="text-[10px] text-zinc-500 bg-black/30 px-2 py-0.5 rounded-full">TMB medida pela bioimpedância</span>
            )}
          </div>
        </div>

        {(() => {
          const targetKcal = autoNutri?.targetKcal ?? smartMacros?.target_calories ?? null;
          const tdee = autoNutri?.tdeeKcal ?? smartMacros?.tdee ?? null;
          const proteinG = autoNutri?.proteinG ?? smartMacros?.protein_g ?? null;
          const carbsG = autoNutri?.carbsG ?? smartMacros?.carbs_g ?? null;
          const fatG = autoNutri?.fatG ?? smartMacros?.fat_g ?? null;
          const waterL = autoNutri ? (autoNutri.waterMl / 1000).toFixed(1) : null;
          const pct = (g: number | null, mult: number) =>
            g != null && targetKcal ? Math.round(((g * mult) / targetKcal) * 100) : null;
          const pPct = pct(proteinG, 4) ?? Math.min(Math.round((plan?.protein_g_per_kg ?? 0) * 4), 100);
          const cPct = pct(carbsG, 4) ?? plan?.carbs_pct ?? 0;
          const fPct = pct(fatG, 9) ?? plan?.fat_pct ?? 0;

          if (!targetKcal && !plan) {
            return (
              <div className="text-center py-4 opacity-60">
                <p className="text-sm">Nenhum plano gerado</p>
                <p className="text-xs mt-1">Use o Coach IA abaixo</p>
              </div>
            );
          }

          return (
            <>
              {/* Meta de calorias em destaque + anel kcal */}
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <p className="text-2xl font-black italic text-zinc-100 leading-none">
                    {targetKcal ?? '—'}<span className="text-sm font-bold text-zinc-400 ml-1">kcal/dia</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1.5">
                    {autoNutri
                      ? <>TMB {autoNutri.tmbKcal} kcal · TDEE {autoNutri.tdeeKcal} kcal (×{autoNutri.activityFactor}) · {autoNutri.goalAdjustmentKcal === 0 ? 'manutenção' : `${autoNutri.goalAdjustmentKcal > 0 ? '+' : ''}${autoNutri.goalAdjustmentKcal} kcal pelo objetivo`}</>
                      : <>TDEE estimado: {tdee ?? '—'} kcal</>}
                  </p>
                  {((autoNutri?.whyThisPlan && autoNutri.whyThisPlan.length > 0) || (autoNutri?.explanation && autoNutri.explanation.length > 0)) && (
                    <button onClick={() => setShowWhy(v => !v)} className="mt-2 text-[11px] text-[#D4853A] hover:text-[#E09B5A] flex items-center gap-1">
                      <ChevronDown className={cn('h-3 w-3 transition-transform', showWhy && 'rotate-180')} />
                      Por que esse plano?
                    </button>
                  )}
                </div>
              </div>

              {showWhy && autoNutri && (
                <div className="mb-3 rounded-lg bg-black/25 border border-white/[0.06] p-3 space-y-2">
                  {autoNutri.whyThisPlan && autoNutri.whyThisPlan.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-[#7FB58F] font-bold">Estratégia para você</p>
                      {autoNutri.whyThisPlan.map((e, i) => (
                        <p key={i} className="text-[11px] text-zinc-300 leading-relaxed">{e}</p>
                      ))}
                    </div>
                  )}
                  {autoNutri.explanation && autoNutri.explanation.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-white/[0.06]">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold">Como chegamos nos números</p>
                      {autoNutri.explanation.map((e, i) => (
                        <p key={i} className="text-[11px] text-zinc-400 leading-relaxed">• {e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Anéis por ordem de importância: Calorias > Proteína > Carbo > Gordura > Água */}
              <div className="flex flex-wrap justify-around gap-y-3 pt-1">
                <MacroRing pct={tdee && targetKcal ? Math.round((targetKcal / tdee) * 100) : 100} color="text-[#D4853A]" label="Calorias" labelColor="text-[#D4853A]" value={targetKcal ? `${targetKcal} kcal` : undefined} />
                <MacroRing pct={pPct} color="text-[#5A8A6A]" label="Proteína" labelColor="text-[#5A8A6A]" value={proteinG != null ? `${proteinG}g${autoNutri ? ` · ${autoNutri.proteinGPerKg}g/kg` : ''}` : undefined} />
                <MacroRing pct={cPct} color="text-[#A67C3A]" label="Carbo" labelColor="text-[#A67C3A]" value={carbsG != null ? `${carbsG}g` : undefined} />
                <MacroRing pct={fPct} color="text-[#8B5A5A]" label="Gordura" labelColor="text-[#8B5A5A]" value={fatG != null ? `${fatG}g` : undefined} />
                {waterL && (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="relative w-16 h-16 flex items-center justify-center rounded-full border-[6px] border-[#2C3E4A]">
                      <span className="text-xs font-bold text-zinc-100">{waterL}L</span>
                    </div>
                    <span className="text-[11px] font-bold text-[#8FA3AD]">Água</span>
                    <span className="text-[10px] text-zinc-500">por dia</span>
                  </div>
                )}
              </div>

              {/* Day types — periodização nutricional */}
              {autoNutri?.dayTypes && autoNutri.dayTypes.length === 3 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {autoNutri.dayTypes.map((d) => (
                    <div key={d.kind} className="rounded-lg bg-black/25 border border-white/[0.06] p-2 text-center">
                      <p className="text-[10px] font-bold text-zinc-300 leading-tight">{d.label}</p>
                      <p className="text-sm font-black italic text-[#D4853A] mt-1">{d.kcal}<span className="text-[9px] font-bold text-zinc-500"> kcal</span></p>
                      <p className="text-[10px] text-[#A67C3A] mt-0.5">{d.carbsG}g carbo</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Nutrition Score */}
              {nutriScore && (
                <div className="mt-4 rounded-lg bg-black/25 border border-white/[0.06] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wide">Nutrition Score</span>
                    <span className="text-lg font-black italic text-[#5A8A6A]">{nutriScore.score}<span className="text-[10px] text-zinc-500 font-bold">/100 · {nutriScore.label}</span></span>
                  </div>
                  <div className="space-y-1.5">
                    {nutriScore.breakdown.map((b, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5"><span>{b.label}</span><span>{b.points}/{b.max}</span></div>
                        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div className="h-full rounded-full bg-[#5A8A6A]" style={{ width: `${Math.round((b.points / b.max) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sinais de ajuste automático */}
              {nutriSignals.length > 0 && nutriSignals[0].title !== 'Sem ajustes necessários' && (
                <div className="mt-3 space-y-2">
                  {nutriSignals.map((sig, i) => (
                    <div key={i} className={cn('rounded-lg border p-2.5',
                      sig.level === 'positivo' ? 'bg-[#5A8A6A]/10 border-[#5A8A6A]/30' :
                      sig.level === 'atencao' ? 'bg-[#8B5A5A]/10 border-[#8B5A5A]/30' :
                      'bg-black/25 border-white/[0.06]')}>
                      <p className="text-[11px] font-bold text-zinc-200">{sig.title}</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{sig.message}</p>
                      {sig.level === 'atencao' && (
                        <a
                          href={`/app/ia?ask=${encodeURIComponent(`Detectei este sinal na minha nutrição: "${sig.title} — ${sig.message}". Considerando meu objetivo e meus dados, o que você recomenda ajustar? Se fizer sentido, pode aplicar a mudança.`)}`}
                          className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-[#D4853A] hover:text-[#E09B5A]"
                        >
                          <Brain className="h-3 w-3" /> Ajustar com o Coach
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ════ V7.2 — Seu momento atual ════ */}
      {intel?.moment && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#5A8A6A]" />
            <span className="text-base font-extrabold italic text-zinc-100">Seu momento atual</span>
            {intel.usedWearable && <span className="ml-auto text-[10px] bg-[#2C3E4A] text-[#8FA3AD] px-2 py-0.5 rounded-full font-semibold">⌚ relógio</span>}
            {intel.cycle?.label && <span className={cn("text-[10px] bg-[#5A8A6A]/20 text-[#7FB58F] px-2 py-0.5 rounded-full font-bold", !intel.usedWearable && "ml-auto")}>{intel.cycle.label}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5">
              <p className="text-[10px] text-zinc-500">Fase</p>
              <p className="text-sm font-bold text-zinc-100">{intel.moment.phase}</p>
            </div>
            <div className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5">
              <p className="text-[10px] text-zinc-500">Score · Evolução</p>
              <p className="text-sm font-bold text-[#5A8A6A]">{intel.moment.score} · {intel.moment.evolution}</p>
            </div>
            <div className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5">
              <p className="text-[10px] text-zinc-500">Principal limitador</p>
              <p className="text-sm font-bold text-[#D4853A]">{intel.moment.limiter}</p>
            </div>
            <div className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5">
              <p className="text-[10px] text-zinc-500">Próxima ação</p>
              <p className="text-[12px] font-semibold text-zinc-200 leading-tight">{intel.moment.nextAction}</p>
            </div>
          </div>
          {intel.sport?.agentLabel && <p className="text-[11px] text-[#7FB58F] font-semibold">🏅 {intel.sport.agentLabel}</p>}
          {intel.cycle?.objective && <p className="text-[11px] text-zinc-400">🎯 {intel.cycle.objective} · <span className="text-zinc-500">{intel.cycle.priority}</span></p>}
          {intel.moment.personalNote && <p className="text-[10px] text-zinc-500">{intel.moment.personalNote}</p>}
        </div>
      )}

      {/* Demanda do treino de hoje */}
      {intel?.todayDemand && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#D4853A]" />
              <span className="text-sm font-bold text-zinc-100">Demanda de hoje{intel.todayLabel ? ` · ${intel.todayLabel}` : intel.isRestDay ? ' · Descanso' : ''}</span>
            </div>
            <span className="text-sm font-black italic text-[#D4853A]">{intel.todayDemand.score}<span className="text-[10px] text-zinc-500">/100 · {intel.todayDemand.level}</span></span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-2">
            <div className="h-full rounded-full bg-gradient-to-r from-[#5A8A6A] via-[#A67C3A] to-[#D4853A]" style={{ width: `${intel.todayDemand.score}%` }} />
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">{intel.todayDemand.strategy}</p>
        </div>
      )}

      {/* Recuperação + Endurance */}
      {(intel?.recoveryAdvice?.active || intel?.endurance?.active) && (
        <div className="space-y-2">
          {intel?.recoveryAdvice?.active && (
            <div className="rounded-2xl border border-[#8B5A5A]/30 bg-[#8B5A5A]/10 p-3">
              <p className="text-[11px] font-bold text-zinc-100 flex items-center gap-1.5"><Heart className="h-3.5 w-3.5 text-[#C97B7B]" />{intel.recoveryAdvice.title}</p>
              <p className="text-[11px] text-zinc-300 leading-relaxed mt-0.5">{intel.recoveryAdvice.message}</p>
            </div>
          )}
          {intel?.endurance?.active && (
            <div className="rounded-2xl border border-[#5A8A6A]/30 bg-[#5A8A6A]/10 p-3">
              <p className="text-[11px] font-bold text-zinc-100 flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-[#7FB58F]" />Endurance · {intel.endurance.phase}</p>
              <p className="text-[11px] text-zinc-300 leading-relaxed mt-0.5">{intel.endurance.note}</p>
            </div>
          )}
        </div>
      )}

      {/* Modalidade esportiva (ativa o especialista) */}
      {intel && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-bold text-zinc-100 mb-1 flex items-center gap-1.5"><Award className="h-4 w-4 text-[#7FB58F]" />Modalidade esportiva</p>
          {intel.sport?.focus && <p className="text-[11px] text-zinc-500 mb-2">{intel.sport.agentLabel} · {intel.sport.focus}</p>}
          <select value={sportSel} onChange={(e) => saveSport(e.target.value)} className="w-full bg-black/30 border border-zinc-700 rounded-lg px-2 py-2 text-[12px] text-zinc-100">
            <option value="">Selecione…</option>
            {SPORTS.map((sp) => <option key={sp.v} value={sp.v}>{sp.l}</option>)}
          </select>
          {intel.sport?.priorities?.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {intel.sport.priorities.map((p: string, i: number) => <li key={i} className="text-[11px] text-zinc-400">• {p}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Prova futura (ativa o modo endurance) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-1.5"><Activity className="h-4 w-4 text-[#5A8A6A]" />Prova futura</p>
        {intel?.race ? (
          <p className="text-[11px] text-zinc-400 mb-2">{intel.race.name ? `${intel.race.name} · ` : ''}{new Date(intel.race.date).toLocaleDateString('pt-BR')} — faltam {intel.race.weeks} semana(s). Modo endurance ativo.</p>
        ) : (
          <p className="text-[11px] text-zinc-500 mb-2">Defina uma prova (corrida, ciclismo, triathlon) para o Coach priorizar carboidrato e recuperação automaticamente.</p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} className="bg-black/30 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-100" />
          <input type="text" value={raceName} onChange={(e) => setRaceName(e.target.value)} placeholder="Nome (opcional)" className="flex-1 min-w-[120px] bg-black/30 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-100" />
          <button onClick={() => saveRace()} disabled={savingRace} className="px-3 py-1.5 rounded-lg bg-[#D4853A] hover:bg-[#E09B5A] disabled:opacity-60 text-white text-[12px] font-bold">Salvar</button>
          {intel?.race && <button onClick={() => { setRaceDate(''); setRaceName(''); saveRace('', ''); }} className="px-2 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 text-[12px]">Remover</button>}
        </div>
      </div>

      {/* Diagnóstico + Simulador */}
      {intel?.diagnosis && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-bold text-zinc-100 mb-1.5 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-[#5A8A6A]" />Diagnóstico</p>
          <div className="space-y-0.5 mb-2">
            {intel.diagnosis.diagnosis.map((dline: string, i: number) => (
              <p key={i} className="text-[11px] text-zinc-400">• {dline}</p>
            ))}
          </div>
          {intel.diagnosis.causes?.length > 0 && (
            <div className="mb-1.5">
              <p className="text-[11px] font-bold text-zinc-300">Possíveis causas:</p>
              {intel.diagnosis.causes.map((cz: string, i: number) => (
                <p key={i} className="text-[11px] text-zinc-400">• {cz}</p>
              ))}
            </div>
          )}
          <p className="text-[12px] text-zinc-200"><span className="font-bold">Conclusão:</span> {intel.diagnosis.conclusion}</p>
          <p className="text-[12px] text-[#D4853A] mt-0.5"><span className="font-bold">Ação:</span> {intel.diagnosis.action}</p>
          {intel.simulations?.length > 0 && (
            <>
              <button onClick={() => setShowSim(v => !v)} className="mt-2 text-[11px] text-[#D4853A] hover:text-[#E09B5A] flex items-center gap-1">
                <ChevronDown className={cn('h-3 w-3 transition-transform', showSim && 'rotate-180')} />
                Simular antes de aplicar
              </button>
              {showSim && (
                <div className="mt-2 space-y-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {intel.simulations.map((opt: any) => (
                    <div key={opt.id} className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-zinc-100">{opt.label}</p>
                        <p className="text-[10px] text-zinc-500">{opt.note}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('text-sm font-black italic', opt.predictedPerWeekKg < 0 ? 'text-[#5A8A6A]' : opt.predictedPerWeekKg > 0 ? 'text-[#D4853A]' : 'text-zinc-400')}>
                          {opt.predictedPerWeekKg > 0 ? '+' : ''}{opt.predictedPerWeekKg}<span className="text-[9px] text-zinc-500">kg/sem</span>
                        </p>
                        <a href={`/app/ia?ask=${encodeURIComponent(`Quero simular este ajuste nutricional: "${opt.label}" (previsão ${opt.predictedPerWeekKg}kg/semana). Faz sentido para meu objetivo atual? Se sim, pode aplicar.`)}`} className="text-[10px] font-bold text-[#D4853A] hover:text-[#E09B5A]">Aplicar com o Coach →</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Histórico de decisões da IA */}
      {decisions.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-1.5"><Brain className="h-4 w-4 text-[#7FB58F]" />Decisões da IA</p>
          <div className="space-y-2">
            {decisions.map((dec) => (
              <div key={dec.id} className="flex items-start gap-2">
                <span className="text-[10px] text-zinc-500 shrink-0 mt-0.5">{new Date(dec.decided_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                <div className="min-w-0">
                  <p className="text-[12px] text-zinc-200">{dec.change_applied}</p>
                  {dec.reason && <p className="text-[10px] text-zinc-500">Motivo: {dec.reason}</p>}
                  {dec.result && <p className="text-[10px] text-[#5A8A6A]">Resultado: {dec.result}</p>}
                </div>
              </div>
            ))}
          </div>
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

          {/* Analyze button */}
          <Button onClick={runCoachAnalysis} disabled={analyzing} className="w-full gap-2" variant={coachData ? 'outline' : 'default'}>
            {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {analyzing ? 'Analisando...' : coachData ? 'Reanalisar com Nutricionista IA' : 'Analisar com Nutricionista IA EDN'}
          </Button>

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

              {/* V8 — Estrutura do nutricionista: Análise → Interpretação → Estratégia → Ação */}
              {(analysis.analysis || analysis.interpretation || analysis.strategy || analysis.action) && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2.5">
                  {analysis.sport_agent && <p className="text-[10px] uppercase tracking-wide text-[#7FB58F] font-bold flex items-center gap-1"><Brain className="h-3 w-3" />{analysis.sport_agent}</p>}
                  {analysis.analysis && (<div><p className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold">Análise</p><p className="text-[12px] text-zinc-300 leading-relaxed">{analysis.analysis}</p></div>)}
                  {analysis.interpretation && (<div><p className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold">Interpretação</p><p className="text-[12px] text-zinc-300 leading-relaxed">{analysis.interpretation}</p></div>)}
                  {analysis.strategy && (<div><p className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold">Estratégia</p><p className="text-[12px] text-zinc-300 leading-relaxed">{analysis.strategy}</p></div>)}
                  {analysis.action && (<div><p className="text-[10px] uppercase tracking-wide text-[#D4853A] font-bold">Ação</p><p className="text-[12px] text-zinc-200 leading-relaxed font-semibold">{analysis.action}</p></div>)}
                </div>
              )}

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

          {!analysis && !analyzing && (
            <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
              <Brain className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 mb-1">Nutricionista IA EDN</p>
              <p className="text-xs text-zinc-600">Análise completa: macros, calorias, ciclagem de carbs, detecção de platô e projeção de resultado</p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB PLANO
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="plano" className="mt-4 space-y-4">
          <Button onClick={generateNutrition} disabled={generating} className="w-full gap-2" variant={plan ? 'outline' : 'default'}>
            {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-[#D4853A]" />}
            {plan ? 'Regenerar plano com IA' : 'Gerar plano nutricional com IA'}
          </Button>

          {plan && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button className="flex items-center gap-2 text-sm font-semibold text-zinc-400 uppercase tracking-wide"
                  onClick={() => setShowMeals(v => !v)}>
                  <span>Distribuicao de Refeicoes ({plan.meals?.length ?? 0}x/dia)</span>
                  {showMeals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
                    <div key={i} className="p-4">
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
                  { label: 'Proteinas', pct: Math.min(Math.round(plan.protein_g_per_kg * 4), 100), color: 'bg-[#D4853A]' },
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

          {!plan && !generating && (
            <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
              <Sparkles className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 mb-1">Nenhum plano nutricional gerado</p>
              <p className="text-xs text-zinc-600">A IA cria um plano personalizado com base no seu perfil e biometria</p>
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
          {latestWeightEntry && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Peso Atual', value: latestWeightEntry.peso + ' kg', icon: <Scale className="h-4 w-4" />, color: 'text-[#D4853A]' },
                { label: 'BF Atual', value: latestWeightEntry.bf ? latestWeightEntry.bf + '%' : '—', icon: <Activity className="h-4 w-4" />, color: 'text-orange-400' },
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
          {latestWeightEntry && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Histórico de Peso</p>
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

      {/* ── Add meal modal ──────────────────────────────────── */}
      {showMealModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-zinc-100">Nova refeição</p>
              <button onClick={() => setShowMealModal(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Nome *</label>
                <input type="text" placeholder="Ex.: Almoço" value={mealForm.name}
                  onChange={e => setMealForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Horário</label>
                  <input type="text" placeholder="12h30" value={mealForm.time}
                    onChange={e => setMealForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">% calorias</label>
                  <input type="number" min="0" max="100" placeholder="30" value={mealForm.calories_pct}
                    onChange={e => setMealForm(f => ({ ...f, calories_pct: e.target.value }))}
                    className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Foco — opcional</label>
                <input type="text" placeholder="Proteína + carbo complexo" value={mealForm.focus}
                  onChange={e => setMealForm(f => ({ ...f, focus: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Exemplo de alimentos — opcional</label>
                <input type="text" placeholder="150g frango, arroz, salada" value={mealForm.example}
                  onChange={e => setMealForm(f => ({ ...f, example: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowMealModal(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={addMeal} disabled={savingMeal || !mealForm.name.trim()}>
                  {savingMeal ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Adicionar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
