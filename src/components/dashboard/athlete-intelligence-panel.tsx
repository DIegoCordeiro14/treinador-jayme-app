'use client';

import { useAthleteState } from '@/hooks/useAthleteState';
import { buildEdnBreakdown } from '@/lib/edn/gamification';
import { Bot, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap, Dumbbell, Utensils, Activity, Heart, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// ── EDN Score 360° ─────────────────────────────────────────────────────────────
function ScoreBar({ label, score, icon, color }: { label: string; score: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-zinc-400">
          <span className={cn('opacity-70', color)}>{icon}</span>
          {label}
        </span>
        <span className={cn('font-bold tabular-nums', score >= 80 ? 'text-green-400' : score >= 55 ? 'text-yellow-400' : 'text-red-400')}>
          {score}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700',
            score >= 80 ? 'bg-green-500' : score >= 55 ? 'bg-yellow-500' : 'bg-red-500'
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ── Proactive Briefing ─────────────────────────────────────────────────────────
function ProactiveBriefing({ name }: { name?: string }) {
  const { state, loading } = useAthleteState();

  if (loading) {
    return (
      <div className="rounded-xl border border-[#D4853A]/20 bg-[#D4853A]/5 p-4 space-y-2">
        <div className="h-4 bg-zinc-800 rounded animate-pulse w-1/3" />
        <div className="h-3 bg-zinc-800 rounded animate-pulse w-full" />
        <div className="h-3 bg-zinc-800 rounded animate-pulse w-4/5" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-xl border border-[#D4853A]/20 bg-[#D4853A]/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bot className="h-4 w-4 text-[#D4853A]" />
          <p className="text-sm font-semibold text-zinc-100">Recomendação do dia</p>
        </div>
        <p className="text-sm text-zinc-400">
          Comece registrando seus treinos e peso para receber recomendações personalizadas.
        </p>
      </div>
    );
  }

  const r = state.raw;
  const score = state.edn_score;

  // Dynamic highlights
  const highlights: string[] = [];

  const neverTrained = r.days_since_last_workout >= 100;
  if (r.days_since_last_workout === 0) {
    highlights.push('✅ Treino registrado hoje — foco em recuperação e hidratação.');
  } else if (neverTrained) {
    highlights.push('💪 Nenhum treino registrado ainda — seu plano está pronto. Comece hoje!');
  } else if (r.days_since_last_workout >= 3) {
    highlights.push(`⚠️ ${r.days_since_last_workout} dias sem treinar — hora de retomar.`);
  } else {
    highlights.push(`🔥 Último treino: há ${r.days_since_last_workout} dia(s).`);
  }

  if (r.weight_trend_14d !== null) {
    const delta = r.weight_trend_14d;
    if (delta < -0.3) highlights.push(`📉 Peso caiu ${Math.abs(delta).toFixed(1)}kg em 14 dias — déficit no alvo.`);
    else if (delta > 0.3) highlights.push(`📈 Peso subiu ${delta.toFixed(1)}kg em 14 dias.`);
    else highlights.push(`⚖️ Peso estável (±${Math.abs(delta).toFixed(1)}kg) nos últimos 14 dias.`);
  }

  if (r.plateau_detected) {
    highlights.push('🔄 Platô de peso detectado — considere refeed ou ajuste de déficit.');
  }

  if (r.protein_days_below_target >= 4) {
    highlights.push(`🥩 Proteína abaixo da meta em ${r.protein_days_below_target} dias — o principal limitador da sua evolução.`);
  }

  // Weak factor
  const subScores = {
    'Consistência': Math.min(100, Math.round((r.sessions_last_28 / Math.max(1, r.planned_sessions_last_28)) * 100)),
    'Nutrição': Math.max(20, Math.round(((28 - r.protein_days_below_target) / 28) * 80)),
    'Cárdio': state.cardio_load,
    'Recuperação': state.recovery_score,
    'Progressão': state.progression_score,
  };
  const [weakLabel, weakScore] = Object.entries(subScores).sort((a, b) => a[1] - b[1])[0];
  if (weakScore < 60 && !highlights.some(h => h.includes(weakLabel))) {
    highlights.push(`📊 Fator que mais limita seu Score ${score}/100: ${weakLabel} (${weakScore}/100).`);
  }

  return (
    <div className="rounded-xl border border-[#D4853A]/20 bg-[#D4853A]/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#D4853A]/20">
            <Brain className="h-4 w-4 text-[#D4853A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Coach EDN</p>
            <p className="text-[10px] text-zinc-500">Análise do dia</p>
          </div>
        </div>
        <Link href="/app/ia" className="text-xs text-[#D4853A] hover:text-[#E09B5A] transition-colors">
          Conversar →
        </Link>
      </div>

      <div className="space-y-1.5">
        {highlights.slice(0, 3).map((h, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: h.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>') }} />
        ))}
      </div>

      {r.plateau_detected && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">Platô ativo — <Link href="/app/evolucao" className="underline">ver análise completa</Link></p>
        </div>
      )}
    </div>
  );
}

// ── EDN Score 360° Panel ───────────────────────────────────────────────────────
function EdnScore360() {
  const { state, loading } = useAthleteState();

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="h-4 bg-zinc-800 rounded animate-pulse w-1/4" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-3 bg-zinc-800 rounded animate-pulse" />)}
      </div>
    );
  }

  if (!state) return null;

  const breakdown = buildEdnBreakdown(
    Math.min(100, Math.round((state.raw.sessions_last_28 / Math.max(1, state.raw.planned_sessions_last_28)) * 100)),
    state.progression_score,
    state.nutrition_adherence,
    state.cardio_load,
    state.recovery_score,
  );

  const SCORE_ITEMS = [
    { key: 'consistency' as const, icon: <Zap className="h-3 w-3" />,       color: 'text-yellow-400' },
    { key: 'progression' as const, icon: <TrendingUp className="h-3 w-3" />, color: 'text-[#D4853A]' },
    { key: 'nutrition'   as const, icon: <Utensils className="h-3 w-3" />,   color: 'text-green-400' },
    { key: 'cardio'      as const, icon: <Activity className="h-3 w-3" />,    color: 'text-orange-400' },
    { key: 'recovery'    as const, icon: <Heart className="h-3 w-3" />,       color: 'text-red-400' },
  ];

  const LEAGUE_EMOJI: Record<string, string> = {
    bronze: '🥉', prata: '🥈', ouro: '🥇', platina: '💎', diamante: '🔷', elite: '👑',
  };

  const trendIcon = state.raw.weight_trend_14d !== null
    ? (state.raw.weight_trend_14d < -0.2 ? <TrendingDown className="h-3.5 w-3.5 text-green-400" />
       : state.raw.weight_trend_14d > 0.2 ? <TrendingUp className="h-3.5 w-3.5 text-[#D4853A]" />
       : <Minus className="h-3.5 w-3.5 text-zinc-500" />)
    : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Score EDN 360°</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-2xl font-black text-zinc-100">{breakdown.total}</span>
            <span className="text-xs text-zinc-500">/100</span>
            <span className="text-lg">{LEAGUE_EMOJI[breakdown.league] ?? '🏅'}</span>
            {trendIcon && <span className="ml-1">{trendIcon}</span>}
          </div>
        </div>
        <Link href="/app/conquistas" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Liga →
        </Link>
      </div>

      {/* 5 sub-scores */}
      <div className="space-y-2.5">
        {SCORE_ITEMS.map(({ key, icon, color }) => {
          const comp = breakdown.components[key];
          return (
            <ScoreBar
              key={key}
              label={comp.label}
              score={comp.score}
              icon={icon}
              color={color}
            />
          );
        })}
      </div>

      {/* Next league progress */}
      {breakdown.nextLeague && (
        <p className="text-[10px] text-zinc-600 text-center">
          +{breakdown.pointsToNext} pontos para {breakdown.nextLeague.label}
        </p>
      )}
    </div>
  );
}

// ── Main export (composed panel) ──────────────────────────────────────────────
export function AthleteIntelligencePanel({ name: _name }: { name?: string }) {
  // ProactiveBriefing foi unificado no DailyBriefingPanel ("Briefing Diário · Coach EDN")
  return <EdnScore360 />;
}
