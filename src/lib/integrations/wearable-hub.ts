/**
 * Wearable Hub — V6.2 Pilar 9 (Capacitor 8 + capacitor-health)
 * Camada única de integração de relógios/saúde do Coach EDN.
 *
 * Fontes suportadas (APIs oficiais apenas):
 *  - apple_health   → Apple Watch via HealthKit (shell nativo iOS/Capacitor)
 *  - health_connect → Samsung/Xiaomi/Amazfit/Pixel/etc via Health Connect (Android)
 *                     usando o plugin `capacitor-health` (mantido, Capacitor 8).
 *  - garmin / fitbit / polar / coros / suunto → APIs cloud OAuth (exigem
 *    credenciais de desenvolvedor — ver docs/CAPACITOR-ANDROID.md)
 *
 * NÃO suportados (sem API oficial / baixa confiabilidade):
 *  DT Ultra, HK Series, clones genéricos — bloqueados explicitamente.
 *
 * Todos os adapters normalizam para o mesmo payload e enviam para
 * POST /api/wearable-sync, que alimenta o Recovery Engine automaticamente.
 *
 * Observação sobre o Health Connect via capacitor-health: a API expõe
 * passos, calorias, distância e batimentos dentro de treinos. Não há sono,
 * HRV nem FC de repouso direta — a FC de repouso é aproximada pelo menor BPM
 * dos treinos do dia. Para HRV/sono use Garmin/Fitbit (OAuth) ou o Atalho.
 */

export type WearableSource =
  | 'apple_health'
  | 'health_connect'
  | 'garmin'
  | 'fitbit'
  | 'polar'
  | 'coros'
  | 'suunto'
  | 'manual';

export interface WearablePayload {
  source: WearableSource;
  recorded_at?: string;        // YYYY-MM-DD (default: hoje)
  hrv_ms?: number;
  hrv_baseline_ms?: number;
  resting_hr?: number;
  sleep_hours?: number;
  sleep_score?: number;
  body_battery?: number;       // Garmin
  training_readiness?: number; // Garmin/Fitbit
  recovery_time_hours?: number;
  vo2max?: number;
  stress_score?: number;
  steps?: number;
  calories_kcal?: number;
  distance_km?: number;
}

export interface SourceInfo {
  id: WearableSource;
  label: string;
  platform: 'ios' | 'android' | 'cloud' | 'any';
  metrics: string[];
  status: 'native' | 'oauth_pending' | 'manual';
}

// ── Registro oficial de fontes (Pilar 9) ──────────────────────────────────────
export const WEARABLE_SOURCES: SourceInfo[] = [
  { id: 'apple_health',   label: 'Apple Watch (HealthKit)',     platform: 'ios',     metrics: ['HRV', 'VO2 Max', 'Sono', 'FC', 'Passos'], status: 'native' },
  { id: 'health_connect', label: 'Health Connect (Samsung, Xiaomi, Pixel, Amazfit…)', platform: 'android', metrics: ['Passos', 'Calorias', 'Distância', 'FC (treinos)'], status: 'native' },
  { id: 'garmin',  label: 'Garmin Connect', platform: 'cloud', metrics: ['HRV', 'Body Battery', 'Sleep Score', 'Recovery Time', 'Training Readiness'], status: 'oauth_pending' },
  { id: 'fitbit',  label: 'Fitbit',         platform: 'cloud', metrics: ['Readiness', 'HRV', 'Sono'], status: 'oauth_pending' },
  { id: 'polar',   label: 'Polar',          platform: 'cloud', metrics: ['Recovery Pro', 'Training Load'], status: 'oauth_pending' },
  { id: 'coros',   label: 'Coros',          platform: 'cloud', metrics: ['Running Fitness', 'Recovery'], status: 'oauth_pending' },
  { id: 'suunto',  label: 'Suunto',         platform: 'cloud', metrics: ['Recovery', 'Training Load'], status: 'oauth_pending' },
];

// Dispositivos sem API oficial — nunca integrar
export const BLOCKED_DEVICES = ['DT Ultra', 'HK Series', 'clones genéricos'];

// ── Runtime: estamos dentro do shell nativo (Capacitor)? ─────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCapacitor(): any | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor ?? null;
}

export function isNativeShell(): boolean {
  const cap = getCapacitor();
  return !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  const cap = getCapacitor();
  if (!cap?.getPlatform) return 'web';
  const p = cap.getPlatform();
  return p === 'ios' || p === 'android' ? p : 'web';
}

// ── Envio normalizado (todas as fontes convergem aqui) ────────────────────────
export async function pushMetrics(payload: WearablePayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/wearable-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

// ── Adapter: Apple HealthKit (Pilar 8) ────────────────────────────────────────
// Requer o plugin Capacitor instalado no shell nativo (iOS).
export async function syncFromHealthKit(): Promise<{ ok: boolean; error?: string }> {
  if (nativePlatform() !== 'ios') return { ok: false, error: 'HealthKit disponível apenas no app iOS' };
  const cap = getCapacitor();
  const hk = cap?.Plugins?.CapacitorHealthkit;
  if (!hk) return { ok: false, error: 'Plugin HealthKit não instalado no shell' };

  try {
    await hk.requestAuthorization({
      all: [], read: ['heartRateVariabilitySDNN', 'restingHeartRate', 'sleepAnalysis', 'vo2Max', 'stepCount', 'activeEnergyBurned'], write: [],
    });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const q = async (sampleName: string) => {
      try {
        const r = await hk.queryHKitSampleType({ sampleName, startDate: today.toISOString(), endDate: new Date().toISOString(), limit: 0 });
        return r?.resultData ?? [];
      } catch { return []; }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avg = (rows: any[], k = 'value') => rows.length ? rows.reduce((s, r) => s + Number(r[k] ?? 0), 0) / rows.length : undefined;

    const [hrv, rhr, sleep, vo2, steps] = await Promise.all([
      q('heartRateVariabilitySDNN'), q('restingHeartRate'), q('sleepAnalysis'), q('vo2Max'), q('stepCount'),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sleepHours = sleep.reduce((s: number, r: any) => {
      const st = new Date(r.startDate).getTime(); const en = new Date(r.endDate).getTime();
      return s + Math.max(0, (en - st) / 3600000);
    }, 0);

    return pushMetrics({
      source: 'apple_health',
      hrv_ms: avg(hrv),
      resting_hr: avg(rhr),
      sleep_hours: sleepHours > 0 ? Math.round(sleepHours * 10) / 10 : undefined,
      vo2max: avg(vo2),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      steps: steps.length ? Math.round(steps.reduce((s: number, r: any) => s + Number(r.value ?? 0), 0)) : undefined,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'HealthKit error' };
  }
}

// ── Adapter: Health Connect via capacitor-health (Pilar 7, Capacitor 8) ───────
// Plugin registrado como `HealthPlugin`. API: isHealthAvailable,
// requestHealthPermissions, queryAggregated (steps/active-calories),
// queryWorkouts (FC dentro de treinos).
export async function syncFromHealthConnect(): Promise<{ ok: boolean; error?: string }> {
  if (nativePlatform() !== 'android') return { ok: false, error: 'Health Connect disponível apenas no app Android' };
  const cap = getCapacitor();
  const hc = cap?.Plugins?.HealthPlugin;
  if (!hc) return { ok: false, error: 'Plugin de saúde não instalado no shell' };

  try {
    try {
      const avail = await hc.isHealthAvailable?.();
      if (avail && avail.available === false) {
        return { ok: false, error: 'Google Health Connect não está instalado neste aparelho.' };
      }
    } catch { /* ignore — segue tentando */ }

    await hc.requestHealthPermissions({
      permissions: ['READ_STEPS', 'READ_ACTIVE_CALORIES', 'READ_TOTAL_CALORIES', 'READ_DISTANCE', 'READ_HEART_RATE', 'READ_WORKOUTS'],
    });

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const startISO = start.toISOString();
    const endISO = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sumAgg = (arr: any[]) => (arr ?? []).reduce((s, a) => s + (Number(a?.value) || 0), 0);

    let steps: number | undefined;
    let calories: number | undefined;
    try {
      const r = await hc.queryAggregated({ startDate: startISO, endDate: endISO, dataType: 'steps', bucket: 'day' });
      const v = sumAgg(r?.aggregatedData); steps = v > 0 ? Math.round(v) : undefined;
    } catch { /* ignore */ }
    try {
      const r = await hc.queryAggregated({ startDate: startISO, endDate: endISO, dataType: 'active-calories', bucket: 'day' });
      const v = sumAgg(r?.aggregatedData); calories = v > 0 ? Math.round(v) : undefined;
    } catch { /* ignore */ }

    // FC de repouso aproximada: menor BPM entre os treinos de hoje; soma de distância
    let restingHr: number | undefined;
    let distanceKm: number | undefined;
    try {
      const w = await hc.queryWorkouts({ startDate: startISO, endDate: endISO, includeHeartRate: true, includeRoute: false, includeSteps: false });
      const bpms: number[] = [];
      let dist = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const wk of (w?.workouts ?? [])) {
        dist += Number(wk?.distance ?? 0) || 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const hr of (wk.heartRate ?? [])) if (hr?.bpm) bpms.push(Number(hr.bpm));
      }
      if (bpms.length) restingHr = Math.round(Math.min(...bpms));
      if (dist > 0) distanceKm = Math.round((dist / 1000) * 100) / 100;
    } catch { /* ignore */ }

    if (steps === undefined && calories === undefined && restingHr === undefined && distanceKm === undefined) {
      return { ok: false, error: 'Sem dados no Health Connect hoje. Autorize as permissões e confirme que o relógio sincronizou.' };
    }

    return pushMetrics({
      source: 'health_connect',
      steps,
      calories_kcal: calories,
      resting_hr: restingHr,
      distance_km: distanceKm,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Health Connect error' };
  }
}

// ── Sync automático conforme a plataforma ─────────────────────────────────────
export async function autoSync(): Promise<{ ok: boolean; source?: WearableSource; error?: string }> {
  const platform = nativePlatform();
  if (platform === 'ios') { const r = await syncFromHealthKit(); return { ...r, source: 'apple_health' }; }
  if (platform === 'android') { const r = await syncFromHealthConnect(); return { ...r, source: 'health_connect' }; }
  return { ok: false, error: 'Sync nativo disponível apenas no app Android/iOS — no navegador use o token pessoal (Atalhos/Tasker).' };
}
