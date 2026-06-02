'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LMap, Polyline as LPolyline, Marker as LMarker } from 'leaflet';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { X, Play, Pause, Square, CheckCircle2, Navigation, Navigation2, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────
interface GpsPoint { lat: number; lng: number; timestamp: number; }
type RunStatus = 'idle' | 'acquiring' | 'running' | 'paused' | 'finished' | 'saving';

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversineKm(p1: GpsPoint, p2: GpsPoint): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtTime(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtPace(seconds: number, km: number) {
  if (km < 0.01) return '--:--';
  const ps = seconds / km;
  return `${Math.floor(ps / 60)}:${String(Math.floor(ps % 60)).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const distRef = useRef(0);
  const pointsRef = useRef<GpsPoint[]>([]);
  const elapsedRef = useRef(0);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // ── Leaflet init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current) return;
    let mounted = true;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !mapEl.current) return;

      leafletRef.current = L;

      // Load Leaflet CSS (from reliable CDN + fallback)
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Inject global styles for route animation
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
          .leaflet-container { background: #18181b; }
        `;
        document.head.appendChild(style);
      }

      const m = L.map(mapEl.current, {
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(m);

      mapRef.current = m;
      setMapReady(true);

      // Center on current position
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mounted) return;
          m.setView([pos.coords.latitude, pos.coords.longitude], 17);
        },
        () => {
          if (!mounted) return;
          m.setView([-23.5505, -46.6333], 14);
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    })();

    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── GPS watch ────────────────────────────────────────────────────────────────
  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS não disponível neste dispositivo');
      return;
    }
    setGpsAccuracy(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const accuracy = pos.coords.accuracy;
        setGpsAccuracy(Math.round(accuracy));

        // Skip low-accuracy points while acquiring (first fix)
        const isFirstPoint = pointsRef.current.length === 0;

        const pt: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
        };

        // If this is the first point, move from 'acquiring' to 'running'
        if (isFirstPoint) {
          setStatus('running');
        }

        // Accumulate distance (ignore jumps > 200m)
        const prev = pointsRef.current[pointsRef.current.length - 1];
        if (prev) {
          const d = haversineKm(prev, pt);
          if (d < 0.2) {
            distRef.current += d;
            setDistance(distRef.current);
          }
        }

        pointsRef.current = [...pointsRef.current, pt];

        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;

        const latLng: [number, number] = [pt.lat, pt.lng];

        // ── Polyline: use addLatLng for incremental updates ──────────────────
        if (!polylineRef.current) {
          polylineRef.current = L.polyline([latLng], {
            color: '#f97316',
            weight: 6,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);

          // Shadow/glow layer under the main line
          L.polyline([latLng], {
            color: '#7c2d12',
            weight: 10,
            opacity: 0.3,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);

        } else {
          (polylineRef.current as any).addLatLng(latLng);
        }

        // ── Start marker (green, stays at origin) ────────────────────────────
        if (!startMarkerRef.current && pointsRef.current.length === 1) {
          const startIcon = L.divIcon({
            html: `<div style="
              width:14px;height:14px;border-radius:50%;
              background:#22c55e;border:2px solid white;
              animation:pulse-start 2s ease-in-out infinite;
            "></div>`,
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          startMarkerRef.current = L.marker(latLng, { icon: startIcon }).addTo(map);
        }

        // ── Current position marker (orange pulsing dot) ─────────────────────
        const currentIcon = L.divIcon({
          html: `<div style="
            width:20px;height:20px;border-radius:50%;
            background:#f97316;border:3px solid white;
            animation:pulse-dot 1.2s ease-in-out infinite;
          "></div>`,
          className: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        if (!currentMarkerRef.current) {
          currentMarkerRef.current = L.marker(latLng, { icon: currentIcon }).addTo(map);
        } else {
          currentMarkerRef.current.setLatLng(latLng);
          currentMarkerRef.current.setIcon(currentIcon);
        }

        // Auto-pan to current position
        map.panTo(latLng, { animate: true, duration: 0.5 });
      },
      (err) => {
        const msg = err.code === 1
          ? 'Permissão de GPS negada. Habilite nas configurações.'
          : err.code === 2
          ? 'Sinal de GPS indisponível. Vá para um local aberto.'
          : 'Tempo limite de GPS excedido. Tente novamente.';
        setGpsError(msg);
        setStatus('idle');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, []);

  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── Timer ───────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ── Controls ─────────────────────────────────────────────────────────────────
  function handleStart() {
    setGpsError(null);
    setStatus('acquiring');
    startTimer();
    startGps();
  }

  function handlePause() {
    setStatus('paused');
    stopTimer();
    stopGps();
  }

  function handleResume() {
    setGpsError(null);
    setStatus('acquiring');
    startTimer();
    startGps();
  }

  function handleFinish() {
    stopTimer();
    stopGps();
    // Fit map to show full route
    const map = mapRef.current;
    const poly = polylineRef.current;
    if (map && poly && pointsRef.current.length > 1) {
      map.fitBounds((poly as any).getBounds(), { padding: [40, 40] });
    }
    setStatus('finished');
  }

  async function handleSave() {
    setStatus('saving');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const km = distRef.current;
    const durationMin = Math.max(1, Math.round(elapsedRef.current / 60));
    const speed = km / (elapsedRef.current / 3600);
    const intensity = speed > 12 ? 'muito alta' : speed > 8 ? 'alta' : speed > 5 ? 'moderada' : 'leve';
    const calories = Math.round(km * 65);

    const { error } = await supabase.from('cardio_sessions').insert({
      user_id: user.id,
      type: 'Corrida',
      duration_min: durationMin,
      intensity,
      calories_burned: calories > 0 ? calories : null,
      gps_track: { coordinates: pointsRef.current },
      distance_km: Math.round(km * 1000) / 1000,
    });

    if (error) {
      toast.error('Erro ao salvar corrida');
      setStatus('finished');
      return;
    }
    toast.success(`Corrida salva! ${km.toFixed(2)} km em ${fmtTime(elapsedRef.current)}`);
    onSaved();
    onClose();
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const pace = fmtPace(elapsed, distance);
  const cals = Math.round(distance * 65);
  const isFinished = status === 'finished' || status === 'saving';
  const isActive = status === 'running' || status === 'paused' || status === 'acquiring';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Close button */}
      {(status === 'idle' || status === 'finished') && (
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white shadow-lg"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* MAP ─────────────────────────────────────────────────────────────────── */}
      <div ref={mapEl} className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>

        {/* Loading overlay */}
        {!mapReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-900 gap-3">
            <Navigation className="h-12 w-12 text-orange-400 animate-pulse" />
            <p className="text-sm text-zinc-400 font-medium">Carregando mapa…</p>
          </div>
        )}

        {/* Acquiring GPS overlay */}
        {status === 'acquiring' && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-black/70 backdrop-blur-sm py-2">
            <Radio className="h-4 w-4 text-orange-400 animate-pulse" />
            <p className="text-xs text-orange-300 font-semibold">Aguardando sinal de GPS…</p>
          </div>
        )}

        {/* Zoom controls */}
        {mapReady && (
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm text-white font-bold text-xl shadow"
            >+</button>
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm text-white font-bold text-xl shadow"
            >−</button>
          </div>
        )}

        {/* Re-center button */}
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

        {/* Live stats badge */}
        {(status === 'running' || status === 'paused' || status === 'acquiring') && (
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-0.5 rounded-xl bg-black/75 backdrop-blur-sm px-3 py-2.5 shadow">
            <p className="text-orange-400 text-2xl font-black tabular-nums leading-none">{fmtTime(elapsed)}</p>
            <p className="text-zinc-200 text-sm font-bold tabular-nums">{distance.toFixed(2)} km</p>
            <p className="text-zinc-500 text-xs tabular-nums">{pace} /km</p>
            {status === 'paused' && (
              <span className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wider mt-0.5">⏸ Pausado</span>
            )}
            {gpsAccuracy !== null && status === 'running' && (
              <span className="text-[10px] text-zinc-600">GPS ±{gpsAccuracy}m</span>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM PANEL ─────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-5 py-5 space-y-4 shrink-0">
        {!isFinished ? (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-black tabular-nums text-zinc-100">{fmtTime(elapsed)}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">Tempo</p>
              </div>
              <div>
                <p className="text-2xl font-black tabular-nums text-orange-400">{distance.toFixed(2)}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">km</p>
              </div>
              <div>
                <p className="text-2xl font-black tabular-nums text-zinc-100">{pace}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">min/km</p>
              </div>
            </div>

            {gpsError && (
              <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg px-3 py-2">{gpsError}</p>
            )}

            {/* Controls */}
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
                  <Square className="h-4 w-4 fill-current" /> Parar
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
            {/* Summary */}
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
