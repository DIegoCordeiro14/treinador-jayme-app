/**
 * V7.0 / V7.1 — GPS nativo de alta precisão + Foreground Service.
 *
 * No app nativo (Capacitor) usa @capacitor-community/background-geolocation:
 *   - Android: FusedLocationProviderClient (Google Play Services), HIGH_ACCURACY,
 *     rodando em Foreground Service com notificação persistente → a corrida
 *     continua com a tela apagada, app minimizado ou celular bloqueado.
 *   - iOS: CLLocationManager (kCLLocationAccuracyBestForNavigation, distanceFilter 0),
 *     com background location updates.
 * No navegador (PWA) cai para navigator.geolocation.watchPosition (enableHighAccuracy).
 *
 * O plugin entrega: latitude, longitude, altitude, accuracy, speed (m/s),
 * bearing e time — exatamente o que o filtro V7.3 consome.
 */

import type { RawPoint } from '@/lib/cardio/gps-filter';

type Cap = {
  isNativePlatform?: () => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Plugins?: Record<string, any>;
};
function cap(): Cap | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor ?? null;
}
export function isNative(): boolean {
  const c = cap();
  return !!c?.isNativePlatform?.();
}

export interface LocationHandle { stop: () => Promise<void> }

export interface StartOptions {
  onPoint: (p: RawPoint) => void;
  onError?: (msg: string) => void;
  notificationTitle?: string;
  notificationText?: string;
}

/**
 * Inicia o rastreamento contínuo. Resolve com um handle para parar.
 * Sempre prefira o GPS nativo quando disponível.
 */
export async function startTracking(opts: StartOptions): Promise<LocationHandle> {
  const c = cap();
  const BG = c?.Plugins?.BackgroundGeolocation;

  // ── Caminho nativo (Foreground Service / CoreLocation) ──────────────────────
  if (isNative() && BG?.addWatcher) {
    const id: string = await BG.addWatcher(
      {
        backgroundTitle: opts.notificationTitle ?? 'Coach EDN',
        backgroundMessage: opts.notificationText ?? 'Corrida em andamento',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0, // todas as atualizações (precisão máxima)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (location: any, error: any) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            opts.onError?.('Permissão de localização negada. Ative nas configurações do app.');
          } else {
            opts.onError?.(String(error?.message ?? error));
          }
          return;
        }
        if (!location) return;
        opts.onPoint({
          latitude: location.latitude,
          longitude: location.longitude,
          altitude: location.altitude ?? null,
          accuracy: location.accuracy ?? null,
          speed: location.speed ?? null,        // m/s
          bearing: location.bearing ?? null,    // graus
          timestamp: location.time ?? Date.now(),
        });
      },
    );
    return { stop: async () => { try { await BG.removeWatcher({ id }); } catch { /* ignore */ } } };
  }

  // ── Fallback web (PWA) ──────────────────────────────────────────────────────
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        opts.onPoint({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude ?? null,
          accuracy: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? null,
          bearing: pos.coords.heading ?? null,
          timestamp: pos.timestamp ?? Date.now(),
        });
      },
      (err) => opts.onError?.(err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    return { stop: async () => navigator.geolocation.clearWatch(watchId) };
  }

  opts.onError?.('GPS indisponível neste dispositivo.');
  return { stop: async () => { /* noop */ } };
}

// ── V7.4 — Auto Pause / Auto Resume ───────────────────────────────────────────
export interface AutoPauseOptions {
  pauseAfterSec?: number;   // parado por X s → pausa (padrão 15s)
  resumeSpeedKmh?: number;  // acima disso → retoma (padrão 3 km/h)
  onPause?: () => void;
  onResume?: () => void;
}

/**
 * Detector de auto-pause baseado em velocidade. Alimente com cada velocidade
 * (km/h) e o timestamp; ele dispara onPause/onResume automaticamente.
 */
export class AutoPause {
  private paused = false;
  private stillSince: number | null = null;
  private readonly pauseAfterMs: number;
  private readonly resumeKmh: number;

  constructor(private opts: AutoPauseOptions = {}) {
    this.pauseAfterMs = (opts.pauseAfterSec ?? 15) * 1000;
    this.resumeKmh = opts.resumeSpeedKmh ?? 3;
  }

  get isPaused() { return this.paused; }

  update(speedKmh: number, now: number) {
    if (this.paused) {
      if (speedKmh >= this.resumeKmh) {
        this.paused = false;
        this.stillSince = null;
        this.opts.onResume?.();
      }
      return;
    }
    // em movimento
    if (speedKmh >= this.resumeKmh) {
      this.stillSince = null;
      return;
    }
    // parado/quase parado
    if (this.stillSince == null) this.stillSince = now;
    else if (now - this.stillSince >= this.pauseAfterMs) {
      this.paused = true;
      this.opts.onPause?.();
    }
  }

  reset() { this.paused = false; this.stillSince = null; }
}
