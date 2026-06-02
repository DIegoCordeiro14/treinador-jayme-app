"use client";

import { useState } from "react";
import { Play, ChevronRight, Star } from "lucide-react";
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
} from "@/types";

interface ExerciseCardProps {
  exercise: Exercise;
}

export function ExerciseCard({ exercise }: ExerciseCardProps) {
  const [open, setOpen] = useState(false);

  const difficultyStars = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all duration-200 group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-zinc-100 text-sm group-hover:text-white transition-colors truncate">
              {exercise.name}
            </h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                  MUSCLE_GROUP_COLORS[exercise.muscle_group]
                )}
              >
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
                <Star
                  key={i}
                  className={cn(
                    "h-3 w-3",
                    i < difficultyStars[exercise.difficulty]
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-zinc-700"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{exercise.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
                  MUSCLE_GROUP_COLORS[exercise.muscle_group]
                )}
              >
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
                    <Badge key={i} variant="outline" className="text-xs">
                      {m}
                    </Badge>
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
                    title={`${exercise.name} - demonstração`}
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
