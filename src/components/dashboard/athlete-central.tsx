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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aos, setAos] = useState<any>(null);
  const [briefLine, setBriefLine] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [session, setSession] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [alertU, setAlertU] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sv2, setSv2] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nba, setNba] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dataHealth, setDataHealth] = useState<any>(null);

  useEffect(() => {
    fetch('/api/athlete-360').then(r => r.json()).then(d => {
      if (d && !d.error) { setEdn(d.edn360 ?? null); setWp(d.weakPoint ?? null); setAos(d.aos ?? null); setSession(d.session ?? null); setAlertU(d.alertsUnified ?? null); setSv2(d.stateV2 ?? null); setNba(d.nextBestAction ?? null); setDataHealth(d.dataHealth ?? null); }
    }).catch(() => {});
    fetch('/api/decisions/evaluate').catch(() => {});
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

      {nba?.primary && (() => { const p = nba.primary; const c = p.priority === 'critical' ? '#C97B7B' : p.priority === 'important' ? '#A67C3A' : p.priority === 'recommended' ? '#5A8A6A' : '#607D8B';
        const pt: Record<string,string> = { critical: 'CRÍTICO', important: 'IMPORTANTE', recommended: 'RECOMENDADO', optional: 'OPCIONAL' };
        const inner = (
          <div className="rounded-xl border p-3 flex items-start gap-2" style={{ borderColor: c + '55', background: c + '11' }}>
            <span className="text-base shrink-0">{p.emoji}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-wide" style={{ color: c }}>{pt[p.priority]} · sua melhor ação agora</p>
              <p className="text-[12px] font-semibold text-zinc-100">{p.title}</p>
              <p className="text-[11px] text-zinc-400">{p.detail}</p>
            </div>
          </div>
        );
        return p.href ? <a href={p.href} className="block">{inner}</a> : inner;
      })()}

      {dataHealth && dataHealth.score < 85 && (
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span>Qualidade dos dados: <b className="text-zinc-300">{dataHealth.score}%</b></span>
          {dataHealth.topGap && <span className="truncate">· resolver: {dataHealth.topGap}</span>}
        </div>
      )}
      {briefLine && <p className="text-[11px] text-zinc-400 leading-relaxed -mt-1">{briefLine}</p>}
      {alertU && alertU.level !== 'normal' && (
        <p className={`text-[11px] font-semibold ${alertU.level==='block'?'text-red-300':alertU.level==='intervene'?'text-orange-300':'text-amber-300'}`}>
          {alertU.level==='block'?'🔴':alertU.level==='intervene'?'🟠':'🟡'} {alertU.items?.[0]?.message}
        </p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {pillars.map((p) => (
          <div key={p.label} className="rounded-lg bg-black/30 border border-white/[0.06] p-2 text-center">
            <p className={`text-lg font-black italic ${ring(p.v)}`}>{p.v}</p>
            <p className="text-[10px] text-zinc-500">{p.label}</p>
          </div>
        ))}
      </div>
      <div className={`rounded-lg border p-2.5 ${sv2?.safetyLevel==='block' ? 'bg-red-500/10 border-red-500/30' : 'bg-[#8B5A5A]/10 border-[#8B5A5A]/30'}`}>
        <p className="text-[11px] font-bold text-zinc-100 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-[#C97B7B]" />Principal limitador: {sv2?.limiter?.label ?? edn.limiterLabel}</p>
        <p className="text-[11px] text-zinc-300 mt-0.5">{sv2?.limiter ? '' : edn.limiterMessage}</p>
        <p className="text-[11px] text-[#D4853A] font-semibold mt-1 flex items-start gap-1"><ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />{sv2?.limiter?.nextAction ?? edn.nextAction}</p>
        <a
          href={`/app/ia?ask=${encodeURIComponent(`Meu EDN 360 está em ${edn.overall}/100 e o principal limitador hoje é ${sv2?.limiter?.label ?? edn.limiterLabel}. A próxima ação sugerida é: "${sv2?.limiter?.nextAction ?? edn.nextAction}". Analise meus dados e, se fizer sentido, aplique o ajuste.`)}`}
          className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-[#D4853A] hover:text-[#E09B5A]"
        >
          <Brain className="h-3.5 w-3.5" /> Aplicar próxima ação com o Coach
        </a>
      </div>
      {session && session.intensity !== 'normal' && (
        <div className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5">
          <p className="text-[11px] font-bold text-[#E09B5A] flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />Seu momento — treino de hoje</p>
          <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed">{session.explanation}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {session.workingVolumePct < 100 && <span className="text-[10px] font-semibold text-orange-300 bg-orange-500/10 px-2 py-0.5 rounded-full">Working −{100 - session.workingVolumePct}%</span>}
            <span className="text-[10px] font-semibold text-zinc-300 bg-zinc-800/80 px-2 py-0.5 rounded-full">RIR ≥ {session.targetRirMin}</span>
            {session.allowPr && <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full">Pode tentar PR</span>}
            {session.loadDeltaPct < 0 && <span className="text-[10px] font-semibold text-orange-300 bg-orange-500/10 px-2 py-0.5 rounded-full">Carga {session.loadDeltaPct}%</span>}
          </div>
        </div>
      )}
      {aos?.nextBestAction && (
        <div className="rounded-lg bg-[#D4853A]/10 border border-[#D4853A]/30 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#E09B5A] flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />Próxima melhor ação (AOS)</p>
            <span className="text-[11px] font-black text-[#7FB58F]">{aos.nextBestAction.confidence}% confiança</span>
          </div>
          <p className="text-[12px] text-zinc-100 font-semibold mt-0.5">{aos.nextBestAction.action}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">{aos.nextBestAction.reason}</p>
          {Array.isArray(aos.nextBestAction.evidence) && aos.nextBestAction.evidence.length > 0 && (
            <p className="text-[10px] text-zinc-500 mt-0.5">Baseado em: {aos.nextBestAction.evidence.join(' · ')}</p>
          )}
          {typeof aos.conflictsResolved === 'number' && aos.conflictsResolved > 0 && (
            <p className="text-[10px] text-[#C97B7B] mt-1">⚠ {aos.conflictsResolved} sugestão(ões) conflitante(s) suprimida(s) por prioridade (ex.: não subir carga com recuperação baixa).</p>
          )}
        </div>
      )}
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
