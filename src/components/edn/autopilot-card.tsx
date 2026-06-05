'use client';
/**
 * Autopilot Card — V6.5 Pilares 6 e 7
 * Componente compartilhado que consome /api/autopilot e exibe, nas três
 * camadas (DADOS → INTERPRETAÇÃO → PRESCRIÇÃO):
 *  - mode="nutrition": TDEE, calorias-alvo, macros e água recalculados
 *    automaticamente da bioimpedância mais recente (e persistidos no perfil)
 *  - mode="cardio": prescrição semanal progressiva por fase, ajustada
 *    pela recuperação atual
 */
import { useEffect, useState } from 'react';
import { Sparkles, Flame, Beef, Wheat, Droplets, HeartPulse, Loader2, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NutritionTargets {
  tmbKcal: number;
  tdeeKcal: number;
  activityFactor: number;
  targetKcal: number;
  goalAdjustmentKcal: number;
  proteinG: number;
  proteinGPerKg: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  source: string;
  explanation: string[];
}

interface CardioPrescription {
  sessionsPerWeek: number;
  minutesPerSession: number;
  intensity: string;
  weeklyTargetKm: number;
  phaseLabel: string;
  explanation: string[];
  adjustedForRecovery: boolean;
}

interface AutopilotResponse {
  nutrition: NutritionTargets | null;
  cardio: CardioPrescription | null;
  recovery?: { score: number; category: string } | null;
  persisted?: boolean;
  bioUsed?: boolean;
  bioMeasuredAt?: string | null;
  error?: string;
  message?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  bioimpedance_tmb: 'TMB medida pela bioimpedância',
  katch_mcardle: 'Katch-McArdle (massa magra da bioimpedância)',
  mifflin: 'Mifflin-St Jeor (sem bioimpedância)',
};

const INTENSITY_LABELS: Record<string, string> = {
  zona2: 'Zona 2 (conversação confortável)',
  zona2_3: 'Zona 2-3 (ritmo moderado)',
  intervalado_leve: 'Intervalado leve',
};

export function AutopilotCard({ mode, embedded = false }: { mode: 'nutrition' | 'cardio'; embedded?: boolean }) {
  const [data, setData] = useState<AutopilotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    fetch('/api/autopilot')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center gap-2 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Autopilot EDN recalculando…</span>
      </div>
    );
  }

  if (!data || data.error === 'profile_incomplete') {
    return (
      <div className="rounded-xl border border-amber-600/30 bg-amber-600/5 p-4">
        <p className="text-xs text-amber-300 font-semibold">Autopilot EDN indisponível</p>
        <p className="text-xs text-zinc-400 mt-1">{data?.message ?? 'Complete sua anamnese (mínimo 80%) no perfil para liberar a prescrição automática.'}</p>
      </div>
    );
  }

  const explanation = mode === 'nutrition' ? (data.nutrition?.explanation ?? []) : (data.cardio?.explanation ?? []);

  return (
    <div className={embedded ? "space-y-3" : "rounded-xl border border-[#D4853A]/25 bg-[#D4853A]/5 p-4 space-y-3"}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#D4853A] shrink-0" />
          <p className="text-sm font-bold text-[#E09B5A]">
            {mode === 'nutrition' ? 'Nutrição Autônoma EDN' : 'Cardio Autônomo EDN'}
          </p>
        </div>
        {mode === 'nutrition' && data.nutrition && (
          <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full shrink-0">
            {SOURCE_LABELS[data.nutrition.source] ?? data.nutrition.source}
          </span>
        )}
        {mode === 'cardio' && data.cardio && (
          <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full shrink-0">
            {data.cardio.phaseLabel}
          </span>
        )}
      </div>

      {/* ── Nutrição (Pilar 6) ── */}
      {mode === 'nutrition' && data.nutrition && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Calorias-alvo', value: `${data.nutrition.targetKcal}`, unit: 'kcal', icon: <Flame className="h-3.5 w-3.5" />, color: 'text-orange-400' },
              { label: `Proteína (${data.nutrition.proteinGPerKg}g/kg)`, value: `${data.nutrition.proteinG}`, unit: 'g', icon: <Beef className="h-3.5 w-3.5" />, color: 'text-red-400' },
              { label: 'Carboidratos', value: `${data.nutrition.carbsG}`, unit: 'g', icon: <Wheat className="h-3.5 w-3.5" />, color: 'text-yellow-400' },
              { label: 'Água', value: `${(data.nutrition.waterMl / 1000).toFixed(1)}`, unit: 'L', icon: <Droplets className="h-3.5 w-3.5" />, color: 'text-blue-400' },
            ].map(m => (
              <div key={m.label} className="rounded-lg bg-zinc-900/80 border border-zinc-800 p-2.5 text-center">
                <div className={cn('flex justify-center mb-1', m.color)}>{m.icon}</div>
                <p className={cn('text-base font-black leading-none', m.color)}>{m.value}<span className="text-[10px] font-semibold ml-0.5">{m.unit}</span></p>
                <p className="text-[9px] text-zinc-500 mt-1 leading-tight">{m.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-400">
            TMB {data.nutrition.tmbKcal}kcal · TDEE {data.nutrition.tdeeKcal}kcal (×{data.nutrition.activityFactor}) ·{' '}
            {data.nutrition.goalAdjustmentKcal === 0 ? 'manutenção' : `${data.nutrition.goalAdjustmentKcal > 0 ? '+' : ''}${data.nutrition.goalAdjustmentKcal}kcal pelo objetivo`}
            {data.persisted ? ' · alvos atualizados no seu perfil automaticamente' : ''}
          </p>
        </>
      )}

      {/* ── Cardio (Pilar 7) ── */}
      {mode === 'cardio' && data.cardio && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Sessões/semana', value: `${data.cardio.sessionsPerWeek}x`, icon: <HeartPulse className="h-3.5 w-3.5" />, color: 'text-red-400' },
              { label: 'Duração', value: `${data.cardio.minutesPerSession}min`, icon: <Activity className="h-3.5 w-3.5" />, color: 'text-blue-400' },
              { label: 'Meta semanal', value: `${data.cardio.weeklyTargetKm}km`, icon: <Flame className="h-3.5 w-3.5" />, color: 'text-orange-400' },
            ].map(m => (
              <div key={m.label} className="rounded-lg bg-zinc-900/80 border border-zinc-800 p-2.5 text-center">
                <div className={cn('flex justify-center mb-1', m.color)}>{m.icon}</div>
                <p className={cn('text-base font-black leading-none', m.color)}>{m.value}</p>
                <p className="text-[9px] text-zinc-500 mt-1 leading-tight">{m.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-400">
            Intensidade: {INTENSITY_LABELS[data.cardio.intensity] ?? data.cardio.intensity}
            {data.cardio.adjustedForRecovery ? ' · reduzido nesta semana pela recuperação' : ''}
            {data.recovery ? ` · prontidão ${data.recovery.score}/100` : ''}
          </p>
        </>
      )}

      {/* ── Camada 2: por quê? ── */}
      {explanation.length > 0 && (
        <div>
          <button onClick={() => setShowWhy(v => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors">
            {showWhy ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Como o Coach chegou nesses números?
          </button>
          {showWhy && (
            <ul className="mt-2 space-y-1.5 border-l-2 border-zinc-800 pl-3">
              {explanation.map((e, i) => (
                <li key={i} className="text-[11px] text-zinc-400 leading-relaxed">{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default AutopilotCard;
