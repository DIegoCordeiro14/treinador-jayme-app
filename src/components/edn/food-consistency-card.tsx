'use client';

// §13 — Consistência Alimentar: médias 7d, tendências e heatmap. Consome
// /api/nutrition/consistency (determinístico).

import { useEffect, useState } from 'react';
import { CalendarCheck2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HeatCell { dateISO: string; weekday: number; status: 'on' | 'partial' | 'off' | 'none'; }
interface Trend { id: string; direction: 'up' | 'down' | 'flat'; label: string; }
interface Consistency {
  days: number; loggedDays: number;
  avg: { calories: number; protein: number; carbs: number; fat: number };
  calorieVariationPct: number; trends: Trend[]; heatmap: HeatCell[]; summary: string;
}

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const COLOR: Record<HeatCell['status'], string> = { on: '#5A8A6A', partial: '#A67C3A', off: '#8B5A5A', none: '#2A2F36' };

function TrendIcon({ d }: { d: string }) {
  if (d === 'up') return <TrendingUp className="h-3.5 w-3.5 text-[#7FB58F]" />;
  if (d === 'down') return <TrendingDown className="h-3.5 w-3.5 text-[#C97B7B]" />;
  return <Minus className="h-3.5 w-3.5 text-zinc-500" />;
}

export function FoodConsistencyCard() {
  const [data, setData] = useState<Consistency | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/nutrition/consistency').then(r => r.json())
      .then(d => { if (alive) setData(d?.consistency ?? null); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-32 animate-pulse" />;
  if (!data || data.loggedDays === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><CalendarCheck2 className="h-4 w-4 text-[#D4853A]" />Consistência alimentar</p>
        <p className="text-[12px] text-zinc-500 mt-1">Registre refeições nos próximos dias para ver sua consistência.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <p className="text-[13px] font-bold text-zinc-100 flex items-center gap-1.5"><CalendarCheck2 className="h-4 w-4 text-[#D4853A]" />Consistência alimentar (7 dias)</p>

      <div className="grid grid-cols-4 gap-2">
        {([['Calorias', data.avg.calories, 'kcal'], ['Proteína', data.avg.protein, 'g'], ['Carbo', data.avg.carbs, 'g'], ['Gordura', data.avg.fat, 'g']] as const).map(([l, v, u]) => (
          <div key={l} className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2 text-center">
            <p className="text-[10px] text-zinc-500">{l}</p>
            <p className="text-[13px] font-bold text-zinc-100">{v}<span className="text-[9px] text-zinc-500">{u}</span></p>
          </div>
        ))}
      </div>

      {/* heatmap */}
      <div className="flex items-center justify-between gap-1">
        {data.heatmap.map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-7 h-7 rounded-md" style={{ background: COLOR[h.status] }} title={`${h.dateISO}: ${h.status}`} />
            <span className="text-[9px] text-zinc-600">{WD[h.weekday]}</span>
          </div>
        ))}
      </div>

      {data.trends.length > 0 && (
        <div className="space-y-1">
          {data.trends.map((t) => (
            <p key={t.id} className="text-[12px] text-zinc-400 flex items-center gap-1.5"><TrendIcon d={t.direction} />{t.label}</p>
          ))}
        </div>
      )}
      <p className="text-[10px] text-zinc-600">{data.summary}</p>
    </div>
  );
}
