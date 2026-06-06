/**
 * V7.10 — Camada de wearables (preparação para integração com relógios).
 *
 * Padroniza um treino vindo de QUALQUER fonte num formato único
 * (WearableWorkout), e registra os providers suportados — mesmo os que
 * ainda não estão ativos. Quando um provider for implementado, basta
 * preencher seu `fetchWorkouts`.
 *
 * Hoje já funcionam:
 *  - health_connect / apple_health → via plugin nativo capacitor-health
 *    (ver src/lib/integrations/wearable-hub.ts)
 *  - manual / token → via /api/wearable-sync (Atalhos iPhone, Tasker)
 * Pendentes (OAuth cloud): garmin, fitbit, polar, coros, suunto, samsung_health.
 */

export interface WearableWorkout {
  source: WearableProviderId;
  startedAt: string;          // ISO
  distanceKm: number | null;
  durationSec: number | null;
  paceSecPerKm: number | null;
  avgHr: number | null;       // bpm
  maxHr: number | null;
  cadenceSpm: number | null;  // passos/min
  elevationGainM: number | null;
  calories: number | null;
}

export type WearableProviderId =
  | 'garmin'
  | 'fitbit'
  | 'polar'
  | 'coros'
  | 'suunto'
  | 'samsung_health'
  | 'apple_health'
  | 'health_connect';

export type WearableStatus = 'native' | 'oauth_pending' | 'manual';

export interface WearableProvider {
  id: WearableProviderId;
  label: string;
  platform: 'android' | 'ios' | 'cloud' | 'any';
  status: WearableStatus;
  /** Métricas que o provider expõe quando ativo. */
  metrics: Array<keyof WearableWorkout>;
}

export const WEARABLE_PROVIDERS: WearableProvider[] = [
  { id: 'health_connect', label: 'Google Health Connect', platform: 'android', status: 'native',
    metrics: ['distanceKm', 'durationSec', 'avgHr', 'maxHr', 'calories'] },
  { id: 'apple_health', label: 'Apple Health', platform: 'ios', status: 'native',
    metrics: ['distanceKm', 'durationSec', 'avgHr', 'maxHr', 'calories'] },
  { id: 'garmin', label: 'Garmin Connect', platform: 'cloud', status: 'oauth_pending',
    metrics: ['distanceKm', 'durationSec', 'paceSecPerKm', 'avgHr', 'maxHr', 'cadenceSpm', 'elevationGainM', 'calories'] },
  { id: 'fitbit', label: 'Fitbit', platform: 'cloud', status: 'oauth_pending',
    metrics: ['distanceKm', 'durationSec', 'avgHr', 'calories'] },
  { id: 'polar', label: 'Polar', platform: 'cloud', status: 'oauth_pending',
    metrics: ['distanceKm', 'durationSec', 'avgHr', 'maxHr', 'cadenceSpm', 'calories'] },
  { id: 'coros', label: 'Coros', platform: 'cloud', status: 'oauth_pending',
    metrics: ['distanceKm', 'durationSec', 'paceSecPerKm', 'avgHr', 'elevationGainM'] },
  { id: 'suunto', label: 'Suunto', platform: 'cloud', status: 'oauth_pending',
    metrics: ['distanceKm', 'durationSec', 'avgHr', 'elevationGainM', 'calories'] },
  { id: 'samsung_health', label: 'Samsung Health', platform: 'android', status: 'oauth_pending',
    metrics: ['distanceKm', 'durationSec', 'avgHr', 'calories'] },
];

/** Normaliza qualquer payload bruto de provider para WearableWorkout. */
export function normalizeWorkout(
  source: WearableProviderId,
  raw: Partial<WearableWorkout>,
): WearableWorkout {
  const distanceKm = raw.distanceKm ?? null;
  const durationSec = raw.durationSec ?? null;
  const paceSecPerKm = raw.paceSecPerKm ??
    (distanceKm && durationSec && distanceKm > 0 ? Math.round(durationSec / distanceKm) : null);
  return {
    source,
    startedAt: raw.startedAt ?? new Date().toISOString(),
    distanceKm,
    durationSec,
    paceSecPerKm,
    avgHr: raw.avgHr ?? null,
    maxHr: raw.maxHr ?? null,
    cadenceSpm: raw.cadenceSpm ?? null,
    elevationGainM: raw.elevationGainM ?? null,
    calories: raw.calories ?? null,
  };
}
