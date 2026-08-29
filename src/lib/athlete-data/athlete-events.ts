// src/lib/athlete-data/athlete-events.ts
// ─────────────────────────────────────────────────────────────────────────────
// Event Bus do atleta (§17/§18). Eventos transportam REFERÊNCIAS e a mudança —
// nunca o estado inteiro. O consumidor busca o estado atualizado (evita duplicar
// dados e caches divergentes).
//
// Implementação leve e sem dependências: um emitter in-process que funciona no
// cliente (React) e é no-op seguro no servidor. Serve para invalidar caches e
// disparar refetch dos módulos abertos quando o peso/bioimpedância mudam.
// ─────────────────────────────────────────────────────────────────────────────

import type { DataSource } from './types';

export type AthleteEventType =
  | 'BODY_MEASUREMENT_CREATED'
  | 'BODY_MEASUREMENT_UPDATED'
  | 'BIOIMPEDANCE_IMPORTED'
  | 'WEIGHT_UPDATED'
  | 'PROFILE_UPDATED'
  | 'WEARABLE_DATA_SYNCED'
  | 'TRAINING_COMPLETED'
  | 'CARDIO_COMPLETED'
  | 'RECOVERY_UPDATED';

export interface AthleteEvent {
  userId: string;
  eventType: AthleteEventType;
  occurredAt: string;
  entityId?: string | null;
  source: DataSource;
}

/** Domínios cujos caches devem ser invalidados por evento (§19). */
export type InvalidationTarget =
  | 'athleteState' | 'nutritionContext' | 'dashboard'
  | 'evolutionSummary' | 'coachContext' | 'projections';

const INVALIDATION_MAP: Record<AthleteEventType, InvalidationTarget[]> = {
  BODY_MEASUREMENT_CREATED: ['athleteState', 'nutritionContext', 'dashboard', 'evolutionSummary', 'coachContext', 'projections'],
  BODY_MEASUREMENT_UPDATED: ['athleteState', 'nutritionContext', 'dashboard', 'evolutionSummary', 'coachContext', 'projections'],
  BIOIMPEDANCE_IMPORTED:    ['athleteState', 'nutritionContext', 'dashboard', 'evolutionSummary', 'coachContext', 'projections'],
  WEIGHT_UPDATED:           ['athleteState', 'nutritionContext', 'dashboard', 'evolutionSummary', 'coachContext', 'projections'],
  PROFILE_UPDATED:          ['athleteState', 'nutritionContext', 'dashboard', 'coachContext'],
  WEARABLE_DATA_SYNCED:     ['athleteState', 'dashboard', 'coachContext'],
  TRAINING_COMPLETED:       ['athleteState', 'dashboard', 'coachContext', 'projections'],
  CARDIO_COMPLETED:         ['athleteState', 'dashboard', 'coachContext', 'projections'],
  RECOVERY_UPDATED:         ['athleteState', 'dashboard', 'coachContext'],
};

/** Alvos de invalidação para um tipo de evento (determinístico). */
export function targetsFor(eventType: AthleteEventType): InvalidationTarget[] {
  return INVALIDATION_MAP[eventType] ?? [];
}

type Handler = (e: AthleteEvent) => void;
const listeners = new Set<Handler>();

/** Assina eventos do atleta. Retorna função de cancelamento. */
export function onAthleteEvent(handler: Handler): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/** Emite um evento (in-process) e também um CustomEvent no window quando houver. */
export function emitAthleteEvent(e: AthleteEvent): void {
  for (const h of Array.from(listeners)) { try { h(e); } catch { /* isolado */ } }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent('athlete-event', { detail: e })); } catch { /* SSR-safe */ }
  }
}

/** Helper: monta e emite um WEIGHT_UPDATED. */
export function emitWeightUpdated(userId: string, source: DataSource, measurementId?: string): void {
  emitAthleteEvent({ userId, eventType: 'WEIGHT_UPDATED', occurredAt: new Date().toISOString(), entityId: measurementId ?? null, source });
}
