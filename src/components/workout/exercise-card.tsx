"use client";

import { useState } from "react";
import { Play, ChevronRight, Star, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MUSCLE_GROUP_LABELS,
  EQUIPMENT_LABELS,
  DIFFICULTY_LABELS,
  MUSCLE_GROUP_COLORS,
  type Exercise,
  type MuscleGroup,
} from "@/types";

// 3.4 — Visual illustration per muscle group
const MUSCLE_ILLUSTRATIONS: Record<MuscleGroup, string> = {
  chest:     "🫁",
  back:      "🔙",
  shoulders: "💪",
  biceps:    "💪",
  triceps:   "💪",
  legs:      "🦵",
  glutes:    "🍑",
  abs:       "🎯",
  calves:    "🦶",
  forearms:  "🤜",
  full_body: "🏃",
};

const MUSCLE_BG: Record<MuscleGroup, string> = {
  chest:     "from-blue-900/40 to-blue-800/20 border-blue-700/30",
  back:      "from-green-900/40 to-green-800/20 border-green-700/30",
  shoulders: "from-yellow-900/40 to-yellow-800/20 border-yellow-700/30",
  biceps:    "from-orange-900/40 to-orange-800/20 border-orange-700/30",
  triceps:   "from-purple-900/40 to-purple-800/20 border-purple-700/30",
  legs:      "from-red-900/40 to-red-800/20 border-red-700/30",
  glutes:    "from-pink-900/40 to-pink-800/20 border-pink-700/30",
  abs:       "from-cyan-900/40 to-cyan-800/20 border-cyan-700/30",
  calves:    "from-teal-900/40 to-teal-800/20 border-teal-700/30",
  forearms:  "from-amber-900/40 to-amber-800/20 border-amber-700/30",
  full_body: "from-zinc-900/40 to-zinc-800/20 border-zinc-700/30",
};

interface ExerciseCardProps {
  exercise: Exercise;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export function ExerciseCard({ exercise, isFavorite = false, onToggleFavorite }: ExerciseCardProps) {
  const [open, setOpen] = useState(false);

  const difficultyStars = { beginner: 1, intermediate: 2, advanced: 3 };
  const stars = difficultyStars[exercise.difficulty] ?? 1;

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all duration-200 group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-zinc-100 text-sm group-hover:text-white transition-colors truncate pr-6">
                {exercise.name}
              </h3>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold", MUSCLE_GROUP_COLORS[exercise.muscle_group])}>
                  {MUSCLE_GROUP_LABELS[exercise.muscle_group]}
                </span>
                <Badge variant="secondary" className="text-[11px] py-0.5">
                  {EQUIPMENT_LABELS[exercise.equipment]}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              <div className="flex gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Star key={i} className={cn("h-3 w-3", i < stars ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")} />
                ))}
              </div>
            </div>
          </div>
        </button>

        {/* 3.3 — Favorite toggle */}
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(exercise.id); }}
            className="absolute top-3 right-8 p-1 rounded-full transition-colors hover:bg-zinc-700"
            title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Heart className={cn("h-4 w-4 transition-colors", isFavorite ? "text-rose-500 fill-rose-500" : "text-zinc-600 hover:text-rose-400")} />
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-xl">{exercise.name}</DialogTitle>
              {onToggleFavorite && (
                <button
                  onClick={() => onToggleFavorite(exercise.id)}
                  className="shrink-0 p-1.5 rounded-full hover:bg-zinc-800 transition-colors"
                >
                  <Heart className={cn("h-5 w-5 transition-colors", isFavorite ? "text-rose-500 fill-rose-500" : "text-zinc-500 hover:text-rose-400")} />
                </button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-5">
            {/* 3.4 — Visual illustration */}
            <div className={cn("rounded-xl border p-5 bg-gradient-to-br flex items-center gap-4", MUSCLE_BG[exercise.muscle_group] ?? "from-zinc-900 to-zinc-800 border-zinc-700")}>
              <span className="text-5xl" role="img">{MUSCLE_ILLUSTRATIONS[exercise.muscle_group] ?? "💪"}</span>
              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-1">Grupo muscular</p>
                <p className="text-lg font-bold text-zinc-100">{MUSCLE_GROUP_LABELS[exercise.muscle_group]}</p>
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Star key={i} className={cn("h-3.5 w-3.5", i < stars ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")} />
                  ))}
                  <span className="text-xs text-zinc-400 ml-1">{DIFFICULTY_LABELS[exercise.difficulty]}</span>
                </div>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={cn("inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold", MUSCLE_GROUP_COLORS[exercise.muscle_group])}>
                {MUSCLE_GROUP_LABELS[exercise.muscle_group]}
              </span>
              <Badge variant="secondary">{EQUIPMENT_LABELS[exercise.equipment]}</Badge>
              <Badge variant="outline">{DIFFICULTY_LABELS[exercise.difficulty]}</Badge>
            </div>

            {/* Description */}
            {exercise.description && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">Descrição</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">{exercise.description}</p>
              </div>
            )}

            {/* Muscles worked */}
            {exercise.muscles_worked && exercise.muscles_worked.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">Músculos Trabalhados</h4>
                <div className="flex flex-wrap gap-1.5">
                  {exercise.muscles_worked.map((m, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            {exercise.tips && exercise.tips.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">Dicas de Execução</h4>
                <ul className="space-y-1.5">
                  {exercise.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                      <span className="text-blue-400 mt-0.5 shrink-0">✓</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Common errors */}
            {exercise.common_errors && exercise.common_errors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">Erros Comuns</h4>
                <ul className="space-y-1.5">
                  {exercise.common_errors.map((error, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                      <span className="text-red-400 mt-0.5 shrink-0">✗</span>
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* YouTube embed */}
            {exercise.youtube_url && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">
                  <span className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-red-500" />
                    Demonstração em Vídeo
                  </span>
                </h4>
                <div className="aspect-video rounded-lg overflow-hidden bg-zinc-800">
                  <iframe
                    src={exercise.youtube_url.replace("watch?v=", "embed/")}
                    title={exercise.name + " - demonstracao"}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
