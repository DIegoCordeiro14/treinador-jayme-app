'use client';

// Hub — "Dados atuais" (somente leitura), consome /api/body-state (fonte única
// com proveniência). Evita que o usuário edite peso no Perfil e crie conflito.

import { useEffect, useState } from 'react';
import { Scale, Info } from 'lucide-react';

interface Prov { value: number; source: string; measuredAtISO: string | null; confidence: string; ageDays: number | null; }
interface BodyState {
  currentWeightKg: Prov | null; bodyFatPct: Prov | null; muscleMassKg: Prov | null; leanMassKg: Prov | null;
  weeklyWeightRateKg: number | null; dataConfidence: number; lastMeasurementISO: string | null;
}

const SOURCE_PT: Record<string, string> = {
  bioimpedance: 'Bioimpedância', measurement: 'Medição', weight_log: 'Registro de peso',
  wearable: 'Wearable', health_connect: 'Health Connect', manual: 'Manual', profile: 'Perfil', estimated: 'Estimativa',
};
const CONF_COLOR: Record<string, string> = { high: '#5A8A6A', moderate: '#A67C3A', low: '#8B5A5A' };

function ageLabel(days: number | null) {
  if (days == null) return '';
  if (days === 0) return 'hoje'; if (days === 1) return 'ontem'; return `há ${days} dias`;
}

export function CanonicalBodyCard() {
  const [s, setS] = useState<BodyState | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch('/api/body-state').then(r => r.json()).then(d => { if (alive) setS(d?.bodyState ?? null); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-24 animate-pulse" />;
  if (!s || !s.currentWeightKg) return null;

  const w = s.currentWeightKg;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-[#D4853A]" />
        <p className="text-[13px] font-bold text-zinc-100">Dados atuais</p>
        <span className="ml-auto text-[10px] text-zinc-500">Confiança dos dados {s.dataConfidence}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center">
          <p className="text-[10px] text-zinc-500">Peso</p>
          <p className="text-[16px] font-bold text-zinc-100">{w.value}<span className="text-[9px] text-zinc-500">kg</span></p>
        </div>
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center">
          <p className="text-[10px] text-zinc-500">Gordura</p>
          <p className="text-[16px] font-bold text-zinc-100">{s.bodyFatPct ? `${s.bodyFatPct.value}%` : '—'}</p>
        </div>
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center">
          <p className="text-[10px] text-zinc-500">Músculo</p>
          <p className="text-[16px] font-bold text-zinc-100">{s.muscleMassKg ? `${s.muscleMassKg.value}kg` : (s.leanMassKg ? `${s.leanMassKg.value}kg` : '—')}</p>
        </div>
      </div>
      <p className="text-[11px] flex items-center gap-1.5" style={{ color: CONF_COLOR[w.confidence] ?? '#607D8B' }}>
        <Info className="h-3.5 w-3.5" />Fonte: {SOURCE_PT[w.source] ?? w.source} · atualizado {ageLabel(w.ageDays)}
        {s.weeklyWeightRateKg != null && Math.abs(s.weeklyWeightRateKg) >= 0.05 ? ` · ${s.weeklyWeightRateKg > 0 ? '+' : ''}${Math.round(s.weeklyWeightRateKg * 100) / 100} kg/sem` : ''}
      </p>
      <a href="/app/evolucao" className="text-[11px] text-[#D4853A] hover:text-[#E09B5A]">Ver evolução corporal →</a>
    </div>
  );
}
