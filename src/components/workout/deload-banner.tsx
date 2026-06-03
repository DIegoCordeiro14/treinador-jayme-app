'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DeloadBannerProps {
  reason?: string; // ex: "Platô de força detectado por 3+ semanas"
  onDeloadStarted?: () => void;
}

const DELOAD_PROTOCOL = [
  { day: 'Seg / 1ª sessão', focus: 'Volume −50%', detail: 'Reduza para metade das séries. Mantenha os exercícios compostos principais.' },
  { day: 'Qua / 2ª sessão', focus: 'Carga −20%', detail: 'Use 80% da carga habitual. Foque em técnica perfeita e conexão mente-músculo.' },
  { day: 'Sex / 3ª sessão', focus: 'RIR ≥ 3', detail: 'Intensidade muito baixa. Mova o corpo sem acumular fadiga. Opcional: apenas mobilidade.' },
  { day: 'Dias de descanso', focus: 'Cardio Zona 1 leve', detail: 'Caminhada 20–30min ou bicicleta leve. Sono ≥ 8h. Proteína ≥ meta.' },
];

export function DeloadBanner({ reason, onDeloadStarted }: DeloadBannerProps) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);

  async function startDeload() {
    setStarting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStarting(false); return; }

    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const { error } = await supabase.from('deloads').insert({
      user_id: user.id,
      start_date: today,
      end_date: endDate,
      reason: reason ?? 'Recomendado pelo Performance Engine EDN',
      load_reduction_pct: 20,
      volume_reduction_pct: 50,
      notes: 'Iniciado via bannerda de recomendação automática',
      is_active: true,
    });

    setStarting(false);
    if (error) { toast.error('Erro ao registrar deload'); return; }

    setStarted(true);
    toast.success('Semana de deload iniciada! Sua carga e volume serão monitorados.');
    onDeloadStarted?.();
  }

  if (started) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
        <div>
          <p className="font-semibold text-green-300 text-sm">Deload ativo esta semana</p>
          <p className="text-xs text-zinc-400 mt-0.5">Volume −50% · Carga −20% · Foco em recuperação e técnica</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-300 text-sm">Deload Recomendado pelo EDN</p>
            <p className="text-xs text-zinc-400 mt-1">{reason ?? 'O Performance Engine detectou sinais de fadiga acumulada ou estagnação.'}</p>
          </div>
          <button onClick={() => setExpanded(v => !v)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {!expanded && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => setExpanded(true)} className="text-xs text-amber-400 hover:text-amber-300">
              Ver protocolo EDN →
            </button>
            <button onClick={startDeload} disabled={starting} className="ml-auto flex items-center gap-1.5 text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg px-3 py-1.5 hover:bg-amber-500/30 transition-colors">
              {starting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Iniciar deload
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-amber-500/20 px-4 pb-4 space-y-3 pt-3">
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Protocolo EDN — Semana de Deload</p>
          <div className="space-y-2">
            {DELOAD_PROTOCOL.map((item, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold">{i + 1}</div>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">{item.day} — {item.focus}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setExpanded(false)} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:bg-zinc-800 transition-colors">Fechar</button>
            <button onClick={startDeload} disabled={starting} className="flex-1 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-1.5">
              {starting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Iniciar semana de deload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
