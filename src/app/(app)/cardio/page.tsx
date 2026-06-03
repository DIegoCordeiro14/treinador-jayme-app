'use client';
import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
const GPSMap = dynamic(() => import('@/components/cardio/gps-map').then(m => ({ default: m.GPSMap })), { ssr: false });
import {
  Flame, Plus, X, Clock, Zap, BarChart2, Loader2, MapPin,
  Activity, TrendingUp, Target, Award, AlertTriangle, ChevronRight,
  Heart, Footprints, Mountain, Star, RefreshCw, Play, Calendar,
  CheckCircle2, Sparkles, Radio,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { useLatestMetrics } from '@/hooks/useLatestMetrics';
import { format, parseISO, startOfWeek, subWeeks, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const RunningTracker = dynamic(() => import('@/components/cardio/running-tracker'), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface CardioSession {
  id: string;
  performed_at: string | null;
  created_at: string;
  type: string;
  duration_min: number;
  intensity: string;
  calories_burned: number | null;
  notes: string | null;
  distance_km: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  cadence_spm: number | null;
  elevation_gain_m: number | null;
  perceived_effort: number | null;
  gps_track: { coordinates: { lat: number; lng: number }[] } | null;
}

interface AiAnalysis {
  summary: string;
  insights: string[];
  recommendation: string;
  fatigue_level: 'normal' | 'atencao' | 'alta';
  trend: 'improving' | 'stable' | 'declining';
  pace_trend: 'improving' | 'stable' | 'declining';
  volume_alert: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sessionDate(s: CardioSession) {
  return new Date(s.performed_at || s.created_at);
}

function paceFromSession(s: CardioSession): number | null {
  if (!s.distance_km || s.distance_km <= 0) return null;
  return s.duration_min / s.distance_km;
}

function formatPace(paceMin: number | null): string {
  if (!paceMin) return '--:--';
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTime(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

// Race time projection using Riegel formula
function projectRaceTime(bestPace: number | null, bestDist: number | null, targetKm: number): string | null {
  if (!bestPace || !bestDist || bestDist < 1) return null;
  const bestTimeMin = bestPace * bestDist;
  const projected = bestTimeMin * Math.pow(targetKm / bestDist, 1.06);
  return formatTime(projected);
}

const INTENSITY_COLORS: Record<string, string> = {
  'leve': 'text-green-400 bg-green-400/10 border-green-400/20',
  'moderada': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'alta': 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  'muito alta': 'text-red-400 bg-red-400/10 border-red-400/20',
};

const CARDIO_TYPES = ['Corrida', 'Caminhada', 'HIIT', 'Bicicleta', 'Eliptico', 'Natacao', 'Pular corda', 'Esteira', 'Outro'];
const INTENSITIES = ['leve', 'moderada', 'alta', 'muito alta'];

// ── Component ─────────────────────────────────────────────────────────────────
export default function CardioPage() {
  const supabase = createClient();
  const { metrics: bodyMetrics } = useLatestMetrics();
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTracker, setShowTracker] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [goalKm, setGoalKm] = useState<number>(10);

  const [form, setForm] = useState({
    type: 'Corrida', duration_min: '30', intensity: 'moderada',
    distance_km: '', calories_burned: '', avg_heart_rate: '',
    max_heart_rate: '', cadence_spm: '', elevation_gain_m: '',
    perceived_effort: '', notes: '',
  });

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('cardio_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    setSessions((data as CardioSession[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function saveSession() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('cardio_sessions').insert({
      user_id: user.id,
      type: form.type,
      duration_min: parseInt(form.duration_min) || 0,
      intensity: form.intensity,
      distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
      calories_burned: form.calories_burned ? parseInt(form.calories_burned) : null,
      avg_heart_rate: form.avg_heart_rate ? parseInt(form.avg_heart_rate) : null,
      max_heart_rate: form.max_heart_rate ? parseInt(form.max_heart_rate) : null,
      cadence_spm: form.cadence_spm ? parseInt(form.cadence_spm) : null,
      elevation_gain_m: form.elevation_gain_m ? parseFloat(form.elevation_gain_m) : null,
      perceived_effort: form.perceived_effort ? parseInt(form.perceived_effort) : null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) { toast.error('Erro ao registrar'); return; }
    toast.success('Atividade registrada!');
    setForm({ type: 'Corrida', duration_min: '30', intensity: 'moderada', distance_km: '', calories_burned: '', avg_heart_rate: '', max_heart_rate: '', cadence_spm: '', elevation_gain_m: '', perceived_effort: '', notes: '' });
    setShowLog(false);
    load();
  }

  async function fetchAiAnalysis() {
    setAiLoading(true);
    try {
      const res = await fetch('/api/analyze-cardio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bodyMetrics: bodyMetrics.weight_kg ? {
            weight_kg: bodyMetrics.weight_kg,
            body_fat_pct: bodyMetrics.body_fat_pct,
            muscle_kg: bodyMetrics.muscle_kg,
            basal_metabolic_rate_kcal: bodyMetrics.basal_metabolic_rate_kcal,
            visceral_fat_level: bodyMetrics.visceral_fat_level,
          } : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiAnalysis(data.analysis);
    } catch { toast.error('Erro ao carregar analise do Coach'); }
    finally { setAiLoading(false); }
  }

  // ── Computed stats ──────────────────────────────────────────────────────────
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekSessions = sessions.filter(s => sessionDate(s) >= weekStart);
  const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const prevWeekEnd = new Date(weekStart.getTime() - 1);
  const prevWeekSessions = sessions.filter(s => {
    const d = sessionDate(s);
    return d >= prevWeekStart && d <= prevWeekEnd;
  });

  const weekKm = weekSessions.reduce((s, r) => s + (r.distance_km ?? 0), 0);
  const prevWeekKm = prevWeekSessions.reduce((s, r) => s + (r.distance_km ?? 0), 0);
  const weekMin = weekSessions.reduce((s, r) => s + r.duration_min, 0);

  const allRuns = sessions.filter(s => s.type === 'Corrida' && s.distance_km);
  const totalKm = allRuns.reduce((s, r) => s + (r.distance_km ?? 0), 0);
  const totalMin = sessions.reduce((s, r) => s + r.duration_min, 0);

  const paces = allRuns.map(paceFromSession).filter(Boolean) as number[];
  const bestPace = paces.length > 0 ? Math.min(...paces) : null;
  const avgPace = paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : null;
  const longestRun = allRuns.length > 0 ? Math.max(...allRuns.map(r => r.distance_km ?? 0)) : 0;

  // Volume increase warning (10% rule)
  const volumeAlert = prevWeekKm > 0 && weekKm > prevWeekKm * 1.1
    ? `Volume aumentou ${Math.round(((weekKm / prevWeekKm) - 1) * 100)}% esta semana (limite seguro: 10%). Risco de sobrecarga.`
    : null;

  // Streak
  let streak = 0;
  const todayStr = format(now, 'yyyy-MM-dd');
  const sessionDates = new Set(sessions.map(s => format(sessionDate(s), 'yyyy-MM-dd')));
  for (let i = 0; i <= 30; i++) {
    const d = format(subDays(now, i), 'yyyy-MM-dd');
    if (sessionDates.has(d)) streak++;
    else if (i > 0) break;
  }

  // Weekly chart data (last 8 weeks)
  const weeklyData = Array.from({ length: 8 }, (_, i) => {
    const ws = startOfWeek(subWeeks(now, 7 - i), { weekStartsOn: 1 });
    const we = new Date(ws.getTime() + 6 * 86400000);
    const km = sessions.filter(s => {
      const d = sessionDate(s);
      return d >= ws && d <= we && s.distance_km;
    }).reduce((s, r) => s + (r.distance_km ?? 0), 0);
    return {
      week: format(ws, 'dd/MM', { locale: ptBR }),
      km: Math.round(km * 10) / 10,
    };
  });

  // Pace trend (last 12 runs)
  const paceData = allRuns.slice(0, 12).reverse().map((s, i) => ({
    run: i + 1,
    pace: paceFromSession(s),
    date: format(sessionDate(s), 'dd/MM', { locale: ptBR }),
  })).filter(d => d.pace !== null);

  // Recovery status
  const last2DaysSessions = sessions.filter(s => sessionDate(s) >= subDays(now, 2));
  const highIntensityRecent = last2DaysSessions.filter(s => s.intensity === 'alta' || s.intensity === 'muito alta');
  const recoveryStatus = highIntensityRecent.length >= 2 ? 'Precisa descanso' : last2DaysSessions.length >= 2 ? 'Atencao' : 'Boa';
  const recoveryColor = recoveryStatus === 'Boa' ? 'text-green-400' : recoveryStatus === 'Atencao' ? 'text-yellow-400' : 'text-red-400';

  const weeklyGoal = 20; // km - could be from profile
  const goalPct = Math.min(100, Math.round((weekKm / weeklyGoal) * 100));

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
    </div>
  );

  if (showTracker) return (
    <RunningTracker onClose={() => setShowTracker(false)} onSaved={() => { setShowTracker(false); load(); }} />
  );

  return (
    <div className="space-y-5 animate-in fade-in-0 duration-300 pb-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Cardio</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Treinamento de corrida inteligente</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowLog(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Registrar
          </Button>
          <Button size="sm" onClick={() => setShowTracker(true)} className="gap-1.5 bg-orange-500 hover:bg-orange-400 text-white border-0">
            <Play className="h-3.5 w-3.5 fill-current" /> Correr
          </Button>
        </div>
      </div>

      {/* ── Volume alert ─────────────────────────────────────────── */}
      {volumeAlert && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-relaxed">{volumeAlert}</p>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
          <TabsTrigger value="visao-geral" className="flex-1 text-xs">Visão Geral</TabsTrigger>
          <TabsTrigger value="evolucao" className="flex-1 text-xs">Evolução</TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 text-xs">Histórico</TabsTrigger>
          <TabsTrigger value="projecao" className="flex-1 text-xs">Projeção</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════
            TAB: VISAO GERAL
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="visao-geral" className="mt-4 space-y-4">

          {/* Hero dashboard */}
          <div className="rounded-2xl bg-gradient-to-br from-orange-600 to-red-600 p-5 text-white shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="h-5 w-5" />
              <span className="text-sm font-semibold opacity-90">Semana Atual</span>
              {sessions.length > 0 && (
                <span className={cn('ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20', recoveryColor === 'text-green-400' ? 'text-white' : 'text-white')}>
                  Recuperação: {recoveryStatus}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Km', value: weekKm.toFixed(1), icon: <MapPin className="h-4 w-4" /> },
                { label: 'Sessoes', value: weekSessions.length, icon: <Activity className="h-4 w-4" /> },
                { label: 'Streak', value: `${streak}d`, icon: <Zap className="h-4 w-4" /> },
              ].map(s => (
                <div key={s.label} className="bg-white/10 rounded-xl p-3 text-center">
                  <div className="flex justify-center mb-1 opacity-80">{s.icon}</div>
                  <p className="text-xl font-black">{s.value}</p>
                  <p className="text-[10px] opacity-70">{s.label}</p>
                </div>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="opacity-80">Meta semanal</span>
                <span className="font-semibold">{weekKm.toFixed(1)} / {weeklyGoal} km ({goalPct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${goalPct}%` }} />
              </div>
            </div>
          </div>

          {/* Performance grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Melhor Pace', value: formatPace(bestPace), sub: 'por km', icon: <Zap className="h-4 w-4" />, color: 'text-orange-400' },
              { label: 'Pace Medio', value: formatPace(avgPace), sub: 'por km', icon: <Activity className="h-4 w-4" />, color: 'text-blue-400' },
              { label: 'Total km', value: totalKm.toFixed(1), sub: 'acumulado', icon: <MapPin className="h-4 w-4" />, color: 'text-green-400' },
              { label: 'Longao', value: `${longestRun.toFixed(1)} km`, sub: 'recorde pessoal', icon: <Award className="h-4 w-4" />, color: 'text-purple-400' },
              { label: 'Tempo Total', value: formatTime(totalMin), sub: 'em atividade', icon: <Clock className="h-4 w-4" />, color: 'text-yellow-400' },
              { label: 'Esta Semana', value: formatTime(weekMin), sub: `${weekKm.toFixed(1)} km`, icon: <TrendingUp className="h-4 w-4" />, color: 'text-red-400' },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className={cn('mb-1', stat.color)}>{stat.icon}</div>
                <p className="text-xl font-bold text-zinc-100">{stat.value}</p>
                <p className="text-xs text-zinc-500">{stat.label}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Coach Jayme IA */}
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/20">
                  <Sparkles className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Coach Jayme</p>
                  <p className="text-[10px] text-zinc-500">Analise inteligente do seu condicionamento</p>
                </div>
              </div>
              <button
                onClick={fetchAiAnalysis}
                disabled={aiLoading}
                className="p-2 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
              >
                <RefreshCw className={cn('h-4 w-4', aiLoading && 'animate-spin')} />
              </button>
            </div>

            {aiLoading && (
              <div className="flex items-center gap-2 py-3">
                <Radio className="h-4 w-4 text-orange-400 animate-pulse" />
                <p className="text-sm text-zinc-400">Analisando seu desempenho...</p>
              </div>
            )}

            {aiAnalysis && !aiLoading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {aiAnalysis.trend === 'improving' && <TrendingUp className="h-4 w-4 text-green-400" />}
                  {aiAnalysis.trend === 'declining' && <TrendingUp className="h-4 w-4 text-red-400 rotate-180" />}
                  {aiAnalysis.trend === 'stable' && <Activity className="h-4 w-4 text-yellow-400" />}
                  <span className={cn('text-xs font-semibold',
                    aiAnalysis.fatigue_level === 'alta' ? 'text-red-400' :
                    aiAnalysis.fatigue_level === 'atencao' ? 'text-yellow-400' : 'text-green-400'
                  )}>
                    Fadiga: {aiAnalysis.fatigue_level === 'normal' ? 'Normal' : aiAnalysis.fatigue_level === 'atencao' ? 'Atencao' : 'Alta'}
                  </span>
                </div>

                <p className="text-sm text-zinc-300 leading-relaxed">{aiAnalysis.summary}</p>

                {aiAnalysis.insights.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {aiAnalysis.insights.map((ins: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-zinc-400">{ins}</p>
                      </div>
                    ))}
                  </div>
                )}

                {aiAnalysis.recommendation && (
                  <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 mt-2">
                    <p className="text-xs font-semibold text-orange-300 mb-0.5">Recomendacao</p>
                    <p className="text-xs text-zinc-300">{aiAnalysis.recommendation}</p>
                  </div>
                )}
              </div>
            )}

            {bodyMetrics.weight_kg && (
              <div className="flex flex-wrap gap-2 mt-1 mb-2">
                {[
                  bodyMetrics.weight_kg && `${bodyMetrics.weight_kg}kg`,
                  bodyMetrics.body_fat_pct && `${bodyMetrics.body_fat_pct}% gordura`,
                  bodyMetrics.basal_metabolic_rate_kcal && `TMB ${bodyMetrics.basal_metabolic_rate_kcal}kcal`,
                ].filter(Boolean).map(tag => (
                  <span key={String(tag)} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{tag}</span>
                ))}
              </div>
            )}
            {!aiAnalysis && !aiLoading && (
              <button onClick={fetchAiAnalysis} className="w-full py-2.5 text-sm text-orange-400 font-medium hover:text-orange-300 transition-colors">
                Analisar meu desempenho com IA
              </button>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB: EVOLUCAO
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="evolucao" className="mt-4 space-y-5">

          {/* Weekly distance chart */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm font-semibold text-zinc-200 mb-1">Distancia Semanal</p>
            <p className="text-xs text-zinc-500 mb-4">Ultimas 8 semanas (km)</p>
            {weeklyData.some(d => d.km > 0) ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyData} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="week" tick={{ fill: '#71717a', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelStyle={{ color: '#e4e4e7' }}
                    itemStyle={{ color: '#f97316' }}
                    formatter={(v: number) => [`${v} km`, 'Distancia']}
                  />
                  <Bar dataKey="km" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-32 flex items-center justify-center">
                <p className="text-sm text-zinc-600">Sem dados suficientes</p>
              </div>
            )}
          </div>

          {/* Pace trend */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm font-semibold text-zinc-200 mb-1">Evolucao do Pace</p>
            <p className="text-xs text-zinc-500 mb-4">Ultimas corridas (min/km)</p>
            {paceData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={paceData} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(v: number) => formatPace(v)} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelStyle={{ color: '#e4e4e7' }}
                    formatter={(v: number) => [formatPace(v), 'Pace']}
                  />
                  <Line type="monotone" dataKey="pace" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-32 flex items-center justify-center">
                <p className="text-sm text-zinc-600">Registre pelo menos 2 corridas com distancia para ver o pace</p>
              </div>
            )}
          </div>

          {/* Monthly summary */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <p className="text-sm font-semibold text-zinc-200">Resumo do Mes</p>
            {(() => {
              const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
              const monthSessions = sessions.filter(s => sessionDate(s) >= monthStart);
              const monthKm = monthSessions.filter(s => s.distance_km).reduce((s, r) => s + (r.distance_km ?? 0), 0);
              const monthMin = monthSessions.reduce((s, r) => s + r.duration_min, 0);
              return (
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: 'Sessoes', value: monthSessions.length },
                    { label: 'Km', value: monthKm.toFixed(1) },
                    { label: 'Tempo', value: formatTime(monthMin) },
                  ].map(s => (
                    <div key={s.label} className="bg-zinc-800 rounded-lg p-3">
                      <p className="text-lg font-bold text-zinc-100">{s.value}</p>
                      <p className="text-[10px] text-zinc-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB: HISTORICO
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="historico" className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
              <Flame className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">Nenhuma atividade registrada</p>
              <p className="text-xs text-zinc-600 mt-1">Registre manualmente ou use o GPS</p>
            </div>
          ) : (
            sessions.map(s => {
              const pace = paceFromSession(s);
              const dt = sessionDate(s);
              return (
                <div key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100 text-sm">{s.type}</span>
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', INTENSITY_COLORS[s.intensity] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700')}>
                          {s.intensity}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {format(dt, "EEEE, dd 'de' MMM", { locale: ptBR })}
                      </p>
                    </div>
                    {s.distance_km && (
                      <div className="text-right">
                        <p className="text-lg font-black text-orange-400">{s.distance_km} km</p>
                        {pace && <p className="text-xs text-zinc-500">{formatPace(pace)} /km</p>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(s.duration_min)}</span>
                    {s.avg_heart_rate && <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-400" />{s.avg_heart_rate} bpm</span>}
                    {s.cadence_spm && <span className="flex items-center gap-1"><Footprints className="h-3 w-3" />{s.cadence_spm} spm</span>}
                    {s.elevation_gain_m && <span className="flex items-center gap-1"><Mountain className="h-3 w-3" />+{s.elevation_gain_m}m</span>}
                    {s.calories_burned && <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-orange-400" />{s.calories_burned} kcal</span>}
                    {s.perceived_effort && <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-400" />{s.perceived_effort}/10</span>}
                    {s.gps_track && <span className="flex items-center gap-1 text-blue-400"><MapPin className="h-3 w-3" />GPS</span>}
                  </div>

                  {/* GPS Track Map */}
                  {s.gps_track?.coordinates && s.gps_track.coordinates.length > 1 && (
                    <div className="mt-3">
                      <GPSMap coordinates={s.gps_track.coordinates} className="h-44 w-full rounded-xl overflow-hidden border border-zinc-700" />
                    </div>
                  )}
                  {s.notes && <p className="text-xs text-zinc-500 mt-2 italic">{s.notes}</p>}
                </div>
              );
            })
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB: PROJECAO
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="projecao" className="mt-4 space-y-4">

          {/* Race projector */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-orange-400" />
              <p className="font-semibold text-zinc-100">Projecao de Prova</p>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Baseado no seu melhor pace ({formatPace(bestPace)} /km) usando formula de Riegel
            </p>

            <div className="flex gap-2 mb-5">
              {[5, 10, 21, 42].map(km => (
                <button
                  key={km}
                  onClick={() => setGoalKm(km)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-semibold transition-colors',
                    goalKm === km
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  )}
                >
                  {km} km
                </button>
              ))}
            </div>

            {bestPace ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-zinc-800 p-4 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Projecao para {goalKm} km</p>
                  <p className="text-3xl font-black text-orange-400">{projectRaceTime(bestPace, longestRun > 0 ? longestRun : allRuns[0]?.distance_km ?? null, goalKm)}</p>
                  <p className="text-xs text-zinc-500 mt-1">baseado no seu melhor desempenho</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Pace alvo', value: formatPace(bestPace * Math.pow(goalKm / Math.max(longestRun, 1), 0.06)) },
                    { label: 'Ritmo', value: `${Math.round(1 / (bestPace * Math.pow(goalKm / Math.max(longestRun, 1), 0.06)) * 60 * 10) / 10} km/h` },
                  ].map(s => (
                    <div key={s.label} className="bg-zinc-800 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-zinc-100">{s.value}</p>
                      <p className="text-[10px] text-zinc-500">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                  <p className="text-xs text-orange-300 font-semibold mb-1">Para completar {goalKm} km voce precisa:</p>
                  <p className="text-xs text-zinc-400">
                    {goalKm <= longestRun
                      ? 'Voce ja tem base para esta distancia! Foque no pace.'
                      : `Aumentar seu longao atual de ${longestRun.toFixed(1)} km gradualmente (regra de 10%/semana).`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-zinc-500">Registre pelo menos 1 corrida com distancia para ver a projecao</p>
              </div>
            )}
          </div>

          {/* Training suggestions */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <p className="text-sm font-semibold text-zinc-200">Treinos Sugeridos para {goalKm} km</p>
            {[
              { type: 'Corrida Facil', desc: `${Math.round(goalKm * 0.4)}-${Math.round(goalKm * 0.5)} km | Pace suave | Zona Z2`, color: 'text-green-400', days: '2-3x por semana' },
              { type: 'Intervalo', desc: `4-6x 800m | Pace de prova | Descanso 2min`, color: 'text-orange-400', days: '1x por semana' },
              { type: 'Longao', desc: `${Math.round(goalKm * 0.7)}-${Math.round(goalKm * 0.9)} km | Pace leve | Construir base`, color: 'text-blue-400', days: '1x por semana' },
            ].map(t => (
              <div key={t.type} className="flex items-start gap-3 rounded-lg bg-zinc-800 p-3">
                <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', t.color.replace('text-', 'bg-'))} />
                <div>
                  <p className={cn('text-sm font-semibold', t.color)}>{t.type}</p>
                  <p className="text-xs text-zinc-400">{t.desc}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{t.days}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Log modal ────────────────────────────────────────────── */}
      {showLog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 sticky top-0 bg-zinc-900">
              <p className="font-semibold text-zinc-100">Registrar Atividade</p>
              <button onClick={() => setShowLog(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Type */}
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-2">Tipo</label>
                <div className="flex flex-wrap gap-2">
                  {CARDIO_TYPES.map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', form.type === t ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'duration_min', label: 'Tempo (min)', placeholder: '30', type: 'number' },
                  { key: 'distance_km', label: 'Distancia (km)', placeholder: '5.0', type: 'number' },
                  { key: 'avg_heart_rate', label: 'FC Media (bpm)', placeholder: '155', type: 'number' },
                  { key: 'max_heart_rate', label: 'FC Max (bpm)', placeholder: '180', type: 'number' },
                  { key: 'cadence_spm', label: 'Cadencia (spm)', placeholder: '170', type: 'number' },
                  { key: 'elevation_gain_m', label: 'Altimetria (m)', placeholder: '50', type: 'number' },
                  { key: 'calories_burned', label: 'Calorias', placeholder: '400', type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-zinc-400 block mb-1.5">{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full h-9 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                ))}
              </div>

              {/* Intensity */}
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-2">Intensidade</label>
                <div className="flex gap-2">
                  {INTENSITIES.map(i => (
                    <button key={i} onClick={() => setForm(f => ({ ...f, intensity: i }))}
                      className={cn('flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors', form.intensity === i ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              {/* Perceived effort */}
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-2">
                  Percepcao de Esforco: <span className="text-orange-400 font-bold">{form.perceived_effort || '—'}</span>/10
                </label>
                <input type="range" min="1" max="10" value={form.perceived_effort || '5'}
                  onChange={e => setForm(f => ({ ...f, perceived_effort: e.target.value }))}
                  className="w-full accent-orange-500" />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>Muito facil</span><span>Moderado</span><span>Exaustivo</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-1.5">Observacoes</label>
                <textarea placeholder="Como foi o treino? Condicoes, sensacoes..." value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowLog(false)}>Cancelar</Button>
                <Button className="flex-1 bg-orange-500 hover:bg-orange-400 text-white border-0" onClick={saveSession} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
