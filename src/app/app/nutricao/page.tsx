'use client';

import { useEffect, useState } from 'react';
import { Utensils, Apple, Zap, Droplets, Clock, CheckCircle2, Sparkles, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Meal {
  name: string;
  time: string;
  calories_pct: number;
  focus: string;
  example: string;
}

interface NutritionPlan {
  strategy: string;
  daily_calories: string;
  protein_g_per_kg: number;
  carbs_pct: number;
  fat_pct: number;
  pre_workout: string;
  post_workout: string;
  rest_day_strategy: string;
  meals?: Meal[];
  key_tips: string[];
}

interface BioData {
  weight_kg: number | null;
  basal_metabolic_rate_kcal: number | null;
  body_fat_pct: number | null;
  skeletal_muscle_mass_kg: number | null;
  protein_pct: number | null;
  water_pct: number | null;
}

function MacroRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#27272a" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor"
            strokeWidth="6" strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round" className={color} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-zinc-100">{pct}%</span>
      </div>
      <span className="text-[11px] text-zinc-400 font-medium">{label}</span>
    </div>
  );
}

export default function NutricaoPage() {
  const supabase = createClient();
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [bio, setBio] = useState<BioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeGoal, setActiveGoal] = useState<string>('');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [showMeals, setShowMeals] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: planData }, { data: bioData }] = await Promise.all([
      supabase.from('workout_plans').select('id, schedule_config, goal').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,basal_metabolic_rate_kcal,body_fat_pct,skeletal_muscle_mass_kg,protein_pct,water_pct').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setPlan((planData?.schedule_config as any)?.nutrition ?? null);
    setActiveGoal(planData?.goal ?? '');
    setActivePlanId(planData?.id ?? null);
    setBio(bioData ?? null);
    setLoading(false);
  }

  async function generateNutrition() {
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: activePlanId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar nutrição');
      setPlan(data.nutrition);
      toast.success('Plano nutricional atualizado pelo Treinador Jayme!');
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao gerar plano nutricional');
    } finally {
      setGenerating(false);
    }
  }

  // Computed protein target
  const proteinTarget = bio?.weight_kg && plan?.protein_g_per_kg
    ? Math.round(bio.weight_kg * plan.protein_g_per_kg)
    : null;

  // Estimated TDEE
  const tdee = bio?.basal_metabolic_rate_kcal ? Math.round(bio.basal_metabolic_rate_kcal * 1.45) : null;

  const goalColors: Record<string, string> = {
    weight_loss: 'from-orange-600 to-red-500',
    definition: 'from-blue-600 to-cyan-500',
    hypertrophy: 'from-green-600 to-emerald-500',
    strength: 'from-purple-600 to-violet-500',
  };
  const gradientClass = goalColors[activeGoal] ?? 'from-green-600 to-emerald-500';

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className={cn('rounded-2xl bg-gradient-to-br p-6 text-white shadow-xl', gradientClass)}>
        <div className="flex items-center gap-2 mb-3">
          <Utensils className="h-5 w-5" />
          <span className="text-sm font-semibold opacity-90">Nutrição</span>
          {plan && <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">{plan.strategy}</span>}
        </div>

        {plan ? (
          <div className="flex justify-around mt-2">
            <MacroRing pct={plan.carbs_pct} color="text-yellow-300" label="Carbs" />
            <MacroRing pct={Math.round(plan.protein_g_per_kg * 4)} color="text-blue-300" label="Proteína" />
            <MacroRing pct={plan.fat_pct} color="text-pink-300" label="Gordura" />
          </div>
        ) : (
          <div className="text-center py-4 opacity-60">
            <p className="text-sm">Nenhum plano gerado ainda</p>
            <p className="text-xs mt-1">Clique em "Gerar com IA" abaixo</p>
          </div>
        )}
      </div>

      {/* Generate button */}
      <Button
        onClick={generateNutrition}
        loading={generating}
        className="w-full gap-2"
        variant={plan ? 'outline' : 'default'}
      >
        {generating ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 text-blue-400" />
        )}
        {plan ? 'Regenerar plano nutricional com IA' : 'Gerar plano nutricional com IA'}
      </Button>

      {/* Bio-based targets */}
      {bio && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Proteína alvo', value: proteinTarget ? `${proteinTarget}g/dia` : '—', sub: `${plan?.protein_g_per_kg ?? '2.0'}g × ${bio.weight_kg ?? '?'}kg`, icon: <Zap className="h-4 w-4" />, color: 'text-blue-400' },
            { label: 'TDEE estimado', value: tdee ? `${tdee} kcal` : '—', sub: `TMB ${bio.basal_metabolic_rate_kcal ?? '—'} × 1.45`, icon: <Apple className="h-4 w-4" />, color: 'text-green-400' },
            { label: 'Água corporal', value: bio.water_pct ? `${bio.water_pct}%` : '—', sub: bio.water_pct && bio.water_pct < 50 ? '⚠️ Abaixo do ideal' : 'Normal', icon: <Droplets className="h-4 w-4" />, color: 'text-cyan-400' },
            { label: 'Proteína corporal', value: bio.protein_pct ? `${bio.protein_pct}%` : '—', sub: bio.protein_pct && bio.protein_pct < 17 ? '⚠️ Aumentar ingestão' : 'Normal', icon: <Utensils className="h-4 w-4" />, color: 'text-purple-400' },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className={cn('mb-1', card.color)}>{card.icon}</div>
              <p className="text-lg font-bold text-zinc-100">{card.value}</p>
              <p className="text-xs text-zinc-500">{card.label}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Meal distribution */}
      {plan?.meals && plan.meals.length > 0 && (
        <div className="space-y-3">
          <button
            className="w-full flex items-center justify-between text-sm font-semibold text-zinc-400 uppercase tracking-wide"
            onClick={() => setShowMeals(v => !v)}
          >
            <span>Distribuição de refeições ({plan.meals.length}x/dia)</span>
            {showMeals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showMeals && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
              {plan.meals.map((meal, i) => (
                <div key={i} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-[11px] font-bold">{i + 1}</span>
                      <span className="text-sm font-semibold text-zinc-200">{meal.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="h-3 w-3" />
                      <span>{meal.time}</span>
                      <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-medium">{meal.calories_pct}%</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 ml-7 mb-0.5">{meal.focus}</p>
                  {meal.example && (
                    <p className="text-xs text-zinc-600 ml-7 italic">{meal.example}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timing nutrition */}
      {plan && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Timing nutricional</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
            {[
              { label: 'Pré-treino', value: plan.pre_workout, icon: <Clock className="h-4 w-4 text-yellow-400" />, accent: 'border-l-yellow-500' },
              { label: 'Pós-treino', value: plan.post_workout, icon: <CheckCircle2 className="h-4 w-4 text-green-400" />, accent: 'border-l-green-500' },
              { label: 'Dia de descanso', value: plan.rest_day_strategy, icon: <Apple className="h-4 