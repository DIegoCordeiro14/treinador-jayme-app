'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LMap, Polyline as LPolyline, Marker as LMarker } from 'leaflet';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { X, Play, Pause, Square, CheckCircle2, Navigation, Navigation2, Radio, Heart, Rss, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GpsFilter, computePaces, fmtPace as fmtPaceLib } from '@/lib/cardio/gps-filter';
import { startTracking, AutoPause, isNative, type LocationHandle } from '@/native/location';
import { analyzeRun, ZONE_LABELS, ZONE_COLORS, type RunAnalysis, type RunZone } from '@/lib/cardio/run-classifier';
import { compareWithStrava, type StravaComparison } from '@/lib/cardio/strava-compare';

interface GpsPoint {
  lat: number; lng: number; timestamp: number;
  altitude?: number | null; accuracy?: number | null; speedKmh?: number; bearing?: number | null;
}
type RunStatus = 'idle' | 'acquiring' | 'running' | 'paused' | 'finished' | 'saving' | 'saved';

function fmtTime(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
  const locHandleRef = useRef<LocationHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const distRef = useRef(0);
  const pointsRef = useRef<GpsPoint[]>([]);
  const cumulativeRef = useRef<{ km: number; sec: number }[]>([]);
  const elapsedRef = useRef(0);
  const filterRef = useRef<GpsFilter>(new GpsFilter());
  const autoPausedRef = useRef(false);
  const autoPauseRef = useRef<AutoPause | null>(null);
  const maxSpeedRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointBufferRef = useRef<any[]>([]);
  const lastSessionSyncRef = useRef(0);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [paceInstant, setPaceInstant] = useState('--:--');
  const [paceSmoothed, setPaceSmoothed] = useState('--:--');
  const [paceAvg, setPaceAvg] = useState('--:--');
  const [autoPaused, setAutoPaused] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<RunAnalysis | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [stravaRefInput, setStravaRefInput] = useState('');
  const [stravaCmp, setStravaCmp] = useState<StravaComparison | null>(null);
  const [resumable, setResumable] = useState<{ id: string; distanceKm: number; elapsed: number } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayPaused, setReplayPaused] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0);
  const [avgBpm, setAvgBpm] = useState<string>('');
  const replayIdxRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replayLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replayMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapEl.current) return;
    let mounted = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !mapEl.current) return;
      leafletRef.current = L;
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css'; link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('run-tracker-styles')) {
        const style = document.createElement('style');
        style.id = 'run-tracker-styles';
        style.textContent = `
          @keyframes pulse-dot { 0%,100%{box-shadow:0 0 0 4px rgba(249,115,22,0.4),0 2px 8px rgba(0,0,0,0.6);} 50%{box-shadow:0 0 0 12px rgba(249,115,22,0.1),0 2px 8px rgba(0,0,0,0.6);} }
          @keyframes pulse-start { 0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,0.5);} 50%{box-shadow:0 0 0 8px rgba(34,197,94,0.1);} }
          .leaflet-container { background:#0D1117; }
        `;
        document.head.appendChild(style);
      }
      const m = L.map(mapEl.current, { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      mapRef.current = m;
      setMapReady(true);
      navigator.geolocation?.getCurrentPosition(
        (pos) => { if (mounted) m.setView([pos.coords.latitude, pos.coords.longitude], 17); },
        () => { if (mounted) m.setView([-23.5505, -46.6333], 14); },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    })();
    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
      locHandleRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, []);

  const renderPoint = useCallback((lat: number, lng: number, isFirst: boolean) => {
    const L = leafletRef.current; const map = mapRef.current;
    if (!L || !map) return;
    const latLng: [number, number] = [lat, lng];
    if (!polylineRef.current) {
      L.polyline([latLng], { color: '#3D2010', weight: 10, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      polylineRef.current = L.polyline([latLng], { color: '#D4853A', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (polylineRef.current as any).addLatLng(latLng);
    }
    if (!startMarkerRef.current && isFirst) {
      const startIcon = L.divIcon({ html: `<div style="width:14px;height:14px;border-radius:50%;background:#5A8A6A;border:2px solid white;animation:pulse-start 2s ease-in-out infinite;"></div>`, className: '', iconSize: [14, 14], iconAnchor: [7, 7] });
      startMarkerRef.current = L.marker(latLng, { icon: startIcon }).addTo(map);
    }
    const currentIcon = L.divIcon({ html: `<div style="width:20px;height:20px;border-radius:50%;background:#D4853A;border:3px solid white;animation:pulse-dot 1.2s ease-in-out infinite;"></div>`, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });
    if (!currentMarkerRef.current) currentMarkerRef.current = L.marker(latLng, { icon: currentIcon }).addTo(map);
    else { currentMarkerRef.current.setLatLng(latLng); currentMarkerRef.current.setIcon(currentIcon); }
    map.panTo(latLng, { animate: true, duration: 0.5 });
  }, []);

  const ensureActiveSession = useCallback(async () => {
    if (sessionIdRef.current) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userIdRef.current = user.id;
    const { data, error } = await supabase.from('active_cardio_sessions').insert({
      user_id: user.id, status: 'running', started_at: new Date().toISOString(), elapsed_seconds: 0, distance_km: 0,
    }).select('id').single();
    if (!error && data) sessionIdRef.current = data.id;
  }, [supabase]);

  const flushBuffer = useCallback(async () => {
    const buf = pointBufferRef.current;
    if (!buf.length || !sessionIdRef.current) return;
    const batch = buf.splice(0, buf.length);
    await supabase.from('cardio_gps_points').insert(batch).then(() => {}, () => {});
  }, [supabase]);

  const syncSession = useCallback(async (lat: number, lng: number) => {
    if (!sessionIdRef.current) return;
    await supabase.from('active_cardio_sessions').update({
      elapsed_seconds: elapsedRef.current, distance_km: Math.round(distRef.current * 1000) / 1000,
      last_latitude: lat, last_longitude: lng, last_sync: new Date().toISOString(),
    }).eq('id', sessionIdRef.current);
  }, [supabase]);

  const cleanupSession = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
    await supabase.from('cardio_gps_points').delete().eq('session_id', id).then(() => {}, () => {});
    await supabase.from('active_cardio_sessions').delete().eq('id', id).then(() => {}, () => {});
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('active_cardio_sessions')
        .select('id, distance_km, elapsed_seconds')
        .eq('user_id', user.id).eq('status', 'running')
        .order('started_at', { ascending: false }).limit(1).maybeSingle();
      if (data) setResumable({ id: data.id, distanceKm: Number(data.distance_km) || 0, elapsed: data.elapsed_seconds || 0 });
    })();
  }, [supabase]);

  const startGps = useCallback(async () => {
    setGpsAccuracy(null);
    filterRef.current.reset();
    autoPauseRef.current = new AutoPause({
      pauseAfterSec: 15, resumeSpeedKmh: 3,
      onPause: () => { autoPausedRef.current = true; setAutoPaused(true); },
      onResume: () => { autoPausedRef.current = false; setAutoPaused(false); },
    });
    try {
      locHandleRef.current = await startTracking({
        notificationTitle: 'Coach EDN', notificationText: 'Corrida em andamento',
        onError: (msg) => setGpsError(msg),
        onPoint: (raw) => {
          const clean = filterRef.current.push(raw);
          setGpsAccuracy(raw.accuracy != null ? Math.round(raw.accuracy) : null);
          if (!clean.accepted) return;
          const isFirst = pointsRef.current.length === 0;
          if (isFirst) setStatus('running');
          autoPauseRef.current?.update(clean.speedKmh, raw.timestamp);
          if (clean.segmentKm > 0 && !autoPausedRef.current) {
            distRef.current += clean.segmentKm; setDistance(distRef.current);
            if (clean.speedKmh > maxSpeedRef.current) maxSpeedRef.current = clean.speedKmh;
          }
          const pt: GpsPoint = {
            lat: clean.latitude, lng: clean.longitude, timestamp: raw.timestamp,
            altitude: raw.altitude ?? null, accuracy: raw.accuracy ?? null, speedKmh: clean.speedKmh, bearing: clean.bearing ?? null,
          };
          pointsRef.current.push(pt);
          if (sessionIdRef.current && userIdRef.current) {
            pointBufferRef.current.push({
              session_id: sessionIdRef.current, user_id: userIdRef.current,
              timestamp: new Date(raw.timestamp).toISOString(),
              latitude: clean.latitude, longitude: clean.longitude,
              altitude: raw.altitude ?? null, accuracy: raw.accuracy ?? null,
              speed: clean.speedKmh, bearing: clean.bearing ?? null, is_filtered: true,
            });
            if (pointBufferRef.current.length >= 10) void flushBuffer();
            const now = Date.now();
            if (now - lastSessionSyncRef.current > 10000) { lastSessionSyncRef.current = now; void syncSession(clean.latitude, clean.longitude); }
          }
          cumulativeRef.current.push({ km: distRef.current, sec: elapsedRef.current });
          const paces = computePaces(cumulativeRef.current);
          setPaceInstant(fmtPaceLib(paces.instantSecPerKm));
          setPaceSmoothed(fmtPaceLib(paces.smoothedSecPerKm));
          setPaceAvg(fmtPaceLib(paces.averageSecPerKm));
          renderPoint(clean.latitude, clean.longitude, isFirst);
        },
      });
    } catch (e) {
      setGpsError(e instanceof Error ? e.message : 'Falha ao iniciar o GPS');
      setStatus('idle');
    }
  }, [renderPoint, flushBuffer, syncSession]);

  const stopGps = useCallback(async () => {
    await locHandleRef.current?.stop();
    locHandleRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      if (autoPausedRef.current) return;
      elapsedRef.current += 1; setElapsed(elapsedRef.current);
    }, 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const resumePersistedSession = useCallback(async () => {
    if (!resumable) return;
    const { data: pts } = await supabase.from('cardio_gps_points')
      .select('latitude, longitude, altitude, accuracy, speed, bearing, timestamp')
      .eq('session_id', resumable.id).order('timestamp', { ascending: true });
    sessionIdRef.current = resumable.id;
    const { data: { user } } = await supabase.auth.getUser();
    userIdRef.current = user?.id ?? null;
    elapsedRef.current = resumable.elapsed; setElapsed(resumable.elapsed);
    distRef.current = resumable.distanceKm; setDistance(resumable.distanceKm);
    pointsRef.current = (pts ?? []).map((p) => ({
      lat: Number(p.latitude), lng: Number(p.longitude), timestamp: new Date(p.timestamp).getTime(),
      altitude: p.altitude, accuracy: p.accuracy, speedKmh: Number(p.speed) || 0, bearing: p.bearing,
    }));
    pointsRef.current.forEach((p, i) => renderPoint(p.lat, p.lng, i === 0));
    setResumable(null);
    setStatus('acquiring'); startTimer(); startGps();
    toast.success('Corrida retomada');
  }, [resumable, supabase, renderPoint, startTimer, startGps]);

  const discardResumable = useCallback(async () => {
    if (!resumable) return;
    await supabase.from('cardio_gps_points').delete().eq('session_id', resumable.id).then(() => {}, () => {});
    await supabase.from('active_cardio_sessions').delete().eq('id', resumable.id).then(() => {}, () => {});
    setResumable(null);
  }, [resumable, supabase]);

  function handleStart() { setGpsError(null); setStatus('acquiring'); void ensureActiveSession(); startTimer(); startGps(); }
  function handlePause() { setStatus('paused'); stopTimer(); stopGps(); }
  function handleResume() { setGpsError(null); setStatus('acquiring'); startTimer(); startGps(); }

  function handleFinish() {
    stopTimer(); stopGps(); void flushBuffer();
    const map = mapRef.current; const poly = polylineRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (map && poly && pointsRef.current.length > 1) map.fitBounds((poly as any).getBounds(), { padding: [40, 40] });
    const samples: { speedKmh: number; dtSec: number }[] = [];
    const pts = pointsRef.current;
    for (let i = 1; i < pts.length; i++) {
      const dt = Math.max(0.001, (pts[i].timestamp - pts[i - 1].timestamp) / 1000);
      samples.push({ speedKmh: pts[i].speedKmh ?? 0, dtSec: dt });
    }
    const a = analyzeRun(samples);
    setAnalysis(a);
    void fetchBriefing(a.sprintCount);
    setStatus('finished');
  }

  async function fetchBriefing(sprintCount: number) {
    setBriefingLoading(true);
    try {
      const res = await fetch('/api/run-briefing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_km: distRef.current, duration_sec: elapsedRef.current,
          avg_pace_sec: distRef.current > 0 ? elapsedRef.current / distRef.current : 0,
          max_speed_kmh: maxSpeedRef.current, sprint_count: sprintCount,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.briefing) setBriefing(data.briefing);
    } catch { /* silencioso */ } finally { setBriefingLoading(false); }
  }

  function runStravaCompare() {
    const ref = parseFloat(stravaRefInput.replace(',', '.'));
    setStravaCmp(compareWithStrava(distRef.current, ref));
  }

  async function handleSave() {
    setStatus('saving');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const km = distRef.current;
    const durationMin = Math.max(1, Math.round(elapsedRef.current / 60));
    const speed = elapsedRef.current > 0 ? km / (elapsedRef.current / 3600) : 0;
    const intensity = speed > 12 ? 'muito alta' : speed > 8 ? 'alta' : speed > 5 ? 'moderada' : 'leve';
    const calories = Math.round(km * 65);
    const { error } = await supabase.from('cardio_sessions').insert({
      user_id: user.id, type: 'Corrida', duration_min: durationMin, intensity,
      calories_burned: calories > 0 ? calories : null,
      gps_track: { coordinates: pointsRef.current, max_speed_kmh: Math.round(maxSpeedRef.current * 10) / 10 },
      distance_km: Math.round(km * 1000) / 1000,
      avg_hr: avgBpm ? Math.round(Number(avgBpm)) : null,
    });
    if (error) { toast.error('Erro ao salvar corrida'); setStatus('finished'); return; }
    await cleanupSession();
    toast.success(`Corrida salva! ${km.toFixed(2)} km em ${fmtTime(elapsedRef.current)}`);
    onSaved();
    setStatus('saved');
  }

  async function handleDiscard() { await cleanupSession(); onClose(); }

  function startReplay() {
    const L = leafletRef.current; const map = mapRef.current; const pts = pointsRef.current;
    if (!L || !map || pts.length < 2 || replaying) return;
    if (replayLineRef.current) { map.removeLayer(replayLineRef.current); replayLineRef.current = null; }
    if (replayMarkerRef.current) { map.removeLayer(replayMarkerRef.current); replayMarkerRef.current = null; }
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    setReplaying(true); setReplayPaused(false); setReplayProgress(0);
    replayIdxRef.current = 0;
    const replayLine = L.polyline([[pts[0].lat, pts[0].lng]], { color: '#5A8A6A', weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(map);
    const icon = L.divIcon({ html: '<div style="width:18px;height:18px;border-radius:50%;background:#5A8A6A;border:3px solid white;box-shadow:0 0 0 6px rgba(90,138,106,0.35)"></div>', className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
    const marker = L.marker([pts[0].lat, pts[0].lng], { icon }).addTo(map);
    replayLineRef.current = replayLine; replayMarkerRef.current = marker;
    map.setView([pts[0].lat, pts[0].lng], Math.max(15, map.getZoom()));
    runReplayTimer();
  }

  function runReplayTimer() {
    const map = mapRef.current; const pts = pointsRef.current;
    const replayLine = replayLineRef.current; const marker = replayMarkerRef.current;
    if (!map || !replayLine || !marker) return;
    const stepMs = Math.max(20, Math.min(120, Math.round(6000 / pts.length)));
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    replayTimerRef.current = setInterval(() => {
      replayIdxRef.current++;
      const i = replayIdxRef.current;
      if (i >= pts.length) {
        if (replayTimerRef.current) clearInterval(replayTimerRef.current);
        setReplayProgress(100);
        finishReplay();
        return;
      }
      const p = pts[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (replayLine as any).addLatLng([p.lat, p.lng]);
      marker.setLatLng([p.lat, p.lng]);
      map.panTo([p.lat, p.lng], { animate: true, duration: stepMs / 1000 });
      setReplayProgress(Math.round((i / (pts.length - 1)) * 100));
    }, stepMs);
  }

  function pauseReplay() {
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    replayTimerRef.current = null;
    setReplayPaused(true);
  }
  function resumeReplay() { setReplayPaused(false); runReplayTimer(); }
  function finishReplay() {
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    replayTimerRef.current = null;
    const map = mapRef.current;
    if (map) {
      if (replayLineRef.current) { map.removeLayer(replayLineRef.current); replayLineRef.current = null; }
      if (replayMarkerRef.current) { map.removeLayer(replayMarkerRef.current); replayMarkerRef.current = null; }
      const poly = polylineRef.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (poly && pointsRef.current.length > 1) { try { map.fitBounds((poly as any).getBounds(), { padding: [40, 40] }); } catch (e) { void e; } }
    }
    setReplaying(false); setReplayPaused(false); setReplayProgress(0);
  }
  function exitReplay() { finishReplay(); }

  const cals = Math.round(distance * 65);
  const isFinished = status === 'finished' || status === 'saving';
  const isActive = status === 'running' || status === 'paused' || status === 'acquiring';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {replaying && (
        <div className="absolute inset-0 z-[60] flex flex-col justify-between pointer-events-none">
          <div className="pointer-events-auto bg-gradient-to-b from-black/85 to-transparent px-5 pt-5 pb-10 flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#5A8A6A] uppercase tracking-widest">Replay da rota</p>
              <p className="text-zinc-200 text-sm mt-0.5">{distance.toFixed(2)} km · {fmtTime(elapsed)}</p>
            </div>
            <button onClick={exitReplay} className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-2 text-sm text-white"><X className="h-4 w-4" /> Sair</button>
          </div>
          <div className="pointer-events-auto bg-gradient-to-t from-black/90 to-transparent px-5 pb-7 pt-12 space-y-3">
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-[#5A8A6A] transition-all duration-200" style={{ width: `${replayProgress}%` }} /></div>
            <div className="flex gap-3">
              {!replayPaused ? (
                <button onClick={pauseReplay} className="flex-1 py-3 rounded-2xl border-2 border-white/30 text-white font-bold flex items-center justify-center gap-2"><Pause className="h-5 w-5 fill-current" /> Pausar</button>
              ) : (
                <button onClick={resumeReplay} className="flex-1 py-3 rounded-2xl bg-[#5A8A6A] text-white font-black flex items-center justify-center gap-2"><Play className="h-5 w-5 fill-current" /> Retomar</button>
              )}
              <button onClick={exitReplay} className="flex-1 py-3 rounded-2xl bg-zinc-800 text-zinc-200 font-bold flex items-center justify-center gap-2"><Square className="h-4 w-4" /> Encerrar</button>
            </div>
          </div>
        </div>
      )}
      {(status === 'idle' || status === 'finished') && (
        <button onClick={onClose} className="absolute top-4 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white shadow-lg">
          <X className="h-4 w-4" />
        </button>
      )}

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
            <p className="text-xs text-orange-300 font-semibold">Aguardando sinal de GPS…{isNative() ? ' (nativo)' : ''}</p>
          </div>
        )}
        {autoPaused && status === 'running' && (
          <div className="absolute inset-x-0 top-9 z-20 flex items-center justify-center gap-2 bg-yellow-500/15 backdrop-blur-sm py-1.5">
            <Pause className="h-3.5 w-3.5 text-yellow-400" />
            <p className="text-[11px] text-yellow-300 font-semibold">Auto-pausa — sem movimento</p>
          </div>
        )}
        {mapReady && (
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
            <button onClick={() => mapRef.current?.zoomIn()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm text-white font-bold text-xl shadow">+</button>
            <button onClick={() => mapRef.current?.zoomOut()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm text-white font-bold text-xl shadow">−</button>
          </div>
        )}
        {mapReady && isActive && (
          <button onClick={() => { const last = pointsRef.current[pointsRef.current.length - 1]; if (last) mapRef.current?.panTo([last.lat, last.lng]); }}
            className="absolute bottom-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/40">
            <Navigation2 className="h-5 w-5" />
          </button>
        )}
        {(status === 'running' || status === 'paused' || status === 'acquiring') && (
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-0.5 rounded-xl bg-black/75 backdrop-blur-sm px-3 py-2.5 shadow">
            <p className="text-orange-400 text-2xl font-black tabular-nums leading-none">{fmtTime(elapsed)}</p>
            <p className="text-zinc-200 text-sm font-bold tabular-nums">{distance.toFixed(2)} km</p>
            <p className="text-zinc-500 text-xs tabular-nums">{paceInstant} /km · agora</p>
            {status === 'paused' && <span className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wider mt-0.5">⏸ Pausado</span>}
            {gpsAccuracy !== null && status === 'running' && (
              <span className={cn('text-[10px]', gpsAccuracy <= 10 ? 'text-green-500' : gpsAccuracy <= 20 ? 'text-yellow-500' : 'text-red-500')}>GPS ±{gpsAccuracy}m</span>
            )}
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border-t border-zinc-800 px-5 py-5 space-y-4 shrink-0 max-h-[72vh] overflow-y-auto">
        {status === 'saved' ? (
          <>
            <div className="text-center py-2">
              <CheckCircle2 className="h-10 w-10 text-[#5A8A6A] mx-auto mb-2" />
              <p className="text-lg font-black text-zinc-100">Corrida salva!</p>
              <p className="text-sm text-zinc-400 mt-0.5">{distance.toFixed(2)} km · {fmtTime(elapsed)}{avgBpm ? ` · ${Math.round(Number(avgBpm))} bpm` : ''}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a href="/app/feed" className="py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold flex items-center justify-center gap-2"><Rss className="h-4 w-4" /> Ver no Feed</a>
              <a href="/app/cardio" className="py-3.5 rounded-2xl border border-zinc-700 text-zinc-200 font-bold flex items-center justify-center gap-2"><ListChecks className="h-4 w-4" /> Ver nos Registros</a>
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-2xl text-zinc-400 font-semibold hover:bg-zinc-800 transition-colors">Fechar</button>
          </>
        ) : !isFinished ? (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-2xl font-black tabular-nums text-zinc-100">{fmtTime(elapsed)}</p><p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">Tempo</p></div>
              <div><p className="text-2xl font-black tabular-nums text-orange-400">{distance.toFixed(2)}</p><p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">km</p></div>
              <div><p className="text-2xl font-black tabular-nums text-zinc-100">{paceAvg}</p><p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">pace médio</p></div>
            </div>

            {isActive && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[{ label: 'Agora (100m)', v: paceInstant }, { label: 'Suave (500m)', v: paceSmoothed }, { label: 'Médio', v: paceAvg }].map((p) => (
                  <div key={p.label} className="rounded-lg bg-zinc-800/60 py-1.5">
                    <p className="text-sm font-bold tabular-nums text-zinc-100">{p.v}</p>
                    <p className="text-[9px] text-zinc-500">{p.label}</p>
                  </div>
                ))}
              </div>
            )}

            {gpsError && <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg px-3 py-2">{gpsError}</p>}

            {status === 'idle' && resumable && (
              <div className="rounded-2xl border border-[#D4853A]/40 bg-[#D4853A]/[0.08] p-3 space-y-2">
                <p className="text-sm text-zinc-200 font-semibold">Corrida não finalizada encontrada</p>
                <p className="text-xs text-zinc-400">{resumable.distanceKm.toFixed(2)} km · {fmtTime(resumable.elapsed)} — quer continuar de onde parou?</p>
                <div className="flex gap-2">
                  <button onClick={discardResumable} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800">Descartar</button>
                  <button onClick={resumePersistedSession} className="flex-1 py-2 rounded-lg bg-[#D4853A] text-white text-sm font-semibold hover:bg-[#B8702E]">Retomar</button>
                </div>
              </div>
            )}
            {status === 'idle' && (
              <button onClick={handleStart} className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white font-black text-xl transition-colors shadow-xl shadow-orange-500/30">
                Iniciar corrida
              </button>
            )}
            {status === 'acquiring' && (
              <div className="w-full py-4 rounded-2xl bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold text-base flex items-center justify-center gap-2">
                <Radio className="h-5 w-5 animate-pulse" /> Buscando sinal GPS…
              </div>
            )}
            {status === 'running' && (
              <div className="flex gap-3">
                <button onClick={handlePause} className="flex-1 py-3.5 rounded-2xl border-2 border-zinc-700 text-zinc-100 font-bold text-base flex items-center justify-center gap-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors">
                  <Pause className="h-5 w-5 fill-current" /> Pausar
                </button>
                <button onClick={handleFinish} className="flex-1 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors">
                  <Square className="h-4 w-4 fill-current" /> Parar
                </button>
              </div>
            )}
            {status === 'paused' && (
              <div className="flex gap-3">
                <button onClick={handleFinish} className="flex-1 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center justify-center gap-2">
                  <Square className="h-4 w-4 fill-current" /> Concluir
                </button>
                <button onClick={handleResume} className="flex-1 py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-black flex items-center justify-center gap-2">
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
                  { label: 'Pace médio', value: `${paceAvg} /km`, color: 'text-zinc-100' },
                  { label: 'Vel. máx', value: `${maxSpeedRef.current.toFixed(1)} km/h`, color: 'text-zinc-100' },
                  { label: 'Calorias est.', value: cals > 0 ? `~${cals} kcal` : '—', color: 'text-zinc-100' },
                  { label: 'Pontos GPS', value: `${pointsRef.current.length}`, color: 'text-zinc-100' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-zinc-800 px-4 py-3">
                    <p className={cn('text-xl font-bold', item.color)}>{item.value}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {pointsRef.current.length > 1 && (
              <button onClick={startReplay} disabled={replaying} className="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-800 disabled:opacity-60 flex items-center justify-center gap-2">
                <Play className="h-4 w-4" /> {replaying ? 'Reproduzindo…' : 'Ver replay da rota'}
              </button>
            )}

            {analysis && (
              <div className="rounded-xl bg-zinc-800/50 px-4 py-3 space-y-2">
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Tipo de corrida</p>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full">
                  {(Object.keys(analysis.zoneSeconds) as RunZone[]).map((z) => {
                    const total = Object.values(analysis.zoneSeconds).reduce((a, b) => a + b, 0) || 1;
                    const pct = (analysis.zoneSeconds[z] / total) * 100;
                    return pct > 0 ? <div key={z} style={{ width: `${pct}%`, background: ZONE_COLORS[z] }} title={ZONE_LABELS[z]} /> : null;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(Object.keys(analysis.zoneSeconds) as RunZone[]).filter((z) => analysis.zoneSeconds[z] > 0).map((z) => (
                    <span key={z} className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: ZONE_COLORS[z] }} />{ZONE_LABELS[z]}
                    </span>
                  ))}
                </div>
                {analysis.insights.map((ins, i) => <p key={i} className="text-xs text-zinc-300">• {ins}</p>)}
              </div>
            )}

            {(briefing || briefingLoading) && (
              <div className="rounded-xl border border-[#D4853A]/30 bg-[#D4853A]/[0.06] px-4 py-3">
                <p className="text-[11px] font-bold text-[#D4853A] uppercase tracking-wider mb-1">Coach EDN analisa</p>
                {briefingLoading ? <p className="text-xs text-zinc-400 animate-pulse">Gerando análise…</p> : <p className="text-sm text-zinc-200 leading-relaxed">{briefing}</p>}
              </div>
            )}

            <div className="rounded-xl bg-zinc-800/50 px-4 py-3 space-y-2">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Comparar com Strava</p>
              <div className="flex gap-2">
                <input type="number" inputMode="decimal" step="0.01" value={stravaRefInput} onChange={(e) => setStravaRefInput(e.target.value)} placeholder="distância do Strava (km)"
                  className="flex-1 h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#D4853A]" />
                <button onClick={runStravaCompare} className="px-3 rounded-lg bg-zinc-700 text-zinc-100 text-sm font-medium hover:bg-zinc-600">Comparar</button>
              </div>
              {stravaCmp && (
                <div className={cn('rounded-lg px-3 py-2 text-xs', stravaCmp.withinTarget ? 'bg-green-500/10 text-green-300' : 'bg-yellow-500/10 text-yellow-300')}>
                  <p className="font-semibold">{stravaCmp.errorPct.toFixed(1)}% de erro · {stravaCmp.qualityLabel}</p>
                  <p className="text-zinc-400 mt-0.5">{stravaCmp.message}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-zinc-800/50 px-4 py-3">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Heart className="h-3.5 w-3.5 text-[#C0453A]" /> FC média (bpm) durante a corrida</label>
              <input type="number" inputMode="numeric" min={40} max={240} value={avgBpm} onChange={(e) => setAvgBpm(e.target.value)} placeholder="ex.: 148" className="mt-2 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-zinc-100 text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleDiscard} className="flex-1 py-3.5 rounded-2xl border border-zinc-700 text-zinc-400 font-semibold hover:bg-zinc-800 transition-colors">Descartar</button>
              <button onClick={handleSave} disabled={status === 'saving'} className="flex-1 py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2 transition-colors">
                {status === 'saving' ? <span className="animate-pulse">Salvando…</span> : <><CheckCircle2 className="h-4 w-4" /> Salvar corrida</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
