// ================================================
// Enums
// ================================================

export type GoalType = 'hypertrophy' | 'weight_loss' | 'definition' | 'strength' | 'fat_loss' | 'recomposition' | 'performance';
export type MainGoal = 'fat_loss' | 'hypertrophy' | 'recomposition' | 'performance';
export type AestheticGoalMale   = 'v_shape' | 'chest' | 'back' | 'shoulders' | 'arms' | 'definition_m' | 'performance_m';
export type AestheticGoalFemale = 'glutes' | 'legs' | 'hamstrings' | 'defined_waist' | 'definition_f' | 'performance_f';
export type AestheticGoal = AestheticGoalMale | AestheticGoalFemale;
export type GenderType = 'male' | 'female' | 'other';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'abs'
  | 'calves'
  | 'forearms'
  | 'full_body';
export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'smith_machine'
  | 'kettlebell'
  | 'bands';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

// ── Módulo 0 — Anamnese Esportiva Inteligente ──
export type TrainingYears = 'lt_6m' | '6m_2y' | '2y_5y' | 'gt_5y';
export type SleepHours = 'lt_5h' | '5_6h' | '7_8h' | 'gt_8h';
export type SleepQuality = 'poor' | 'regular' | 'good' | 'excellent';
export type StressLevel = 'low' | 'medium' | 'high';
export type WorkType = 'sedentary' | 'moderate' | 'active';
export type CardioFrequency = 'none' | '1_2x' | '3_4x' | '5x_plus';
export type TrainingLocation = 'full_gym' | 'basic_gym' | 'condo' | 'home' | 'bodyweight';
export type PreferredTime = 'morning' | 'afternoon' | 'evening';
export type EdnPhase = 'adaptation' | 'fat_loss' | 'recomp' | 'hypertrophy' | 'specialization' | 'deload';
export type RecommendedComplexity = 'basic' | 'intermediate' | 'advanced';

// ================================================
// Database Tables
// ================================================

export interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  goal: GoalType;
  experience_level: ExperienceLevel;
  weekly_frequency: number;
  meals_per_day: number | null;
  created_at: string;
  updated_at: string;
  // V3.2
  gender: GenderType | null;
  main_goal: MainGoal | null;
  aesthetic_goal: AestheticGoal | null;
  limitations: string[] | null;
  available_equipment: string[] | null;
  mesocycle_number: number | null;
  // ── Módulo 0 — Anamnese ──
  priority_muscle_1: MuscleGroup | null;
  priority_muscle_2: MuscleGroup | null;
  training_years: TrainingYears | null;
  has_periodization_exp: boolean | null;
  knows_rir: boolean | null;
  has_used_top_set: boolean | null;
  has_used_back_off: boolean | null;
  has_used_deload: boolean | null;
  session_duration_min: number | null;
  preferred_time: PreferredTime | null;
  training_location: TrainingLocation | null;
  sleep_hours: SleepHours | null;
  sleep_quality: SleepQuality | null;
  stress_level: StressLevel | null;
  work_type: WorkType | null;
  cardio_frequency: CardioFrequency | null;
  cardio_types: string[] | null;
  limitation_description: string | null;
  favorite_exercises: string[] | null;
  disliked_exercises: string[] | null;
  forbidden_exercises: string[] | null;
  // ── Avaliação automática EDN ──
  edn_phase: EdnPhase | null;
  progression_potential: number | null;
  recommended_complexity: RecommendedComplexity | null;
  profile_completion_pct: number | null;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group: MuscleGroup;
  equipment: EquipmentType;
  difficulty: DifficultyLevel;
  description: string;
  tips: string[];
  common_errors: string[];
  muscles_worked: string[];
  youtube_url: string | null;
  gif_url: string | null;
  created_by: string | null;
  is_public: boolean;
  created_at: string;
}

export interface WorkoutPlan {
  id: string;
  user_id: string;
  name: string;
  description: string;
  days_per_week: number;
  goal: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  workout_days?: WorkoutDay[];
}

export interface WorkoutDay {
  id: string;
  plan_id: string;
  name: string;
  day_of_week: number | null;
  order_index: number;
  // Joined
  workout_exercises?: WorkoutExerciseWithExercise[];
}

export interface WorkoutExercise {
  id: string;
  workout_day_id: string;
  exercise_id: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  notes: string;
  order_index: number;
}

export interface WorkoutExerciseWithExercise extends WorkoutExercise {
  exercise: Exercise;
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  workout_day_id: string | null;
  plan_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  notes: string;
  total_volume_kg: number;
  // Joined
  workout_day?: WorkoutDay | null;
  session_sets?: SessionSet[];
}

export interface SessionSet {
  id: string;
  session_id: string;
  workout_exercise_id: string | null;
  exercise_id: string;
  set_number: number;
  reps_done: number;
  weight_kg: number;
  completed: boolean;
  notes: string;
  // Joined
  exercise?: Exercise;
}

export interface BodyMeasurement {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  arm_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  thigh_cm: number | null;
  calf_cm: number | null;
  created_at: string;
}

export interface Achievement {
  id: string;
  user_id: string;
  type: string;
  title: string;
  description: string;
  earned_at: string;
  icon: string;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface AIConversation {
  id: string;
  user_id: string;
  messages: AIMessage[];
  created_at: string;
  updated_at: string;
}

// ================================================
// UI / Form Types
// ================================================

export interface StatsCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label: string;
    positive: boolean;
  };
  color?: string;
}

export interface WeeklyCalendarDay {
  date: Date;
  hasWorkout: boolean;
  isToday: boolean;
  sessionId?: string;
}

// ================================================
// API Response Types
// ================================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
}

// ================================================
// Workout Execution State
// ================================================

export interface ExecutionSet {
  setNumber: number;
  weightKg: number;
  repsDone: number;
  completed: boolean;
  notes: string;
}

export interface ExecutionExercise {
  workoutExercise: WorkoutExerciseWithExercise;
  sets: ExecutionSet[];
  completed: boolean;
}

export interface WorkoutExecutionState {
  sessionId: string | null;
  planId: string;
  workoutDayId: string;
  startedAt: Date;
  exercises: ExecutionExercise[];
  currentExerciseIndex: number;
  elapsedSeconds: number;
  isFinished: boolean;
}

// ================================================
// Label Maps
// ================================================

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  legs: 'Pernas',
  glutes: 'Glúteos',
  abs: 'Abdômen',
  calves: 'Panturrilha',
  forearms: 'Antebraço',
  full_body: 'Corpo Todo',
};

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  barbell: 'Barra',
  dumbbell: 'Halter',
  machine: 'Máquina',
  cable: 'Cabo',
  bodyweight: 'Peso Corporal',
  smith_machine: 'Smith',
  kettlebell: 'Kettlebell',
  bands: 'Elástico',
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

export const GOAL_LABELS: Record<GoalType, string> = {
  hypertrophy: 'Hipertrofia',
  weight_loss: 'Emagrecimento',
  definition: 'Definição',
  strength: 'Força',
  fat_loss: 'Emagrecimento',
  recomposition: 'Recomposição',
  performance: 'Performance',
};

export const MAIN_GOAL_LABELS: Record<MainGoal, string> = {
  fat_loss:      'Emagrecimento',
  hypertrophy:   'Hipertrofia',
  recomposition: 'Recomposição Corporal',
  performance:   'Performance',
};

export const AESTHETIC_GOAL_LABELS_MALE: Record<AestheticGoalMale, string> = {
  v_shape:      'Shape em V',
  chest:        'Peitoral',
  back:         'Costas',
  shoulders:    'Ombros',
  arms:         'Braços',
  definition_m: 'Definição',
  performance_m:'Performance',
};

export const AESTHETIC_GOAL_LABELS_FEMALE: Record<AestheticGoalFemale, string> = {
  glutes:       'Glúteos',
  legs:         'Pernas',
  hamstrings:   'Posteriores',
  defined_waist:'Cintura Definida',
  definition_f: 'Definição Geral',
  performance_f:'Performance',
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

// ── Módulo 0 — Label Maps ──

export const TRAINING_YEARS_LABELS: Record<TrainingYears, string> = {
  lt_6m: 'Menos de 6 meses',
  '6m_2y': '6 meses a 2 anos',
  '2y_5y': '2 a 5 anos',
  gt_5y: 'Mais de 5 anos',
};

export const SLEEP_HOURS_LABELS: Record<SleepHours, string> = {
  lt_5h: 'Menos de 5h',
  '5_6h': '5–6h',
  '7_8h': '7–8h',
  gt_8h: 'Mais de 8h',
};

export const SLEEP_QUALITY_LABELS: Record<SleepQuality, string> = {
  poor: 'Ruim',
  regular: 'Regular',
  good: 'Boa',
  excellent: 'Excelente',
};

export const STRESS_LEVEL_LABELS: Record<StressLevel, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  sedentary: 'Sedentário',
  moderate: 'Moderadamente ativo',
  active: 'Muito ativo',
};

export const CARDIO_FREQUENCY_LABELS: Record<CardioFrequency, string> = {
  none: 'Nenhum',
  '1_2x': '1–2x/semana',
  '3_4x': '3–4x/semana',
  '5x_plus': '5x ou mais',
};

export const CARDIO_TYPE_LABELS: Record<string, string> = {
  walking: 'Caminhada',
  running: 'Corrida',
  bike: 'Bike',
  swimming: 'Natação',
  other: 'Outros',
};

export const TRAINING_LOCATION_LABELS: Record<TrainingLocation, string> = {
  full_gym: 'Academia completa',
  basic_gym: 'Academia básica',
  condo: 'Condomínio',
  home: 'Casa',
  bodyweight: 'Peso corporal',
};

export const PREFERRED_TIME_LABELS: Record<PreferredTime, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  evening: 'Noite',
};

export const LIMITATION_LABELS: Record<string, string> = {
  shoulder: 'Ombro',
  knee: 'Joelho',
  lower_back: 'Lombar',
  hip: 'Quadril',
  elbow: 'Cotovelo',
  wrist: 'Punho',
};

export const EDN_PHASE_LABELS: Record<EdnPhase, string> = {
  adaptation: 'Adaptação',
  fat_loss: 'Emagrecimento',
  recomp: 'Recomposição',
  hypertrophy: 'Hipertrofia',
  specialization: 'Especialização',
  deload: 'Deload',
};

export const COMPLEXITY_LABELS: Record<RecommendedComplexity, string> = {
  basic: 'Básico',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

export const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  chest: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  back: 'bg-[#D4853A]/15 text-[#D4853A] border-transparent',
  shoulders: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  biceps: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  triceps: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  legs: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  glutes: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  abs: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  calves: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  forearms: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
  full_body: 'bg-[rgba(144,164,174,0.1)] text-[#8FA3AD] border-transparent',
}
