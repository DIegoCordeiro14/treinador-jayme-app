'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Flame, Plus, X, Clock, Zap, BarChart2, Loader2, MapPin } from 'lucide-react';

const RunningTracker = dynamic(() => import('@/components/cardio/running-tracker'), { ssr: false });
import { createClient } from '@/lib/supabase/client';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CardioSession {
  id: string;
  performed_at: string;
  type: string;
  duration_min: number;
  intensity: string;
  calories_burned: number | null;
  notes: string | null;
  distance_km: number | null;
  gps_track: { coordinates: { lat: number; lng: number }[] } | null;
}

interface CardioProtocol {
  type: string;
  duration_min: number;
  intensity: string;
  when?: string;
  notes?: string;
}

interface ScheduleCardio {
  training_days: CardioProtocol;
  rest_days: CardioProtocol;
  frequency_per_week: number;
  general_notes: string;
}

const INTENSITY_COLORS: Record<string, string> = {
  'leve': 'text-green-400 bg-green-400/10',
  'moderada': 'text-yellow-400 bg-yellow-400/10',
  'alta': 'text-orange-400 bg-orange-400/10',
  'muito alta': 'text-red-400 bg-red-400/10',
};

const CARDIO_TYPES = ['Caminhada', 'Corrida', 'HIIT', 'Bicicleta', 'Elíptico', 'Natação', 'Pular corda', 'Esteira', 'Outro'];
const INTENSITIES = ['leve', 'moderada', 'alta', 'muito alta'];

const weekDays = eachDayOfInterval({
  start: startOfWeek(new Date(), { weekStartsOn: 1 }),
  end: endOfWeek(new Date(), { weekStartsOn: 1 }),
});

export default function CardioPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [protocol, setProtocol] = useState<ScheduleCardio | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [showTracker, setShowTracker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'Caminhada', duration_min: '30', intensity: 'moderada', calories_burned: '', notes: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: sess }, { data: plan }] = await Promise.all([
      supabase.from('cardio_sessions').select('*').eq('user_id', user.id).order('performed_at', { ascending: false }).limit(30),
      supabase.from('workout_plans').select('schedule_config').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    ]);
    setSessions(sess ?? []);
    setProtocol((plan?.schedule_config as any)?.cardio ?? null);
    setLoading(false);
  }

  async function logSession() {
    if (!form.type || !form.duration_min) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('cardio_sessions').insert({
      user_id: user.id,
      type: form.type,
      duration_min: parseInt(form.duration_min),
      intensity: form.intensity,
      calories_burned: form.calories_burned ? parseInt(form.calories_burned) : null,
      notes: form.notes || null,
    });
    if (error) { toast.error('Erro ao registrar'); setSaving(false); return; }
    toast.success('Cárdio registrado!');
    setForm({ type: 'Caminhada', duration_min: '30', intensity: 'moderada', calories_burned: '', notes: '' });
    setShowLog(false);
    setSaving(false);
    load();
  }

  // Weekly stats
  const weekSessions = sessions.filter(s => {
    const d = parseISO(s.performed_at);
    return d >= weekDays[0] && d <= weekDays[6];
  });
  const totalMinsWeek = weekSessions.reduce((s, c) => s + c.duration_min, 0);
  const totalCalWeek = weekSessions.reduce((s, c) => s + (c.calories_burned ?? 0), 0);

  // Weekly activity dots
  const weekActivity = weekDays.map(day => ({
    day,
    session: weekSessions.find(s => isSameDay(parseISO(s.performed_at), day)),
  }));

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Strava-style header */}
      <div className="rounded-2xl bg-gradient-to-br from-orange-600 via-orange-500 to-red-500 p-6 text-white shadow-xl shadow-orange-500/20">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame className="h-5 w-5" />
              <span className="text-sm font-semibold opacity-90">Cárdio</span>
            </div>
            <p className="text-4xl font-black">{totalMinsWeek}<span className="text-lg font-medium opacity-80 ml-1">min</span></p>
            <p className="text-sm opacity-75 mt-0.5">esta semana</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{weekSessions.length}</p>
            <p className="text-xs opacity-75">sessões</p>
            {totalCalWeek > 0 && <>
              <p className="text-xl font-bold mt-2">{totalCalWeek}</p>
              <p className="text-xs opacity-75">kcal</p>
            </>}
          </div>
        </div>

        {/* Weekly activity bar */}
        <div className="flex gap-1.5 mt-3">
          {weekActivity.map(({ day, session }) => (
            <div key={day.toISOString()} className="flex-1 flex flex-col items-center gap-1">
              <div className={cn(
                'w-full rounded-md transition-all',
                session ? 'bg-white/30' : 'bg-white/10',
              )} style={{ height: session ? `${Math.min(40, 8 + session.duration_min / 3)}px` : '8px' }} />
              <span className="text-[9px] font-medium opacity-60">{format(day, 'EEE', { locale: ptBR }).slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => setShowTracker(true)}
          className="gap-2 bg-orange-600 hover:bg-orange-700 text-white py-5 text-base font-bold"
        >
          <MapPin className="h-4 w-4" />
          Correr com GPS
        </Button>
        <Button
          onClick={() => setShowLog(true)}
          variant="outline"
          className="gap-2 border-zinc-700 text-zinc-200 hover:bg-zinc-800 py-5"
        >
          <Plus className="h-4 w-4" />
          Registrar cárdio
        </Button>
      </div>

      {/* Protocol from AI plan */}
      {protocol && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Protocolo do Jayme</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-orange-400">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-semibold">Dia de treino</span>
              </div>
              <p className="text-sm font-bold text-zinc-100">{protocol.training_days.type}</p>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-400">{protocol.training_days.duration_min}min</span>
              </div>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full inline-block', INTENSITY_COLORS[protocol.training_days.intensity] ?? 'text-zinc-400 bg-zinc-800')}>
                {protocol.training_days.intensity}
              </span>
              {protocol.training_days.when && <p className="text-[11px] text-zinc-500">{protocol.training_days.when}</p>}
              {protocol.training_days.notes && <p className="text-[11px] text-zinc-600 italic">{protocol.training_days.notes}</p>}
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-blue-400">
                <Flame className="h-4 w-4" />
                <span className="text-xs font-semibold">Dia de descanso</span>
              </div>
              <p className="text-sm font-bold text-zinc-100">{protocol.rest_days.type}</p>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-400">{protocol.rest_days.duration_min}min</span>
              </div>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full inline-block', INTENSITY_COLORS[protocol.rest_days.intensity] ?? 'text-zinc-400 bg-zinc-800')}>
                {protocol.rest_days.intensity}
              </span>
              {protocol.rest_days.notes && <p className="text-[11px] text-zinc-600 italic">{protocol.rest_days.notes}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <BarChart2 className="h-4 w-4 text-orange-400 shrink-0" />
            <p className="text-xs text-zinc-400">{protocol.general_notes}</p>
          </div>
        </div>
      )}

      {!protocol && !loading && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
          <Flame className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-400 mb-1">Nenhum protocolo gerado ainda</p>
          <p className="text-xs text-zinc-600">Vá ao Calendário → Programar treinos para o Jayme gerar seu protocolo de cárdio</p>
        </div>
      )}

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Histórico</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
            {sessions.slice(0, 10).map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                  <Flame className="h-4 w-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{s.type}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-zinc-500">{s.duration_min}min</span>
                    {s.distance_km ? <span className="text-xs text-orange-400 font-medium">{s.distance_km.toFixed(2)} km</span> : null}
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', INTENSITY_COLORS[s.intensity] ?? 'text-zinc-400 bg-zinc-800')}>{s.intensity}</span>
                    {s.calories_burned ? <span className="text-xs text-zinc-500">{s.calories_burned} kcal</span> : null}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-zinc-500">{format(parseISO(s.performed_at), "dd MMM", { locale: ptBR })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Running Tracker (fullscreen) */}
      {showTracker && (
        <RunningTracker
          onClose={() => setShowTracker(false)}
          onSaved={() => { setShowTracker(false); load(); }}
        />
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-zinc-100">Registrar cárdio</h3>
              <button onClick={() => setShowLog(false)} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Tipo</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {CARDIO_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Duração (min)</label>
                  <input type="number" min="1" value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Intensidade</label>
                  <select value={form.intensity} onChange={e => setForm(f => ({ ...f, intensity: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    {INTENSITIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Calorias (opcional)</label>
                <input type="number" placeholder="ex: 250" value={form.calories_burned} onChange={e => setForm(f => ({ ...f, calories_burned: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowLog(false)}>Cancelar</Button>
              <Button className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={saving} onClick={logSession}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
