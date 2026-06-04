'use client';
import { useState } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReduceCaloriesCard, AddHiitCard, ApplyDeloadCard } from '@/components/ui/action-card';

interface ProjectionCompareProps {
  currentWeightKg: number | null;
  currentBfPct: number | null;
  currentMuscleKg: number | null;
  weeklyWeightDeltaKg: number | null;
  bodyFatPct: number | null;
  plateauDetected: boolean;
  deloadRecommended: boolean;
  cardioKmWeekly: number;
}

const HORIZONS = [30, 60, 90] as const;
const HORIZON_LABELS: Record<number, string> = { 30: '1 mês', 60: '2 meses', 90: '3 meses' };

function projectWeight(kg: number, weeklyDelta: number, weeks: number, factor = 1) {
  return parseFloat((kg + weeklyDelta * weeks * factor).toFixed(1));
}

export function ProjectionCompare({ currentWeightKg, currentBfPct, weeklyWeightDeltaKg, plateauDetected, deloadRecommended, cardioKmWeekly }: ProjectionCompareProps) {
  const [hz, setHz] = useState<30|60|90>(90);
  const [applied, setApplied] = useState<string | null>(null);

  if (!currentWeightKg) {
    return <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center"><p className="text-sm text-zinc-500">Registre seu peso para ver projeções comparativas.</p></div>;
  }

  const weeks = hz / 7;
  const weekly = weeklyWeightDeltaKg ?? 0;
  const current = projectWeight(currentWeightKg, weekly, weeks);

  const scenarios: { label: string; projected: number; desc: string; type: string }[] = [];
  if (plateauDetected) scenarios.push({ label: 'Reduzir 150kcal/dia', projected: projectWeight(currentWeightKg, weekly - 0.15, weeks), desc: 'Retoma perda de ~0.15kg/semana.', type: 'reduce_calories' });
  if (cardioKmWeekly < 15) scenarios.push({ label: '+2 sessões HIIT/semana', projected: projectWeight(currentWeightKg, weekly - 0.25, weeks), desc: 'HIIT 20-25min adiciona ~250kcal de gasto.', type: 'add_cardio_goal' });
  if (deloadRecommended) scenarios.push({ label: 'Aplicar deload agora', projected: projectWeight(currentWeightKg, weekly, weeks, 1.15), desc: 'Supercompensação → próximas 4 semanas mais produtivas.', type: 'apply_deload' });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {HORIZONS.map(h => (
          <button key={h} onClick={() => setHz(h)} className={cn('flex-1 text-xs py-1.5 rounded-lg border transition-colors font-medium', hz === h ? 'border-[#D4853A]/50 bg-[#D4853A]/15 text-[#E09B5A]' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700')}>{HORIZON_LABELS[h]}</button>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Trajetória atual — sem ajustes</p>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-black text-zinc-100">{current}kg</span>
          <span className="text-sm text-zinc-500 mb-0.5">em {hz} dias</span>
          {weekly < -0.05 ? <TrendingDown className="h-4 w-4 text-green-400 mb-0.5" /> : weekly > 0.05 ? <TrendingUp className="h-4 w-4 text-[#D4853A] mb-0.5" /> : <Minus className="h-4 w-4 text-zinc-500 mb-0.5" />}
        </div>
        {currentBfPct && <p className="text-xs text-zinc-500 mt-0.5">BF estimado: ~{Math.max(5, currentBfPct + (weekly < 0 ? weekly * weeks * 0.6 : weekly * weeks * 0.4)).toFixed(1)}%</p>}
      </div>

      {scenarios.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Com ajustes recomendados</p>
          {scenarios.map((sc, i) => {
            const delta = sc.projected - current;
            const better = delta < 0;
            if (applied === sc.type) return <div key={i} className="rounded-xl border border-green-600/30 bg-green-600/5 p-4"><p className="text-sm text-green-300">✅ {sc.label} — ação aplicada.</p></div>;
            return (
              <div key={i} className={cn('rounded-xl border p-4 space-y-3', better ? 'border-green-600/25 bg-green-600/5' : 'border-[#D4853A]/20 bg-[#D4853A]/5')}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-100">{sc.label}</p>
                  <span className={cn('text-sm font-bold', better ? 'text-green-400' : 'text-[#D4853A]')}>{sc.projected}kg</span>
                </div>
                {better && <p className="text-xs text-green-300">{Math.abs(delta).toFixed(1)}kg a menos vs trajetória atual em {hz} dias</p>}
                <p className="text-xs text-zinc-400">{sc.desc}</p>
                {sc.type === 'reduce_calories' && <ReduceCaloriesCard onApplied={() => setApplied(sc.type)} />}
                {sc.type === 'apply_deload' && <ApplyDeloadCard onApplied={() => setApplied(sc.type)} />}
                {sc.type === 'add_cardio_goal' && <AddHiitCard onApplied={() => setApplied(sc.type)} />}
              </div>
            );
          })}
        </div>
      )}

      {scenarios.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
          <p className="text-sm text-green-300">✅ Trajetória saudável. Continue o plano atual.</p>
        </div>
      )}
    </div>
  );
}
