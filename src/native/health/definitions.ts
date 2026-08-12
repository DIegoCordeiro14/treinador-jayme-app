/**
 * Contrato normalizado do plugin nativo de saúde (Coach EDN Native Data Bridge).
 *
 * TODA fonte nativa (Health Connect / HealthKit / Strava) DEVE devolver este mesmo
 * contrato. A camada nativa NÃO calcula fisiologia — apenas transporta dados reais
 * (timestamps preservados) para os motores determinísticos existentes.
 */

export type SyncState =
  | 'not_connected' | 'permission_required' | 'connected'
  | 'syncing' | 'synced' | 'partial' | 'error';

export interface NativeGpsPoint {
  timestamp: string; // ISO
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracyHorizontal?: number | null;
  accuracyVertical?: number | null;
}

export interface NativeHeartRateSample {
  timestamp: string; // ISO — preservado individualmente (série temporal)
  bpm: number;
}

/** Resumo de uma atividade (sem amostras pesadas). */
export interface NativeWorkout {
  externalId: string;
  provider: string;            // 'health_connect' | 'healthkit' | 'strava' | 'wear_os'
  deviceName?: string | null;

  sportType: string;           // categoria normalizada (normalizeSportType)
  sourceSportType?: string | null; // exerciseType original (auditoria)

  startedAt: string;           // ISO
  endedAt: string;             // ISO
  durationSeconds: number;

  distanceMeters?: number | null;
  caloriesActive?: number | null;
  caloriesTotal?: number | null;

  avgHeartRate?: number | null;
  maxHeartRate?: number | null;

  cadence?: number | null;
  elevationGainMeters?: number | null;

  hasRoute: boolean;
  hasHeartRateSamples: boolean;
}

/** Detalhe completo (com rota e FC temporal). */
export interface NativeWorkoutDetails extends NativeWorkout {
  route: NativeGpsPoint[];
  heartRateSamples: NativeHeartRateSample[];
}

export interface QueryWorkoutOptions { startTime: string; endTime: string }
export interface QueryWorkoutResult { workouts: NativeWorkout[] }

export interface WorkoutDetailsOptions { externalId: string; startTime: string; endTime: string }

export interface TimeRangeOptions { startTime: string; endTime: string }
export interface HeartRateSampleResult { samples: NativeHeartRateSample[] }

export interface WorkoutRouteOptions { externalId: string; startTime: string; endTime: string }
export interface WorkoutRouteResult { route: NativeGpsPoint[] }

export interface LiveMetricsOptions { sportType?: string }
export interface LiveMetricEvent {
  timestamp: string;
  heartRate?: number | null;
  calories?: number | null;
  distanceMeters?: number | null;
  speedMps?: number | null;
  source: 'wear_os' | 'watchos';
}

export interface HealthPermissionStatus {
  available: boolean;
  granted: boolean;
  missing: string[];
}

// Compat mínimo com o tipo de handle do Capacitor sem depender do pacote em build web.
export interface PluginListenerHandle { remove: () => Promise<void> }

export interface CoachEdnHealthPlugin {
  isAvailable(): Promise<{ available: boolean; platform: string }>;
  getHealthPermissionsStatus(): Promise<HealthPermissionStatus>;
  requestHealthPermissions(): Promise<HealthPermissionStatus>;

  queryWorkouts(options: QueryWorkoutOptions): Promise<QueryWorkoutResult>;
  queryWorkoutDetails(options: WorkoutDetailsOptions): Promise<NativeWorkoutDetails>;
  queryHeartRateSamples(options: TimeRangeOptions): Promise<HeartRateSampleResult>;
  queryWorkoutRoute(options: WorkoutRouteOptions): Promise<WorkoutRouteResult>;

  startLiveMetrics(options: LiveMetricsOptions): Promise<void>;
  stopLiveMetrics(): Promise<void>;
  addListener(eventName: 'liveMetrics', listener: (event: LiveMetricEvent) => void): Promise<PluginListenerHandle>;
}
