import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { WorkoutExerciseWithExercise } from '@/types';

export interface ExecutionSet {
  setNumber: number;
  setType: 'warmup' | 'feeder' | 'topset' | 'backoff';
  weightKg: number;
  repsDone: number;
  rir: number;
  completed: boolean;
  notes: string;
}

export interface ExecutionExercise {
  workoutExercise: WorkoutExerciseWithExercise;
  sets: ExecutionSet[];
  completed: boolean;
}

interface WorkoutState {
  sessionId: string | null;
  planId: string | null;
  workoutDayId: string | null;
  startedAt: Date | null;
  exercises: ExecutionExercise[];
  currentExerciseIndex: number;
  elapsedSeconds: number;
  isActive: boolean;
  isFinished: boolean;
  restTimerActive: boolean;
  restTimerSeconds: number;

  // Actions
  startSession: (params: { planId: string; workoutDayId: string; exercises: ExecutionExercise[] }) => void;
  setSessionId: (id: string) => void;
  updateSet: (exerciseIdx: number, setIdx: number, data: Partial<ExecutionSet>) => void;
  completeSet: (exerciseIdx: number, setIdx: number) => void;
  completeExercise: (exerciseIdx: number) => void;
  nextExercise: () => void;
  prevExercise: () => void;
  setElapsed: (s: number) => void;
  startRestTimer: (seconds: number) => void;
  stopRestTimer: () => void;
  finishSession: () => void;
  resetSession: () => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  immer((set) => ({
    sessionId: null,
    planId: null,
    workoutDayId: null,
    startedAt: null,
    exercises: [],
    currentExerciseIndex: 0,
    elapsedSeconds: 0,
    isActive: false,
    isFinished: false,
    restTimerActive: false,
    restTimerSeconds: 0,

    startSession: ({ planId, workoutDayId, exercises }) =>
      set((state) => {
        state.planId = planId;
        state.workoutDayId = workoutDayId;
        state.exercises = exercises;
        state.startedAt = new Date();
        state.isActive = true;
        state.isFinished = false;
        state.currentExerciseIndex = 0;
        state.elapsedSeconds = 0;
      }),

    setSessionId: (id) => set((state) => { state.sessionId = id; }),

    updateSet: (exerciseIdx, setIdx, data) =>
      set((state) => {
        Object.assign(state.exercises[exerciseIdx].sets[setIdx], data);
      }),

    completeSet: (exerciseIdx, setIdx) =>
      set((state) => {
        state.exercises[exerciseIdx].sets[setIdx].completed = true;
      }),

    completeExercise: (exerciseIdx) =>
      set((state) => {
        state.exercises[exerciseIdx].completed = true;
      }),

    nextExercise: () =>
      set((state) => {
        if (state.currentExerciseIndex < state.exercises.length - 1) {
          state.currentExerciseIndex++;
        }
      }),

    prevExercise: () =>
      set((state) => {
        if (state.currentExerciseIndex > 0) {
          state.currentExerciseIndex--;
        }
      }),

    setElapsed: (s) => set((state) => { state.elapsedSeconds = s; }),

    startRestTimer: (seconds) =>
      set((state) => {
        state.restTimerActive = true;
        state.restTimerSeconds = seconds;
      }),

    stopRestTimer: () =>
      set((state) => {
        state.restTimerActive = false;
        state.restTimerSeconds = 0;
      }),

    finishSession: () =>
      set((state) => {
        state.isActive = false;
        state.isFinished = true;
      }),

    resetSession: () =>
      set((state) => {
        state.sessionId = null;
        state.planId = null;
        state.workoutDayId = null;
        state.startedAt = null;
        state.exercises = [];
        state.currentExerciseIndex = 0;
        state.elapsedSeconds = 0;
        state.isActive = false;
        state.isFinished = false;
        state.restTimerActive = false;
        state.restTimerSeconds = 0;
      }),
  }))
);
