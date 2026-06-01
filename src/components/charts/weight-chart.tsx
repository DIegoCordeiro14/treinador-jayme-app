"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BodyMeasurement } from "@/types";

interface WeightChartProps {
  measurements: BodyMeasurement[];
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
          {p.value.toFixed(1)} kg
        </p>
      ))}
    </div>
  );
}

export function WeightChart({ measurements }: WeightChartProps) {
  const data = measurements
    .filter((m) => m.weight_kg !== null)
    .slice(-30)
    .map((m) => ({
      date: format(parseISO(m.date), "dd/MM", { locale: ptBR }),
      weight: m.weight_kg!,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500 text-sm">
        Nenhum dado de peso registrado ainda
      </div>
    );
  }

  const minVal = Math.min(...data.map((d) => d.weight)) - 2;
  const maxVal = Math.max(...data.map((d) => d.weight)) + 2;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={{ stroke: "#27272a" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minVal, maxVal]}
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#2563eb" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
