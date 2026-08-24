'use client';
import { useState } from 'react';
import { FlaskConical, Loader2, ChevronRight } from 'lucide-react';

interface Horizon { day: number; weightKg: number; bfPct: number | null }
interface Scenario { label: string; horizons: Horizon[]; performanceImpact: string; recoveryImpact: string; risk: string; summary: string }

/** "E se…" — simulações determinísticas do Digital Twin. A IA não calcula; o motor projeta. */
export function TwinScenariosCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [sel, setSel] = useState<number>(0);

  async function loadIt() {
    setOpen(true);
    if (scenarios) return;
    setLoading(true);
    try { const r = await fetch('/api/twin-scenarios'); const d = await r.json(); if (Array.isArray(d?.scenarios)) setScenarios(d.scenarios); } catch { /* */ }
    setLoading(false);
  }

  const riskColor = (r: string) => r === 'alto' ? 'text-red-300' : r === 'moderado' ? 'text-amber-300' : 'text-emerald-300';

  if (!open) return (
    <button onClick={loadIt} className="w-full flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-200 hover:border-[#D4853A]/40">
      <FlaskConical className="h-4 w-4 text-[#D4853A]" /><span className="flex-1 text-left">Simular "E se…" (Digital Twin)</span><ChevronRight className="h-4 w-4 text-zinc-500" />
    </button>
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-[#D4853A]" /><p className="text-sm font-semibold text-zinc-100">E se… (projeção 30/60/90d)</p></div>
      {loading ? <p className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Simulando…</p> : !scenarios ? <p className="text-xs text-zinc-500">Sem dados suficientes.</p> : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {scenarios.map((s, i) => (
              <button key={i} onClick={() => setSel(i)} className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${sel===i ? 'border-[#D4853A] bg-[#D4853A]/10 text-[#E09B5A]' : 'border-zinc-700 text-zinc-400'}`}>{s.label}</button>
            ))}
          </div>
          {scenarios[sel] && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {scenarios[sel].horizons.map(h => (
                  <div key={h.day} className="rounded-lg bg-black/30 border border-white/[0.06] p-2 text-center">
                    <p className="text-[10px] text-zinc-500">{h.day}d</p>
                    <p className="text-sm font-black text-zinc-100">{h.weightKg}kg</p>
                    {h.bfPct != null && <p className="text-[10px] text-zinc-400">{h.bfPct}% BF</p>}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-300">{scenarios[sel].summary}</p>
              <p className="text-[10px] text-zinc-500">Performance: {scenarios[sel].performanceImpact} · Recuperação: {scenarios[sel].recoveryImpact} · Risco: <span className={riskColor(scenarios[sel].risk)}>{scenarios[sel].risk}</span></p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
