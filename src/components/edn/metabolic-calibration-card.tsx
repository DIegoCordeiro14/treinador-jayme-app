'use client';

// §5 UI — Calibração metabólica: TDEE observado (faixa/confiança) vs previsto.
// Consome /api/nutrition/calibration (determinístico).

import { useState } from 'react';
import { Flame, Loader2 } from 'lucide-react';

interface Calibration {
  estimatedTdee: number | null; range: { min: number; max: number } | null;
  confidence: number; dataPoints: number; trend: string; applyAdjustment: boolean;
  suggestedTdee: number | null; note: string;
}

const TREND_PT: Record<string, string> = {
  higher_than_predicted: 'acima do previsto', lower_than_predicted: 'abaixo do previsto',
  consistent: 'coerente com a fórmula', insufficient_data: 'dados insuficientes',
};

export function MetabolicCalibrationCard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ calibration: Calibration | null; predictedTdee?: number } | null>(null);

  const run = async () => {
    setLoading(true);
    try { const r = await fetch('/api/nutrition/calibration'); setData(await r.json()); }
    catch { setData(null); } finally { setLoading(false); }
  };

  const c = data?.calibration;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-[#D4853A]" />
        <p className="text-[13px] font-bold text-zinc-100">Calibração metabólica</p>
        <button onClick={run} disabled={loading}
          className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[#D4853A]/40 text-[#E09B5A] hover:bg-[#D4853A]/10 disabled:opacity-50 flex items-center gap-1">
          {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando…</> : 'Calcular TDEE real'}
        </button>
      </div>

      {c && c.trend !== 'insufficient_data' && c.estimatedTdee != null ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-bold text-zinc-100">{c.estimatedTdee}</span>
            <span className="text-[11px] text-zinc-500">kcal/dia observado {c.range ? `(${c.range.min}–${c.range.max})` : ''}</span>
          </div>
          <p className="text-[11px] text-zinc-400">Previsto pela fórmula: <b className="text-zinc-300">{data?.predictedTdee}</b> · {TREND_PT[c.trend] ?? c.trend} · confiança {Math.round(c.confidence * 100)}%</p>
          <p className="text-[12px] text-zinc-300">{c.note}</p>
          {c.applyAdjustment && c.suggestedTdee && (
            <p className="text-[11px] text-[#7FB58F]">Sugerido ajustar as metas para ~{c.suggestedTdee} kcal (evidência longitudinal).</p>
          )}
        </div>
      ) : c ? (
        <p className="text-[12px] text-zinc-500">{c.note}</p>
      ) : (
        <p className="text-[12px] text-zinc-500">Estime seu gasto energético real a partir da ingestão registrada e da variação de peso (28 dias).</p>
      )}
    </div>
  );
}
