'use client';

import { useEffect, useState } from 'react';
import { Watch, Footprints, Flame, HeartPulse, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Metrics {
  recorded_at: string;
  source: string | null;
  steps: number | null;
  calories_kcal: number | null;
  resting_hr: number | null;
  distance_km: number | null;
  sleep_hours: number | null;
  hrv_ms: number | null;
}

/**
 * Item 3 — Dados complementares vindos do relógio (Health Connect / wearables).
 * Mostra o registro mais recente de wearable_metrics. Não aparece se não houver
 * nenhum dado sincronizado.
 */
export function WearableMetricsCard() {
  const supabase = createClient();
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('wearable_metrics')
        .select('recorded_at, source, steps, calories_kcal, resting_hr, distance_km, sleep_hours, hrv_ms')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setM(data as Metrics);
    })();
  }, [supabase]);

  if (!m) return null;

  const items = [
    { show: m.steps != null, icon: <Footprints className="h-4 w-4" />, label: 'Passos', value: m.steps?.toLocaleString('pt-BR'), color: 'text-[#D4853A]' },
    { show: m.calories_kcal != null, icon: <Flame className="h-4 w-4" />, label: 'Calorias', value: `${m.calories_kcal} kcal`, color: 'text-orange-400' },
    { show: m.resting_hr != null, icon: <HeartPulse className="h-4 w-4" />, label: 'FC repouso', value: `${Math.round(Number(m.resting_hr))} bpm`, color: 'text-[#C0453A]' },
    { show: m.distance_km != null && Number(m.distance_km) > 0, icon: <MapPin className="h-4 w-4" />, label: 'Distância', value: `${Number(m.distance_km).toFixed(1)} km`, color: 'text-[#5A8A6A]' },
  ].filter((i) => i.show);

  if (items.length === 0) return null;

  const dayLabel = (() => {
    const d = new Date(m.recorded_at + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  })();

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-3.5">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
          <Watch className="h-3.5 w-3.5 text-[#D4853A]" /> Relógio · {m.source === 'health_connect' ? 'Health Connect' : m.source ?? 'wearable'}
        </p>
        <span className="text-[10px] text-zinc-600">{dayLabel}</span>
      </div>
      <div className={`grid gap-3 ${items.length >= 4 ? 'grid-cols-4' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {items.map((i) => (
          <div key={i.label} className="text-center py-2 rounded-lg bg-white/[0.03]">
            <div className={`flex justify-center ${i.color}`}>{i.icon}</div>
            <p className="text-base font-extrabold italic text-zinc-100 mt-1 leading-none">{i.value}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{i.label}</p>
          </div>
        ))}
      </div>
      {(m.sleep_hours != null || m.hrv_ms != null) && (
        <div className="flex gap-4 mt-3 text-[11px] text-zinc-500">
          {m.sleep_hours != null && <span>Sono: <strong className="text-zinc-300">{Number(m.sleep_hours).toFixed(1)}h</strong></span>}
          {m.hrv_ms != null && <span>HRV: <strong className="text-zinc-300">{Math.round(Number(m.hrv_ms))}ms</strong></span>}
        </div>
      )}
    </div>
  );
}
