'use client';

import { useState } from 'react';
import { useAthleteState } from '@/hooks/useAthleteState';
import {
  Database, Brain, Target, ChevronDown, Dumbbell, Utensils,
  Activity, Heart, TrendingDown, TrendingUp, Minus, Gauge, AlertTriangle, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const RECOVERY_LABEL: Record<string, string> = {
  excellent: 'Excelente', good: 'Boa', moderate: 'Moderada', low: 'Baixa', critical: 'Crítica',
};

function LayerHeader({ n, title, subtitle, icon, color }: {
  n: number; title: string; subtitle: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', color)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Camada {n}</p>
        <p className="text-sm font-extrabold italic text-zinc-100 leading-tight">{title}</p>
      </div>
      <p className="ml-auto text-[10px] text-zinc-600 text-right hidden sm:block max-w-[40%]">{subtitle}</p>
    </div>
  );
}

export function ThreeLayerPanel() {
  const { state, loading } = useAthleteState();
  const [open, setOpen] = useState(true);

  if (loading) {
    return (
      <div className="rounded-2xl card-gradient p-5 space-y-3">
        <div className="h-4 w-1/3 rounded bg-zinc-800 animate-pulse" />
        <div className="h-20 rounded bg-zinc-800/60 animate-pulse" />
      </div>
    );
  }
  if (!state) return null;

  const r = state.raw;
  const rec = state.recovery_state;

  const dataPoints: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: 'Treinos (28d)', value: `${r.sessions_last_28}/${r.planned_sessions_last_28}`, icon: <Dumbbell className="h-3.5 w-3.5" /> },
    { label: 'PR (4 sem)', value: r.has_pr_last_4_weeks ? 'Sim' : 'Não', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { label: 'RIR médio', value: r.avg_rir != null ? r.avg_rir.toFixed(1) : '—', icon: <Gauge className="h-3.5 w-3.5" /> },
    { label: 'Proteína < meta', value: `${r.protein_days_below_target}d`, icon: <Utensils className="h-3.5 w-3.5" /> },
    { label: 'Cárdio semana', value: `${r.cardio_km_this_week.toFixed(1)}/${r.cardio_goal_km} km`, icon: <Activity className="h-3.5 w-3.5" /> },
    { label: 'Prontidão', value: `${rec.score}/100`, icon: <Heart className="h-3.5 w-3.5" /> },
  ];
  if (r.weight_trend_14d != null) {
    dataPoints.push({
      label: 'Peso (14d)',
      value: `${r.weight_trend_14d > 0 ? '+' : ''}${r.weight_trend_14d.toFixed(1)} kg`,
      icon: r.weight_trend_14d < -0.2 ? <TrendingDown className="h-3.5 w-3.5" /> : r.weight_trend_14d > 0.2 ? <TrendingUp className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />,
    });
  }

  const interpretations: { text: string; tone: 'danger' | 'warning' | 'info' }[] = [
    ...state.alerts.map((a) => ({ text: a.message, tone: a.type })),
    ...rec.factors.map((f) => ({ text: f, tone: 'info' as const })),
  ];
  if (interpretations.length === 0) {
    interpretations.push({ text: `Prontidão ${RECOVERY_LABEL[rec.category] ?? rec.category} (${rec.score}/100) — sem alertas no momento.`, tone: 'info' });
  }

  const prescriptions = state.recommendations.length > 0
    ? state.recommendations
    : ['Registre treinos, peso e nutrição para receber prescrições personalizadas do Coach EDN.'];

  const toneStyle = (t: 'danger' | 'warning' | 'info') =>
    t === 'danger' ? 'text-[#B07A7A]' : t === 'warning' ? 'text-[#C49A5A]' : 'text-[#8FA3AD]';
  const toneIcon = (t: 'danger' | 'warning' | 'info') =>
    t === 'info' ? <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />;

  return (
    <div className="rounded-2xl card-gradient overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-5 text-left">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4853A]/15 shrink-0">
          <Brain className="h-5 w-5 text-[#D4853A]" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Inteligência EDN</p>
          <p className="text-base font-extrabold italic text-zinc-100 leading-tight">Dados → Interpretação → Prescrição</p>
        </div>
        <ChevronDown className={cn('ml-auto h-5 w-5 text-zinc-500 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div className="rounded-xl bg-[#0D1520] border border-white/[0.06] p-4">
            <LayerHeader n={1} title="Dados" subtitle="O que medimos" icon={<Database className="h-4 w-4 text-[#8FA3AD]" />} color="bg-white/[0.05]" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3.5">
              {dataPoints.map((d) => (
                <div key={d.label} className="rounded-lg bg-black/20 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-zinc-500 mb-1">{d.icon}<span className="text-[10px] uppercase tracking-wide truncate">{d.label}</span></div>
                  <p className="text-base font-black text-zinc-100 leading-none">{d.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-zinc-700" /></div>

          <div className="rounded-xl bg-[#0D1520] border border-white/[0.06] p-4">
            <LayerHeader n={2} title="Interpretação" subtitle="O que isso significa" icon={<Brain className="h-4 w-4 text-[#A67C3A]" />} color="bg-[#A67C3A]/15" />
            <div className="space-y-2 mt-3.5">
              {interpretations.slice(0, 5).map((it, i) => (
                <div key={i} className={cn('flex items-start gap-2 text-xs leading-relaxed', toneStyle(it.tone))}>
                  {toneIcon(it.tone)}<span className="text-zinc-300">{it.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-zinc-700" /></div>

          <div className="rounded-xl bg-[#D4853A]/[0.06] border border-[#D4853A]/20 p-4">
            <LayerHeader n={3} title="Prescrição" subtitle="O que fazer" icon={<Target className="h-4 w-4 text-[#D4853A]" />} color="bg-[#D4853A]/15" />
            <div className="space-y-2 mt-3.5">
              {prescriptions.slice(0, 3).map((p, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#D4853A] text-[10px] font-black text-white shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-zinc-200 leading-relaxed">{p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
