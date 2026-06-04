"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WorkoutSession } from "@/types";

interface VolumeChartProps {
  sessions: WorkoutSession[];
  weeks?: number;
}

interface TooltipPayload {
  value: number;
  name: string;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {(p.value / 1000).toFixed(1)} ton
        </p>
      ))}
    </div>
  );
}

export function VolumeChart({ sessions, weeks = 8 }: VolumeChartProps) {
  const today = new Date();

  const data = Array.from({ length: weeks }, (_, i) => {
    const weekStart = startOfWeek(subWeeks(today, weeks - 1 - i), {
      weekStartsOn: 1,
    });
    const weekEnd = addDays(weekStart, 6);
    const label = format(weekStart, "dd/MM", { locale: ptBR });

    const volume = sessions
      .filter((s) => {
        const d = new Date(s.started_at);
        return d >= weekStart && d <= weekEnd;
      })
      .reduce((sum, s) => sum + (s.total_volume_kg ?? 0), 0);

    return { label, volume };
  });

  if (data.every((d) => d.volume === 0)) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500 text-sm">
        Nenhum volume registrado ainda
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={{ stroke: "#27272a" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}t`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="volume"
          fill="#D4853A"
          radius={[4, 4, 0, 0]}
          opacity={0.85}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
