'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Circle, Bot,
  Loader2, Trophy, Clock, Zap, BarChart2, ArrowLeft, Play,
  Pause, Square, PlayCircle, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkoutExerciseWithExercise } from '@/types';

interface SetEntry { weight: string; reps: string; rir: string; completed: boolean; }
interface ExState {
  sets: SetEntry[];
  tip: string | null; tipLoading: boolean;
  feedback: string | null; feedbackLoading: boolean;
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="font-semibold text-zinc-100">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
}

function getYoutubeThumbnail(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

const MUSCLE_PT: Record<string, string> = {
  chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Biceps',
  triceps: 'Triceps', legs: 'Pernas', glutes: 'Gluteos', abs: 'Abdomen',
  calves: 'Panturrilha', forearms: 'Antebraco', full_body: 'Corpo Todo',
};
const RIR_OPTS = ['0', '1', '2', '3', '4'];

function defaultSets(count: number, prevW: number | null): SetEntry[] {
  return Array.from({ length: count }, () => ({ weight: prevW ? String(prevW) : '', reps: '', rir: '2', completed: false }));
}

export default function ExecutarPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const dayId = searchParams.get('day') ?? '';

  const [exercises, setExercises] = useState<WorkoutExerciseWithExercise[]>([]);
  const [dayName, setDayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [exStates, setExStates] = useState<ExState[]>([]);
  const [prevLoads, setPrevLoads] = useState<Record<string, number>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<'warmup' | 'active' | 'summary'>('warmup');
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<Date>(new Date());
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!dayId) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: dayData }, { data: sessions }] = await Promise.all([
        supabase.from('workout_days').select('name, workout_exercises(*, exercise:exercises(*))').eq('id', dayId).single(),
        supabase.from('workout_sessions').select('id').eq('user_id', user.id).order('started_at', { ascending: false }).limit(10),
      ]);
      if (!dayData) { setLoading(false); return; }
      const exs = ((dayData as any).workout_exercises ?? []) as WorkoutExerciseWithExercise[];
      exs.sort((a, b) => a.order_index - b.order_index);
      setDayName((dayData as any).name ?? 'Treino');
      setExercises(exs);
      if (sessions?.length) {
        const ids = sessions.map(s => s.id);
        const { data: ps } = await supabase.from('session_sets').select('exercise_id, weight_kg').in('session_id', ids).eq('completed', true).order('weight_kg', { ascending: false });
        if (ps) {
          const loads: Record<string, number> = {};
          ps.forEach(s => { if (!loads[s.exercise_id]) loads[s.exercise_id] = Number(s.weight_kg); });
          setPrevLoads(loads);
          setExStates(exs.map(ex => ({ sets: defaultSets(ex.sets, loads[ex.exercise_id] ?? null), tip: null, tipLoading: false, feedback: null, feedbackLoading: false })));
        } else {
          setExStates(exs.map(ex => ({ sets: defaultSets(ex.sets, null), tip: null, tipLoading: false, feedback: null, feedbackLoading: false })));
        }
      } else {
        setExStates(exs.map(ex => ({ sets: defaultSets(ex.sets, null), tip: null, tipLoading: false, feedback: null, feedbackLoading: false })));
      }
      setLoading(false);
    })();
  }, [dayId]);

  useEffect(() => {
    if (phase !== 'active' || isPaused) return;
    timerRef.current = setInterval(() => { elapsedRef.current += 1; setElapsed(elapsedRef.current); }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, isPaused]);

  const loadTip = useCallback(async (idx: number, exs: WorkoutExerciseWithExercise[], loads: Record<string, number>) => {
    if (idx >= exs.length) return;
    const ex = exs[idx];
    setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], tipLoading: true }; return n; });
    try {
      const res = await fetch('/api/workout-coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'tip', exercise: { name: ex.exercise.name, muscle_group: MUSCLE_PT[ex.exercise.muscle_group] ?? ex.exercise.muscle_group, sets: ex.sets, reps_min: ex.reps_min, reps_max: ex.reps_max, notes: ex.notes }, target_rir: 2, previous_load: loads[ex.exercise_id] ?? null }),
      });
      const { message } = await res.json();
      setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], tip: message ?? null, tipLoading: false }; return n; });
    } catch {
      setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], tipLoading: false }; return n; });
    }
  }, []);

  const loadFeedback = useCallback(async (idx: number, exs: WorkoutExerciseWithExercise[], states: ExState[]) => {
    const ex = exs[idx];
    const done = states[idx].sets.filter(s => s.completed);
    if (!done.length) return;
    setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], feedbackLoading: true }; return n; });
    try {
      const res = await fetch('/api/workout-coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'feedback', exercise: { name: ex.exercise.name, reps_min: ex.reps_min, reps_max: ex.reps_max }, sets_data: done.map(s => ({ weight_kg: parseFloat(s.weight) || 0, reps_done: parseInt(s.reps) || 0, rir: parseInt(s.rir) || 0 })), target_rir: 2 }),
      });
      const { message } = await res.json();
      setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], feedback: message ?? null, feedbackLoading: false }; return n; });
    } catch {
      setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], feedbackLoading: false }; return n; });
    }
  }, []);

  function startWorkout() {
    startedAt.current = new Date();
    setPhase('active');
    if (exercises.length > 0) loadTip(0, exercises, prevLoads);
  }

  function pauseWorkout() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsPaused(true);
  }

  function resumeWorkout() {
    setIsPaused(false);
  }

  function endWorkout() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase('summary');
  }

  function updateSet(exIdx: number, sIdx: number, field: keyof SetEntry, val: string | boolean) {
    setExStates(p => { const n = [...p]; const sets = [...n[exIdx].sets]; sets[sIdx] = { ...sets[sIdx], [field]: val }; n[exIdx] = { ...n[exIdx], sets }; return n; });
  }

  function toggleComplete(exIdx: number, sIdx: number) {
    setExStates(p => {
      const n = [...p];
      const sets = [...n[exIdx].sets];
      const prev = sets[sIdx].completed;
      sets[sIdx] = { ...sets[sIdx], completed: !prev };
      n[exIdx] = { ...n[exIdx], sets };
      const allDone = sets.every(s => s.completed);
      if (allDone && !prev && !n[exIdx].feedback && !n[exIdx].feedbackLoading) {
        setTimeout(() => loadFeedback(exIdx, exercises, n), 200);
      }
      return n;
    });
  }

  function goTo(idx: number) {
    setCurrentIdx(idx);
    if (exStates[idx] && !exStates[idx].tip && !exStates[idx].tipLoading) loadTip(idx, exercises, prevLoads);
  }

  function nextExercise() {
    if (currentIdx < exercises.length - 1) { goTo(currentIdx + 1); }
    else { endWorkout(); }
  }

  async function saveSession() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const finishedAt = new Date();
    let totalVolume = 0;
    const allSets: object[] = [];
    exercises.forEach((ex, ei) => {
      exStates[ei]?.sets.forEach((s, si) => {
        if (!s.completed) return;
        const w = parseFloat(s.weight) || 0, r = parseInt(s.reps) || 0;
        totalVolume += w * r;
        allSets.push({ exercise_id: ex.exercise_id, workout_exercise_id: ex.id, set_number: si + 1, weight_kg: w, reps_done: r, rir: s.rir !== '' ? parseInt(s.rir) : null, completed: true, set_type: 'working' });
      });
    });
    const { data: session, error } = await supabase.from('workout_sessions').insert({ user_id: user.id, workout_day_id: dayId || null, plan_id: id || null, started_at: startedAt.current.toISOString(), finished_at: finishedAt.toISOString(), duration_seconds: Math.round((finishedAt.getTime() - startedAt.current.getTime()) / 1000), total_volume_kg: Math.round(totalVolume), notes: '' }).select('id').single();
    if (error || !session) { toast.error('Erro ao salvar sessao'); setSaving(false); return; }
    if (allSets.length > 0) await supabase.from('session_sets').insert(allSets.map(s => ({ ...(s as object), session_id: session.id })));
    toast.success('Treino salvo!');
    router.push(`/app/treinos/${id}`);
  }

  const ex = exercises[currentIdx];
  const st = exStates[currentIdx];
  const doneCount = st?.sets.filter(s => s.completed).length ?? 0;
  const totalVol = exStates.reduce((a, s) => a + s.sets.reduce((b, set) => b + (set.completed ? (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0) : 0), 0), 0);
  const doneEx = exStates.filter(s => s.sets.length > 0 && s.sets.every(s => s.completed)).length;
  const thumbnail = ex ? getYoutubeThumbnail(ex.exercise.youtube_url ?? null) : null;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 text-blue-400 animate-spin" /></div>;

  // WARMUP
  if (phase === 'warmup') return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in-0 duration-200">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{dayName}</h1>
          <p className="text-sm text-zinc-500">{exercises.length} exercicios · {exercises.reduce((a, e) => a + e.sets, 0)} series</p>
        </div>
      </div>

      {/* RIR reminder */}
      <div className="rounded-xl border border-yellow-600/25 bg-yellow-600/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-yellow-400 shrink-0" />
          <p className="text-sm font-bold text-yellow-300">Lembrete: o que e RIR?</p>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          <span className="font-semibold text-zinc-300">RIR = Repeticoes em Recamara</span> — o numero de reps que você ainda conseguiria fazer, mas <em>nao fez</em>.
          Controlar o RIR e o que separa o treino inteligente (EDN) do treino ao acaso.
        </p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-zinc-800/80 p-2.5">
            <p className="font-black text-red-400 text-base">RIR 0</p>
            <p className="text-zinc-500 mt-0.5">Falha total</p>
            <p className="text-zinc-600 text-[10px]">nao sobrou nada</p>
          </div>
          <div className="rounded-lg bg-zinc-800/80 p-2.5 ring-1 ring-yellow-500/40">
            <p className="font-black text-yellow-400 text-base">RIR 2</p>
            <p className="text-zinc-400 mt-0.5 font-medium">Ideal EDN</p>
            <p className="text-zinc-600 text-[10px]">2 reps sobrando</p>
          </div>
          <div className="rounded-lg bg-zinc-800/80 p-2.5">
            <p className="font-black text-green-400 text-base">RIR 4+</p>
            <p className="text-zinc-500 mt-0.5">Leve demais</p>
            <p className="text-zinc-600 text-[10px]">aumente a carga</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {exercises.map((e, i) => (
          <div key={e.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-500">{i + 1}</span>
              <div>
                <p className="text-sm font-semibold text-zinc-100">{e.exercise.name}</p>
                <p className="text-xs text-zinc-500">{MUSCLE_PT[e.exercise.muscle_group] ?? e.exercise.muscle_group}</p>
              </div>
            </div>
            <span className="text-xs text-zinc-400 shrink-0 ml-4">{e.sets}x{e.reps_min}-{e.reps_max}</span>
          </div>
        ))}
      </div>

      <button onClick={startWorkout} className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-600/20">
        <Play className="h-5 w-5 fill-current" /> Iniciar Treino
      </button>
    </div>
  );

  // SUMMARY
  if (phase === 'summary') return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in-0 duration-200">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-yellow-400" />
        <h1 className="text-xl font-bold text-zinc-100">Treino concluido!</h1>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Duracao', value: fmtTime(elapsed), icon: <Clock className="h-4 w-4" />, color: 'text-blue-400' },
          { label: 'Volume', value: `${Math.round(totalVol)} kg`, icon: <BarChart2 className="h-4 w-4" />, color: 'text-green-400' },
          { label: 'Exercicios', value: `${doneEx}/${exercises.length}`, icon: <Zap className="h-4 w-4" />, color: 'text-orange-400' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
            <div className={cn('flex justify-center mb-1.5', s.color)}>{s.icon}</div>
            <p className={cn('text-xl font-black', s.color)}>{s.value}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
        {exercises.map((e, i) => {
          const s = exStates[i]; const done = s?.sets.filter(x => x.completed).length ?? 0;
          const vol = s?.sets.reduce((a, x) => a + (x.completed ? (parseFloat(x.weight)||0)*(parseInt(x.reps)||0) : 0), 0) ?? 0;
          return (
            <div key={e.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                {done === e.sets ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <Circle className="h-4 w-4 text-zinc-600 shrink-0" />}
                <p className="text-sm font-medium text-zinc-200">{e.exercise.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold text-zinc-400">{done}/{e.sets} series</p>
                {vol > 0 && <p className="text-[10px] text-zinc-600">{Math.round(vol)} kg</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3">
        <button onClick={() => router.back()} className="flex-1 py-3.5 rounded-xl border border-zinc-700 text-zinc-400 font-semibold hover:bg-zinc-800 transition-colors">Descartar</button>
        <button onClick={saveSession} disabled={saving} className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2 transition-colors">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Salvar treino</>}
        </button>
      </div>
    </div>
  );

  // ACTIVE
  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in-0 duration-200">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm -mx-4 px-4 -mt-8 pt-5 pb-3 border-b border-zinc-800/60 md:-mx-8 md:px-8">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <button onClick={() => router.back()} className="text-zinc-500 hover:text-zinc-300">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-sm font-bold text-zinc-100 leading-none">{dayName}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Exercicio {currentIdx + 1} de {exercises.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-zinc-300 mr-1">
              <Clock className={cn('h-3.5 w-3.5', isPaused ? 'text-yellow-500' : 'text-zinc-500')} />
              <span className={cn('font-mono font-bold text-sm tabular-nums', isPaused && 'text-yellow-400')}>{fmtTime(elapsed)}</span>
            </div>
            {!isPaused ? (
              <button onClick={pauseWorkout} title="Pausar" className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-yellow-400 transition-colors">
                <Pause className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button onClick={resumeWorkout} title="Retomar" className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 transition-colors">
                <PlayCircle className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={endWorkout} title="Encerrar treino" className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors">
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {exercises.map((_, i) => {
            const isDone = exStates[i]?.sets.length > 0 && exStates[i]?.sets.every(s => s.completed);
            return (
              <button key={i} onClick={() => goTo(i)} className={cn('flex-1 h-1.5 rounded-full transition-all', {
                'bg-blue-500': i === currentIdx,
                'bg-green-500': isDone && i !== currentIdx,
                'bg-zinc-700 hover:bg-zinc-600': !isDone && i !== currentIdx,
              })} />
            );
          })}
        </div>
      </div>

      {/* Paused overlay */}
      {isPaused && (
        <div className="rounded-2xl border border-yellow-600/30 bg-yellow-600/5 p-6 text-center space-y-3">
          <Pause className="h-8 w-8 text-yellow-400 mx-auto" />
          <p className="font-bold text-yellow-300 text-lg">Treino pausado</p>
          <p className="text-sm text-zinc-500">Descanse, hidrate-se, volte quando estiver pronto.</p>
          <button onClick={resumeWorkout} className="w-full py-3 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 font-bold flex items-center justify-center gap-2 transition-colors">
            <PlayCircle className="h-4 w-4" /> Retomar treino
          </button>
        </div>
      )}

      {!isPaused && (
        <>
          {/* Exercise name */}
          {ex && (
            <div className="flex items-start justify-between pt-1">
              <div>
                <h1 className="text-2xl font-black text-zinc-100 leading-tight">{ex.exercise.name}</h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {MUSCLE_PT[ex.exercise.muscle_group] ?? ex.exercise.muscle_group}
                  {' · '}{ex.sets}x{ex.reps_min}-{ex.reps_max} reps{' · '}RIR 2
                </p>
                {ex.notes && <p className="text-xs text-zinc-600 mt-1 italic">{ex.notes}</p>}
              </div>
              <span className={cn('shrink-0 ml-4 mt-1 text-xs font-bold px-2.5 py-1 rounded-full', doneCount === ex.sets ? 'bg-green-500/15 text-green-400' : 'bg-zinc-800 text-zinc-400')}>
                {doneCount}/{ex.sets}
              </span>
            </div>
          )}

          {/* Exercise video thumbnail */}
          {thumbnail && ex && (
            <a
              href={ex.exercise.youtube_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors group"
            >
              <div className="relative">
                <img
                  src={thumbnail}
                  alt={ex.exercise.name}
                  className="w-full object-cover"
                  style={{ maxHeight: '180px', objectPosition: 'center' }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 backdrop-blur-sm">
                    <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 bg-zinc-900 flex items-center gap-2">
                <PlayCircle className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-500">Demonstracao: {ex.exercise.name}</span>
              </div>
            </a>
          )}

          {/* AI Tip card */}
          {st && (
            <div className="rounded-xl border border-blue-600/20 bg-blue-600/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600/15">
                  <Bot className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Coach EDN diz</span>
              </div>
              {st.tipLoading ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Carregando dica...</span>
                </div>
              ) : st.tip ? (
                <p className="text-sm text-zinc-300 leading-relaxed"><Md text={st.tip} /></p>
              ) : (
                <p className="text-xs text-zinc-600 italic">IA indisponivel</p>
              )}
            </div>
          )}

          {/* Sets table */}
          {st && ex && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="grid grid-cols-[36px_1fr_1fr_90px_44px] items-center gap-2 px-4 py-2 border-b border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-600 uppercase">#</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Carga (kg)</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Reps</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">RIR</span>
                <span />
              </div>
              {st.sets.map((s, si) => (
                <div key={si} className={cn('grid grid-cols-[36px_1fr_1fr_90px_44px] items-center gap-2 px-4 py-2.5 border-b border-zinc-800/50 last:border-0 transition-colors', s.completed && 'bg-green-500/5')}>
                  <span className={cn('text-sm font-black text-center', s.completed ? 'text-green-400' : 'text-zinc-500')}>{si + 1}</span>
                  <input type="number" step="0.5" placeholder="--" value={s.weight} onChange={e => updateSet(currentIdx, si, 'weight', e.target.value)} disabled={s.completed}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 text-center placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" />
                  <input type="number" step="1" min="0" placeholder="--" value={s.reps} onChange={e => updateSet(currentIdx, si, 'reps', e.target.value)} disabled={s.completed}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 text-center placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" />
                  <select value={s.rir} onChange={e => updateSet(currentIdx, si, 'rir', e.target.value)} disabled={s.completed}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {RIR_OPTS.map(r => <option key={r} value={r}>RIR {r}</option>)}
                  </select>
                  <button onClick={() => toggleComplete(currentIdx, si)} className="flex h-9 w-9 items-center justify-center rounded-lg mx-auto transition-colors hover:bg-zinc-800">
                    {s.completed ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <Circle className="h-5 w-5 text-zinc-600" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* AI Feedback */}
          {st && (st.feedbackLoading || st.feedback) && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-500/10">
                  <Bot className="h-3.5 w-3.5 text-green-400" />
                </div>
                <span className="text-[11px] font-bold text-green-400 uppercase tracking-widest">Análise do Coach EDN</span>
              </div>
              {st.feedbackLoading ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Analisando suas series...</span>
                </div>
              ) : (
                <p className="text-sm text-zinc-300 leading-relaxed"><Md text={st.feedback!} /></p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pb-6">
            {currentIdx > 0 && (
              <button onClick={() => goTo(currentIdx - 1)} className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-zinc-700 text-zinc-400 font-semibold text-sm hover:bg-zinc-800 transition-colors">
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
            )}
            <button onClick={nextExercise} className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-600/15">
              {currentIdx < exercises.length - 1
                ? <><span>Proximo exercicio</span><ChevronRight className="h-4 w-4" /></>
                : <><Trophy className="h-4 w-4" /><span>Finalizar treino</span></>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
