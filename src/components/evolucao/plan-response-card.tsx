'use client';

// Botão "Avaliar bloco" — chama POST /api/plan-response, classifica a resposta ao
// plano atual (HIGHLY_EFFECTIVE..EXCESSIVE_FATIGUE) e registra a decisão.

import { useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';

interface PlanResponse {
  classification: string;
  nextGenerationHint: string;
  score: number;
  sessionsCompleted: number;
  sessionsPlanned: number;
  strengthDeltaPct: number | null;
  adherenceRate: number;
  error?: string;
}

const LABEL: Record<string, string> = {
  HIGHLY_EFFECTIVE: 'Bloco muito efetivo',
  EFFECTIVE: 'Bloco efetivo',
  NEUTRAL: 'Resposta morna',
  INEFFECTIVE: 'Baixa resposta',
  EXCESSIVE_FATIGUE: 'Fadiga excessiva',
};
const COLOR: Record<string, string> = {
  HIGHLY_EFFECTIVE: '#5A8A6A', EFFECTIVE: '#7FB58F', NEUTRAL: '#A67C3A',
  INEFFECTIVE: '#C97B7B', EXCESSIVE_FATIGUE: '#B4544E',
};

export function PlanResponseCard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PlanResponse | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/plan-response', { method: 'POST' });
      setData(await r.json());
    } catch {
      setData({ classification: '', nextGenerationHint: '', score: 0, sessionsCompleted: 0, sessionsPlanned: 0, strengthDeltaPct: null, adherenceRate: 0, error: 'Falha ao avaliar.' });
    } finally { setLoading(false); }
  };

  const color = data?.classification ? (COLOR[data.classification] ?? '#A67C3A') : '#607D8B';

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-[#D4853A]" />
        <p className="text-[13px] font-bold text-zinc-100">Avaliação do bloco atual</p>
        <button onClick={run} disabled={loading}
          className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[#D4853A]/40 text-[#E09B5A] hover:bg-[#D4853A]/10 disabled:opacity-50 flex items-center gap-1">
          {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Avaliando…</> : 'Avaliar bloco'}
        </button>
      </div>

      {data && !data.error && data.classification && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: color + '22', color }}>{LABEL[data.classification] ?? data.classification}</span>
            <span className="text-[11px] text-zinc-500">{data.sessionsCompleted}/{data.sessionsPlanned} sessões · {Math.round(data.adherenceRate * 100)}% aderência{data.strengthDeltaPct != null ? ` · força ${data.strengthDeltaPct > 0 ? '+' : ''}${data.strengthDeltaPct}%` : ''}</span>
          </div>
          <p className="text-[12px] text-zinc-300 leading-relaxed">{data.nextGenerationHint}</p>
          <p className="text-[10px] text-zinc-600">Registrado — influencia a sua próxima geração de treino.</p>
        </div>
      )}
      {data?.error && <p className="text-[12px] text-[#C97B7B]">{data.error}</p>}
      {!data && !loading && <p className="text-[12px] text-zinc-500">Avalie como o plano atual está funcionando para retroalimentar a próxima ficha.</p>}
    </div>
  );
}
