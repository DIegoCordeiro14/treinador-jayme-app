'use client';

// Evolution Intelligence Panel — religa a UI da aba Evolução aos motores das
// Fases 1-3 (EvolutionState, matriz Performance×Composição, Muscle Development
// Score, Before/After e cenários de projeção). Fetch determinístico; aditivo.

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Gauge, Target, AlertTriangle, Sparkles, Dumbbell } from 'lucide-react';

interface MetricState { key: string; label: string; changePerWeek: number | null; signal: 'confirmed' | 'possible' | 'noise'; confidence: number; direction: 'up' | 'down' | 'flat'; }
interface EvolutionState {
  goal: string; periodDays: number; headline: string; status: 'positive' | 'attention' | 'insufficient';
  metrics: MetricState[];
  recomposition: { verdict: string; message: string; confidence: string };
  plateau: { isPlateau: boolean; reason: string };
  goalProgress: { score: number; topAdvance: string; topLimiter: string; onTrack: boolean };
  whatChanged: string[]; topAdvance: string; topLimiter: string;
  dataConfidence: { body: number; nutrition: number; nutritionNote: string };
}
interface MuscleScore { muscle_group: string; score: number; is_weak_point: boolean; reason: string; }
interface MatrixResult { quadrant: string; emoji: string; title: string; likelyCauses: string[]; message: string; }
interface ScenarioPoint { day: number; weightKg: number; bfPct: number | null; leanKg: number | null; }
interface Scenarios { scenarios: { scenario: string; points: ScenarioPoint[] }[]; disclaimer: string; }
interface BAMetric { label: string; unit: string; before: number | null; after: number | null; deltaAbs: number | null; direction: string; good: boolean | null; }
interface Payload { state: EvolutionState | null; matrix?: MatrixResult; muscleScores?: MuscleScore[]; scenarios?: Scenarios | null; beforeAfter?: { metrics: BAMetric[]; summary: string } | null; }

const MG_PT: Record<string, string> = { chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', legs: 'Pernas', glutes: 'Glúteos', abs: 'Abdômen', calves: 'Panturrilha', forearms: 'Antebraço', full_body: 'Corpo todo' };
const GOAL_PT: Record<string, string> = { cutting: 'Emagrecimento', hypertrophy: 'Hipertrofia', lean_bulk: 'Lean Bulk', recomposition: 'Recomposição', performance: 'Performance', maintenance: 'Manutenção' };

function DirIcon({ d }: { d: string }) {
  if (d === 'up') return <TrendingUp className="h-3.5 w-3.5 text-[#7FB58F]" />;
  if (d === 'down') return <TrendingDown className="h-3.5 w-3.5 text-[#C97B7B]" />;
  return <Minus className="h-3.5 w-3.5 text-zinc-500" />;
}

export function EvolutionIntelligencePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/evolution-intelligence')
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-40 animate-pulse" />;
  const state = data?.state;
  if (!state || state.status === 'insufficient') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-400">Registre peso/medidas e treinos para desbloquear o painel de inteligência de evolução.</p>
      </div>
    );
  }

  const statusColor = state.status === 'positive' ? '#5A8A6A' : '#A67C3A';
  const statusLabel = state.status === 'positive' ? 'Evolução positiva' : 'Requer atenção';
  const score = state.goalProgress.score;

  return (
    <div className="space-y-3">
      {/* HERO — Seu momento atual */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: statusColor + '55', background: 'linear-gradient(135deg,#12181F,#0D1117)' }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: statusColor }} />
          <span className="text-base font-extrabold italic text-zinc-100">Seu momento atual</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: statusColor + '22', color: statusColor }}>{statusLabel}</span>
        </div>

        <p className="text-[13px] text-zinc-200 leading-relaxed">{state.headline}</p>

        {/* Goal progress score */}
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-zinc-400 flex items-center gap-1"><Target className="h-3.5 w-3.5" />Progresso do objetivo · {GOAL_PT[state.goal] ?? state.goal}</span>
            <span className="font-bold text-zinc-100">{score}/100</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${score}%`, background: statusColor }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5">
            <p className="text-[10px] text-zinc-500">Principal avanço</p>
            <p className="text-[12px] font-semibold text-[#7FB58F]">{state.topAdvance}</p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5">
            <p className="text-[10px] text-zinc-500">Principal limitador</p>
            <p className="text-[12px] font-semibold text-[#D4A85A]">{state.topLimiter}</p>
          </div>
        </div>

        {/* O que mudou */}
        {state.whatChanged.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {state.whatChanged.map((w, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">{w}</span>
            ))}
          </div>
        )}

        {/* Recomposição / platô */}
        {state.recomposition.verdict === 'recomposition' && (
          <p className="text-[11px] text-[#7FB58F] flex items-start gap-1"><Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />{state.recomposition.message}</p>
        )}
        {state.plateau.isPlateau && (
          <p className="text-[11px] text-[#D4A85A] flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{state.plateau.reason}</p>
        )}

        {/* Confiança dos dados */}
        <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/60">
          <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />Confiança corpo: <b className="text-zinc-300">{state.dataConfidence.body}%</b></span>
          <span className="text-[10px] text-zinc-500">Nutrição: <b className="text-zinc-300">{state.dataConfidence.nutrition}%</b></span>
        </div>
      </div>

      {/* Matriz Performance × Composição */}
      {data?.matrix && data.matrix.quadrant !== 'neutral' && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-1.5">
          <p className="text-[13px] font-bold text-zinc-100">{data.matrix.emoji} Performance × Composição: {data.matrix.title}</p>
          <p className="text-[12px] text-zinc-400">{data.matrix.message}</p>
          {data.matrix.likelyCauses.length > 0 && (
            <p className="text-[11px] text-zinc-500">Prováveis causas: {data.matrix.likelyCauses.join(' · ')}</p>
          )}
        </div>
      )}

      {/* Muscle Development Score */}
      {data?.muscleScores && data.muscleScores.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><Dumbbell className="h-4 w-4 text-[#D4853A]" />Desenvolvimento muscular</p>
          <div className="space-y-1.5">
            {data.muscleScores.map((m) => (
              <div key={m.muscle_group} className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 w-20 shrink-0">{MG_PT[m.muscle_group] ?? m.muscle_group}</span>
                <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.score}%`, background: m.is_weak_point ? '#C97B7B' : '#5A8A6A' }} />
                </div>
                <span className={`text-[11px] font-bold w-8 text-right ${m.is_weak_point ? 'text-[#C97B7B]' : 'text-zinc-300'}`}>{m.score}</span>
                {m.is_weak_point && <AlertTriangle className="h-3.5 w-3.5 text-[#C97B7B] shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Before / After */}
      {data?.beforeAfter && data.beforeAfter.metrics.some((m) => m.deltaAbs != null) && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100">Antes vs Depois</p>
          <div className="grid grid-cols-3 gap-2">
            {data.beforeAfter.metrics.filter((m) => m.deltaAbs != null).map((m) => (
              <div key={m.label} className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center">
                <p className="text-[10px] text-zinc-500">{m.label}</p>
                <p className="text-[12px] text-zinc-300">{m.before} → <b className="text-zinc-100">{m.after}{m.unit}</b></p>
                <p className={`text-[11px] font-semibold flex items-center justify-center gap-0.5 ${m.good ? 'text-[#7FB58F]' : m.good === false ? 'text-[#C97B7B]' : 'text-zinc-500'}`}>
                  <DirIcon d={m.direction} />{m.deltaAbs! > 0 ? '+' : ''}{m.deltaAbs}{m.unit}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cenários de projeção */}
      {data?.scenarios && data.scenarios.scenarios.length === 3 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100">Projeção de peso (90 dias)</p>
          <div className="grid grid-cols-3 gap-2">
            {data.scenarios.scenarios.map((s) => {
              const pt = s.points.find((p) => p.day === 90) ?? s.points[s.points.length - 1];
              const label = s.scenario === 'conservative' ? 'Conservador' : s.scenario === 'optimistic' ? 'Otimista' : 'Esperado';
              return (
                <div key={s.scenario} className={`rounded-xl border p-2.5 text-center ${s.scenario === 'expected' ? 'border-[#D4853A]/40 bg-[#D4853A]/5' : 'border-zinc-800 bg-zinc-900/60'}`}>
                  <p className="text-[10px] text-zinc-500">{label}</p>
                  <p className="text-[14px] font-bold text-zinc-100">{pt.weightKg}kg</p>
                  {pt.bfPct != null && <p className="text-[10px] text-zinc-500">{pt.bfPct}% BF</p>}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-600">{data.scenarios.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
