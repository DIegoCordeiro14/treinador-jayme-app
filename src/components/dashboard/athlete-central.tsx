'use client';
/**
 * Central do Atleta — EDN 360 Score (V8).
 * Treino · Nutrição · Recuperação · Cardio + principal limitador + próxima ação
 * + Weak Point Engine. Tudo determinístico (vem de /api/athlete-360).
 */
import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, Dumbbell, Brain } from 'lucide-react';

interface Edn360 {
  overall: number;
  scores: { training: number; nutrition: number; recovery: number; cardio: number };
  limiterLabel: string; limiterMessage: string; nextAction: string;
}
interface WeakPoint {
  weakest: { muscle: string; evolutionPct: number } | null;
  strongest: { muscle: string; evolutionPct: number } | null;
  recommendation: string | null;
}

const ring = (v: number) => v >= 80 ? 'text-[#5A8A6A]' : v >= 60 ? 'text-[#D4853A]' : 'text-[#C0453A]';

export function AthleteCentral() {
  const [edn, setEdn] = useState<Edn360 | null>(null);
  const [wp, setWp] = useState<WeakPoint | null>(null);
  const [briefLine, setBriefLine] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/athlete-360').then(r => r.json()).then(d => {
      if (d && !d.error) { setEdn(d.edn360 ?? null); setWp(d.weakPoint ?? null); }
    }).catch(() => {});
    fetch('/api/daily-briefing').then(r => r.json()).then(d => {
      const line = d?.alert || d?.todayAction || (Array.isArray(d?.highlights) ? d.highlights[0] : null);
      if (line) setBriefLine(String(line).replace(/\*\*(.*?)\*\*/g, '$1'));
    }).catch(() => {});
  }, []);

  if (!edn) return null;
  const pillars: { label: string; v: number }[] = [
    { label: 'Treino', v: edn.scores.training },
    { label: 'Nutrição', v: edn.scores.nutrition },
    { label: 'Recuperação', v: edn.scores.recovery },
    { label: 'Cardio', v: edn.scores.cardio },
  ];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-[#D4853A]" />
        <span className="text-base font-extrabold italic text-zinc-100">Central do Atleta</span>
        <span className="ml-auto text-lg font-black italic text-[#D4853A]">{edn.overall}<span className="text-[10px] text-zinc-500 font-bold">/100 · EDN 360</span></span>
      </div>
      {briefLine && <p className="text-[11px] text-zinc-400 leading-relaxed -mt-1">{briefLine}</p>}
      <div className="grid grid-cols-4 gap-2">
        {pillars.map((p) => (
          <div key={p.label} className="rounded-lg bg-black/30 border border-white/[0.06] p-2 text-center">
            <p className={`text-lg font-black italic ${ring(p.v)}`}>{p.v}</p>
            <p className="text-[10px] text-zinc-500">{p.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-[#8B5A5A]/10 border border-[#8B5A5A]/30 p-2.5">
        <p className="text-[11px] font-bold text-zinc-100 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-[#C97B7B]" />Principal limitador: {edn.limiterLabel}</p>
        <p className="text-[11px] text-zinc-300 mt-0.5">{edn.limiterMessage}</p>
        <p className="text-[11px] text-[#D4853A] font-semibold mt-1 flex items-start gap-1"><ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />{edn.nextAction}</p>
        <a
          href={`/app/ia?ask=${encodeURIComponent(`Meu EDN 360 está em ${edn.overall}/100 e o principal limitador hoje é ${edn.limiterLabel}. A próxima ação sugerida é: "${edn.nextAction}". Analise meus dados e, se fizer sentido, aplique o ajuste.`)}`}
          className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-[#D4853A] hover:text-[#E09B5A]"
        >
          <Brain className="h-3.5 w-3.5" /> Aplicar próxima ação com o Coach
        </a>
      </div>
      {wp?.recommendation && (
        <div className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5">
          <p className="text-[11px] font-bold text-zinc-100 flex items-center gap-1.5"><Dumbbell className="h-3.5 w-3.5 text-[#7FB58F]" />Ponto fraco muscular</p>
          <p className="text-[11px] text-zinc-300 mt-0.5">{wp.recommendation}</p>
          <a
            href={`/app/ia?ask=${encodeURIComponent(`Detectei um ponto fraco muscular: ${wp.recommendation} Pode montar/ajustar minha rotina para especializar esse grupo?`)}`}
            className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-[#7FB58F] hover:text-[#9FCBAF]"
          >
            <Brain className="h-3.5 w-3.5" /> Especializar com o Coach
          </a>
        </div>
      )}
    </div>
  );
}
