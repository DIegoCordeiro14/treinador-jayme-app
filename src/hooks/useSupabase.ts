"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  WorkoutPlan,
  WorkoutDay,
  WorkoutSession,
  Exercise,
  BodyMeasurement,
} from "@/types";

export function useSupabase() {
  const supabase = useMemo(() => createClient(), []);

  async function getProfile(userId: string): Promise<Profile | null> {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    return data;
  }

  async function updateProfile(userId: string, updates: Partial<Profile>): Promise<void> {
    await supabase.from("profiles").update(updates).eq("id", userId);
  }

  async function getWorkoutPlans(userId: string): Promise<WorkoutPlan[]> {
    const { data } = await supabase
      .from("workout_plans")
      .select(
        `
        *,
        workout_days (
          *,
          workout_exercises (
            *,
            exercise:exercises (*)
          )
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return (data as WorkoutPlan[]) ?? [];
  }

  async function getWorkoutPlan(planId: string): Promise<WorkoutPlan | null> {
    const { data } = await supabase
      .from("workout_plans")
      .select(
        `
        *,
        workout_days (
          *,
          workout_exercises (
            *,
            exercise:exercises (*)
          )
        )
      `
      )
      .eq("id", planId)
      .single();
    return data as WorkoutPlan | null;
  }

  async function getRecentSessions(
    userId: string,
    limit = 10
  ): Promise<WorkoutSession[]> {
    const { data } = await supabase
      .from("workout_sessions")
      .select(
        `
        *,
        workout_day:workout_days (name),
        session_sets (
          *,
          exercise:exercises (name, muscle_group)
        )
      `
      )
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(limit);
    return (data as WorkoutSession[]) ?? [];
  }

  async function getExercises(): Promise<Exercise[]> {
    const { data } = await supabase
      .from("exercises")
      .select("*")
      .eq("is_public", true)
      .order("name");
    return (data as Exercise[]) ?? [];
  }

  async function getBodyMeasurements(userId: string): Promise<BodyMeasurement[]> {
    const { data } = await supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: true });
    return (data as BodyMeasurement[]) ?? [];
  }

  async function insertBodyMeasurement(
    measurement: Omit<BodyMeasurement, "id" | "created_at">
  ): Promise<void> {
    await supabase.from("body_measurements").insert(measurement);
  }

  return {
    supabase,
    getProfile,
    updateProfile,
    getWorkoutPlans,
    getWorkoutPlan,
    getRecentSessions,
    getExercises,
    getBodyMeasurements,
    insertBodyMeasurement,
  };
}
