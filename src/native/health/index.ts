/**
 * Bridge do plugin nativo de saúde.
 *
 * Em produção (APK/iOS) `CoachEdnHealth` é o plugin nativo registrado via Capacitor.
 * Enquanto o plugin nativo dedicado não está publicado, este módulo ADAPTA o plugin
 * `HealthPlugin` (capacitor-health) já embarcado ao contrato normalizado, para que os
 * motores existentes já consumam o mesmo formato. Sem plataforma nativa, retorna vazio
 * (nunca sintetiza dados).
 */
import { normalizeSportType, SPORT_LABEL } from '@/lib/cardio/sport-types';
import type {
  CoachEdnHealthPlugin, NativeWorkout, NativeWorkoutDetails, NativeGpsPoint,
  NativeHeartRateSample, QueryWorkoutOptions, WorkoutDetailsOptions, TimeRangeOptions,
  WorkoutRouteOptions, LiveMetricsOptions, LiveMetricEvent, PluginListenerHandle, HealthPermissionStatus,
} from './definitions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cap(): any | null { return typeof window !== 'undefined' ? (window as any).Capacitor : null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nativePlugin(): any | null { const c = cap(); return c?.Plugins?.CoachEdnHealth ?? null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function legacyPlugin(): any | null { const c = cap(); return c?.Plugins?.HealthPlugin ?? null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

const HC_PERMS = ['READ_EXERCISE', 'READ_HEART_RATE', 'READ_DISTANCE', 'READ_ACTIVE_CALORIES_BURNED', 'READ_TOTAL_CALORIES_BURNED', 'READ_SPEED', 'READ_ELEVATION_GAINED', 'READ_EXERCISE_ROUTE'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWorkout(wk: any, provider: string): NativeWorkout {
  const sourceSportType = String(wk?.workoutType ?? wk?.type ?? wk?.exerciseType ?? '');
  const sportType = normalizeSportType(sourceSportType);
  const startedAt = wk?.startDate ?? wk?.startTime ?? new Date().toISOString();
  const endedAt = wk?.endDate ?? wk?.endTime ?? startedAt;
  const durationSeconds = num(wk?.duration) ?? Math.max(0, (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  const route = extractRoute(wk);
  const hr = extractHr(wk);
  return {
    externalId: String(wk?.id ?? `${startedAt}|${sportType}`),
    provider, deviceName: wk?.dataOrigin ?? wk?.sourceName ?? null,
    sportType, sourceSportType: sourceSportType || null,
    startedAt, endedAt, durationSeconds: Math.round(durationSeconds),
    distanceMeters: num(wk?.distance),
    caloriesActive: num(wk?.activeCalories), caloriesTotal: num(wk?.totalCalories) ?? num(wk?.calories),
    avgHeartRate: hr.length ? Math.round(hr.reduce((a, b) => a + b.bpm, 0) / hr.length) : num(wk?.avgHeartRate),
    maxHeartRate: hr.length ? Math.max(...hr.map(h => h.bpm)) : num(wk?.maxHeartRate),
    cadence: num(wk?.cadence), elevationGainMeters: num(wk?.elevationGain),
    hasRoute: route.length > 1, hasHeartRateSamples: hr.length > 0,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRoute(wk: any): NativeGpsPoint[] {
  const arr = wk?.route ?? wk?.locations ?? wk?.routePoints ?? wk?.gpsPoints ?? [];
  const out: NativeGpsPoint[] = [];
  for (const p of (Array.isArray(arr) ? arr : [])) {
    const lat = num(p?.lat ?? p?.latitude), lng = num(p?.lng ?? p?.long ?? p?.longitude);
    if (lat != null && lng != null) out.push({ timestamp: p?.time ?? p?.timestamp ?? p?.recordedAt ?? '', latitude: lat, longitude: lng, altitude: num(p?.altitude ?? p?.alt), accuracyHorizontal: num(p?.accuracy ?? p?.horizontalAccuracy), accuracyVertical: num(p?.verticalAccuracy) });
  }
  return out;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHr(wk: any): NativeHeartRateSample[] {
  const arr = wk?.heartRate ?? wk?.heartRateSamples ?? [];
  const out: NativeHeartRateSample[] = [];
  for (const h of (Array.isArray(arr) ? arr : [])) { const bpm = num(h?.bpm ?? h?.value); const t = h?.time ?? h?.timestamp ?? h?.recordedAt ?? ''; if (bpm != null && bpm > 0) out.push({ timestamp: t, bpm: Math.round(bpm) }); }
  return out;
}

/** Fallback web/legado que adapta HealthPlugin ao contrato. */
const legacyBridge: CoachEdnHealthPlugin = {
  async isAvailable() {
    const c = cap();
    const platform = c?.getPlatform?.() ?? 'web';
    if (!c?.isNativePlatform?.()) return { available: false, platform };
    const hc = legacyPlugin();
    try { const a = await hc?.isHealthAvailable?.(); return { available: a?.available !== false, platform }; } catch { return { available: !!hc, platform }; }
  },
  async getHealthPermissionsStatus(): Promise<HealthPermissionStatus> {
    const hc = legacyPlugin();
    if (!hc) return { available: false, granted: false, missing: HC_PERMS };
    try { const r = await hc.checkHealthPermissions?.({ permissions: HC_PERMS }); const granted = !!r?.granted || r?.hasAllPermissions === true; return { available: true, granted, missing: granted ? [] : HC_PERMS }; }
    catch { return { available: true, granted: false, missing: HC_PERMS }; }
  },
  async requestHealthPermissions(): Promise<HealthPermissionStatus> {
    const hc = legacyPlugin();
    if (!hc) return { available: false, granted: false, missing: HC_PERMS };
    try { await hc.requestHealthPermissions?.({ permissions: HC_PERMS }); } catch { /* */ }
    return this.getHealthPermissionsStatus();
  },
  async queryWorkouts(o: QueryWorkoutOptions) {
    const hc = legacyPlugin(); if (!hc?.queryWorkouts) return { workouts: [] };
    try { const r = await hc.queryWorkouts({ startDate: o.startTime, endDate: o.endTime, includeHeartRate: true, includeRoute: false, includeSteps: false }); return { workouts: (r?.workouts ?? []).map((w: unknown) => mapWorkout(w, 'health_connect')) }; }
    catch { return { workouts: [] }; }
  },
  async queryWorkoutDetails(o: WorkoutDetailsOptions): Promise<NativeWorkoutDetails> {
    const hc = legacyPlugin();
    const base: NativeWorkoutDetails = { externalId: o.externalId, provider: 'health_connect', sportType: 'outro', startedAt: o.startTime, endedAt: o.endTime, durationSeconds: 0, hasRoute: false, hasHeartRateSamples: false, route: [], heartRateSamples: [] };
    if (!hc?.queryWorkouts) return base;
    try {
      const r = await hc.queryWorkouts({ startDate: o.startTime, endDate: o.endTime, includeHeartRate: true, includeRoute: true, includeSteps: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wk = (r?.workouts ?? []).find((w: any) => String(w?.id ?? '') === o.externalId) ?? (r?.workouts ?? [])[0];
      if (!wk) return base;
      const w = mapWorkout(wk, 'health_connect');
      return { ...w, route: extractRoute(wk), heartRateSamples: extractHr(wk) };
    } catch { return base; }
  },
  async queryHeartRateSamples(o: TimeRangeOptions) {
    const hc = legacyPlugin(); if (!hc?.queryWorkouts) return { samples: [] };
    try { const r = await hc.queryWorkouts({ startDate: o.startTime, endDate: o.endTime, includeHeartRate: true, includeRoute: false, includeSteps: false }); const samples: NativeHeartRateSample[] = []; for (const wk of (r?.workouts ?? [])) samples.push(...extractHr(wk)); return { samples: samples.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }; }
    catch { return { samples: [] }; }
  },
  async queryWorkoutRoute(o: WorkoutRouteOptions) {
    const d = await this.queryWorkoutDetails({ externalId: o.externalId, startTime: o.startTime, endTime: o.endTime });
    return { route: d.route };
  },
  async startLiveMetrics(_o: LiveMetricsOptions) { /* streaming ao vivo só no plugin nativo dedicado */ },
  async stopLiveMetrics() { /* */ },
  async addListener(_e: 'liveMetrics', _l: (event: LiveMetricEvent) => void): Promise<PluginListenerHandle> { return { remove: async () => {} }; },
};

/** Usa o plugin nativo dedicado quando presente; senão o adaptador legado. */
export const CoachEdnHealth: CoachEdnHealthPlugin = (() => {
  const np = nativePlugin();
  return np ?? legacyBridge;
})();

export const sportLabelFor = (t: string) => SPORT_LABEL[normalizeSportType(t)] ?? t;
export * from './definitions';
