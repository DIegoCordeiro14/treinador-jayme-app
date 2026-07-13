/**
 * Event Bus + Pipeline reativo — AOS Blocos 3/4
 * Barramento de eventos desacoplado: cada evento dispara automaticamente os
 * motores necessários (pipeline), em vez de cada tela recalcular manualmente.
 */

export type AthleteEvent =
  | 'WorkoutCompleted' | 'WorkoutSkipped' | 'BioUpdated' | 'NewWearableSync'
  | 'GoalChanged' | 'NutritionChanged' | 'CardioFinished' | 'WorkoutGenerated'
  | 'RecoveryUpdated' | 'PlanCreated' | 'PlateauDetected' | 'PRAchieved'
  | 'SleepUpdated' | 'HRVUpdated' | 'RaceScheduled';

// Quais motores/recomputações cada evento aciona (Bloco 4 — pipeline).
export const EVENT_PIPELINE: Record<AthleteEvent, string[]> = {
  WorkoutCompleted: ['progression', 'volume', 'recovery', 'nutrition', 'athlete-score', 'aos', 'coach-briefing'],
  WorkoutSkipped: ['recovery', 'athlete-score', 'aos'],
  BioUpdated: ['nutrition', 'progress', 'projections', 'athlete-score', 'aos'],
  NewWearableSync: ['recovery', 'aos', 'coach-briefing'],
  GoalChanged: ['nutrition', 'training', 'cardio', 'aos'],
  NutritionChanged: ['nutrition', 'athlete-score', 'aos'],
  CardioFinished: ['cardio-intelligence', 'recovery', 'nutrition', 'athlete-score', 'aos'],
  WorkoutGenerated: ['calendar', 'nutrition', 'aos'],
  RecoveryUpdated: ['aos', 'coach-briefing', 'calendar'],
  PlanCreated: ['calendar', 'nutrition', 'aos'],
  PlateauDetected: ['training', 'nutrition', 'aos', 'coach-briefing'],
  PRAchieved: ['progression', 'athlete-score', 'timeline', 'coach-briefing'],
  SleepUpdated: ['recovery', 'aos'],
  HRVUpdated: ['recovery', 'aos', 'coach-briefing'],
  RaceScheduled: ['cardio-intelligence', 'nutrition', 'calendar', 'aos'],
};

type Handler = (payload?: unknown) => void;

export class EventBus {
  private handlers = new Map<AthleteEvent, Set<Handler>>();
  on(ev: AthleteEvent, h: Handler): () => void {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(h);
    return () => this.handlers.get(ev)?.delete(h);
  }
  emit(ev: AthleteEvent, payload?: unknown): string[] {
    this.handlers.get(ev)?.forEach((h) => { try { h(payload); } catch { /* isolado */ } });
    return EVENT_PIPELINE[ev] ?? [];
  }
  pipeline(ev: AthleteEvent): string[] { return EVENT_PIPELINE[ev] ?? []; }
}

// Instância global (singleton) para uso no cliente.
export const athleteBus = new EventBus();
