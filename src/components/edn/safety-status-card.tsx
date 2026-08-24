'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ShieldAlert, ChevronRight } from 'lucide-react';
import { trainingSafetyStatus } from '@/lib/edn/physical-condition-engine';

/** 🛡️ Status de treinamento — 🟢 sem restrições / 🟡 acompanhamento / 🔴 restrições ativas. */
export function SafetyStatusCard() {
  const [state, setState] = useState<{ level: 'none'|'watch'|'restricted'; label: string } | null>(null);
  useEffect(() => {
    fetch('/api/physical-conditions').then(r => r.json()).then(d => {
      if (!Array.isArray(d?.conditions)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conds = (d.conditions as any[]).map(c => ({ conditionType: 'injury' as const, bodyRegion: c.body_region, side: c.side, status: c.status, restrictedMovements: c.restricted_movements ?? [], userConfirmed: c.user_confirmed !== false }));
      setState(trainingSafetyStatus(conds));
    }).catch(() => {});
  }, []);
  if (!state) return null;
  const color = state.level === 'none' ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5'
    : state.level === 'watch' ? 'text-amber-300 border-amber-500/20 bg-amber-500/5'
    : 'text-red-300 border-red-500/20 bg-red-500/5';
  const Icon = state.level === 'none' ? ShieldCheck : ShieldAlert;
  const dot = state.level === 'none' ? '🟢' : state.level === 'watch' ? '🟡' : '🔴';
  return (
    <Link href="/app/condicoes" className={`flex items-center gap-2 rounded-xl border p-3 ${color}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold">Status de treinamento</p>
        <p className="text-[11px] opacity-90 truncate">{dot} {state.label}</p>
      </div>
      <ChevronRight className="h-4 w-4 opacity-60" />
    </Link>
  );
}
