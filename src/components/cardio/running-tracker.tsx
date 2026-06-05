'use client';
/**
 * Running Tracker — V6.6 (tracking profissional)
 *  - Distância: Haversine ponto a ponto com filtro por accuracy + velocidade
 *    (sem o corte cego de 200m que descartava trechos inteiros)
 *  - Cronômetro por relógio de parede (não congela em segundo plano)
 *  - Wake Lock: a tela não bloqueia durante a corrida
 *  - Persistência: active_cardio_sessions + cardio_gps_points (todos os pontos)
 *  - resumeTracking(): corrida sobrevive a fechar/recarregar o app
 *  - Indicadores: qualidade do GPS (🟢🟡🔴), velocidade, status de gravação
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LMap, Polyline as LPolyline, Marker as LMarker } from 'leaflet';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { X, Play, Pause, Square, CheckCircle2, Navigation, Navigation2, Radio, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { evaluatePoint, classifyAccuracy, fmtPaceMinKm, fmtSpeedKmh, GPS_QUALITY_LABELS, type TrackPoint, type GpsQuality } from '@/lib/edn/run-tracking';

type RunStatus = 'idle' | 'resumable' | 'acquiring' | 'running' | 'paused' | 'finished' | 'saving';

function fmtTime(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const QUALITY_DOT: Record<GpsQuality, string> = {
  excellent: 'bg-green-500',
  good: 'bg-yellow-500',
  poor: 'bg-red-500',
};

interface Props { onClose: () => void; onSaved: () => void; }

export default function RunningTracker({ onClose, onSaved }: Props) {
  const supabase = createClient();

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const polylineRef = useRef<LPolyline | null>(null);
  const currentMarkerRef = useRef<LMarker | null>(null);
  const startMarkerRef = useRef<LMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef = useRef<any>(null);

  // Cronômetro por relógio de parede (sobrevive ao throttling em background)
  const accumulatedRef = useRef(0);          // segundos acumulados em pausas anteriores
  const segStartRef = useRef<number | null>(null); // epoch ms do segmento atual

  const distRef = useRef(0);
  const pointsRef = useRef<TrackPoint[]>([]);
  const lastAcceptedRef = useRef<TrackPoint | null>(null);
  const pendingPointsRef = useRef<TrackPoint[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const statusRef = useRef<RunStatus>('idle');

  const [status, _setStatus] = useState<RunStatus>('idle');
  const setStatus = (s: RunStatus) => { statusRef.current = s; _setStatus(s); };
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [resumable, setResumable] = useState<{ id: string; distance_km: number; elapsed_seconds: number; started_at: string } | null>(null);

  const currentElapsed = useCallback(() => {
    const seg = segStartRef.current ? (Date.now() - segStartRef.current) / 1000 : 0;
    return accumulatedRef.current + seg;
  }, []);

  // ── Wake Lock (tela não bloqueia durante a corrida) ─────────────────────────
  const acquireWakeLock = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav: any = navigator;
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen');
        setWakeLockOn(true);
        wakeLockRef.current.addEventListener?.('release', () => setWakeLockOn(false));
      }
    } catch { setWakeLockOn(false); }
  }, []);

  const releaseWakeLock = useCallback(() => {
    try { wakeLockRef.current?.release?.(); } catch { /* noop */ }
    wakeLockRef.current = null;
    setWakeLockOn(false);
  }, []);

  // Reaquire wake lock ao voltar do background
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && (statusRef.current === 'running' || statusRef.current === 'acquiring')) {
        acquireWakeLock();
        setElapsed(currentElapsed()); // corrige o relógio na volta
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [acquireWakeLock, currentElapsed]);

  // ── Persistência (active_cardio_sessions + cardio_gps_points) ───────────────
  const syncSession = useCallback(async (newStatus?: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const last = pointsRef.current[pointsRef.current.length - 1];
    await supabase.from('active_cardio_sessions').update({
      elapsed_seconds: Math.round(currentElapsed()),
      distance_km: Math.round(distRef.current * 1000) / 1000,
      last_latitude: last?.lat ?? null,
      last_longitude: last?.lng ?? null,
      last_sync: new Date().toISOString(),
      ...(newStatus ? { status: newStatus } : {}),
    }).eq('id', sid);
  }, [currentElapsed]);

  const flushPoints = useCallback(async () => {
    const sid = sessionIdRef.current;
    const uid = userIdRef.current;
    if (!sid || !uid || pendingPointsRef.current.length === 0) return;
    const batch = pendingPointsRef.current.splice(0, pendingPointsRef.current.length);
    await supabase.from('cardio_gps_points').insert(batch.map(p => ({
      session_id: sid,
      user_id: uid,
      timestamp: new Date(p.timestamp).toISOString(),
      latitude: p.lat,
      longitude: p.lng,
      altitude: p.altitude ?? null,
      accuracy: p.accuracy ?? null,
      speed: p.speed ?? null,
    })));
  }, []);

  // resumeTracking(): detecta sessão ativa abandonada ao abrir
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userIdRef.current = user.id;
      const { data: active } = await supabase
        .from('active_cardio_sessions')
        .select('id, distance_km, elapsed_seconds, started_at, status')
        .eq('user_id', user.id)
        .in('status', ['active', 'paused'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) {
        setResumable(active as any);
        setStatus('resumable');
      }
    })();
  }, []);

  // ── Leaflet init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current) return;
    let mounted = true;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !mapEl.current) return;
      leafletRef.current = L;

      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('run-tracker-styles')) {
        const style = document.createElement('style');
        style.id = 'run-tracker-styles';
        style.textContent = `
          @keyframes pulse-dot {
            0%, 100% { box-shadow: 0 0 0 4px rgba(249,115,22,0.4), 0 2px 8px rgba(0,0,0,0.6); }
            50%       { box-shadow: 0 0 0 12px rgba(249,115,22,0.1), 0 2px 8px rgba(0,0,0,0.6); }
          }
          @keyframes pulse-start {
            0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.5); }
            50%       { box-shadow: 0 0 0 8px rgba(34,197,94,0.1); }
          }
          .leaflet-container { background: #0D1117; }
        `;
        document.head.appendChild(style);
      }

      const m = L.map(mapEl.current, { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      mapRef.current = m;
      setMapReady(true);

      navigator.geolocation.getCurrentPosition(
        (pos) => { if (mounted) m.setView([pos.coords.latitude, pos.coords.longitude], 17); },
        () => { if (mounted) m.setView([-23.5505, -46.6333], 14); },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    })();

    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      if (syncRef.current) clearInterval(syncRef.current);
      releaseWakeLock();
    };
  }, []);

  // ── Desenho no mapa ──────────────────────────────────────────────────────────
  const drawPoint = useCallback((pt: TrackPoint, isFirst: boolean) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const latLng: [number, number] = [pt.lat, pt.lng];

    if (!polylineRef.current) {
      polylineRef.current = L.polyline([latLng], { color: '#D4853A', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (polylineRef.current as any).addLatLng(latLng);
    }

    if (!startMarkerRef.current && isFirst) {
      const startIcon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#5A8A6A;border:2px solid white;animation:pulse-start 2s ease-in-out infinite;"></div>`,
        className: '', iconSize: [14, 14], iconAnchor: [7, 7],
      });
      startMarkerRef.current = L.marker(latLng, { icon: startIcon }).addTo(map);
    }

    const currentIcon = L.divIcon({
      html: `<div style="width:20px;height:20px;border-radius:50%;background:#D4853A;border:3px solid white;animation:pulse-dot 1.2s ease-in-out infinite;"></div>`,
      className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    });
    if (!currentMarkerRef.current) {
      currentMarkerRef.current = L.marker(latLng, { icon: currentIcon }).addTo(map);
    } else {
      currentMarkerRef.current.setLatLng(latLng);
    }
    map.panTo(latLng, { animate: true, duration: 0.5 });
  }, []);

  // ── GPS watch (alta precisão, sem cache) ────────────────────────────────────
  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS não disponível neste dispositivo');
      return;
    }
    setGpsAccuracy(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt: TrackPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
          accuracy: pos.coords.accuracy ?? null,
          altitude: pos.coords.altitude ?? null,
          speed: pos.coords.speed ?? null,
        };
        setGpsAccuracy(pt.accuracy != null ? Math.round(pt.accuracy) : null);

        const isFirst = pointsRef.current.length === 0;
        if (isFirst && statusRef.current === 'acquiring') setStatus('running');

        // V6.6: Haversine + filtro por accuracy/velocidade (nada de corte fixo de 200m)
        const result = evaluatePoint(lastAcceptedRef.current, pt);
        if (result.addDistanceKm > 0) {
          distRef.current += result.addDistanceKm;
          setDistance(distRef.current);
        }
        if (result.accept) lastAcceptedRef.current = pt;

        pointsRef.current.push(pt);
        pendingPointsRef.current.push(pt);
        if (pendingPointsRef.current.length >= 10) flushPoints();

        drawPoint(pt, isFirst);
      },
      (err) => {
        const msg = err.code === 1
          ? 'Permissão de GPS negada. Habilite nas configurações.'
          : err.code === 2
          ? 'Sinal de GPS indisponível. Vá para um local aberto.'
          : 'Tempo limite de GPS excedido. Tente novamente.';
        setGpsError(msg);
        if (statusRef.current === 'acquiring') setStatus('idle');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, [drawPoint, flushPoints]);

  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── Relógio (wall clock) + sync periódico ────────────────────────────────────
  const startClock = useCallback(() => {
    segStartRef.current = Date.now();
    tickRef.current = setInterval(() => setElapsed(currentElapsed()), 1000);
    syncRef.current = setInterval(() => { syncSession(); flushPoints(); }, 10000);
  }, [currentElapsed, syncSession, flushPoints]);

  const stopClock = useCallback(() => {
    accumulatedRef.current = currentElapsed();
    segStartRef.current = null;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (syncRef.current) { clearInterval(syncRef.current); syncRef.current = null; }
    setElapsed(accumulatedRef.current);
  }, [currentElapsed]);

  // ── Controles ────────────────────────────────────────────────────────────────
  async function handleStart() {
    setGpsError(null);
    setStatus('acquiring');
    // cria a sessão persistida
    if (userIdRef.current) {
      const { data } = await supabase
        .from('active_cardio_sessions')
        .insert({ user_id: userIdRef.current, status: 'active' })
        .select('id')
        .single();
      sessionIdRef.current = data?.id ?? null;
    }
    startClock();
    startGps();
    acquireWakeLock();
  }

  async function handleResumeSession() {
    // retoma sessão abandonada (app fechado/recarregado)
    if (!resumable) return;
    sessionIdRef.current = resumable.id;
    accumulatedRef.current = resumable.elapsed_seconds;
    distRef.current = Number(resumable.distance_km) || 0;
    setDistance(distRef.current);
    setElapsed(accumulatedRef.current);
    lastAcceptedRef.current = null; // evita somar o deslocamento offline como glitch
    setResumable(null);
    setGpsError(null);
    setStatus('acquiring');
    await supabase.from('active_cardio_sessions').update({ status: 'active' }).eq('id', resumable.id);
    startClock();
    startGps();
    acquireWakeLock();
  }

  async function discardResumable() {
    if (resumable) {
      await supabase.from('active_cardio_sessions').update({ status: 'abandoned' }).eq('id', resumable.id);
    }
    setResumable(null);
    setStatus('idle');
  }

  function handlePause() {
    setStatus('paused');
    stopClock();
    stopGps();
    syncSession('paused');
    flushPoints();
  }

  function handleResume() {
    setGpsError(null);
    setStatus('acquiring');
    syncSession('active');
    startClock();
    startGps();
  }

  function handleFinish() {
    stopClock();
    stopGps();
    releaseWakeLock();
    flushPoints();
    syncSession('finished');
    const map = mapRef.current;
    const poly = polylineRef.current;
    if (map && poly && pointsRef.current.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.fitBounds((poly as any).getBounds(), { padding: [40, 40] });
    }
    setStatus('finished');
  }

  async function handleSave() {
    setStatus('saving');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const km = distRef.current;
    const totalSec = Math.round(accumulatedRef.current);
    const durationMin = Math.max(1, Math.round(totalSec / 60));
    const speed = km / (totalSec / 3600 || 1);
    const intensity = speed > 12 ? 'muito alta' : speed > 8 ? 'alta' : speed > 5 ? 'moderada' : 'leve';
    const calories = Math.round(km * 65);

    await flushPoints();

    const { error } = await supabase.from('cardio_sessions').insert({
      user_id: user.id,
      type: 'Corrida',
      duration_min: durationMin,
      intensity,
      calories_burned: calories > 0 ? calories : null,
      gps_track: { coordinates: pointsRef.current, tracking_session_id: sessionIdRef.current, engine: 'v6.6' },
      distance_km: Math.round(km * 1000) / 1000,
    });

    if (error) {
      toast.error('Erro ao salvar corrida');
      setStatus('finished');
      return;
    }
    toast.success(`Corrida salva! ${km.toFixed(2)} km em ${fmtTime(totalSec)}`);
    onSaved();
    onClose();
  }

  // ── Derivados ─────────────────────────────────────────────────────────────────
  const pace = fmtPaceMinKm(elapsed, distance);
  const speedKmh = fmtSpeedKmh(distance, elapsed);
  const cals = Math.round(distance * 65);
  const isFinished = status === 'finished' || status === 'saving';
  const isActive = status === 'running' || status === 'paused' || status === 'acquiring';
  const quality: GpsQuality = classifyAccuracy(gpsAccuracy);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {(status === 'idle' || status === 'finished' || status === 'resumable') && (
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white shadow-lg"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* MAP */}
      <div ref={mapEl} className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
        {!mapReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-900 gap-3">
            <Navigation className="h-12 w-12 text-orange-400 animate-pulse" />
            <p className="text-sm text-zinc-400 font-medium">Carregando mapa…</p>
          </div>
        )}

        {status === 'acquiring' && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-black/70 backdrop-blur-sm py-2">
            <Radio className="h-4 w-4 text-orange-400 animate-pulse" />
            <p className="text-xs text-orange-300 font-semibold">Aguardando sinal de GPS…</p>
          </div>
        )}

        {mapReady && (
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
            <button onClick={() => mapRef.current?.zoomIn()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm text-white font-bold text-xl shadow">+</button>
            <button onClick={() => mapRef.current?.zoomOut()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm text-white font-bold text-xl shadow">−</button>
          </div>
        )}

        {mapReady && isActive && (
          <button
            onClick={() => {
              const last = pointsRef.current[pointsRef.current.length - 1];
              if (last) mapRef.current?.panTo([last.lat, last.lng]);
            }}
            className="absolute bottom-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/40"
          >
            <Navigation2 className="h-5 w-5" />
          </button>
        )}

        {/* Live stats + qualidade do GPS + status de gravação */}
        {isActive && (
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-0.5 rounded-xl bg-black/75 backdrop-blur-sm px-3 py-2.5 shadow">
            <p className="text-orange-400 text-2xl font-black tabular-nums leading-none">{fmtTime(elapsed)}</p>
            <p className="text-zinc-200 text-sm font-bold tabular-nums">{distance.toFixed(2)} km</p>
            <p className="text-zinc-500 text-xs tabular-nums">{pace} /km · {speedKmh} km/h</p>
            {status === 'paused' ? (
              <span className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wider mt-0.5">⏸ GPS pausado</span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
                <span className={cn('inline-block h-2 w-2 rounded-full', QUALITY_DOT[quality])} />
                GPS {GPS_QUALITY_LABELS[quality]}{gpsAccuracy != null ? ` ±${gpsAccuracy}m` : ''}
              </span>
            )}
            {status === 'running' && (
              <span className="text-[9px] text-zinc-600">
                {wakeLockOn ? '● Gravando — tela protegida contra bloqueio' : '● Gravando'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM PANEL */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-5 py-5 space-y-4 shrink-0">
        {status === 'resumable' && resumable ? (
          <>
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 space-y-1">
              <p className="text-sm font-bold text-orange-300 flex items-center gap-2">
                <RotateCcw className="h-4 w-4" /> Corrida em andamento encontrada
              </p>
              <p className="text-xs text-zinc-400">
                {Number(resumable.distance_km).toFixed(2)} km · {fmtTime(resumable.elapsed_seconds)} — o app foi fechado, mas a sessão foi preservada.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={discardResumable} className="flex-1 py-3.5 rounded-2xl border border-zinc-700 text-zinc-400 font-semibold hover:bg-zinc-800 transition-colors">
                Descartar
              </button>
              <button onClick={handleResumeSession} className="flex-1 py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-black flex items-center justify-center gap-2">
                <Play className="h-5 w-5 fill-current" /> Retomar corrida
              </button>
            </div>
          </>
        ) : !isFinished ? (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xl font-black tabular-nums text-zinc-100">{fmtTime(elapsed)}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">Tempo</p>
              </div>
              <div>
                <p className="text-xl font-black tabular-nums text-orange-400">{distance.toFixed(2)}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">km</p>
              </div>
              <div>
                <p className="text-xl font-black tabular-nums text-zinc-100">{pace}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">min/km</p>
              </div>
              <div>
                <p className="text-xl font-black tabular-nums text-zinc-100">{speedKmh}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">km/h</p>
              </div>
            </div>

            {gpsError && (
              <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg px-3 py-2">{gpsError}</p>
            )}

            {status === 'idle' && (
              <button
                onClick={handleStart}
                className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white font-black text-xl transition-colors shadow-xl shadow-orange-500/30"
              >
                Iniciar corrida
              </button>
            )}
            {status === 'acquiring' && (
              <div className="w-full py-4 rounded-2xl bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold text-base flex items-center justify-center gap-2">
                <Radio className="h-5 w-5 animate-pulse" />
                Buscando sinal GPS…
              </div>
            )}
            {status === 'running' && (
              <div className="flex gap-3">
                <button
                  onClick={handlePause}
                  className="flex-1 py-3.5 rounded-2xl border-2 border-zinc-700 text-zinc-100 font-bold text-base flex items-center justify-center gap-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
                >
                  <Pause className="h-5 w-5 fill-current" /> Pausar
                </button>
                <button
                  onClick={handleFinish}
                  className="flex-1 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors"
                >
                  <Square className="h-4 w-4 fill-current" /> Finalizar
                </button>
              </div>
            )}
            {status === 'paused' && (
              <div className="flex gap-3">
                <button
                  onClick={handleFinish}
                  className="flex-1 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center justify-center gap-2"
                >
                  <Square className="h-4 w-4 fill-current" /> Concluir
                </button>
                <button
                  onClick={handleResume}
                  className="flex-1 py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-black flex items-center justify-center gap-2"
                >
                  <Play className="h-5 w-5 fill-current" /> Retomar
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Resumo da corrida</p>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Distância', value: `${distance.toFixed(2)} km`, color: 'text-orange-400' },
                  { label: 'Tempo total', value: fmtTime(elapsed), color: 'text-zinc-100' },
                  { label: 'Pace médio', value: `${pace} /km`, color: 'text-zinc-100' },
                  { label: 'Calorias est.', value: cals > 0 ? `~${cals} kcal` : '—', color: 'text-zinc-100' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-zinc-800 px-4 py-3">
                    <p className={cn('text-xl font-bold', item.color)}>{item.value}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl border border-zinc-700 text-zinc-400 font-semibold hover:bg-zinc-800 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSave}
                disabled={status === 'saving'}
                className="flex-1 py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {status === 'saving' ? (
                  <span className="animate-pulse">Salvando…</span>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> Salvar corrida</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
