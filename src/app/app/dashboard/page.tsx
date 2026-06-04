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
  Bot,
  CheckCircle2,
  Circle,
  TrendingUp,
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
import { DailyBriefingPanel } from "@/components/dashboard/daily-briefing-panel";
import { AthleteIntelligencePanel } from "@/components/dashboard/athlete-intelligence-panel";
import { ThreeLayerPanel } from "@/components/dashboard/three-layer-panel";
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
    { data: latestBio },
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
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bioimpedance_data")
      .select("weight_kg, bmi, body_fat_pct, skeletal_muscle_mass_kg, lean_mass_kg")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  // Today's workout day — fonte de verdade: schedule_config (mesma agenda do Calendário)
  const todayDayOfWeek = today.getDay();
  let todayWorkoutDay: WorkoutDay | null = null;

  if (typedPlan && typedPlan.workout_days) {
    const sortedDays = [...typedPlan.workout_days].sort(
      (a, b) => a.order_index - b.order_index
    );

    const schedule = (typedPlan as unknown as {
      schedule_config?: { start_date?: string; pattern?: number[]; day_assignments?: Record<string, string> } | null;
    }).schedule_config;

    const ednDay = todayDayOfWeek === 0 ? 7 : todayDayOfWeek; // 1=Seg … 7=Dom (padrão do Calendário)

    if (schedule?.pattern?.length) {
      // Segue exatamente a distribuição do Calendário
      if (schedule.pattern.includes(ednDay)) {
        const label = schedule.day_assignments?.[String(ednDay)] ?? null;
        const norm = (x: string) => x.toLowerCase().trim();
        // 1º: nome do treino igual/contém o rótulo
        let matchedDay = label
          ? sortedDays.find(
              (d) => norm(d.name) === norm(label) || norm(d.name).includes(norm(label)) || norm(label).includes(norm(d.name))
            ) ?? null
          : null;
        // 2º: rótulo é grupo muscular (ex. "legs/abs") — escolhe o treino com mais exercícios desses grupos
        if (!matchedDay && label) {
          const tokens = norm(label).split(/[\/+,&\s]+/).filter(Boolean);
          let best: { day: WorkoutDay; score: number } | null = null;
          for (const d of sortedDays) {
            const exs = (d as unknown as { workout_exercises?: { exercise?: { muscle_group?: string } }[] }).workout_exercises ?? [];
            const score = exs.filter((we) => tokens.some((t) => (we.exercise?.muscle_group ?? "").startsWith(t.slice(0, 4)))).length;
            if (score > 0 && (!best || score > best.score)) best = { day: d, score };
          }
          matchedDay = best?.day ?? null;
        }
        // 3º: posição do dia no padrão semanal → enésimo treino do plano
        if (!matchedDay) {
          const idx = [...schedule.pattern].sort((a, b) => a - b).indexOf(ednDay);
          matchedDay = sortedDays[idx % sortedDays.length] ?? null;
        }
        todayWorkoutDay = matchedDay;
      } else {
        todayWorkoutDay = null; // dia de descanso conforme o Calendário
      }
    } else {
      // Sem agenda: comportamento anterior (day_of_week ou sequencial)
      const matched = sortedDays.find((d) => d.day_of_week === todayDayOfWeek);
      todayWorkoutDay = matched ?? null;
      if (!todayWorkoutDay && weeklySessions.length < sortedDays.length) {
        todayWorkoutDay = sortedDays[weeklySessions.length] ?? null;
      }
    }
  }

  // ── Próximo treino agendado (informativo) ──
  const WEEKDAY_PT = ["", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
  let nextWorkout: { weekday: string; name: string; label?: string | null } | null = null;

  if (typedPlan && typedPlan.workout_days) {
    const sortedDays = [...typedPlan.workout_days].sort((a, b) => a.order_index - b.order_index);
    const schedule = (typedPlan as unknown as {
      schedule_config?: { pattern?: number[]; day_assignments?: Record<string, string> } | null;
    }).schedule_config;

    const matchByLabel = (label: string | null): WorkoutDay | null => {
      if (!label) return null;
      const norm = (x: string) => x.toLowerCase().trim();
      const byName = sortedDays.find(
        (d) => norm(d.name) === norm(label) || norm(d.name).includes(norm(label)) || norm(label).includes(norm(d.name))
      );
      if (byName) return byName;
      const tokens = norm(label).split(/[\/+,&\s]+/).filter(Boolean);
      let best: { day: WorkoutDay; score: number } | null = null;
      for (const d of sortedDays) {
        const exs = (d as unknown as { workout_exercises?: { exercise?: { muscle_group?: string } }[] }).workout_exercises ?? [];
        const score = exs.filter((we) => tokens.some((t) => (we.exercise?.muscle_group ?? "").startsWith(t.slice(0, 4)))).length;
        if (score > 0 && (!best || score > best.score)) best = { day: d, score };
      }
      return best?.day ?? null;
    };

    if (schedule?.pattern?.length) {
      const ednToday = todayDayOfWeek === 0 ? 7 : todayDayOfWeek;
      const sortedPattern = [...schedule.pattern].sort((a, b) => a - b);
      // primeiro dia do padrão estritamente após hoje; senão, primeiro da próxima semana
      const nextEdn = sortedPattern.find((d) => d > ednToday) ?? sortedPattern[0];
      if (nextEdn !== undefined) {
        const label = schedule.day_assignments?.[String(nextEdn)] ?? null;
        const matched = matchByLabel(label) ?? sortedDays[sortedPattern.indexOf(nextEdn) % sortedDays.length] ?? null;
        if (matched) nextWorkout = { weekday: WEEKDAY_PT[nextEdn], name: matched.name, label };
      }
    } else if (sortedDays.length > 0) {
      // sem agenda: próximo treino sequencial
      const next = sortedDays[(weeklySessions.length + (todayWorkoutDay ? 1 : 0)) % sortedDays.length];
      if (next && next.id !== todayWorkoutDay?.id) nextWorkout = { weekday: "próxima sessão", name: next.name };
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
          nextWorkout={nextWorkout}
        />
        <WeeklyCalendarStrip sessions={typedSessions} />
      </div>

      {/* V5.0 — Coach EDN Daily Briefing + Composição Corporal (mockup) */}
      <div className={latestBio ? "grid md:grid-cols-2 gap-4 items-start" : ""}>
        <DailyBriefingPanel />
        {latestBio && (
          <div className="rounded-xl card-gradient p-5">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3.5">Composição Corporal</p>
            <div className="grid grid-cols-3 gap-3 mb-3.5">
              <div className="text-center py-2.5 px-2 rounded-lg bg-white/[0.03]">
                <p className="text-lg font-extrabold italic text-zinc-100">{latestBio.weight_kg ?? "—"}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">PESO (KG)</p>
              </div>
              <div className="text-center py-2.5 px-2 rounded-lg bg-white/[0.03]">
                <p className="text-lg font-extrabold italic text-[#8B5A5A]">{latestBio.body_fat_pct != null ? `${latestBio.body_fat_pct}%` : "—"}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">GORDURA</p>
              </div>
              <div className="text-center py-2.5 px-2 rounded-lg bg-white/[0.03]">
                <p className="text-lg font-extrabold italic text-[#5A8A6A]">{latestBio.skeletal_muscle_mass_kg ?? latestBio.lean_mass_kg ?? "—"}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">MÚSCULO (KG)</p>
              </div>
            </div>
            {latestBio.bmi != null && (
              <div>
                <div className="flex justify-between text-[11px] mb-1.5">
                  <span className="text-zinc-400">IMC</span>
                  <span className={latestBio.bmi >= 30 ? "text-[#A67C3A] font-semibold" : latestBio.bmi >= 25 ? "text-[#A67C3A] font-semibold" : "text-[#5A8A6A] font-semibold"}>
                    {latestBio.bmi} — {latestBio.bmi >= 30 ? "Alto" : latestBio.bmi >= 25 ? "Acima" : "Normal"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full ${latestBio.bmi >= 25 ? "bg-[#A67C3A]" : "bg-[#5A8A6A]"}`} style={{ width: `${Math.min(100, (latestBio.bmi / 40) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* V5.0 — EDN Score 360° */}
      <AthleteIntelligencePanel name={profile?.name ?? undefined} />

      {/* Camadas 1-2-3 — Dados → Interpretação → Prescrição */}
      <ThreeLayerPanel />

      {/* Deload banner — aparece quando streak > 3 semanas sem PR ou platô de peso detectado */}
      {streak >= 14 && weeklyVolume > 0 && (
        <DeloadBanner reason={`${streak} dias de treino contínuo. Se não houver PRs recentes, uma semana de deload vai maximizar suas próximas 4 semanas.`} />
      )}

      {/* Onboarding checklist — só aparece sem sessões */}
      {monthlySessions.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#D4853A]" /> Primeiros passos
          </p>
          <div className="space-y-2">
            {[
              { label: "Perfil configurado", done: !!profile?.name, href: "/app/perfil" },
              { label: "Peso registrado", done: !!latestWeightKg, href: "/app/evolucao" },
              { label: "Plano de treino criado", done: !!typedPlan, href: "/app/treinos" },
              { label: "Primeiro treino concluído", done: monthlySessions.length > 0, href: todayWorkoutDay ? `/app/treinos/${typedPlan?.id}/executar?day=${todayWorkoutDay.id}` : "/app/treinos" },
            ].map(step => (
              <Link key={step.label} href={step.href} className="flex items-center gap-3 py-1.5 group">
                {step.done
                  ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                  : <Circle className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors" />}
                <span className={step.done ? "text-sm text-zinc-400 line-through" : "text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors"}>
                  {step.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Active Plan */}
      {typedPlan && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-zinc-100">Plano Ativo</h2>
            <Link href={`/app/treinos/${typedPlan.id}`}>
              <button className="text-xs text-[#D4853A] hover:text-[#E09B5A] flex items-center gap-1 transition-colors">
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
              <button className="text-xs text-[#D4853A] hover:text-[#E09B5A] flex items-center gap-1 transition-colors">
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
