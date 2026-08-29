'use client';

// Cardio OS — cards da fonte única: plano adaptativo, diagnóstico único, forecast
// e safety planner. Consome o objeto de /api/cardio-intelligence (determinístico).

import { Target, Activity, Gauge, Shield, TrendingUp, GitMerge } from 'lucide-react';

interface AdaptiveGoal { min: number; ideal: number; safetyLimit: number; }
interface Plan {
  phase: string; phaseLabel: string; sessionsPerWeek: number; minutesPerSession: number;
  intensityDistribution: { z2Pct: number; thresholdPct: number; intervalPct: number };
  weeklyKm: AdaptiveGoal; longRunKm: number | null; intervalSession: string | null;
  racePriority: string; canIncreaseLoad: boolean; explanation: string[];
}
interface Diagnosis { state: string; confidence: number; primaryLimiter: string | null; headline: string; recommendedAction: { detail: string }; evidence: string[]; }
interface Forecast { conservativeMin: number; expectedMin: number; optimisticMin: number; confidence: string; }
interface SafetyModality { modality: string; level: string; reason: string; }
interface Safety { modalities: SafetyModality[]; hasRestriction: boolean; disclaimer: string; }
interface Concurrent { concurrentLoad: number; strengthLoad: number; enduranceLoad: number; interferenceRisk: string; conflicts: { reason: string }[]; recommendations: string[]; }

const STATE_PT: Record<string, string> = {
  progressing: 'Progredindo', plateau: 'Platô', overreaching: 'Sobrecarga', undertraining: 'Treino insuficiente',
  detraining: 'Destreino', recovery_limited: 'Recuperação limitando', efficiency_improving: 'Eficiência melhorando',
  efficiency_declining: 'Eficiência caindo', insufficient_data: 'Dados insuficientes',
};
const STATE_COLOR: Record<string, string> = {
  progressing: '#5A8A6A', efficiency_improving: '#5A8A6A', plateau: '#A67C3A', recovery_limited: '#A67C3A',
  overreaching: '#C97B7B', undertraining: '#A67C3A', detraining: '#C97B7B', efficiency_declining: '#C97B7B', insufficient_data: '#607D8B',
};
const PRIORITY_PT: Record<string, string> = { hypertrophy_first: 'força em 1º (cardio se adapta)', race_first: 'prova em 1º (força se adapta)', balanced: 'equilibrado' };
const MOD_PT: Record<string, string> = { running: 'Corrida', walking: 'Caminhada', cycling: 'Bike', swimming: 'Natação', elliptical: 'Elíptico', rowing: 'Remo' };
const LEVEL_COLOR: Record<string, string> = { restricted: '#C97B7B', caution: '#A67C3A', compatible: '#5A8A6A' };
const LEVEL_PT: Record<string, string> = { restricted: 'Restrito', caution: 'Cautela', compatible: 'Compatível' };

const fmtMin = (m: number) => { const s = Math.round(m * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CardioIntelligenceCards({ intel }: { intel: any }) {
  const plan: Plan | null = intel?.plan ?? null;
  const diag: Diagnosis | null = intel?.diagnosis ?? null;
  const forecast: Forecast | null = intel?.forecast ?? null;
  const safety: Safety | null = intel?.safety ?? null;
  if (!plan && !diag) return null;

  return (
    <div className="space-y-3">
      {/* Diagnóstico único */}
      {diag && diag.state !== 'insufficient_data' && (
        <div className="rounded-2xl border p-4 space-y-1.5" style={{ borderColor: (STATE_COLOR[diag.state] ?? '#607D8B') + '55' }}>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4" style={{ color: STATE_COLOR[diag.state] }} />
            <span className="text-[13px] font-bold text-zinc-100">Diagnóstico da corrida</span>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: (STATE_COLOR[diag.state] ?? '#607D8B') + '22', color: STATE_COLOR[diag.state] }}>{STATE_PT[diag.state] ?? diag.state}</span>
          </div>
          <p className="text-[12px] text-zinc-300">{diag.headline}</p>
          <p className="text-[12px] text-[#D4853A]">→ {diag.recommendedAction.detail}</p>
          <p className="text-[10px] text-zinc-600">Confiança {Math.round(diag.confidence * 100)}%{diag.primaryLimiter ? ` · limitador: ${diag.primaryLimiter}` : ''}</p>
        </div>
      )}

      {/* Plano adaptativo (fonte única) */}
      {plan && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><Target className="h-4 w-4 text-[#D4853A]" />Plano de cardio · {plan.phase}</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center">
              <p className="text-[10px] text-zinc-500">Meta semanal</p>
              <p className="text-[14px] font-bold text-zinc-100">{plan.weeklyKm.ideal}<span className="text-[9px] text-zinc-500">km</span></p>
              <p className="text-[9px] text-zinc-600">{plan.weeklyKm.min}–{plan.weeklyKm.safetyLimit}</p>
            </div>
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center">
              <p className="text-[10px] text-zinc-500">Sessões</p>
              <p className="text-[14px] font-bold text-zinc-100">{plan.sessionsPerWeek}×{plan.minutesPerSession}<span className="text-[9px] text-zinc-500">min</span></p>
            </div>
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center">
              <p className="text-[10px] text-zinc-500">Longão</p>
              <p className="text-[14px] font-bold text-zinc-100">{plan.longRunKm ?? '—'}<span className="text-[9px] text-zinc-500">{plan.longRunKm ? 'km' : ''}</span></p>
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div style={{ width: `${plan.intensityDistribution.z2Pct}%`, background: '#5A8A6A' }} />
            <div style={{ width: `${plan.intensityDistribution.thresholdPct}%`, background: '#A67C3A' }} />
            <div style={{ width: `${plan.intensityDistribution.intervalPct}%`, background: '#C97B7B' }} />
          </div>
          <p className="text-[10px] text-zinc-500">Z2 {plan.intensityDistribution.z2Pct}% · Limiar {plan.intensityDistribution.thresholdPct}% · Intervalado {plan.intensityDistribution.intervalPct}% · prioridade: {PRIORITY_PT[plan.racePriority] ?? plan.racePriority}</p>
          {plan.intervalSession && <p className="text-[11px] text-zinc-400">🔁 {plan.intervalSession}</p>}
          {!plan.canIncreaseLoad && <p className="text-[11px] text-[#D4A85A]">Consolidar antes de subir carga (sem validação para progredir).</p>}
        </div>
      )}

      {/* Forecast */}
      {forecast && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-[#7FB58F]" />Projeção de tempo</p>
          <div className="grid grid-cols-3 gap-2">
            {([['Conservador', forecast.conservativeMin], ['Provável', forecast.expectedMin], ['Otimista', forecast.optimisticMin]] as const).map(([l, v], i) => (
              <div key={l} className={`rounded-xl border p-2.5 text-center ${i === 1 ? 'border-[#D4853A]/40 bg-[#D4853A]/5' : 'border-zinc-800 bg-zinc-900/60'}`}>
                <p className="text-[10px] text-zinc-500">{l}</p>
                <p className="text-[14px] font-bold text-zinc-100">{fmtMin(v)}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600">Confiança: {forecast.confidence} · projeção baseada no histórico, não é garantia.</p>
        </div>
      )}

      {(() => { const f = intel?.fatigueState; if (!f || (!f.reduceLegVolume && !f.reduceIntensity)) return null;
        return (
          <div className="rounded-xl border border-[#A67C3A]/30 bg-[#A67C3A]/5 p-3">
            <p className="text-[12px] text-[#D4A85A] flex items-start gap-1.5"><Activity className="h-3.5 w-3.5 shrink-0 mt-0.5" />{f.note} O treino de força do dia é ajustado automaticamente.</p>
          </div>
        );
      })()}

      {/* Concurrent training (força × endurance) */}
      {(() => { const c: Concurrent | null = intel?.concurrent ?? null; if (!c || (c.interferenceRisk === 'low' && c.conflicts.length === 0)) return null;
        const rc = c.interferenceRisk === 'high' ? '#C97B7B' : c.interferenceRisk === 'moderate' ? '#A67C3A' : '#5A8A6A';
        const rt = c.interferenceRisk === 'high' ? 'Alto' : c.interferenceRisk === 'moderate' ? 'Moderado' : 'Baixo';
        return (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-[#D4853A]" />
              <span className="text-[13px] font-bold text-zinc-100">Força × Cardio (interferência)</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: rc + '22', color: rc }}>Risco {rt}</span>
            </div>
            <p className="text-[11px] text-zinc-500">Carga concorrente {c.concurrentLoad}/100 · força {c.strengthLoad} · endurance {c.enduranceLoad}</p>
            {c.recommendations.slice(0, 2).map((r, i) => (
              <p key={i} className="text-[12px] text-zinc-300 flex items-start gap-1.5"><span className="text-[#D4853A]">•</span>{r}</p>
            ))}
          </div>
        );
      })()}

      {/* Safety planner */}
      {safety && safety.hasRestriction && (
        <div className="rounded-2xl border border-[#8B5A5A]/30 bg-[#8B5A5A]/5 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><Shield className="h-4 w-4 text-[#C97B7B]" />Segurança por modalidade</p>
          <div className="flex flex-wrap gap-1.5">
            {safety.modalities.map((m) => (
              <span key={m.modality} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: (LEVEL_COLOR[m.level]) + '22', color: LEVEL_COLOR[m.level] }} title={m.reason}>{MOD_PT[m.modality] ?? m.modality}: {LEVEL_PT[m.level]}</span>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600">{safety.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
