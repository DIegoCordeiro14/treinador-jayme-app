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

export const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  chest: 'bg-red-500/20 text-red-400 border-red-500/30',
  back: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  shoulders: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  biceps: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  triceps: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  legs: 'bg-green-500/20 text-green-400 border-green-500/30',
  glutes: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  abs: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  calves: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  forearms: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  full_body: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};
