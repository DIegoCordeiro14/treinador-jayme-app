/**
 * Importa corridas do relógio (com rota de GPS) via Health Connect (Android).
 * Usa o plugin capacitor-health (HealthPlugin.queryWorkouts) com includeRoute=true.
 * Funciona apenas no app instalado e quando o relógio sincronizou o treino COM rota
 * para o Health Connect. (iOS/HealthKit: rota ainda não exposta pelo plugin atual.)
 */
export interface WatchRun {
  externalId: string;
  type: string;                 // 'Corrida' | 'Caminhada' | 'Outro'
  startedAt: string;            // ISO
  durationMin: number;
  distanceKm: number;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  distanceMeters: number | null;
  coordinates: { lat: number; lng: number }[];
  gpsPoints: { lat: number; lng: number; t: string | null; altitude: number | null }[];
  heartRateSamples: { t: string | null; bpm: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRoute(wk: any): { lat: number; lng: number; t: string | null; altitude: number | null }[] {
  const arr = wk?.route ?? wk?.locations ?? wk?.routePoints ?? wk?.gpsPoints ?? [];
  const out: { lat: number; lng: number; t: string | null; altitude: number | null }[] = [];
  for (const p of (Array.isArray(arr) ? arr : [])) {
    const lat = num(p?.lat ?? p?.latitude);
    const lng = num(p?.lng ?? p?.long ?? p?.longitude);
    if (lat != null && lng != null) out.push({ lat, lng, t: p?.time ?? p?.timestamp ?? p?.recordedAt ?? null, altitude: num(p?.altitude ?? p?.alt) });
  }
  return out;
}

export async function fetchWatchRuns(daysBack = 21): Promise<{ ok: boolean; runs: WatchRun[]; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (typeof window !== 'undefined' ? (window as any).Capacitor : null);
  if (!cap?.isNativePlatform?.()) return { ok: false, runs: [], error: 'Disponível apenas no app instalado.' };
  const hc = cap?.Plugins?.HealthPlugin;
  if (!hc?.queryWorkouts) return { ok: false, runs: [], error: 'Integração de saúde indisponível neste app. Atualize o APK.' };
  try {
    // IMPORTANTE: inicializa o healthConnectClient (senão o queryWorkouts lança
    // "lateinit property healthConnectClient has not been initialized").
    try {
      const avail = await hc.isHealthAvailable?.();
      if (avail && avail.available === false) {
        return { ok: false, runs: [], error: 'Google Health Connect não está instalado/configurado neste aparelho.' };
      }
    } catch { /* segue tentando */ }
    try {
      await hc.requestHealthPermissions?.({
        permissions: ['READ_WORKOUTS', 'READ_HEART_RATE', 'READ_DISTANCE', 'READ_TOTAL_CALORIES', 'READ_ACTIVE_CALORIES', 'READ_EXERCISE_ROUTE'],
      });
    } catch { /* permissão pode ter sido negada — segue e o query trata */ }

    const end = new Date();
    const startD = new Date(end.getTime() - daysBack * 86400000);
    const r = await hc.queryWorkouts({
      startDate: startD.toISOString(), endDate: end.toISOString(),
      includeHeartRate: true, includeRoute: true, includeSteps: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (r?.workouts ?? []) as any[];
    const runs: WatchRun[] = [];
    for (const wk of raw) {
      const gpts = extractRoute(wk);
      const coords = gpts.map(p => ({ lat: p.lat, lng: p.lng }));
      const distM = num(wk?.distance) ?? 0;
      const distanceKm = distM > 0 ? Math.round((distM / 1000) * 1000) / 1000 : 0;
      const startISO: string | null = wk?.startDate ?? wk?.startTime ?? null;
      const endISO: string | null = wk?.endDate ?? wk?.endTime ?? null;
      const durationSec = num(wk?.duration) ?? (startISO && endISO ? (new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000 : 0);
      const durationMin = Math.max(1, Math.round((durationSec || 0) / 60));
      const cal = num(wk?.calories) ?? num(wk?.totalCalories) ?? num(wk?.activeCalories);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hrRaw = (wk?.heartRate ?? []) as any[];
      const hrSamples = hrRaw.map((h: any) => ({ t: h?.time ?? h?.timestamp ?? h?.recordedAt ?? null, bpm: num(h?.bpm) ?? num(h?.value) })).filter((x: any) => x.bpm != null) as { t: string | null; bpm: number }[];
      const bpms = hrSamples.map(h => h.bpm);
      const avgHr = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
      const maxHr = bpms.length ? Math.max(...bpms) : null;
      const wtype = String(wk?.workoutType ?? wk?.type ?? '').toUpperCase();
      const isRun = wtype.includes('RUN');
      const isWalk = wtype.includes('WALK') || wtype.includes('HIK');
      if (!isRun && !isWalk && coords.length < 2 && distanceKm <= 0) continue;
      runs.push({
        externalId: `${startISO ?? ''}|${distanceKm}`,
        type: isRun ? 'Corrida' : isWalk ? 'Caminhada' : 'Outro',
        startedAt: startISO ?? new Date().toISOString(),
        durationMin, distanceKm,
        calories: cal != null ? Math.round(cal) : null,
        avgHr, maxHr,
        distanceMeters: distM > 0 ? distM : null,
        coordinates: coords,
        gpsPoints: gpts,
        heartRateSamples: hrSamples,
      });
    }
    runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return { ok: true, runs: runs.slice(0, 15) };
  } catch (e) {
    return { ok: false, runs: [], error: e instanceof Error ? e.message : 'Erro ao ler o relógio' };
  }
}

export function runIntensity(distanceKm: number, durationMin: number): string {
  const speed = durationMin > 0 ? distanceKm / (durationMin / 60) : 0;
  return speed > 12 ? 'muito alta' : speed > 8 ? 'alta' : speed > 5 ? 'moderada' : 'leve';
}
