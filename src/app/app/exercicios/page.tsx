"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, SlidersHorizontal, X, Star, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ExerciseCard } from "@/components/workout/exercise-card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  MUSCLE_GROUP_LABELS,
  EQUIPMENT_LABELS,
  type Exercise,
  type MuscleGroup,
  type EquipmentType,
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

const EQUIPMENT_FILTERS: { key: EquipmentType | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "barbell", label: "Barra" },
  { key: "dumbbell", label: "Halter" },
  { key: "machine", label: "Máquina" },
  { key: "cable", label: "Cabo" },
  { key: "bodyweight", label: "Peso Corporal" },
  { key: "kettlebell", label: "Kettlebell" },
  { key: "smith_machine", label: "Smith" },
  { key: "bands", label: "Elástico" },
];

const FAVORITES_KEY = "exercise_favorites";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveFavorites(ids: Set<string>) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids])); } catch {}
}

export default function ExerciciosPage() {
  const supabase = createClient();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | "all">("all");
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType | "all">("all");
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFavorites(loadFavorites());
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

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveFavorites(next);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchSearch =
        search === "" ||
        ex.name.toLowerCase().includes(search.toLowerCase()) ||
        ex.muscles_worked.some((m) =>
          m.toLowerCase().includes(search.toLowerCase())
        );
      const matchMuscle = selectedMuscle === "all" || ex.muscle_group === selectedMuscle;
      const matchEquipment = selectedEquipment === "all" || ex.equipment === selectedEquipment;
      const matchFav = !showFavorites || favorites.has(ex.id);
      return matchSearch && matchMuscle && matchEquipment && matchFav;
    });
  }, [exercises, search, selectedMuscle, selectedEquipment, showFavorites, favorites]);

  const hasFilter = search || selectedMuscle !== "all" || selectedEquipment !== "all" || showFavorites;

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Biblioteca de Exercícios</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{exercises.length} exercícios disponíveis</p>
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
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Muscle filters + Favorites */}
      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        <button
          onClick={() => setShowFavorites(!showFavorites)}
          className={cn(
            "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            showFavorites
              ? "bg-rose-600 border-rose-600 text-white"
              : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
          )}
        >
          <Heart className={cn("h-3 w-3", showFavorites && "fill-white")} />
          Favoritos {favorites.size > 0 && `(${favorites.size})`}
        </button>
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

      {/* Equipment filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {EQUIPMENT_FILTERS.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setSelectedEquipment(filter.key)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              selectedEquipment === filter.key
                ? "bg-purple-600 border-purple-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
            )}
          >
            {filter.key === "all" ? "Equipamento" : filter.label}
          </button>
        ))}
      </div>

      {/* 3.1 — Difficulty legend */}
      <div className="flex items-center gap-4 px-1">
        {[
          { stars: 1, label: "Iniciante" },
          { stars: 2, label: "Intermediário" },
          { stars: 3, label: "Avançado" },
        ].map(({ stars, label }) => (
          <div key={label} className="flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Star
                key={i}
                className={cn("h-3 w-3", i < stars ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")}
              />
            ))}
            <span className="text-[10px] text-zinc-500 ml-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Results count + clear */}
      {hasFilter && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={() => { setSearch(""); setSelectedMuscle("all"); setSelectedEquipment("all"); setShowFavorites(false); }}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Limpar filtros
          </button>
        </div>
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
          <p className="text-zinc-400 font-medium">
            {showFavorites && favorites.size === 0 ? "Nenhum favorito ainda" : "Nenhum exercício encontrado"}
          </p>
          <p className="text-sm text-zinc-600 mt-1">
            {showFavorites && favorites.size === 0
              ? "Marque exercícios com o coração para adicioná-los aqui"
              : "Tente ajustar os filtros ou a busca"}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              isFavorite={favorites.has(exercise.id)}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
