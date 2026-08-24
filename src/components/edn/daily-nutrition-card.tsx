'use client';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MealLogger } from './meal-logger';

interface Targets { targetKcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null }

/** Card "Hoje": consumido × meta por macro + botões de registro. Números vêm dos motores. */
export function DailyNutritionCard() {
  const supabase = createClient();
  const [consumed, setConsumed] = useState({ kcal: 0, p: 0, c: 0, f: 0 });
  const [targets, setTargets] = useState<Targets | null>(null);

  const loadConsumed = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('food_logs').select('calories_kcal, protein_g, carbs_g, fat_g').eq('user_id', user.id).eq('log_date', today);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    setConsumed({
      kcal: Math.round(rows.reduce((a, r) => a + (r.calories_kcal ?? 0), 0)),
      p: Math.round(rows.reduce((a, r) => a + (r.protein_g ?? 0), 0)),
      c: Math.round(rows.reduce((a, r) => a + (r.carbs_g ?? 0), 0)),
      f: Math.round(rows.reduce((a, r) => a + (r.fat_g ?? 0), 0)),
    });
  }, [supabase]);

  useEffect(() => {
    loadConsumed();
    fetch('/api/autopilot').then(r => r.json()).then(d => {
      const t = d?.targets ?? d?.nutrition ?? null;
      if (t) setTargets({ targetKcal: t.targetKcal ?? t.target_calories ?? null, proteinG: t.proteinG ?? t.protein_g ?? null, carbsG: t.carbsG ?? t.carbs_g ?? null, fatG: t.fatG ?? t.fat_g ?? null });
    }).catch(() => {});
  }, [loadConsumed]);

  const bar = (v: number, t: number | null) => t && t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0;
  const Row = ({ label, v, t, unit, color }: { label: string; v: number; t: number | null; unit: string; color: string }) => (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5"><span className="text-zinc-400">{label}</span><span className="text-zinc-300 font-mono">{v}{t != null ? ` / ${Math.round(t)}` : ''} {unit}</span></div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${bar(v, t)}%` }} /></div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold text-zinc-100">Hoje</p>
        <p className="text-lg font-black text-[#D4853A]">{consumed.kcal}{targets?.targetKcal ? <span className="text-xs text-zinc-500"> / {Math.round(targets.targetKcal)} kcal</span> : <span className="text-xs text-zinc-500"> kcal</span>}</p>
      </div>
      <Row label="Proteína" v={consumed.p} t={targets?.proteinG ?? null} unit="g" color="bg-[#5A8A6A]" />
      <Row label="Carboidrato" v={consumed.c} t={targets?.carbsG ?? null} unit="g" color="bg-[#D4853A]" />
      <Row label="Gordura" v={consumed.f} t={targets?.fatG ?? null} unit="g" color="bg-[#C0453A]" />
      <MealLogger onLogged={loadConsumed} />
    </div>
  );
}
