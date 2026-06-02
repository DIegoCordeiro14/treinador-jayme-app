"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ExerciseCard } from "@/components/workout/exercise-card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  MUSCLE_GROUP_LABELS,
  type Exercise,
  type MuscleGroup,
  MUSCLE_GROUP_COLORS,
} from "@/types";

const MUSCLE_FILTERS: { key: MuscleGroup | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "chest", label: "Peito" },
  { key: "back", label: "Costas" },
  { key: "shoulders", label: "Ombros" },
  { key: "biceps", label: "Bíceps" },
  { key: "triceps", label: "Tríceps" },
  { key: "legs", label: "Pernas" },
  { key: "glutes", label: "Glúteos" },
  { key: "abs", label: "Abdômen" },
  { key: "calves", label: "Panturrilha" },
];

export default function ExerciciosPage() {
  const supabase = createClient();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | "all">("all");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("exercises")
        .select("*")
        .eq("is_public", true)
        .order("name");
      setExercises((data as Exercise[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchSearch =
        search === "" ||
        ex.name.toLowerCase().includes(search.toLowerCase()) ||
        ex.muscles_worked.some((m) =>
          m.toLowerCase().includes(search.toLowerCase())
        );
      const matchMuscle =
        selectedMuscle === "all" || ex.muscle_group === selectedMuscle;
      return matchSearch && matchMuscle;
    });
  }, [exercises, search, selectedMuscle]);

  return (
    <div className="space-y-5 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Biblioteca de Exercícios</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {exercises.length} exercícios disponíveis
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar exercício ou músculo..."
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Muscle group filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {MUSCLE_FILTERS.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setSelectedMuscle(filter.key)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              selectedMuscle === filter.key
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      {(search || selectedMuscle !== "all") && (
        <p className="text-xs text-zinc-500">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} encontrado
          {filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-12 text-center">
          <SlidersHorizontal className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Nenhum exercício encontrado</p>
          <p className="text-sm text-zinc-600 mt-1">
            Tente ajustar os filtros ou a busca
          </p>
          {(search || selectedMuscle !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedMuscle("all");
              }}
              className="text-blue-400 text-sm mt-2 hover:text-blue-300 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>
      )}
    </div>
  );
}
