/**
 * Normalização determinística da camada nativa (transporte -> motores existentes).
 * Funções puras e testáveis: janela incremental, dedup, matching força↔wearable,
 * classificação de destino (enriquecer força / importar cardio / ignorar).
 */
import type { NativeWorkout, NativeWorkoutDetails, SyncState } from '../../native/health/definitions';
import { SPORT_LABEL, sportUsesGps, normalizeSportType, type SportActivityType } from '../cardio/sport-types';

/** Janela incremental com overlap para não perder registros que sincronizam tarde. */
export function incrementalWindow(lastSyncIso: string | null, nowIso: string, overlapMinutes = 10, maxDaysBack = 30): { startTime: string; endTime: string } {
  const now = new Date(nowIso).getTime();
  let start: number;
  if (lastSyncIso) start = new Date(lastSyncIso).getTime() - overlapMinutes * 60000;
  else start = now - maxDaysBack * 86400000;
  const floor = now - maxDaysBack * 86400000;
  if (start < floor) start = floor;
  return { startTime: new Date(start).toISOString(), endTime: new Date(now).toISOString() };
}

/** Chave de dedup estável. */
export function dedupKey(w: { provider: string; externalId: string }): string { return `${w.provider}::${w.externalId}`; }

/** Remove atividades já importadas (por provider+externalId). */
export function dedupWorkouts<T extends { provider: string; externalId: string }>(workouts: T[], seenKeys: Set<string>): T[] {
  const out: T[] = []; const local = new Set<string>();
  for (const w of workouts) { const k = dedupKey(w); if (seenKeys.has(k) || local.has(k)) continue; local.add(k); out.push(w); }
  return out;
}

export function isStrengthWorkout(w: { sportType: string }): boolean {
  return normalizeSportType(w.sportType) === 'musculacao';
}

export interface StrengthSessionRef { id: string; startedAt: string; endedAt: string | null }

/**
 * Casa uma atividade de força do wearable com uma workout_session do Coach na mesma
 * janela (mesmo usuário assumido pelo chamador). Retorna o id da sessão ou null.
 * Critério: início próximo (<= toleranceMin) OU sobreposição temporal.
 */
export function matchStrengthWorkout(nativeW: { startedAt: string; endedAt: string }, sessions: StrengthSessionRef[], toleranceMin = 20): string | null {
  const nS = new Date(nativeW.startedAt).getTime();
  const nE = new Date(nativeW.endedAt).getTime();
  let best: { id: string; delta: number } | null = null;
  for (const s of sessions) {
    const sS = new Date(s.startedAt).getTime();
    const sE = s.endedAt ? new Date(s.endedAt).getTime() : sS + 90 * 60000;
    const startClose = Math.abs(sS - nS) <= toleranceMin * 60000;
    const overlap = nS <= sE && sS <= nE;
    if (startClose || overlap) { const delta = Math.abs(sS - nS); if (!best || delta < best.delta) best = { id: s.id, delta }; }
  }
  return best?.id ?? null;
}

export type ImportDestination = 'enrich_strength' | 'import_cardio' | 'skip';

/** Decide o destino de uma atividade nativa. */
export function classifyNativeWorkout(w: NativeWorkout, strengthSessions: StrengthSessionRef[]): { destination: ImportDestination; strengthSessionId?: string; reason: string } {
  if (isStrengthWorkout(w)) {
    const sid = matchStrengthWorkout(w, strengthSessions);
    if (sid) return { destination: 'enrich_strength', strengthSessionId: sid, reason: 'Força correspondente encontrada — enriquecer sessão existente.' };
    // Força sem sessão do Coach: não cria cardio (evita duplicar musculação).
    return { destination: 'skip', reason: 'Musculação sem sessão do Coach na janela — ignorada no cardio.' };
  }
  const hasSignal = w.hasRoute || (w.distanceMeters ?? 0) > 0 || (w.caloriesActive ?? w.caloriesTotal ?? 0) > 0 || w.hasHeartRateSamples || w.durationSeconds >= 60;
  if (!hasSignal) return { destination: 'skip', reason: 'Sem sinal de atividade.' };
  return { destination: 'import_cardio', reason: 'Atividade de cardio/esporte importável.' };
}

/** Linha de cardio a partir do detalhe nativo (o chamador injeta user_id/session_id). */
export function toCardioRow(d: NativeWorkoutDetails) {
  const sport = normalizeSportType(d.sportType) as SportActivityType;
  const distanceKm = (d.distanceMeters ?? 0) > 0 ? Math.round((d.distanceMeters! / 1000) * 1000) / 1000 : null;
  const durationMin = Math.max(1, Math.round(d.durationSeconds / 60));
  const coords = (d.route ?? []).map(p => ({ lat: p.latitude, lng: p.longitude }));
  return {
    performed_at: d.startedAt,
    type: SPORT_LABEL[sport],
    sport_type: sport,
    source_sport_type: d.sourceSportType ?? null,
    duration_min: durationMin,
    distance_km: distanceKm,
    calories_burned: d.caloriesActive ?? d.caloriesTotal ?? null,
    avg_hr: d.avgHeartRate ?? null,
    max_hr: d.maxHeartRate ?? null,
    elevation_gain_m: d.elevationGainMeters ?? null,
    cadence: d.cadence ?? null,
    gps_track: coords.length > 1 ? { coordinates: coords, max_speed_kmh: 0 } : null,
    source_provider: d.provider,
    external_id: d.externalId,
    uses_gps: sportUsesGps(sport),
  };
}

export function computeSyncState(o: { available: boolean; granted: boolean; syncing: boolean; found: number; withErrors: boolean; partial: boolean }): SyncState {
  if (!o.available) return 'not_connected';
  if (!o.granted) return 'permission_required';
  if (o.syncing) return 'syncing';
  if (o.withErrors) return 'error';
  if (o.partial) return 'partial';
  if (o.found >= 0) return 'synced';
  return 'connected';
}
