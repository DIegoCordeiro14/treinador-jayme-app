'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { newId, insertOrQueue, flushQueue } from '@/lib/offline-queue';
import { suggestProgression } from '@/lib/edn/progression-engine';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Circle, Bot, TrendingUp,
  Loader2, Trophy, Clock, Zap, BarChart2, ArrowLeft, Play,
  Pause, Square, PlayCircle, Info, Activity, Heart, Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkoutExerciseWithExercise } from '@/types';
import { RestTimer } from '@/components/workout/rest-timer';
import { fetchWorkoutMetrics, fetchLiveHr, type WorkoutMetrics } from '@/lib/wearables/workout-metrics';

type SetType = 'aquecimento' | 'feeder' | 'top' | 'working';
interface SetEntry { weight: string; reps: string; rir: string; completed: boolean; setType: SetType; }

const SET_TYPE_CONFIG: Record<SetType, { label: string; color: string; bg: string }> = {
  aquecimento: { label: 'Aquecimento', color: 'text-sky-400',    bg: 'bg-sky-400/15 border-sky-400/30' },
  feeder:      { label: 'Feeder',      color: 'text-yellow-400', bg: 'bg-yellow-400/15 border-yellow-400/30' },
  top:         { label: 'Top Set',     color: 'text-orange-400', bg: 'bg-orange-400/15 border-orange-400/30' },
  working:     { label: 'Working',     color: 'text-zinc-300',   bg: 'bg-zinc-700/50 border-zinc-600/30' },
};
const SET_TYPE_CYCLE: SetType[] = ['aquecimento', 'feeder', 'top', 'working'];

function autoSetTypes(count: number): SetType[] {
  if (count === 1) return ['top'];
  if (count === 2) return ['aquecimento', 'top'];
  if (count === 3) return ['aquecimento', 'top', 'working'];
  if (count === 4) return ['aquecimento', 'feeder', 'top', 'working'];
  // 5+: aquecimento(s) + feeder + top + working(s)
  const types: SetType[] = ['aquecimento', 'aquecimento', 'feeder', 'top'];
  for (let i = 4; i < count; i++) types.push('working');
  return types;
}
interface ExState {
  sets: SetEntry[];
  tip: string | null; tipLoading: boolean;
  feedback: string | null; feedbackLoading: boolean;
}

// V6.5 — Pilar 5: análise pré-treino do Coach EDN
type PreCheckAdjustment = 'progress' | 'maintain' | 'reduce_10' | 'reduce_25' | 'rest';
interface PreCheck {
  adjustment: PreCheckAdjustment;
  message: string;
  recovery: { score: number; category: string };
}

const PRECHECK_STYLE: Record<PreCheckAdjustment, { title: string; border: string; bg: string; text: string }> = {
  progress:  { title: 'Dia de progressão',         border: 'border-emerald-600/30', bg: 'bg-emerald-600/5', text: 'text-emerald-300' },
  maintain:  { title: 'Treino conforme o plano',   border: 'border-blue-600/30',    bg: 'bg-blue-600/5',    text: 'text-blue-300' },
  reduce_10: { title: 'Hoje sem intensificação',   border: 'border-yellow-600/30',  bg: 'bg-yellow-600/5',  text: 'text-yellow-300' },
  reduce_25: { title: 'Volume reduzido em ~25%',   border: 'border-orange-600/30',  bg: 'bg-orange-600/5',  text: 'text-orange-300' },
  rest:      { title: 'Descanso recomendado',      border: 'border-red-600/30',     bg: 'bg-red-600/5',     text: 'text-red-300' },
};

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
  const types = autoSetTypes(count);
  return Array.from({ length: count }, (_, i) => ({
    weight: '',
    reps: '',
    rir: types[i] === 'aquecimento' ? '4' : types[i] === 'feeder' ? '3' : '2',
    completed: false,
    setType: types[i],
  }));
}

export default function ExecutarPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const dayId = searchParams.get('day') ?? '';

  const [exercises, setExercises] = useState<WorkoutExerciseWithExercise[]>([]);
  const [restTimer, setRestTimer] = useState<{ duration: number } | null>(null);
  const [dayName, setDayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [exStates, setExStates] = useState<ExState[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [prescriptions, setPrescriptions] = useState<Record<string, any>>({});
  const [prevLoads, setPrevLoads] = useState<Record<string, number>>({});
  const [prevTimes, setPrevTimes] = useState<Record<string, number>>({}); // isométrico: tempo (s) anterior
  const [ednSuggestions, setEdnSuggestions] = useState<Record<string, { suggestedWeight: number; model: string; stagnant: boolean }>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<'warmup' | 'active' | 'summary'>('warmup');
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [liveHr, setLiveHr] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<WorkoutMetrics | null>(null);
  const [preCheck, setPreCheck] = useState<PreCheck | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<Date>(new Date());
  const elapsedRef = useRef(0);
  // Cronômetro por timestamp (imune a background) + persistência do progresso
  const accumRef = useRef(0);
  const runStartRef = useRef(0);
  const countingRef = useRef(false);
  const restoredRef = useRef(false);
  const phaseRef = useRef<'warmup' | 'active' | 'summary'>('warmup');
  const isPausedRef = useRef(false);
  const syncElapsedRef = useRef<() => void>(() => {});
  const setCountingRef = useRef<(on: boolean) => void>(() => {});
  const saveProgressRef = useRef<() => void>(() => {});
  const storageKey = `edn_workout_progress_${id}_${dayId}`;

  // V6.5 — Pilar 5: consulta o Coach EDN antes do treino
  useEffect(() => {
    fetch('/api/pre-workout-check')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.adjustment) setPreCheck(d as PreCheck); })
      .catch(() => {});
  }, []);

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
        const { data: ps } = await supabase.from('session_sets').select('exercise_id, weight_kg, reps_done, session_id').in('session_id', ids).eq('completed', true);
        if (ps) {
          const loads: Record<string, number> = {};
          // Agrupar por exercise_id e session para detectar estagnação
          const byEx: Record<string, number[]> = {};
          const times: Record<string, number> = {};
          ps.forEach(s => {
            const eid = s.exercise_id;
            const w = Number(s.weight_kg);
            if (!byEx[eid]) byEx[eid] = [];
            byEx[eid].push(w);
            if (!loads[eid] || w > loads[eid]) loads[eid] = w;
            const r = Number((s as any).reps_done) || 0;
            if (!times[eid] || r > times[eid]) times[eid] = r;
          });
          setPrevLoads(loads);
          setPrevTimes(times);
          // Calcular sugestões EDN simples
          const suggestions: Record<string, { suggestedWeight: number; model: string; stagnant: boolean }> = {};
          Object.entries(byEx).forEach(([eid, weights]) => {
            const sorted = [...new Set(weights)].sort((a, b) => b - a);
            const top = sorted[0] ?? 0;
            const stagnant = sorted.length < 2 ? false : (sorted[0] - sorted[sorted.length - 1]) < 2.5;
            suggestions[eid] = { suggestedWeight: stagnant ? top : top + 2.5, model: stagnant ? 'Estagnado — tente aumentar o volume' : 'Progressão linear', stagnant };
          });
          setEdnSuggestions(suggestions);
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
    if (!dayId) return;
    fetch(`/api/prescribe-loads?dayId=${dayId}`).then(r => r.json()).then(d => { if (d?.prescriptions) setPrescriptions(d.prescriptions); }).catch(() => {});
  }, [dayId]);

// (sem auto-preenchimento: as cargas só entram ao tocar em 'Preencher cargas sugeridas')

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // Cronômetro por relógio real — continua certo mesmo em background.
  useEffect(() => {
    if (phase === 'active' && !isPaused) {
      setCountingRef.current(true);
      timerRef.current = setInterval(() => syncElapsedRef.current(), 500);
      return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
    }
    setCountingRef.current(false);
  }, [phase, isPaused]);

  // Retoma um treino salvo (mesmo aparelho) — entra PAUSADO, sem perder nada.
  useEffect(() => {
    if (loading || restoredRef.current || exStates.length === 0) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.exStates || saved.exStates.length !== exStates.length) return;
      setExStates(saved.exStates);
      setCurrentIdx(Math.min(saved.currentIdx ?? 0, exStates.length - 1));
      accumRef.current = saved.elapsed ?? 0;
      elapsedRef.current = saved.elapsed ?? 0;
      setElapsed(saved.elapsed ?? 0);
      countingRef.current = false;
      if (saved.startedAt) startedAt.current = new Date(saved.startedAt);
      setPhase('active');
      setIsPaused(true);
      toast('Treino retomado — estava pausado. Toque em Retomar para continuar.');
    } catch { /* ignore */ }
  }, [loading, exStates.length, storageKey]);

  // Auto-salva o progresso a cada mudança relevante.
  useEffect(() => {
    if (phase === 'active') saveProgressRef.current();
  }, [exStates, currentIdx, isPaused, phase]);

  // Ao sair (trocar de aba, minimizar, fechar) → auto-pausa e salva tudo.
  useEffect(() => {
    const persist = () => {
      if (phaseRef.current !== 'active') return;
      // Bloquear a tela NÃO pausa o treino — só salva. O cronômetro é por
      // timestamp, então o tempo segue correto ao voltar. Só pausa se o
      // usuário tocar em Pausar.
      saveProgressRef.current();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') persist();
      else syncElapsedRef.current();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', persist);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', persist);
      saveProgressRef.current(); // salva ao desmontar (navegou para outra tela)
    };
  }, []);

  const loadTip = useCallback(async (idx: number, exs: WorkoutExerciseWithExercise[], loads: Record<string, number>) => {
    if (idx >= exs.length) return;
    const ex = exs[idx];
    setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], tipLoading: true }; return n; });
    try {
      const res = await fetch('/api/workout-coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'tip', exercise: { name: ex.exercise.name, muscle_group: MUSCLE_PT[ex.exercise.muscle_group] ?? ex.exercise.muscle_group, sets: ex.sets, reps_min: ex.reps_min, reps_max: ex.reps_max, notes: ex.notes }, target_rir: 2, previous_load: loads[ex.exercise_id] ?? null, isometric: !!(ex.exercise as any)?.is_isometric,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          prescribed: (() => { const p = (prescriptions as any)[ex.id]; return p && !p.noHistory && p.topSet ? { topKg: p.topSet.weightKg, topReps: p.topSet.reps, strategy: p.strategy } : null; })() }),
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
    // Próxima carga DETERMINÍSTICA (mesmo motor do Load Intelligence), a partir do top set real
    const isoEx = !!(ex.exercise as any)?.is_isometric;
    let nextSuggestion: { weightKg: number; reps: number } | null = null;
    if (!isoEx) {
      const cand = done.map(s => ({ weightKg: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0, rir: s.rir !== '' ? parseInt(s.rir) : null }))
        .filter(x => x.weightKg > 0).sort((a, b) => b.weightKg - a.weightKg)[0];
      if (cand) {
        const pr = suggestProgression({ weightKg: cand.weightKg, reps: cand.reps, rir: cand.rir, repsMin: ex.reps_min, repsMax: ex.reps_max });
        nextSuggestion = { weightKg: pr.nextWeightKg ?? cand.weightKg, reps: Math.max(ex.reps_min, Math.min(ex.reps_max, pr.nextReps ?? ex.reps_min)) };
      }
    }
    try {
      const res = await fetch('/api/workout-coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'feedback', exercise: { name: ex.exercise.name, reps_min: ex.reps_min, reps_max: ex.reps_max }, sets_data: done.map(s => ({ weight_kg: parseFloat(s.weight) || 0, reps_done: parseInt(s.reps) || 0, rir: parseInt(s.rir) || 0 })), target_rir: 2, isometric: isoEx, avg_hr: liveHr, next_suggestion: nextSuggestion }),
      });
      const { message } = await res.json();
      setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], feedback: message ?? null, feedbackLoading: false }; return n; });
    } catch {
      setExStates(p => { const n = [...p]; n[idx] = { ...n[idx], feedbackLoading: false }; return n; });
    }
  }, []);

  // ── Cronômetro / persistência (refs sempre apontam para a versão atual) ──────
  const syncElapsed = () => {
    const base = accumRef.current;
    const live = countingRef.current ? (Date.now() - runStartRef.current) / 1000 : 0;
    elapsedRef.current = Math.floor(base + live);
    setElapsed(elapsedRef.current);
  };
  const setCounting = (on: boolean) => {
    if (on === countingRef.current) return;
    const now = Date.now();
    if (on) runStartRef.current = now;
    else accumRef.current += (now - runStartRef.current) / 1000;
    countingRef.current = on;
    syncElapsed();
  };
  const saveProgress = () => {
    if (phaseRef.current !== 'active') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        v: 1,
        currentIdx,
        elapsed: elapsedRef.current,
        isPaused: isPausedRef.current,
        startedAt: startedAt.current.toISOString(),
        exStates,
      }));
    } catch { /* ignore */ }
  };
  const clearProgress = () => { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } };
  syncElapsedRef.current = syncElapsed;
  setCountingRef.current = setCounting;
  saveProgressRef.current = saveProgress;

  // FC "quase ao vivo" do relógio durante o treino (Health Connect, best-effort)
  useEffect(() => {
    if (phase !== 'active') { return; }
    let alive = true;
    const tick = async () => { const hr = await fetchLiveHr(); if (alive && hr) setLiveHr(hr); };
    tick();
    const id = setInterval(tick, 45000);
    return () => { alive = false; clearInterval(id); };
  }, [phase]);

  function startWorkout() {
    startedAt.current = new Date();
    accumRef.current = 0;
    runStartRef.current = Date.now();
    countingRef.current = false;
    elapsedRef.current = 0;
    setElapsed(0);
    setPhase('active');
    if (exercises.length > 0) loadTip(0, exercises, prevLoads);
  }

  function pauseWorkout() {
    setIsPaused(true);
    saveProgressRef.current();
  }

  function resumeWorkout() {
    setIsPaused(false);
  }

  function endWorkout() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setCounting(false);
    setPhase('summary');
  }

  function cycleSetType(exIdx: number, sIdx: number) {
    setExStates(p => {
      const n = [...p];
      const sets = [...n[exIdx].sets];
      const curr = sets[sIdx].setType;
      const nextIdx = (SET_TYPE_CYCLE.indexOf(curr) + 1) % SET_TYPE_CYCLE.length;
      sets[sIdx] = { ...sets[sIdx], setType: SET_TYPE_CYCLE[nextIdx] };
      n[exIdx] = { ...n[exIdx], sets };
      return n;
    });
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
      // Iniciar rest timer quando série é marcada como concluída (não ao desmarcar)
      if (!prev) {
        const restSecs = exercises[exIdx]?.rest_seconds ?? 90;
        const setType = sets[sIdx].setType;
        // Não mostrar timer para séries de aquecimento
        if (setType !== 'aquecimento') {
          setRestTimer({ duration: restSecs });
        }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isoEx = !!(ex.exercise as any)?.is_isometric;
        const w = isoEx ? 0 : (parseFloat(s.weight) || 0), r = parseInt(s.reps) || 0;
        totalVolume += w * r;
        allSets.push({ exercise_id: ex.exercise_id, workout_exercise_id: ex.id, set_number: si + 1, weight_kg: w, reps_done: r, rir: s.rir !== '' ? parseInt(s.rir) : null, completed: true, set_type: s.setType });
      });
    });
    // Análises do Coach EDN por exercício (exercise_id -> texto)
    const coachFeedback: Record<string, string> = {};
    exercises.forEach((ex, ei) => { const fb = exStates[ei]?.feedback; if (fb) coachFeedback[ex.exercise_id] = fb; });
    // FC média do período do treino — só grava se vier do relógio (Health Connect)
    let m = { avgHr: null as number | null, maxHr: null as number | null, calories: null as number | null };
    try { m = await fetchWorkoutMetrics(startedAt.current.getTime(), finishedAt.getTime()); } catch { /* sem relógio/offline */ }
    setMetrics(m);
    const avgHr = m.avgHr;
    // ID gerado no cliente -> permite salvar offline sem roundtrip e é idempotente no reenvio
    const sessionId = newId();
    const sessionRow = { id: sessionId, user_id: user.id, workout_day_id: dayId || null, plan_id: id || null, started_at: startedAt.current.toISOString(), finished_at: finishedAt.toISOString(), duration_seconds: Math.round((finishedAt.getTime() - startedAt.current.getTime()) / 1000), total_volume_kg: Math.round(totalVolume), notes: '', avg_hr: avgHr, max_hr: m.maxHr, calories_burned: m.calories, coach_feedback: coachFeedback };
    const setRows = allSets.map(s => ({ id: newId(), ...(s as object), session_id: sessionId }));
    const inserts = [
      { table: 'workout_sessions', rows: [sessionRow] },
      ...(setRows.length > 0 ? [{ table: 'session_sets', rows: setRows }] : []),
    ];
    const result = await insertOrQueue(supabase, inserts, 'Treino');
    if (result === 'error') { toast.error('Erro ao salvar sessao'); setSaving(false); return; }
    clearProgress();
    if (result === 'queued') toast.success('Treino salvo offline — será enviado ao reconectar.');
    else { toast.success('Treino salvo!'); flushQueue(supabase).catch(() => {}); }
    router.push(`/app/treinos/${id}`);
  }

  const ex = exercises[currentIdx];
  const st = exStates[currentIdx];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iso = !!(ex?.exercise as any)?.is_isometric; // isométrico: prescrito por tempo (s)
  // Sugestão de carga/reps por série (EDN Load Intelligence), casada por tipo de série
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sugForSet: ({ weightKg: number; reps: number } | null)[] = (() => {
    const p = ex ? (prescriptions as any)[ex.id] : null;
    if (!p || p.noHistory || !st || iso) return (st?.sets ?? []).map(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool: Record<string, any[]> = { aquecimento: [], feeder: [], top: [], working: [] };
    for (const x of (p.sets ?? [])) (pool[x.kind] ?? (pool[x.kind] = [])).push(x);
    const idx: Record<string, number> = { aquecimento: 0, feeder: 0, top: 0, working: 0 };
    return st.sets.map((se) => { const arr = pool[se.setType] ?? []; const v = arr[idx[se.setType]++] ?? arr[arr.length - 1] ?? null; return v ? { weightKg: v.weightKg, reps: v.reps } : null; });
  })();
  const doneCount = st?.sets.filter(s => s.completed).length ?? 0;
  const totalVol = exStates.reduce((a, s) => a + s.sets.reduce((b, set) => b + (set.completed ? (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0) : 0), 0), 0);
  const doneEx = exStates.filter(s => s.sets.length > 0 && s.sets.every(s => s.completed)).length;
  const thumbnail = ex ? getYoutubeThumbnail(ex.exercise.youtube_url ?? null) : null;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 text-[#D4853A] animate-spin" /></div>;

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

      {/* V6.5 — Pilar 5: análise pré-treino do Coach EDN */}
      {preCheck && (() => {
        const sty = PRECHECK_STYLE[preCheck.adjustment];
        return (
          <div className={cn('rounded-xl border p-4 space-y-2', sty.border, sty.bg)}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className={cn('h-4 w-4 shrink-0', sty.text)} />
                <p className={cn('text-sm font-bold', sty.text)}>Coach EDN — {sty.title}</p>
              </div>
              <span className="text-[11px] font-semibold text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-full shrink-0">
                Prontidão {preCheck.recovery.score}/100
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{preCheck.message}</p>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  preCheck.recovery.score >= 85 ? 'bg-emerald-500' :
                  preCheck.recovery.score >= 70 ? 'bg-blue-500' :
                  preCheck.recovery.score >= 55 ? 'bg-yellow-500' :
                  preCheck.recovery.score >= 40 ? 'bg-orange-500' : 'bg-red-500')}
                style={{ width: `${preCheck.recovery.score}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* RIR reminder */}
      <div className="rounded-xl border border-yellow-600/25 bg-yellow-600/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-yellow-400 shrink-0" />
          <p className="text-sm font-bold text-yellow-300">Lembrete: o que e RIR?</p>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          <span className="font-semibold text-zinc-300">RIR = Repeticoes em Recamara</span> — o numero de reps que voce ainda conseguiria fazer, mas <em>nao fez</em>.
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
            <span className="text-xs text-zinc-400 shrink-0 ml-4">{(e.exercise as any)?.is_isometric ? `${e.sets}× ${e.reps_min}-${e.reps_max}s` : `${e.sets}x${e.reps_min}-${e.reps_max}`}</span>
          </div>
        ))}
      </div>

      <button onClick={startWorkout} className="w-full py-4 rounded-2xl bg-[#D4853A] hover:bg-[#D4853A] text-white font-black text-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#D4853A]/20">
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
          { label: 'Duracao', value: fmtTime(elapsed), icon: <Clock className="h-4 w-4" />, color: 'text-[#D4853A]' },
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
      {metrics && (metrics.avgHr || metrics.maxHr || metrics.calories) && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'FC media', value: metrics.avgHr ? `${metrics.avgHr}` : '—', icon: <Heart className="h-4 w-4" />, color: 'text-red-400' },
            { label: 'FC max', value: metrics.maxHr ? `${metrics.maxHr}` : '—', icon: <Heart className="h-4 w-4" />, color: 'text-red-400' },
            { label: 'Calorias', value: metrics.calories ? `${metrics.calories}` : '—', icon: <Flame className="h-4 w-4" />, color: 'text-orange-400' },
          ].map(s2 => (
            <div key={s2.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
              <div className={cn('flex justify-center mb-1.5', s2.color)}>{s2.icon}</div>
              <p className={cn('text-xl font-black', s2.color)}>{s2.value}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">{s2.label}{(s2.label !== 'Calorias') ? ' bpm' : ' kcal'}</p>
            </div>
          ))}
        </div>
      )}
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
        <button onClick={() => { clearProgress(); router.back(); }} className="flex-1 py-3.5 rounded-xl border border-zinc-700 text-zinc-400 font-semibold hover:bg-zinc-800 transition-colors">Descartar</button>
        <button onClick={saveSession} disabled={saving} className="flex-1 py-3.5 rounded-xl bg-[#D4853A] hover:bg-[#D4853A] disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2 transition-colors">
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
              {liveHr != null && (<span className="flex items-center gap-1 ml-2 text-red-400"><Heart className="h-3.5 w-3.5 fill-current" /><span className="font-mono font-bold text-sm tabular-nums">{liveHr}</span></span>)}
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
                'bg-[#D4853A]': i === currentIdx,
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
                  {' · '}{iso ? `${ex.sets}× ${ex.reps_min}-${ex.reps_max}s` : `${ex.sets}x${ex.reps_min}-${ex.reps_max} reps`}{' · '}{iso ? 'isométrico' : 'RIR 2'}
                </p>
                {ex.notes && <p className="text-xs text-zinc-600 mt-1 italic">{ex.notes}</p>}
              </div>
              <span className={cn('shrink-0 ml-4 mt-1 text-xs font-bold px-2.5 py-1 rounded-full', doneCount === ex.sets ? 'bg-green-500/15 text-green-400' : 'bg-zinc-800 text-zinc-400')}>
                {doneCount}/{ex.sets}
              </span>
            </div>
          )}

          {/* Sugestão EDN + alerta de estagnação */}
          {ex && iso && (() => {
            const pt = prevTimes[ex.exercise_id] ?? 0;
            const target = pt > 0 ? pt + 5 : ex.reps_max;
            return (
              <div className="rounded-lg border px-3 py-2.5 flex items-center gap-3 border-[#D4853A]/20 bg-[#D4853A]/5">
                <TrendingUp className="h-4 w-4 shrink-0 text-[#D4853A]" />
                <div>
                  <p className="text-xs font-bold text-[#E09B5A]">
                    {pt > 0 ? `Sugestão EDN: sustentar ~${target}s (progrida no tempo)` : `Isométrico — alvo ${ex.reps_min}-${ex.reps_max}s com técnica limpa`}
                  </p>
                  <p className="text-[10px] text-zinc-500">{pt > 0 ? `Último: ${pt}s — supere mantendo a técnica` : 'Sem carga e sem reps: progressão por tempo de sustentação'}</p>
                </div>
              </div>
            );
          })()}

          {ex && !iso && (() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = (prescriptions as any)[ex.id];
            const sg = ednSuggestions[ex.exercise_id];
            if (p && !p.noHistory && p.topSet) {
              return (
                <div className="rounded-lg border px-3 py-2.5 flex items-center gap-3 border-[#D4853A]/20 bg-[#D4853A]/5">
                  <TrendingUp className="h-4 w-4 shrink-0 text-[#D4853A]" />
                  <div>
                    <p className="text-xs font-bold text-[#E09B5A]">Sugestão EDN: {p.topSet.weightKg}kg × {p.topSet.reps} (Top Set)</p>
                    <p className="text-[10px] text-zinc-500">{p.strategy}{p.confidence != null ? ` · confiança ${p.confidence}%` : ''}</p>
                  </div>
                </div>
              );
            }
            if (!sg) return null;
            return (
              <div className={cn('rounded-lg border px-3 py-2.5 flex items-center gap-3', sg.stagnant ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-[#D4853A]/20 bg-[#D4853A]/5')}>
                <TrendingUp className={cn('h-4 w-4 shrink-0', sg.stagnant ? 'text-yellow-400' : 'text-[#D4853A]')} />
                <div>
                  <p className={cn('text-xs font-bold', sg.stagnant ? 'text-yellow-300' : 'text-[#E09B5A]')}>
                    {sg.stagnant ? '⚠ Estagnação detectada — aumente volume ou mude progressão' : `Sugestão EDN: ${sg.suggestedWeight}kg (Top Set)`}
                  </p>
                  <p className="text-[10px] text-zinc-500">{sg.model}</p>
                </div>
              </div>
            );
          })()}

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
            <div className="rounded-xl border border-[#D4853A]/20 bg-[#D4853A]/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#D4853A]/15">
                  <Bot className="h-3.5 w-3.5 text-[#D4853A]" />
                </div>
                <span className="text-[11px] font-bold text-[#D4853A] uppercase tracking-widest">Coach EDN diz</span>
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

          {/* Sugestão de cargas EDN — inline por série (ver placeholders) */}
          {ex && !iso && prescriptions[ex.id] && !prescriptions[ex.id].noHistory && (() => {
            const p = prescriptions[ex.id];
            const working = (p.sets ?? []).find((x: any) => x.kind === 'working') ?? p.topSet;
            const fillAll = () => { (st?.sets ?? []).forEach((se, si) => { if (st!.sets[si].completed) return; const sg = sugForSet[si]; updateSet(currentIdx, si, 'weight', String((sg ?? working)?.weightKg ?? '')); if (!st!.sets[si].reps) updateSet(currentIdx, si, 'reps', String((sg ?? working)?.reps ?? '')); }); };
            return (
              <div className="flex items-center justify-end mb-2 text-[11px]">
                <button onClick={fillAll} className="text-[#D4853A] hover:text-[#E09B5A] font-bold underline">Preencher cargas sugeridas</button>
              </div>
            );
          })()}

          {/* Sets table */}
          {st && ex && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="grid grid-cols-[80px_1fr_1fr_70px_44px] items-center gap-2 px-3 py-2 border-b border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-600 uppercase">Tipo</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">{iso ? '' : 'Carga (kg)'}</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">{iso ? 'Tempo (s)' : 'Reps'}</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">RIR</span>
                <span />
              </div>
              {st.sets.map((s, si) => {
                const typeConf = SET_TYPE_CONFIG[s.setType];
                return (
                <div key={si} className={cn('grid grid-cols-[80px_1fr_1fr_70px_44px] items-center gap-2 px-3 py-2.5 border-b border-zinc-800/50 last:border-0 transition-colors', s.completed && 'bg-green-500/5')}>
                  <button
                    onClick={() => !s.completed && cycleSetType(currentIdx, si)}
                    disabled={s.completed}
                    title="Clique para mudar o tipo"
                    className={cn('text-[9px] font-bold px-1.5 py-1 rounded-md border text-center leading-tight truncate transition-colors', typeConf.bg, typeConf.color, s.completed ? 'cursor-default opacity-70' : 'hover:brightness-110 cursor-pointer')}
                  >
                    {typeConf.label}
                  </button>
                  {iso ? (
                    <span className="text-center text-xs text-zinc-600">—</span>
                  ) : (
                    <input type="number" step="0.5" placeholder={sugForSet[si] ? String(sugForSet[si]!.weightKg) : "--"} value={s.weight} onChange={e => updateSet(currentIdx, si, 'weight', e.target.value)} disabled={s.completed}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 text-center placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#D4853A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" />
                  )}
                  <input type="number" step={iso ? 5 : 1} min="0" placeholder={iso ? "seg" : (sugForSet[si] ? String(sugForSet[si]!.reps) : "--")} value={s.reps} onChange={e => updateSet(currentIdx, si, 'reps', e.target.value)} disabled={s.completed}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 text-center placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#D4853A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" />
                  <select value={s.rir} onChange={e => updateSet(currentIdx, si, 'rir', e.target.value)} disabled={s.completed}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 text-center focus:outline-none focus:ring-1 focus:ring-[#D4853A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {RIR_OPTS.map(r => <option key={r} value={r}>RIR {r}</option>)}
                  </select>
                  <button onClick={() => toggleComplete(currentIdx, si)} className="flex h-9 w-9 items-center justify-center rounded-lg mx-auto transition-colors hover:bg-zinc-800">
                    {s.completed ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <Circle className="h-5 w-5 text-zinc-600" />}
                  </button>
                </div>
                );
              })}
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
            <button onClick={nextExercise} className="flex-1 py-3.5 rounded-xl bg-[#D4853A] hover:bg-[#D4853A] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#D4853A]/15">
              {currentIdx < exercises.length - 1
                ? <><span>Proximo exercicio</span><ChevronRight className="h-4 w-4" /></>
                : <><Trophy className="h-4 w-4" /><span>Finalizar treino</span></>}
            </button>
          </div>
        </>
      )}
    {/* Rest Timer overlay */}
      {restTimer && (
        <RestTimer
          durationSeconds={restTimer.duration}
          onComplete={() => setRestTimer(null)}
          onSkip={() => setRestTimer(null)}
        />
      )}
    </div>
  );
}
