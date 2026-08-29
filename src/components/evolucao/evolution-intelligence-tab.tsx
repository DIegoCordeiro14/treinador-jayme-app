'use client';

// Aba "Inteligência" — expõe relatório mensal, timeline, decisões→resultados e
// memória longitudinal (Fases 2-3). Fetch determinístico de /api/evolution-intelligence.

import { useEffect, useState } from 'react';
import { FileText, Clock, GitBranch, Brain, CheckCircle2, XCircle, Clock3, ArrowRight, Link2 } from 'lucide-react';

interface Report {
  periodLabel: string;
  sections: {
    body: { headline: string; confidence: number; recomposition: string };
    performance: { matrix: string; topAdvance: string };
    muscles: { weakest: string[]; strongest: string[] };
    recovery: { direction: string; message: string };
    nutrition: { confidence: number; note: string };
    decisions: { successRate: number; highlights: string[] };
  };
  mainAdvance: string; mainLimiter: string; nextMonthStrategy: string; goalProgressScore: number;
}
interface TimelineEvent { dateISO: string; kind: string; title: string; detail?: string; tone: string; emoji: string; }
interface TimelineMonth { monthKey: string; label: string; events: TimelineEvent[]; }
interface DecisionOutcome { id: string; decision: string; verdict: string; summary: string; }
interface Memory { strategies: { action: string; timesTried: number; successRate: number; recommendation: string }[]; learnedNotes: string[]; }
interface Correlation { key: string; strength: string; direction: string; reliable: boolean; message: string; r: number | null; }
interface Payload { report?: Report | null; timeline?: TimelineMonth[]; decisions?: DecisionOutcome[]; decisionStats?: { successRate: number; total: number }; memory?: Memory; correlations?: Correlation[]; }

const MG_PT: Record<string, string> = { chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', legs: 'Pernas', glutes: 'Glúteos', abs: 'Abdômen', calves: 'Panturrilha', forearms: 'Antebraço' };
const mg = (k: string) => MG_PT[k] ?? k;

function VerdictIcon({ v }: { v: string }) {
  if (v === 'positive') return <CheckCircle2 className="h-4 w-4 text-[#7FB58F] shrink-0" />;
  if (v === 'negative') return <XCircle className="h-4 w-4 text-[#C97B7B] shrink-0" />;
  return <Clock3 className="h-4 w-4 text-zinc-500 shrink-0" />;
}

export function EvolutionIntelligenceTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/evolution-intelligence')
      .then((r) => r.json()).then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-40 animate-pulse" />;

  const report = data?.report;
  const timeline = data?.timeline ?? [];
  const decisions = data?.decisions ?? [];
  const memory = data?.memory;

  return (
    <div className="space-y-3">
      {/* Relatório mensal */}
      {report ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <p className="text-[14px] font-extrabold italic text-zinc-100 flex items-center gap-1.5"><FileText className="h-4 w-4 text-[#D4853A]" />Relatório de evolução · {report.periodLabel}</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5">
              <p className="text-[10px] text-zinc-500">Progresso do objetivo</p>
              <p className="text-[16px] font-bold text-zinc-100">{report.goalProgressScore}/100</p>
            </div>
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5">
              <p className="text-[10px] text-zinc-500">Decisões (acerto)</p>
              <p className="text-[16px] font-bold text-zinc-100">{report.sections.decisions.successRate}%</p>
            </div>
          </div>

          <div className="space-y-1.5 text-[12px] text-zinc-300">
            <p>🧍 <span className="text-zinc-400">Corpo:</span> {report.sections.body.headline}</p>
            <p>💪 <span className="text-zinc-400">Performance:</span> {report.sections.performance.matrix}</p>
            <p>🦵 <span className="text-zinc-400">Músculos:</span> mais fortes {report.sections.muscles.strongest.map(mg).join(', ') || '—'}; a reforçar {report.sections.muscles.weakest.map(mg).join(', ') || '—'}.</p>
            <p>🔋 <span className="text-zinc-400">Recuperação:</span> {report.sections.recovery.message}</p>
            <p>🥗 <span className="text-zinc-400">Nutrição:</span> {report.sections.nutrition.note}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#5A8A6A]/10 border border-[#5A8A6A]/30 p-2.5">
              <p className="text-[10px] text-zinc-500">Principal avanço</p>
              <p className="text-[12px] font-semibold text-[#7FB58F]">{report.mainAdvance}</p>
            </div>
            <div className="rounded-xl bg-[#A67C3A]/10 border border-[#A67C3A]/30 p-2.5">
              <p className="text-[10px] text-zinc-500">Principal limitador</p>
              <p className="text-[12px] font-semibold text-[#D4A85A]">{report.mainLimiter}</p>
            </div>
          </div>

          <p className="text-[12px] text-[#D4853A] font-semibold flex items-start gap-1"><ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />Estratégia p/ o próximo mês: {report.nextMonthStrategy}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-400">Registre mais medições e treinos para gerar o relatório de evolução.</p>
        </div>
      )}

      {/* Decisões → resultados */}
      {decisions.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><GitBranch className="h-4 w-4 text-[#5A8A6A]" />Decisões → resultados</p>
          <div className="space-y-1.5">
            {decisions.slice(0, 8).map((d) => (
              <div key={d.id} className="flex items-start gap-2 text-[12px] text-zinc-300">
                <VerdictIcon v={d.verdict} />
                <span>{d.decision}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memória longitudinal */}
      {memory && (memory.learnedNotes.length > 0 || memory.strategies.length > 0) && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><Brain className="h-4 w-4 text-[#D4853A]" />O que o Coach aprendeu com você</p>
          {memory.learnedNotes.length > 0 ? (
            <ul className="space-y-1">
              {memory.learnedNotes.slice(0, 6).map((n, i) => (
                <li key={i} className="text-[12px] text-zinc-400 flex items-start gap-1.5"><span className="text-[#D4853A]">•</span>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-zinc-500">Ainda coletando dados para aprender seus padrões de resposta.</p>
          )}
        </div>
      )}

      {/* Correlações observadas */}
      {(data?.correlations ?? []).filter((c) => c.reliable).length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><Link2 className="h-4 w-4 text-[#5A8A6A]" />Correlações observadas</p>
          <div className="space-y-1.5">
            {(data?.correlations ?? []).filter((c) => c.reliable).map((c) => (
              <p key={c.key} className="text-[12px] text-zinc-400 flex items-start gap-1.5"><span className="text-[#5A8A6A]">•</span>{c.message}</p>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600">Associações estatísticas — não provam causa e efeito.</p>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#7FB58F]" />Linha do tempo da evolução</p>
          {timeline.slice(0, 4).map((month) => (
            <div key={month.monthKey}>
              <p className="text-[10px] font-bold text-zinc-500 tracking-wide mb-1">{month.label}</p>
              <div className="space-y-1">
                {month.events.slice(0, 8).map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] text-zinc-300">
                    <span className="shrink-0">{e.emoji}</span>
                    <span>{e.title}{e.detail ? <span className="text-zinc-500"> — {e.detail}</span> : null}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
