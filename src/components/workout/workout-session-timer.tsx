"use client";

import { padZero, secondsToTime } from "@/lib/utils";

interface WorkoutSessionTimerProps {
  elapsedSeconds: number;
}

export function WorkoutSessionTimer({ elapsedSeconds }: WorkoutSessionTimerProps) {
  const { h, m, s } = secondsToTime(elapsedSeconds);

  return (
    <div className="flex items-center gap-1 font-mono text-sm font-semibold text-zinc-300">
      {h > 0 && (
        <>
          <span className="tabular-nums">{padZero(h)}</span>
          <span className="text-zinc-600">:</span>
        </>
      )}
      <span className="tabular-nums">{padZero(m)}</span>
      <span className="text-zinc-600">:</span>
      <span className="tabular-nums">{padZero(s)}</span>
    </div>
  );
}
