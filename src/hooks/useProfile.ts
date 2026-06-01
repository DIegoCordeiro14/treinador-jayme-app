"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (profileError) {
          setError(profileError.message);
        } else {
          setProfile(data as Profile);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  async function updateProfile(updates: Partial<Profile>): Promise<boolean> {
    if (!profile) return false;

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profile.id);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setProfile((prev) => (prev ? { ...prev, ...updates } : null));
    return true;
  }

  return { profile, loading, error, updateProfile };
}
