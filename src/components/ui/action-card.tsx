'use client';
/**
 * ActionCard — V5.0 Pillar 4
 * Exibe sugestão do Coach EDN com botão de ação aplicável.
 */
import { useState } from 'react';
import { Zap, Check, Loader2 } from 'lucide-react';
import { Button } from './button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ActionPayload } from '@/app/api/apply-action/route';

interface ActionCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action: ActionPayload;
  variant?: 'blue' | 'amber' | 'green' | 'red';
  onApplied?: () => void;
}

const VARIANTS = {
  blue:  { border: 'border-[#D4853A]/30',  bg: 'bg-[#D4853A]/5',  icon: 'text-[#D4853A]',  btn: '' },
  amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', icon: 'text-amber-400', btn: 'bg-amber-600 hover:bg-amber-700 text-white border-0' },
  green: { border: 'border-green-600/30', bg: 'bg-green-600/5', icon: 'text-green-400', btn: 'bg-green-600 hover:bg-green-700 text-white border-0' },
  red:   { border: 'border-red-600/30',   bg: 'bg-red-600/5',   icon: 'text-red-400',   btn: 'bg-red-600 hover:bg-red-700 text-white border-0' },
};

export function ActionCard({ icon, title, description, action, variant = 'blue', onApplied }: ActionCardProps) {
  const [applied, setApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const v = VARIANTS[variant];

  async function apply() {
    setLoading(true);
    try {
      const res = await fetch('/api/apply-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? 'Ação aplicada!');
        setApplied(true);
        onApplied?.();
      } else {
        toast.error(data.error ?? 'Erro ao aplicar ação');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  if (applied) {
    return (
      <div className={cn('rounded-xl border p-4 flex items-center gap-3', 'border-green-600/30 bg-green-600/5')}>
        <Check className="h-4 w-4 text-green-400 shrink-0" />
        <p className="text-sm text-green-300">Aplicado com sucesso.</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border p-4 space-y-3', v.border, v.bg)}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 shrink-0', v.icon)}>{icon ?? <Zap className="h-4 w-4" />}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{title}</p>
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <Button
        size="sm"
        className={cn('w-full gap-2', v.btn)}
        onClick={apply}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        {loading ? 'Aplicando...' : 'Aplicar'}
      </Button>
    </div>
  );
}

// ── Preset action cards ────────────────────────────────────────────────────────
export function ReduceCaloriesCard({ kcal = 150, onApplied }: { kcal?: number; onApplied?: () => void }) {
  return (
    <ActionCard
      title={`Reduzir ${kcal}kcal da meta diária`}
      description={`Peso estabilizado. Reduzir ${kcal}kcal reativa o déficit e retoma a perda de gordura.`}
      action={{ type: 'reduce_calories', value: kcal, reason: 'plateau' }}
      variant="amber"
      onApplied={onApplied}
    />
  );
}

export function ApplyDeloadCard({ onApplied }: { onApplied?: () => void }) {
  return (
    <ActionCard
      title="Aplicar Deload esta semana"
      description="Sem PR há 3+ semanas. Um deload de volume (50% de séries, mesmas cargas) vai maximizar as próximas 4 semanas."
      action={{ type: 'apply_deload', reason: 'stagnation' }}
      variant="blue"
      onApplied={onApplied}
    />
  );
}

export function AddHiitCard({ sessions = 2, onApplied }: { sessions?: number; onApplied?: () => void }) {
  return (
    <ActionCard
      title={`Adicionar ${sessions}x HIIT por semana`}
      description="Perda de gordura desacelerando. HIIT 20-25min acelera o gasto calórico sem interferir no treino de força."
      action={{ type: 'add_cardio_goal', value: sessions * 5 }}
      variant="green"
      onApplied={onApplied}
    />
  );
}
