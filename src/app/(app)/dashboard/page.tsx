import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Flame,
  BarChart2,
  Calendar,
  Scale,
  Plus,
  Clock,
  Dumbbell,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatsCard } from "@/components/dashboard/stats-card";
import { WorkoutTodayCard } from "@/components/dashboard/workout-today-card";
import { WeeklyCalendarStrip } from "@/components/dashboard/weekly-calendar-strip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getGreeting,
  formatDuration,
  formatWeight,
} from "@/lib/utils";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  subDays,
  isWithinInterval,
  isSameDay,
  parseISO,
} from "date-fns";
import { MUSCLE_GROUP_COLORS, MUSCLE_GROUP_LABELS, GOAL_LABELS } from "@/types";
import type { WorkoutSession, WorkoutPlan, WorkoutDay } from "@/types";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch all needed data in parallel
  const [
    { data: profile },
    { data: sessions },
    { data: activePlan },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("workout_sessions")
      .select(
        `*, workout_day:workout_days(name, order_index)`
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("workout_plans")
      .select(
        `*, workout_days(*, workout_exercises(*, exercise:exercises(*)))`
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single(),
  ]);

  const typedSessions = (sessions ?? []) as WorkoutSession[];
  const typedPlan = activePlan as WorkoutPlan | null;

  // Calculate stats
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const monthStart = startOfMonth(today);

  const weeklySessions = typedSessions.filter((s) => {
    const d = parseISO(s.started_at);
    return isWithinInterval(d, { start: weekStart, end: weekEnd });
  });

  const monthlySessions = typedSessions.filter((s) => {
    const d = parseISO(s.started_at);
    return d >= monthStart;
  });

  const weeklyVolume = weeklySessions.reduce(
    (sum, s) => sum + (s.total_volume_kg ?? 0),
    0
  );

  // Streak calculation
  let streak = 0;
  let checkDate = new Date(today);
  while (true) {
    const hasWorkout = typedSessions.some((s) =>
      isSameDay(parseISO(s.started_at), checkDate)
    );
    if (!hasWorkout) break;
    streak++;
    checkDate = subDays(checkDate, 1);
  }

  // Latest weight
  // Buscar peso mais recente: prioriza bioimpedance_data, depois body_measurements
  const [{ data: latestBioWeight }, { data: latestMeasurement }] = await Promise.all([
    supabase
      .from("bioimpedance_data")
      .select("weight_kg, measured_at")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("body_measurements")
      .select("weight_kg, date")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(1)
      .single(),
  ]);
  // Usar o registro mais recente entre as duas fontes
  const latestWeightKg = (() => {
    const bioW = latestBioWeight?.weight_kg ?? null;
    const measW = latestMeasurement?.weight_kg ?? null;
    if (bioW && measW) {
      const bioDate = new Date(latestBioWeight!.measured_at);
      const measDate = new Date(latestMeasurement!.date);
      return bioDate >= measDate ? bioW : measW;
    }
    return bioW ?? measW;
  })();

  // Today's workout day (based on day of week or sequential)
  const todayDayOfWeek = today.getDay();
  let todayWorkoutDay: WorkoutDay | null = null;

  if (typedPlan && typedPlan.workout_days) {
    const sortedDays = [...typedPlan.workout_days].sort(
      (a, b) => a.order_index - b.order_index
    );
    // Match by day_of_week if set
    const matched = sortedDays.find((d) => d.day_of_week === todayDayOfWeek);
    todayWorkoutDay = matched ?? null;

    // If no explicit day_of_week, use sequential based on how many workouts done this week
    if (!todayWorkoutDay && weeklySessions.length < sortedDays.length) {
      todayWorkoutDay = sortedDays[weeklySessions.length] ?? null;
    }
  }

  const recentSessions = typedSessions.slice(0, 5);

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            {getGreeting(profile?.name?.split(" ")[0] ?? "atleta")} 💪
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {today.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <Link href="/app/treinos">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Novo Treino
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          label="Sequência"
          value={`${streak} ${streak === 1 ? "dia" : "dias"}`}
          icon={<Flame className="h-4 w-4" />}
          color="orange"
        />
        <StatsCard
          label="Volume Semanal"
          value={weeklyVolume > 0 ? formatWeight(weeklyVolume) : "0kg"}
          icon={<BarChart2 className="h-4 w-4" />}
          color="blue"
        />
        <StatsCard
          label="Treinos no Mês"
          value={monthlySessions.length}
          icon={<Calendar className="h-4 w-4" />}
          color="green"
        />
        <StatsCard
          label="Peso Atual"
          value={latestWeightKg ? formatWeight(latestWeightKg) : "—"}
          icon={<Scale className="h-4 w-4" />}
          color="purple"
        />
      </div>

      {/* Today's workout + weekly strip */}
      <div className="grid md:grid-cols-2 gap-4">
        <WorkoutTodayCard
          workoutDay={todayWorkoutDay}
          plan={typedPlan}
          isRestDay={!todayWorkoutDay}
        />
        <WeeklyCalendarStrip sessions={typedSessions} />
      </div>

      {/* Active Plan */}
      {typedPlan && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-zinc-100">Plano Ativo</h2>
            <Link href={`/app/treinos/${typedPlan.id}`}>
              <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                Ver plano <ChevronRight className="h-3 w-3" />
              </button>
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-zinc-200">{typedPlan.name}</p>
            {typedPlan.description && (
              <p className="text-sm text-zinc-400">{typedPlan.description}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary">
                {typedPlan.days_per_week}x por semana
              </Badge>
              <Badge variant="outline">{GOAL_LABELS[typedPlan.goal as keyof typeof GOAL_LABELS] ?? typedPlan.goal}</Badge>
              <Badge variant="outline">
                {typedPlan.workout_days?.length ?? 0} divisões
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* No active plan CTA */}
      {!typedPlan && (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-8 text-center">
          <Dumbbell className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="font-semibold text-zinc-300 mb-1">Nenhum plano ativo</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Crie seu primeiro plano de treino para começar a registrar suas sessões
          </p>
          <Link href="/app/treinos">
            <Button size="sm">Criar plano de treino</Button>
          </Link>
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-zinc-100">Sessões Recentes</h2>
            <Link href="/app/historico">
              <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                Ver todas <ChevronRight className="h-3 w-3" />
              </button>
            </Link>
          </div>
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                  <Dumbbell className="h-4.5 w-4.5 text-zinc-400" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-zinc-100 text-sm">
                    {session.workout_day?.name ?? "Treino livre"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(session.started_at).toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {session.duration_seconds && (
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Clock className="h-3 w-3" />
                      {formatDuration(session.duration_seconds)}
                    </div>
                  )}
                  {session.total_volume_kg > 0 && (
                    <span className="text-xs text-zinc-500">
                      {formatWeight(session.total_volume_kg)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
