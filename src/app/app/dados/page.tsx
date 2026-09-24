'use client';

import { useEffect, useState } from 'react';
import { Database, AlertTriangle, CheckCircle2, Clock, TriangleAlert } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cell = { value: number | null; unit: string; source: string | null; measuredAt: string | null; confidence: string; ageDays: number | null; isStale: boolean };

const CONF_DOT: Record<string, string> = { high: 'bg-[#5A8A6A]', medium: 'bg-[#D4853A]', low: 'bg-[#8B5A5A]', unknown: 'bg-zinc-600' };
const SEV_CLR: Record<string, string> = { critical: 'text-[#C97B7B] border-[#8B5A5A]/40 bg-[#8B5A5A]/10', warn: 'text-[#D4853A] border-[#D4853A]/30 bg-[#D4853A]/5', info: 'text-zinc-400 border-zinc-800 bg-zinc-900/60' };

function ago(iso: string | null): string {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return 'hoje';
  if (d === 1) return 'ontem';
  return `${d} dias atrás`;
}

const DOMAIN_LABELS: Record<string, string> = { body: 'Corpo', recovery: 'Recuperação', cardio: 'Cardio', nutrition: 'Nutrição', training: 'Treino' };

export default function DadosPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [snap, setSnap] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [quality, setQuality] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => fetch('/api/current-snapshot').then((r) => r.json()).then((d) => { setSnap(d.snapshot ?? null); setQuality(d.quality ?? null); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => {
    load();
    const onEv = () => load();
    if (typeof window !== 'undefined') window.addEventListener('athlete-event', onEv);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('athlete-event', onEv); };
  }, []);

  if (loading) return <div className="p-6 text-sm text-zinc-500">Carregando dados do atleta…</div>;
  if (!snap) return <div className="p-6 text-sm text-zinc-500">Ainda não há dados suficientes.</div>;

  const domains = ['body', 'recovery', 'cardio', 'nutrition', 'training'] as const;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300 pb-10">
      <div className="flex items-center gap-2">
        <Database className="h-6 w-6 text-[#D4853A]" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Central de Dados</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Cada dado, sua fonte, quando foi medido e o quão confiável é.</p>
        </div>
      </div>

      {/* Saúde geral dos dados */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">Qualidade dos dados</span>
          <span className="text-2xl font-black text-zinc-100">{quality?.score ?? '—'}<span className="text-sm text-zinc-500">/100</span></span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-[#D4853A]" style={{ width: `${quality?.score ?? 0}%` }} />
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
          <span>Confiança global: <b className="text-zinc-300">{snap.globalConfidence}%</b></span>
          {snap.staleData?.length > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{snap.staleData.length} desatualizado(s)</span>}
          {snap.missingData?.length > 0 && <span>{snap.missingData.length} ausente(s)</span>}
        </div>
      </div>

      {/* Conflitos / avisos */}
      {quality?.issues?.filter((i: { kind: string }) => i.kind === 'conflict' || i.kind === 'implausible' || i.kind === 'abrupt_change').length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><TriangleAlert className="h-4 w-4 text-[#C97B7B]" /> Requer atenção</p>
          {quality.issues.filter((i: { kind: string }) => i.kind === 'conflict' || i.kind === 'implausible' || i.kind === 'abrupt_change').map((i: { label: string; detail: string; severity: string }, idx: number) => (
            <div key={idx} className={`rounded-xl border px-3 py-2 text-[12px] ${SEV_CLR[i.severity] ?? SEV_CLR.info}`}>
              <b>{i.label}:</b> {i.detail}
            </div>
          ))}
        </div>
      )}

      {/* Métricas por domínio, com proveniência */}
      {domains.map((dom) => {
        const block = snap[dom] as Record<string, Cell>;
        const keys = Object.keys(block ?? {});
        if (keys.length === 0) return null;
        return (
          <div key={dom} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <p className="text-[13px] font-bold text-zinc-100">{DOMAIN_LABELS[dom]}</p>
            <div className="divide-y divide-zinc-800/60">
              {keys.map((k) => {
                const c = block[k];
                return (
                  <div key={k} className="flex items-center gap-3 py-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${CONF_DOT[c.confidence] ?? 'bg-zinc-600'}`} title={`confiança: ${c.confidence}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-zinc-200">{c.value ?? '—'}<span className="text-[11px] text-zinc-500">{c.unit}</span></p>
                      <p className="text-[10px] text-zinc-500 truncate">{c.source ?? '—'} · {ago(c.measuredAt)}{c.isStale ? ' · desatualizado' : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-[10px] text-zinc-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Nenhum dado é sobrescrito automaticamente — o histórico é sempre preservado.</p>
    </div>
  );
}
