"use client";

import { useEffect, useState, useCallback } from "react";
import { X, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { padZero } from "@/lib/utils";

interface RestTimerProps {
  durationSeconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

export function RestTimer({ durationSeconds, onComplete, onSkip }: RestTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }
    const interval = setInterval(() => {
      setRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining, onComplete]);

  const progress = ((durationSeconds - remaining) / durationSeconds) * 100;
  const circumference = 2 * Math.PI * 54; // r=54
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const urgencyColor =
    remaining <= 10
      ? "#8B5A5A"
      : remaining <= 30
      ? "#A67C3A"
      : "#D4853A";

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-8 animate-in fade-in-0">
      <div>
        <h2 className="text-center text-xl font-bold text-zinc-100 mb-1">Descanso</h2>
        <p className="text-center text-sm text-zinc-400">Próxima série em breve</p>
      </div>

      {/* Circular progress */}
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="-rotate-90">
          {/* Background circle */}
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke="#1C2933"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke={urgencyColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className="text-4xl font-bold font-mono tabular-nums"
            style={{ color: urgencyColor }}
          >
            {padZero(minutes)}:{padZero(seconds)}
          </span>
          <span className="text-xs text-zinc-500 mt-1">
            de {Math.floor(durationSeconds / 60)}:{padZero(durationSeconds % 60)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkip} className="gap-2">
          <SkipForward className="h-4 w-4" />
          Pular Descanso
        </Button>
        <Button variant="ghost" onClick={onSkip} className="gap-2 text-zinc-500">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>

      <p className="text-xs text-zinc-600 max-w-xs text-center">
        O descanso adequado entre séries é fundamental para manter a performance. Não pule!
      </p>
    </div>
  );
}
