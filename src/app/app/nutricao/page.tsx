'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { cn } from '@/lib/utils'; 
import { toast } from 'sonner';
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
  const [showMeals, setShowMeals] = useState(true);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightForm, setWeightForm] = useState({ weight_kg: '', body_fat_pct: '' });
  const [savingWeight, setSavingWeight] = useState(false);
  const [activeTab, setActiveTab] = useState('coach');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: planData }, { data: logs }] = await Promise.all([
      supabase.from('workout_plans').select('id, schedule_config, goal').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('body_weight_logs').select('*').eq('user_id', user.id).order('log_date', { ascending: false }).limit(30),
    ]);
    setPlan((planData?.schedule_config as any)?.nutrition ?? null);
    setActiveGoal(planData?.goal ?? '');
    setActivePlanId(planData?.id ?? null);
    setWeightLogs((logs as WeightLog[]) ?? []);
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

  // Mockup: hero escuro com borda âmbar para todos os objetivos
  const gradientClass = 'from-[#1A1005] to-[#0D1520] border border-[#D4853A]/25';

  // Weight chart data
  const weightChartData = [...weightLogs].reverse().slice(-14).map(l => ({
    date: format(parseISO(l.log_date), 'dd/MM', { locale: ptBR }),
    peso: l.weight_kg,
    bf: l.body_fat_pct,
  }));

  const currentWeight = weightLogs[0]?.weight_kg ?? coachData?.current_weight ?? null;
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

      {/* ── Macro hero card ──────────────────────────────────────── */}
      <div className={cn('rounded-2xl bg-gradient-to-br p-5 text-zinc-100', gradientClass)}>
        <div className="flex items-center gap-2 mb-3">
          <Utensils className="h-5 w-5" />
          <span className="text-sm font-semibold opacity-90">Macros do Plano</span>
          {plan && <span className="ml-auto text-xs bg-[#D4853A]/15 text-[#D4853A] px-2 py-0.5 rounded-full font-semibold">{plan.strategy}</span>}
        </div>
        {plan ? (
          <>
            {/* Linha kcal — layout do mockup */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold tracking-[0.08em] text-[#D4853A]">META DIÁRIA</p>
                <p className="text-xl font-black italic text-zinc-100 mt-0.5">{(() => { const v = smartMacros?.target_calories ?? plan.daily_calories ?? '—'; return typeof v === 'number' ? `${v} kcal` : String(v).includes('kcal') ? v : `${v} kcal`; })()}</p>
                <p className="text-xs text-zinc-400 mt-0.5">TDEE estimado: {smartMacros?.tdee ?? '—'} kcal</p>
              </div>
              <MacroRing pct={smartMacros?.tdee && smartMacros?.target_calories ? Math.round((smartMacros.target_calories / smartMacros.tdee) * 100) : 100} color="text-[#D4853A]" label="kcal" />
            </div>
            <div className="flex justify-around">
              <MacroRing pct={Math.min(Math.round(plan.protein_g_per_kg * 4), 100)} color="text-[#5A8A6A]" label="Proteína" labelColor="text-[#5A8A6A]" value={smartMacros ? smartMacros.protein_g + 'g' : undefined} />
              <MacroRing pct={plan.carbs_pct} color="text-[#A67C3A]" label="Carbo" labelColor="text-[#A67C3A]" value={smartMacros ? smartMacros.carbs_g + 'g' : undefined} />
              <MacroRing pct={plan.fat_pct} color="text-[#8B5A5A]" label="Gordura" labelColor="text-[#8B5A5A]" value={smartMacros ? smartMacros.fat_g + 'g' : undefined} />
            </div>
          </>
        ) : (
          <div className="text-center py-4 opacity-60">
            <p className="text-sm">Nenhum plano gerado</p>
            <p className="text-xs mt-1">Use o Coach IA abaixo</p>
          </div>
        )}

      </div>

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

          {plan?.meals && plan.meals.length > 0 && (
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between text-sm font-semibold text-zinc-400 uppercase tracking-wide"
                onClick={() => setShowMeals(v => !v)}>
                <span>Distribuicao de Refeicoes ({plan.meals!.length}x/dia)</span>
                {showMeals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showMeals && (
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
                        </div>
                      </div>
                      <p className="text-xs text-zinc-400 ml-7 mb-0.5">{meal.focus}</p>
                      {meal.example && <p className="text-xs text-zinc-600 ml-7 italic">{meal.example}</p>}
                    </div>
                  ))}
                </div>
              )}
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
    </div>
  );
}
