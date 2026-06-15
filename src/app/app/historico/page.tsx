'use client';

import { useEffect, useState, useCallback } from 'react';
import { format, parseISO, formatDuration, intervalToDuration } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dumbbell, Clock, ChevronDown, ChevronUp, TrendingUp, Calendar, BarChart2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface SessionSet {
  exercise_id: string;
  reps_done: number;
  weight_kg: number;
  set_type: string;
  exercise?: { name: string; muscle_group: string };
}

interface WorkoutSession {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  total_volume_kg: number;
  notes: string;
  workout_day?: { name: string } | null;
  session_sets?: SessionSet[];
  coach_feedback?: Record<string, string> | null;
  progression?: Record<string, 'up' | 'same' | 'down' | 'new'>;
}

function fmtDuration(secs: number | null) {
  if (!secs) return '—';
  const d = intervalToDuration({ start: 0, end: secs * 1000 });
  if ((d.hours ?? 0) > 0) return `${d.hours}h ${d.minutes}min`;
  return `${d.minutes ?? 0}min`;
}

const MUSCLE_COLORS: Record<string, string> = {
  chest: 'text-red-400 bg-red-500/10',   back: 'text-[#D4853A] bg-[#D4853A]/10',
  shoulders: 'text-purple-400 bg-purple-500/10', biceps: 'text-orange-400 bg-orange-500/10',
  triceps: 'text-yellow-400 bg-yellow-500/10', legs: 'text-green-400 bg-green-500/10',
  glutes: 'text-pink-400 bg-pink-500/10', abs: 'text-cyan-400 bg-cyan-500/10',
};

// Renderiza **negrito** (e remove os asteriscos) — usado nas análises do Coach
function MdBold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="font-semibold text-zinc-100">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

export default function HistoricoPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 15;

  // Stats
  const totalVolume = sessions.reduce((s, sess) => s + (sess.total_volume_kg ?? 0), 0);
  const avgDuration = sessions.filter(s => s.duration_seconds).reduce((sum, s, _, arr) =>
    sum + (s.duration_seconds ?? 0) / arr.length, 0);

  const load = useCallback(async (pageNum: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const from = pageNum * PAGE_SIZE;
    const { data } = await supabase
      .from('workout_sessions')
      .select(`*, workout_day:workout_days(name)`)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    const results = (data ?? []) as WorkoutSession[];
    setSessions(prev => pageNum === 0 ? results : [...prev, ...results]);
    setHasMore(results.length === PAGE_SIZE);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(0); }, [load]);

  async function loadSets(sessionId: string) {
    if (expanded === sessionId) { setExpanded(null); return; }
    setExpanded(sessionId);

    // Only fetch if not already loaded
    const sess = sessions.find(s => s.id === sessionId);
    if (sess?.session_sets) return;

    const { data } = await supabase
      .from('session_sets')
      .select(`*, exercise:exercises(name, muscle_group)`)
      .eq('session_id', sessionId)
      .eq('completed', true)
      .order('set_number');

    const sets = (data ?? []) as SessionSet[];

    // Progressão: compara o maior peso de cada exercício com a sessão ANTERIOR
    const progression: Record<string, 'up' | 'same' | 'down' | 'new'> = {};
    try {
      const exIds = [...new Set(sets.map(s => s.exercise_id))];
      const { data: { user } } = await supabase.auth.getUser();
      if (user && exIds.length && sess) {
        const { data: prev } = await supabase
          .from('session_sets')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select('exercise_id, weight_kg, workout_sessions!inner(started_at, user_id)')
          .in('exercise_id', exIds)
          .eq('completed', true)
          .eq('workout_sessions.user_id', user.id)
          .lt('workout_sessions.started_at', sess.started_at);
        // melhor peso da sessão anterior mais recente, por exercício
        const prevByEx = new Map<string, { date: string; maxW: number }>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prev ?? []).forEach((r: any) => {
          const d = r.workout_sessions?.started_at as string; const w = Number(r.weight_kg) || 0;
          const cur = prevByEx.get(r.exercise_id);
          if (!cur || d > cur.date) prevByEx.set(r.exercise_id, { date: d, maxW: w });
          else if (d === cur.date && w > cur.maxW) cur.maxW = w;
        });
        const curByEx = new Map<string, number>();
        sets.forEach(s => { const w = Number(s.weight_kg) || 0; curByEx.set(s.exercise_id, Math.max(curByEx.get(s.exercise_id) ?? 0, w)); });
        curByEx.forEach((w, eid) => {
          const p = prevByEx.get(eid);
          if (!p) progression[eid] = 'new';
          else if (w > p.maxW) progression[eid] = 'up';
          else if (w < p.maxW) progression[eid] = 'down';
          else progression[eid] = 'same';
        });
      }
    } catch { /* progressão é opcional */ }

    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, session_sets: sets, progression } : s
    ));
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    load(next);
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-zinc-800 rounded" />
      {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-zinc-800 rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/dashboard" className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Histórico</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Todas as suas sessões de treino</p>
        </div>
      </div>

      {/* Stats strip */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Dumbbell className="h-4 w-4" />, label: 'Sessões', value: sessions.length + (hasMore ? '+' : '') },
            { icon: <BarChart2 className="h-4 w-4" />, label: 'Volume total', value: totalVolume > 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg` },
            { icon: <Clock className="h-4 w-4" />, label: 'Duração média', value: fmtDuration(Math.round(avgDuration)) },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-center">
              <div className="flex justify-center text-zinc-500 mb-1">{s.icon}</div>
              <p className="text-lg font-bold text-zinc-100">{s.value}</p>
              <p className="text-[10px] text-zinc-600">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-12 text-center">
          <Dumbbell className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Nenhuma sessão registrada</p>
          <p className="text-xs text-zinc-600 mt-1">Execute um treino para ver o histórico aqui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(sess => {
            const isOpen = expanded === sess.id;
            const dateStr = format(parseISO(sess.started_at), "EEE, dd 'de' MMM", { locale: ptBR });
            const timeStr = format(parseISO(sess.started_at), 'HH:mm');

            // Group sets by exercise
            const exerciseMap = new Map<string, { name: string; muscle: string; sets: SessionSet[] }>();
            (sess.session_sets ?? []).forEach(set => {
              const key = set.exercise_id;
              if (!exerciseMap.has(key)) {
                exerciseMap.set(key, {
                  name: set.exercise?.name ?? 'Exercício',
                  muscle: set.exercise?.muscle_group ?? '',
                  sets: [],
                });
              }
              exerciseMap.get(key)!.sets.push(set);
            });

            return (
              <div key={sess.id} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                {/* Row */}
                <button
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-zinc-800/50 transition-colors"
                  onClick={() => loadSets(sess.id)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4853A]/15 border border-[#D4853A]/20">
                    <Dumbbell className="h-4.5 w-4.5 text-[#D4853A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-100 text-sm truncate">
                      {sess.workout_day?.name ?? 'Treino Livre'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dateStr} · {timeStr}</span>
                      {sess.duration_seconds && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDuration(sess.duration_seconds)}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-[#D4853A]">{Math.round(sess.total_volume_kg)}kg</p>
                    <p className="text-[10px] text-zinc-600">volume</p>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
                </button>

                {/* Expanded sets */}
                {isOpen && (
                  <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
                    {exerciseMap.size === 0 ? (
                      <p className="text-xs text-zinc-500 text-center py-2">Sem séries registradas nesta sessão</p>
                    ) : (
                      [...exerciseMap.entries()].map(([id, ex]) => {
                        const prog = sess.progression?.[id];
                        const fb = sess.coach_feedback?.[id];
                        const progMeta = prog === 'up' ? { t: '↑ Progrediu', c: 'text-green-400 bg-green-500/10' }
                          : prog === 'down' ? { t: '↓ Caiu', c: 'text-red-400 bg-red-500/10' }
                          : prog === 'same' ? { t: '→ Manteve', c: 'text-zinc-400 bg-zinc-800' }
                          : prog === 'new' ? { t: 'Novo', c: 'text-[#D4853A] bg-[#D4853A]/10' } : null;
                        return (
                        <div key={id}>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', MUSCLE_COLORS[ex.muscle] ?? 'text-zinc-400 bg-zinc-800')}>
                              {ex.muscle}
                            </span>
                            <p className="text-xs font-semibold text-zinc-200">{ex.name}</p>
                            {progMeta && <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', progMeta.c)}>{progMeta.t}</span>}
                          </div>
                          <div className="flex flex-wrap gap-1.5 ml-0.5">
                            {ex.sets.map((set, i) => (
                              <span key={i} className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md font-mono">
                                {set.weight_kg}kg × {set.reps_done}
                              </span>
                            ))}
                          </div>
                          {fb && (
                            <div className="mt-1.5 ml-0.5 rounded-lg border border-[#D4853A]/20 bg-[#D4853A]/5 px-2.5 py-1.5">
                              <p className="text-[10px] font-bold text-[#D4853A] uppercase tracking-wider mb-0.5">Análise do Coach EDN</p>
                              <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-line"><MdBold text={fb} /></p>
                            </div>
                          )}
                        </div>
                        );
                      })
                    )}
                    {sess.notes && (
                      <p className="text-xs text-zinc-500 italic border-t border-zinc-800 pt-2">{sess.notes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button onClick={loadMore} className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Carregar mais sessões…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
