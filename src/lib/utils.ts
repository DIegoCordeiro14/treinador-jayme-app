import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWeight(kg: number): string {
  return `${kg.toFixed(1)}kg`;
}

// Volume total abreviado em toneladas: 16465 -> "16,46t"; 850 -> "850 kg".
export function formatVolume(kg: number): string {
  if (!kg || kg <= 0) return '0 kg';
  if (kg >= 1000) return `${(kg / 1000).toFixed(2).replace('.', ',')}t`;
  return `${Math.round(kg)} kg`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function calculateVolume(sets: { weight_kg: number; reps_done: number }[]): number {
  return sets.reduce((acc, set) => acc + set.weight_kg * set.reps_done, 0);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Bom dia, ${name}!`;
  if (hour < 18) return `Boa tarde, ${name}!`;
  return `Boa noite, ${name}!`;
}

export function getDayName(dayOfWeek: number): string {
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return days[dayOfWeek];
}

export function getFullDayName(dayOfWeek: number): string {
  const days = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  return days[dayOfWeek];
}

export function secondsToTime(seconds: number): { h: number; m: number; s: number } {
  return {
    h: Math.floor(seconds / 3600),
    m: Math.floor((seconds % 3600) / 60),
    s: seconds % 60,
  };
}

export function padZero(n: number): string {
  return String(n).padStart(2, "0");
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function getTrendIcon(trend: number): string {
  if (trend > 0) return "↑";
  if (trend < 0) return "↓";
  return "→";
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
