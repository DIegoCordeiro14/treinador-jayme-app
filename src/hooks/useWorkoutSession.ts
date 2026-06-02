"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  WorkoutDay,
  WorkoutExerciseWithExercise,
  ExecutionExercise,
  ExecutionSet,
  WorkoutExecutionState,
} from "@/types";

function buildInitialExercises(
  workoutExercises: WorkoutExerciseWithExercise[]
): ExecutionExercise[] {
  return workoutExercises.map((we) => ({
    workoutExercise: we,
    sets: Array.from({ length: we.sets }, (_, i) => ({
      setNumber: i + 1,
      weightKg: 0,
      repsDone: we.reps_max,
      completed: false,
      notes: "",
    })),
    completed: false,
  }));
}

interface UseWorkoutSessionOptions {
  workoutDay: WorkoutDay;
  planId: string;
}

export function useWorkoutSession({ workoutDay, planId }: UseWorkoutSessionOptions) {
  const [state, setState] = useState<WorkoutExecutionState>(() => ({
    sessionId: null,
    planId,
    workoutDayId: workoutDay.id,
    startedAt: new Date(),
    exercises: buildInitialExercises(workoutDay.workout_exercises ?? []),
    currentExerciseIndex: 0,
    elapsedSeconds: 0,
    isFinished: false,
  }));

  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(90);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed timer
  useEffect(() => {
    if (state.isFinished) return;
    timerRef.current = setInterval(() => {
      setState((prev) => ({
        ...prev,
        elapsedSeconds: prev.elapsedSeconds + 1,
      }));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.isFinished]);

  const updateSet = useCallback(
    (exerciseIndex: number, setIndex: number, updates: Partial<ExecutionSet>) => {
      setState((prev) => {
        const exercises = [...prev.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        sets[setIndex] = { ...sets[setIndex], ...updates };
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        return { ...prev, exercises };
      });
    },
    []
  );

  const completeSet = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      setState((prev) => {
        const exercises = [...prev.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        sets[setIndex] = { ...sets[setIndex], completed: true };

        // Check if all sets for this exercise are done
        const allSetsCompleted = sets.every((s) => s.completed);
        exercise.sets = sets;
        exercise.completed = allSetsCompleted;
        exercises[exerciseIndex] = exercise;
        return { ...prev, exercises };
      });

      // Start rest timer
      const restSeconds =
        state.exercises[exerciseIndex]?.workoutExercise.rest_seconds ?? 90;
      setRestDuration(restSeconds);
      setShowRestTimer(true);
    },
    [state.exercises]
  );

  const skipRestTimer = useCallback(() => {
    setShowRestTimer(false);
  }, []);

  const goToExercise = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      currentExerciseIndex: Math.max(0, Math.min(index, prev.exercises.length - 1)),
    }));
  }, []);

  const nextExercise = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.currentExerciseIndex + 1;
      if (nextIndex >= prev.exercises.length) return prev;
      return { ...prev, currentExerciseIndex: nextIndex };
    });
  }, []);

  const prevExercise = useCallback(() => {
    setState((prev) => {
      const prevIndex = prev.currentExerciseIndex - 1;
      if (prevIndex < 0) return prev;
      return { ...prev, currentExerciseIndex: prevIndex };
    });
  }, []);

  const finishWorkout = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState((prev) => ({ ...prev, isFinished: true }));
  }, []);

  const currentExercise = state.exercises[state.currentExerciseIndex];
  const completedCount = state.exercises.filter((e) => e.completed).length;
  const totalExercises = state.exercises.length;
  const progressPercent =
    totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0;

  const totalVolume = state.exercises.reduce((total, exercise) => {
    return (
      total +
      exercise.sets
        .filter((s) => s.completed)
        .reduce((sum, s) => sum + s.weightKg * s.repsDone, 0)
    );
  }, 0);

  return {
    state,
    currentExercise,
    completedCount,
    totalExercises,
    progressPercent,
    totalVolume,
    showRestTimer,
    restDuration,
    updateSet,
    completeSet,
    skipRestTimer,
    goToExercise,
    nextExercise,
    prevExercise,
    finishWorkout,
  };
}
