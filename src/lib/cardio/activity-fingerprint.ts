/**
 * Activity Fingerprint + fontes — dedup entre Mi Fitness, Strava, Health, etc.
 * A mesma corrida pode chegar por vários transportes. O fingerprint determinístico
 * (início ~, duração ~, distância ~, tipo, coordenada inicial) reconhece a mesma
 * atividade e evita duplicar. Não depende só de provider+external_id.
 */

export type Provider = 'coach_edn' | 'mi_fitness' | 'garmin' | 'polar' | 'fitbit' | 'suunto' | 'coros' | 'samsung_health' | 'strava' | 'apple_health' | 'manual' | 'health_connect';
export type Transport = 'health_connect' | 'google_fit' | 'apple_health' | 'strava' | 'manual' | 'native';

export interface ActivityFingerprintInput {
  userId: string;
  performedAt: string;          // ISO
  durationSeconds: number;
  distanceMeters?: number | null;
  activityType: string;         // ex.: 'Corrida'
  routeStart?: { latitude: number; longitude: number } | null;
}

// Buckets de tolerância: início ±2min, duração ±2min, distância arredondada a 100m,
// coordenada inicial arredondada a ~3 casas (~110m). Mesmo tipo de atividade.
export function computeFingerprint(i: ActivityFingerprintInput): string {
  const startBucket = Math.round(new Date(i.performedAt).getTime() / (2 * 60 * 1000)); // 2min
  const durBucket = Math.round(i.durationSeconds / 120);                                // 2min
  const distBucket = i.distanceMeters != null ? Math.round(i.distanceMeters / 100) : -1; // 100m
  const type = (i.activityType ?? '').toLowerCase().trim();
  const lat = i.routeStart ? i.routeStart.latitude.toFixed(3) : 'x';
  const lng = i.routeStart ? i.routeStart.longitude.toFixed(3) : 'x';
  return [i.userId, type, startBucket, durBucket, distBucket, lat, lng].join('|');
}

// Duas atividades são a mesma quando os fingerprints batem OU (início próximo +
// duração próxima + distância próxima + mesmo tipo), tolerante a ruído.
export function isSameActivity(a: ActivityFingerprintInput, b: ActivityFingerprintInput): boolean {
  if (computeFingerprint(a) === computeFingerprint(b)) return true;
  const sameType = (a.activityType ?? '').toLowerCase() === (b.activityType ?? '').toLowerCase();
  if (!sameType) return false;
  const dStart = Math.abs(new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()) / 1000;
  const dDur = Math.abs(a.durationSeconds - b.durationSeconds);
  const dist = (a.distanceMeters ?? 0) > 0 && (b.distanceMeters ?? 0) > 0
    ? Math.abs((a.distanceMeters as number) - (b.distanceMeters as number)) / Math.max(a.distanceMeters as number, b.distanceMeters as number)
    : 0;
  return dStart <= 180 && dDur <= 180 && dist <= 0.05; // ±3min início/duração, ±5% distância
}

// ── Rótulo de origem (Bloco 1/2) ─────────────────────────────────────────────
const PROVIDER_LABEL: Record<string, string> = {
  coach_edn: 'Coach EDN (GPS)', mi_fitness: 'Mi Fitness', garmin: 'Garmin', polar: 'Polar',
  fitbit: 'Fitbit', suunto: 'Suunto', coros: 'Coros', samsung_health: 'Samsung Health',
  strava: 'Strava', apple_health: 'Apple Health', health_connect: 'Health Connect', manual: 'Manual',
};
const TRANSPORT_LABEL: Record<string, string> = {
  health_connect: 'Health Connect', google_fit: 'Google Fit', apple_health: 'Apple Health',
  strava: 'Strava', manual: 'manual', native: 'GPS',
};

export function sourceLabel(provider?: string | null, transport?: string | null): string {
  if (!provider || provider === 'coach_edn') return 'Coach EDN (GPS)';
  const p = PROVIDER_LABEL[provider] ?? provider;
  if (!transport || transport === 'native') return `Importado do ${p}`;
  return `Importado do ${p} via ${TRANSPORT_LABEL[transport] ?? transport}`;
}
