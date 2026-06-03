'use client';

import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { prTypeLabel, type PRType } from '@/lib/edn/pr-engine';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PR {
  id: string;
  exercise_id: string;
  pr_type: PRType;
  value: number;
  achieved_at: string;
  exercise: { name: string; muscle_group: string } | null;
}

const PR_COLORS: Record<PRType, string> = {
  load:          'text-orange-400 bg-orange-400/10 border-orange-400/20',
  reps:          'text-blue-400 bg-blue-400/10 border-blue-400/20',
  volume:        'text-green-400 bg-green-400/10 border-green-400/20',
  estimated_1rm: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

const PR_UNIT: Record<PRType, string> = {
  load: 'kg', reps: 'reps', volume: 'kg vol', estimated_1rm: 'kg 1RM',
};

export default function RecordsPage() {
  const supabase = createClient();
  const [records, setRecords] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('personal_records')
        .select('*, exercise:exercises(name, muscle_group)')
        .eq('user_id', user.id)
        .order('achieved_at', { ascending: false });
      setRecords((data ?? []) as PR[]);
      setLoading(false);
    })();
  }, []);

  // Agrupar por exercício
  const byExercise = records.reduce<Record<string, PR[]>>((acc, pr) => {
    const name = pr.exercise?.name ?? pr.exercise_id;
    if (!acc[name]) acc[name] = [];
    acc[name].push(pr);
    return acc;
  }, {});

  return (
    <div className="space-y-5 animate-in fade-in-0 duration-300 pb-8">
      <div className="flex items-center gap-3">
        <Link href="/app/treinos" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-400" /> Recordes Pessoais
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{records.length} PRs registrados</p>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-zinc-800 animate-pulse" />)}
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-12 text-center">
          <Trophy className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="font-semibold text-zinc-300">Nenhum PR ainda</p>
          <p className="text-sm text-zinc-500 mt-1">Complete treinos e as Top Sets para registrar seus recordes</p>
        </div>
      )}

      {Object.entries(byExercise).map(([name, prs]) => (
        <div key={name} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            <p className="font-semibold text-zinc-100">{name}</p>
            {prs[0]?.exercise?.muscle_group && (
              <span className="text-xs text-zinc-500 ml-auto capitalize">{prs[0].exercise.muscle_group}</span>
            )}
          </div>
          <div className="divide-y divide-zinc-800">
            {prs.map(pr => (
              <div key={pr.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn('text-xs font-bold px-2 py-1 rounded-lg border', PR_COLORS[pr.pr_type])}>
                  {prTypeLabel(pr.pr_type)}
                </span>
                <p className="text-lg font-black text-zinc-100 ml-auto">
                  {pr.value} <span className="text-sm font-normal text-zinc-500">{PR_UNIT[pr.pr_type]}</span>
                </p>
                <p className="text-xs text-zinc-600 w-20 text-right">
                  {format(parseISO(pr.achieved_at), 'dd/MM/yy', { locale: ptBR })}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
