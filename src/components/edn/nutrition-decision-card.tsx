'use client';

// Card "Decisão nutricional" — consome decision + nutritionState + conditionAdjustment
// do /api/autopilot (diagnóstico ÚNICO e determinístico). A IA não decide aqui.

import { CheckCircle2, AlertTriangle, Info, Gauge, ArrowRight } from 'lucide-react';

interface Decision {
  state: string; confidence: number;
  primarySignal: { level: 'positivo' | 'info' | 'atencao'; title: string; message: string };
  limitingFactor: string | null; recommendedAction: string; adjustmentAllowed: boolean;
}
interface NutritionState {
  calorieBalance: string; proteinStatus: string; carbStatus: string;
  adherence: number | null; metabolicConfidence: number | null; primaryRisk: string | null; nextAction: string;
}
interface ConditionAdj { trainingReduced: boolean; note: string; }

const BALANCE_PT: Record<string, string> = {
  strong_deficit: 'Déficit forte', moderate_deficit: 'Déficit moderado', maintenance: 'Manutenção',
  moderate_surplus: 'Superávit moderado', strong_surplus: 'Superávit forte', unknown: '—',
};
const RISK_PT: Record<string, string> = { nutrition: 'Nutrição', training: 'Treino', recovery: 'Recuperação', cardio: 'Cardio', adherence: 'Aderência' };
const ACTION_PT: Record<string, string> = {
  maintain_calories: 'Manter calorias', maintain_calories_improve_carb_timing: 'Manter calorias e melhorar o timing de carboidratos',
  improve_logging_adherence: 'Melhorar a aderência ao registro', prioritize_recovery: 'Priorizar recuperação',
  recalculate_energy_targets: 'Recalcular as metas de energia', reduce_calorie_deficit: 'Reduzir o déficit calórico',
  reduce_calorie_surplus: 'Reduzir o superávit', collect_more_data: 'Coletar mais dados',
};

export function NutritionDecisionCard({ decision, state, condition }: { decision: Decision | null; state: NutritionState | null; condition: ConditionAdj | null }) {
  if (!decision) return null;
  const lvl = decision.primarySignal.level;
  const color = lvl === 'positivo' ? '#5A8A6A' : lvl === 'atencao' ? '#A67C3A' : '#607D8B';
  const Icon = lvl === 'positivo' ? CheckCircle2 : lvl === 'atencao' ? AlertTriangle : Info;

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: color + '55', background: 'linear-gradient(135deg,#12181F,#0D1117)' }}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5" style={{ color }} />
        <span className="text-base font-extrabold italic text-zinc-100">Decisão nutricional</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: color + '22', color }}>{decision.primarySignal.title}</span>
      </div>
      <p className="text-[13px] text-zinc-200 leading-relaxed">{decision.primarySignal.message}</p>

      {state && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5">
            <p className="text-[10px] text-zinc-500">Balanço calórico</p>
            <p className="text-[12px] font-semibold text-zinc-200">{BALANCE_PT[state.calorieBalance] ?? state.calorieBalance}</p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5">
            <p className="text-[10px] text-zinc-500">Principal limitador</p>
            <p className="text-[12px] font-semibold text-[#D4A85A]">{decision.limitingFactor ? (RISK_PT[decision.limitingFactor] ?? decision.limitingFactor) : '—'}</p>
          </div>
        </div>
      )}

      <p className="text-[12px] text-[#D4853A] font-semibold flex items-start gap-1">
        <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Próxima ação: {state ? (ACTION_PT[state.nextAction] ?? state.nextAction) : ACTION_PT[decision.recommendedAction] ?? decision.recommendedAction}
      </p>

      {condition?.trainingReduced && (
        <p className="text-[11px] text-[#C9A05A] flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{condition.note}</p>
      )}

      <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/60">
        <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />Confiança do diagnóstico: <b className="text-zinc-300">{Math.round(decision.confidence * 100)}%</b></span>
        {!decision.adjustmentAllowed && <span className="text-[10px] text-zinc-600">Sem ajuste sugerido ainda</span>}
      </div>
    </div>
  );
}
