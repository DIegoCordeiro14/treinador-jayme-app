'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Sparkles, CalendarDays, Loader2, X, Flame, Utensils, Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay,
  parseISO, addMonths, subMonths, getDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, formatVolume } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SessionDay { date: string; session_count: number; total_volume_kg: number; finished: boolean; }
interface CardioConfig {
  training_days: { type: string; duration_min: number; intensity: string; when: string; notes: string };
  rest_days: { type: string; duration_min: number; intensity: string; notes: string };
  frequency_per_week: number; general_notes: string;
}
interface NutritionConfig {
  strategy: string; daily_calories: string; protein_g_per_kg: number; carbs_pct: number; fat_pct: number;
  pre_workout: string; post_workout: string; rest_day_strategy: string; key_tips: string[];
}
interface ScheduleConfig {
  start_date: string; pattern: number[]; day_assignments: Record<string, string>;
  reasoning: string; cardio: CardioConfig | null; nutrition: NutritionConfig | null;
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const TODAY_START = new Date(new Date().setHours(0, 0, 0, 0));

function jsToEdn(jsDay: number) { return jsDay === 0 ? 7 : jsDay; }
function isScheduledDay(date: Date, cfg: ScheduleConfig | null) {
  if (!cfg) return false;
  if (date < new Date(cfg.start_date + 'T00:00:00')) return false;
  return (cfg.pattern ?? []).includes(jsToEdn(getDay(date)));
}
function getWorkoutLabel(date: Date, cfg: ScheduleConfig | null) {
  if (!cfg) return '';
  return cfg.day_assignments?.[String(jsToEdn(getDay(date)))] ?? '';
}

// Abreviação de grupo muscular (a partir do muscle_group em inglês dos exercícios)
const MUSCLE_EN: Record<string, string> = {
  chest: 'Peit', back: 'Cost', shoulders: 'Omb', biceps: 'Bíc', triceps: 'Trí',
  legs: 'Pern', quadriceps: 'Quad', hamstrings: 'Post', glutes: 'Glút', abs: 'Abd',
  calves: 'Pant', forearms: 'Ante', core: 'Core', full_body: 'Full', cardio: 'Card',
};
function muscleLabelFromGroups(groups: string[]): string {
  const uniq = [...new Set(groups.filter(Boolean))];
  if (!uniq.length) return '';
  return uniq.slice(0, 2).map(g => MUSCLE_EN[g] ?? (g.charAt(0).toUpperCase() + g.slice(1, 3))).join('/');
}
// Resolve a letra/nome do dia (ex.: "Treino A", "B") para o agrupamento muscular real
function resolveMuscle(stored: string, map: Record<string, string>): string | null {
  if (!stored) return null;
  const a = stored.trim().toLowerCase();
  const b = a.replace(/^treino\s+/, '');
  const v = map[a] ?? map[b];
  return v || null;
}

const MUSCLE_ABBREV: Record<string, string> = {
  peito: 'Peit', peitoral: 'Peit', costas: 'Cost', dorsais: 'Dors', dorsal: 'Dors',
  pernas: 'Pern', quadríceps: 'Quad', quadriceps: 'Quad', posteriores: 'Post', isquiotibiais: 'Isq', panturrilha: 'Pant',
  ombros: 'Omb', deltoides: 'Delt', deltoide: 'Delt', bíceps: 'Bic', biceps: 'Bic', tríceps: 'Tri', triceps: 'Tri',
  glúteos: 'Glút', gluteos: 'Glút', gluteo: 'Glút', abdômen: 'Abd', abdomen: 'Abd', abdominal: 'Abd', core: 'Core',
  antebraços: 'Ante', trapézio: 'Trap', trapezio: 'Trap',
};
function shortLabel(label: string): string {
  const s = label.replace(/^Treino\s+/i, '').trim();
  if (s.length <= 4) return s;
  const lower = s.toLowerCase();
  if (MUSCLE_ABBREV[lower]) return MUSCLE_ABBREV[lower];
  const parts = s.split(/\s+e\s+|\/|\+|,/i);
  if (parts.length >= 2) {
    return parts.slice(0, 2).map(p => { const pl = p.trim().toLowerCase(); return MUSCLE_ABBREV[pl] ?? p.trim().slice(0, 3); }).join('/');
  }
  return s.slice(0, 5);
}

export default function CalendarioPage() {
  const supabase = createClient();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sessionDays, setSessionDays] = useState<Map<string, SessionDay>>(new Map());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState<{ id: string; name: string; days_per_week: number; goal: string; schedule_config: ScheduleConfig | null; } | null>(null);
  const [dayMuscleMap, setDayMuscleMap] = useState<Record<string, string>>({});
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleStartDate, setScheduleStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isScheduling, setIsScheduling] = useState(false);
  const [planTab, setPlanTab] = useState<'cardio' | 'nutrition'>('cardio');
  const [allowWeekends, setAllowWeekends] = useState(true);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  useEffect(() => { loadData(); }, [currentMonth]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: sessions }, { data: plan }, { data: prof }] = await Promise.all([
      supabase.from('workout_sessions').select('started_at, finished_at, total_volume_kg')
        .eq('user_id', user.id)
        .gte('started_at', format(calStart, 'yyyy-MM-dd'))
        .lte('started_at', format(calEnd, 'yyyy-MM-dd') + 'T23:59:59'),
      supabase.from('workout_plans').select('id, name, days_per_week, goal, schedule_config')
        .eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('profiles').select('train_weekends').eq('id', user.id).maybeSingle(),
    ]);

    const map = new Map<string, SessionDay>();
    (sessions ?? []).forEach((s: Record<string, unknown>) => {
      const dateStr = format(parseISO(s.started_at as string), 'yyyy-MM-dd');
      const existing = map.get(dateStr);
      if (existing) { existing.session_count++; existing.total_volume_kg += (s.total_volume_kg as number) ?? 0; }
      else { map.set(dateStr, { date: dateStr, session_count: 1, total_volume_kg: (s.total_volume_kg as number) ?? 0, finished: !!s.finished_at }); }
    });

    setSessionDays(map);
    setActivePlan(plan as any ?? null);

    // Mapa letra/nome do dia -> agrupamento muscular (derivado dos exercícios reais)
    if (plan) {
      const { data: days } = await supabase
        .from('workout_days')
        .select('name, order_index, workout_exercises(exercise:exercises(muscle_group))')
        .eq('plan_id', (plan as any).id)
        .order('order_index');
      const m: Record<string, string> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (days ?? []).forEach((d: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groups = (d.workout_exercises ?? []).map((we: any) => we.exercise?.muscle_group).filter(Boolean) as string[];
        const lbl = muscleLabelFromGroups(groups);
        if (!lbl) return;
        const name = String(d.name ?? '').trim().toLowerCase();
        const letter = String.fromCharCode(97 + (d.order_index ?? 0)); // a, b, c...
        m[name] = lbl;
        m[name.replace(/^treino\s+/, '')] = lbl;
        m[letter] = lbl;
        m['treino ' + letter] = lbl;
      });
      setDayMuscleMap(m);
    } else {
      setDayMuscleMap({});
    }
    if (prof) setAllowWeekends((prof as { train_weekends?: boolean }).train_weekends ?? true);
    setLoading(false);
  }

  async function loadDaySessions(date: Date) {
    setSelectedDay(date);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const { data } = await supabase.from('workout_sessions').select('*, workout_day:workout_days(name)')
      .eq('user_id', user.id).gte('started_at', dateStr).lte('started_at', dateStr + 'T23:59:59');
    setSelectedSessions(data ?? []);
  }

  async function handleSchedule() {
    if (!activePlan) return;
    setIsScheduling(true);
    try {
      const res = await fetch('/api/schedule-workouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: activePlan.id, start_date: scheduleStartDate, allow_weekends: allowWeekends }),
      });
      if (!res.ok) throw new Error('Falha');
      const { schedule } = await res.json();
      setActivePlan(prev => prev ? { ...prev, schedule_config: schedule } : null);
      // Atualiza o Dashboard (force-dynamic) ao voltar
      router.refresh();
      toast.success('Plano completo gerado!');
    } catch {
      toast.error('Erro ao calcular. Tente novamente.');
    } finally {
      setIsScheduling(false);
    }
  }

  const cfg = activePlan?.schedule_config ?? null;
  const today = new Date();
  const daysElapsed = today <= monthEnd ? today.getDate() : monthEnd.getDate();
  const stats = {
    total: sessionDays.size,
    volume: Array.from(sessionDays.values()).reduce((s, d) => s + d.total_volume_kg, 0),
    consistency: daysElapsed > 0 ? Math.round((sessionDays.size / daysElapsed) * 100) : 0,
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Calendário</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Acompanhe sua consistência de treino</p>
        </div>
        {activePlan && (
          <Button size="sm" onClick={() => setShowScheduleDialog(true)} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />{cfg ? 'Reprogramar' : 'Programar treinos'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-2xl font-bold text-green-400">{stats.total}</p><p className="text-xs text-zinc-500 mt-0.5">Treinos no mês</p></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-2xl font-bold text-[#D4853A]">{stats.volume > 0 ? formatVolume(stats.volume) : '—'}</p><p className="text-xs text-zinc-500 mt-0.5">Volume total</p></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-2xl font-bold text-purple-400">{stats.consistency}%</p><p className="text-xs text-zinc-500 mt-0.5">Consistência</p></div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"><ChevronLeft className="h-4 w-4 text-zinc-400" /></button>
          <h2 className="font-semibold text-zinc-100 capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"><ChevronRight className="h-4 w-4 text-zinc-400" /></button>
        </div>
        <div className="grid grid-cols-7 px-4 pt-3 pb-1">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-medium text-zinc-600 pb-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 px-4 pb-4 gap-1">
          {days.map(day => {
            const inMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const dateStr = format(day, 'yyyy-MM-dd');
            const session = sessionDays.get(dateStr);
            const planned = !session && isScheduledDay(day, cfg) && day >= TODAY_START;
            const workoutLabel = getWorkoutLabel(day, cfg);
            const isPast = day < TODAY_START;
            return (
              <button key={day.toISOString()} onClick={() => inMonth && loadDaySessions(day)}
                className={cn('relative flex flex-col items-center justify-center rounded-lg p-1 min-h-[48px] transition-all text-sm font-medium',
                  !inMonth && 'opacity-20 cursor-default', inMonth && 'hover:bg-zinc-800',
                  isToday(day) && 'ring-1 ring-[#D4853A]', isSelected && 'bg-zinc-800',
                  session && 'text-zinc-100', planned && 'text-[#E09B5A]',
                  !session && !planned && inMonth && (isPast ? 'text-zinc-500' : 'text-zinc-600'))}>
                <span>{format(day, 'd')}</span>
                {session && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-green-400" />}
                {planned && (
                  <>
                    <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#D4853A]/70" />
                    {workoutLabel && <span className="absolute top-0.5 right-0.5 text-[7px] text-[#D4853A]/70 font-medium leading-none truncate max-w-[46px]">{resolveMuscle(workoutLabel, dayMuscleMap) ?? shortLabel(workoutLabel)}</span>}
                  </>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 px-4 py-3 border-t border-zinc-800 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Treino feito</div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500"><span className="w-2 h-2 rounded-full bg-[#D4853A]/70 inline-block" />Treino planejado</div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500"><span className="w-4 h-0.5 rounded bg-[#D4853A] inline-block" />Hoje</div>
        </div>
      </div>

      {selectedDay && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h3 className="font-semibold text-zinc-100">{format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}</h3>
          {selectedSessions.length > 0 ? (
            <div className="space-y-2">
              {selectedSessions.map((s: Record<string, unknown>) => (
                <div key={s.id as string} className="flex items-center gap-3 text-sm">
                  <div className={cn('h-2 w-2 rounded-full shrink-0', s.finished_at ? 'bg-green-400' : 'bg-yellow-400')} />
                  <span className="text-zinc-200">{(s.workout_day as { name: string } | null)?.name ?? 'Treino livre'}</span>
                  {(s.total_volume_kg != null) && <span className="text-zinc-500 text-xs ml-auto">{formatVolume(s.total_volume_kg as number)}</span>}
                </div>
              ))}
            </div>
          ) : isScheduledDay(selectedDay, cfg) && selectedDay >= TODAY_START ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[#E09B5A]"><CalendarDays className="h-4 w-4" /><span>Treino planejado: <strong>{resolveMuscle(getWorkoutLabel(selectedDay, cfg), dayMuscleMap) ?? getWorkoutLabel(selectedDay, cfg)}</strong></span></div>
              {cfg?.cardio && (
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-orange-400 font-semibold"><Flame className="h-3.5 w-3.5" />Cárdio recomendado</div>
                  <p className="text-zinc-300">{cfg.cardio.training_days.type} · {cfg.cardio.training_days.duration_min}min · {cfg.cardio.training_days.intensity}</p>
                  <p className="text-zinc-500">{cfg.cardio.training_days.when} — {cfg.cardio.training_days.notes}</p>
                </div>
              )}
              {cfg?.nutrition && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-green-400 font-semibold"><Utensils className="h-3.5 w-3.5" />Nutrição — dia de treino</div>
                  <p className="text-zinc-300"><span className="text-zinc-500">Pré:</span> {cfg.nutrition.pre_workout}</p>
                  <p className="text-zinc-300"><span className="text-zinc-500">Pós:</span> {cfg.nutrition.post_workout}</p>
                </div>
              )}
            </div>
          ) : !isScheduledDay(selectedDay, cfg) && cfg && selectedDay >= TODAY_START ? (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">Dia de descanso.</p>
              {cfg.cardio && (
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-orange-400 font-semibold"><Flame className="h-3.5 w-3.5" />Cárdio (descanso)</div>
                  <p className="text-zinc-300">{cfg.cardio.rest_days.type} · {cfg.cardio.rest_days.duration_min}min · {cfg.cardio.rest_days.intensity}</p>
                  <p className="text-zinc-500">{cfg.cardio.rest_days.notes}</p>
                </div>
              )}
              {cfg.nutrition && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-xs">
                  <div className="flex items-center gap-1.5 text-green-400 font-semibold mb-1"><Utensils className="h-3.5 w-3.5" />Nutrição — dia de descanso</div>
                  <p className="text-zinc-300">{cfg.nutrition.rest_day_strategy}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Nenhum treino neste dia.</p>
          )}
        </div>
      )}

      {cfg && (cfg.cardio || cfg.nutrition) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
            <Sparkles className="h-4 w-4 text-[#D4853A]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-zinc-100">Plano gerado pelo Coach EDN</p>
              {cfg.reasoning && <p className="text-xs text-zinc-500 mt-0.5">{cfg.reasoning}</p>}
            </div>
          </div>
          <div className="flex border-b border-zinc-800">
            {[{ key: 'cardio', label: 'Cárdio', icon: <Flame className="h-3.5 w-3.5" /> }, { key: 'nutrition', label: 'Nutrição', icon: <Utensils className="h-3.5 w-3.5" /> }].map(tab => (
              <button key={tab.key} onClick={() => setPlanTab(tab.key as 'cardio' | 'nutrition')}
                className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors', planTab === tab.key ? 'text-[#D4853A] border-b-2 border-[#D4853A]' : 'text-zinc-500 hover:text-zinc-300')}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {planTab === 'cardio' && cfg.cardio && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-orange-400 uppercase tracking-wide">Dias de treino</p>
                    <p className="text-xs text-zinc-200 font-medium">{cfg.cardio.training_days.type}</p>
                    <p className="text-xs text-zinc-400">{cfg.cardio.training_days.duration_min}min · {cfg.cardio.training_days.intensity}</p>
                    <p className="text-xs text-zinc-500">{cfg.cardio.training_days.when}</p>
                    {cfg.cardio.training_days.notes && <p className="text-[11px] text-zinc-600 italic">{cfg.cardio.training_days.notes}</p>}
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#D4853A] uppercase tracking-wide">Dias de descanso</p>
                    <p className="text-xs text-zinc-200 font-medium">{cfg.cardio.rest_days.type}</p>
                    <p className="text-xs text-zinc-400">{cfg.cardio.rest_days.duration_min}min · {cfg.cardio.rest_days.intensity}</p>
                    {cfg.cardio.rest_days.notes && <p className="text-[11px] text-zinc-600 italic">{cfg.cardio.rest_days.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500"><Dumbbell className="h-3.5 w-3.5 shrink-0" /><span>{cfg.cardio.general_notes}</span></div>
              </div>
            )}
            {planTab === 'nutrition' && cfg.nutrition && (
              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-green-400">{cfg.nutrition.strategy}</p>
                    <p className="text-[11px] text-zinc-500">{cfg.nutrition.daily_calories}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[{ label: 'Proteína', value: `${cfg.nutrition.protein_g_per_kg}g/kg`, color: 'text-[#D4853A]' }, { label: 'Carbs', value: `${cfg.nutrition.carbs_pct}%`, color: 'text-yellow-400' }, { label: 'Gordura', value: `${cfg.nutrition.fat_pct}%`, color: 'text-orange-400' }].map(m => (
                      <div key={m.label} className="rounded border border-zinc-700 py-2"><p className={cn('text-sm font-bold', m.color)}>{m.value}</p><p className="text-[10px] text-zinc-500">{m.label}</p></div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {[{ label: 'Pré-treino', value: cfg.nutrition.pre_workout, color: 'text-yellow-400' }, { label: 'Pós-treino', value: cfg.nutrition.post_workout, color: 'text-green-400' }, { label: 'Dia de descanso', value: cfg.nutrition.rest_day_strategy, color: 'text-[#D4853A]' }].map(item => (
                    <div key={item.label} className="text-xs"><span className={cn('font-semibold', item.color)}>{item.label}: </span><span className="text-zinc-300">{item.value}</span></div>
                  ))}
                </div>
                {cfg.nutrition.key_tips?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Dicas</p>
                    {cfg.nutrition.key_tips.map((tip, i) => (
                      <div key={i} className="flex gap-2 text-xs text-zinc-400"><span className="text-green-500 shrink-0">•</span><span>{tip}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showScheduleDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-zinc-100">Programar treinos</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{activePlan?.name} · {activePlan?.days_per_week}x/semana</p>
              </div>
              <button onClick={() => setShowScheduleDialog(false)} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Dia de início</label>
              <input type="date" value={scheduleStartDate} onChange={e => setScheduleStartDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-800/50 px-3 py-3">
              <div>
                <p className="text-sm text-zinc-200">Treinar nos fins de semana</p>
                <p className="text-[11px] text-zinc-500">Se desligado, não marca sábado/domingo</p>
              </div>
              <button type="button" onClick={() => setAllowWeekends(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${allowWeekends ? 'bg-[#D4853A]' : 'bg-zinc-700'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${allowWeekends ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-800/50 p-3 space-y-1">
              <div className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[#D4853A]" /><p className="text-xs font-medium text-zinc-300">O Coach EDN vai gerar</p></div>
              <ul className="text-[11px] text-zinc-500 space-y-0.5 pl-5 list-disc">
                <li>Distribuição dos treinos respeitando tempo de recuperação</li>
                <li>Protocolo de cárdio para cada tipo de dia</li>
                <li>Estratégia nutricional com macros e timings</li>
              </ul>
            </div>

            {cfg && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 px-3 py-2">
                <p className="text-[11px] text-zinc-500">Atual: {(cfg.pattern ?? []).map(d => WEEKDAYS[d - 1]).join(', ')}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowScheduleDialog(false)}>Cancelar</Button>
              <Button className="flex-1 gap-1.5" disabled={isScheduling} onClick={async () => { await handleSchedule(); setShowScheduleDialog(false); }}>
                {isScheduling ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Calculando…</> : <><Sparkles className="h-3.5 w-3.5" />Gerar plano</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
