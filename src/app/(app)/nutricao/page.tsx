'use client';

import { useEffect, useState } from 'react';
import { Utensils, Apple, Zap, Droplets, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface NutritionPlan {
  strategy: string;
  daily_calories: string;
  protein_g_per_kg: number;
  carbs_pct: number;
  fat_pct: number;
  pre_workout: string;
  post_workout: string;
  rest_day_strategy: string;
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
  const [activeGoal, setActiveGoal] = useState<string>('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: planData }, { data: bioData }] = await Promise.all([
      supabase.from('workout_plans').select('schedule_config, goal').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,basal_metabolic_rate_kcal,body_fat_pct,skeletal_muscle_mass_kg,protein_pct,water_pct').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setPlan((planData?.schedule_config as any)?.nutrition ?? null);
    setActiveGoal(planData?.goal ?? '');
    setBio(bioData ?? null);
    setLoading(false);
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
      {/* Strava-style header */}
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
            <p className="text-xs mt-1">Vá ao Calendário → Programar treinos</p>
          </div>
        )}
      </div>

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

      {/* Timing nutrition */}
      {plan && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Timing nutricional</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
            {[
              { label: 'Pré-treino', value: plan.pre_workout, icon: <Clock className="h-4 w-4 text-yellow-400" />, accent: 'border-l-yellow-500' },
              { label: 'Pós-treino', value: plan.post_workout, icon: <CheckCircle2 className="h-4 w-4 text-green-400" />, accent: 'border-l-green-500' },
              { label: 'Dia de descanso', value: plan.rest_day_strategy, icon: <Apple className="h-4 w-4 text-blue-400" />, accent: 'border-l-blue-500' },
            ].map(item => (
              <div key={item.label} className={cn('flex gap-3 px-4 py-3.5 border-l-2', item.accent)}>
                <div className="shrink-0 mt-0.5">{item.icon}</div>
                <div>
                  <p className="text-xs font-semibold text-zinc-300 mb-0.5">{item.label}</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Macro breakdown */}
      {plan && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Macros diários</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Calorias diárias</span>
              <span className="text-zinc-200 font-medium">{plan.daily_calories}</span>
            </div>
            {[
              { label: 'Carboidratos', pct: plan.carbs_pct, color: 'bg-yellow-500', kcal: tdee ? Math.round(tdee * plan.carbs_pct / 400) : null, unit: 'g' },
              { label: 'Proteínas', pct: Math.round(plan.protein_g_per_kg * 4), color: 'bg-blue-500', kcal: proteinTarget, unit: 'g' },
              { label: 'Gorduras', pct: plan.fat_pct, color: 'bg-pink-500', kcal: tdee ? Math.round(tdee * plan.fat_pct / 900) : null, unit: 'g' },
            ].map(macro => (
              <div key={macro.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{macro.label}</span>
                  <span className="text-zinc-300">{macro.pct}%{macro.kcal ? ` · ~${macro.kcal}${macro.unit}` : ''}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', macro.color)} style={{ width: `${Math.min(macro.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key tips */}
      {plan != null && (plan.key_tips?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Dicas do Jayme</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            {(plan?.key_tips ?? []).map((tip, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-[11px] font-bold">{i + 1}</div>
                <p className="text-xs text-zinc-300 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!plan && !loading && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
          <Sparkles className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 mb-1">Nenhum plano nutricional gerado</p>
          <p className="text-xs text-zinc-600">Vá ao Calendário → Programar treinos para o Jayme criar sua estratégia nutricional</p>
        </div>
      )}
    </div>
  );
}
