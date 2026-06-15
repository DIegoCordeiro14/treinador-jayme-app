"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Dumbbell,
  ChevronRight,
  Target,
  Calendar,
  CheckCircle2,
  Sparkles,
  Activity,
  AlertCircle,
  UserCog,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import type { WorkoutPlan } from "@/types";
import { GOAL_LABELS, MAIN_GOAL_LABELS } from "@/types";

const createPlanSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  description: z.string().optional(),
});

type CreatePlanForm = z.infer<typeof createPlanSchema>;

const DEFAULT_DAYS = {
  2: [{ name: "Treino A" }, { name: "Treino B" }],
  3: [{ name: "Treino A" }, { name: "Treino B" }, { name: "Treino C" }],
  4: [
    { name: "Treino A" },
    { name: "Treino B" },
    { name: "Treino C" },
    { name: "Treino D" },
  ],
  5: [
    { name: "Treino A" },
    { name: "Treino B" },
    { name: "Treino C" },
    { name: "Treino D" },
    { name: "Treino E" },
  ],
  6: [
    { name: "Treino A" },
    { name: "Treino B" },
    { name: "Treino C" },
    { name: "Treino D" },
    { name: "Treino E" },
    { name: "Treino F" },
  ],
};

// ── Módulo 0: dados de prescrição vêm SEMPRE do perfil (anamnese) ─────────────
type ProfilePrescription = {
  daysPerWeek: 2 | 3 | 4 | 5 | 6;
  goal: string;
  goalLabel: string;
  completionPct: number;
};

function mapMainGoalToPlanGoal(mainGoal: string | null, fallback: string | null): string {
  if (mainGoal === "fat_loss") return "weight_loss";
  if (mainGoal) return mainGoal;
  return fallback ?? "hypertrophy";
}

// ── Bioimpedance info helper ─────────────────────────────────────────────────
type BioInfo = {
  reason: string;
  metrics: string;
};

function buildBioInfo(bio: Record<string, any>): BioInfo {
  const bf = bio.body_fat_pct as number | null;
  const visceral = bio.visceral_fat_level as number | null;
  const bmi = bio.bmi as number | null;
  const muscle = bio.skeletal_muscle_mass_kg as number | null;

  const metrics: string[] = [];
  if (bio.weight_kg) metrics.push(`${bio.weight_kg}kg`);
  if (bmi)           metrics.push(`IMC ${bmi}`);
  if (bf)            metrics.push(`Gordura ${bf}%`);
  if (muscle)        metrics.push(`Músculo ${muscle}kg`);
  if (visceral)      metrics.push(`Visceral nível ${visceral}`);

  let reason: string;
  if ((bf && bf >= 28) || (visceral && visceral >= 10)) {
    reason = "Gordura corporal elevada e/ou gordura visceral alta. A EDN recomenda foco em emagrecimento com exercícios compostos e déficit calórico.";
  } else if (bf && bf >= 20) {
    reason = "Gordura acima do ideal para hipertrofia pura. A EDN recomenda definição para melhorar composição corporal antes de focar em massa.";
  } else {
    reason = "Composição corporal favorável. A EDN recomenda foco em hipertrofia com progressão de carga e superávit calórico controlado.";
  }
  return { reason, metrics: metrics.join(" · ") };
}

export default function TreinosPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bioInfo, setBioInfo] = useState<BioInfo | null>(null);
  const [prescription, setPrescription] = useState<ProfilePrescription | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePlanForm>({
    resolver: zodResolver(createPlanSchema),
  });

  useEffect(() => {
    loadPlans();
    loadProfileAndBio();
  }, []);

  async function loadProfileAndBio() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: prof }, { data: bio }] = await Promise.all([
      supabase
        .from("profiles")
        .select("weekly_frequency, main_goal, goal, profile_completion_pct")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("bioimpedance_data")
        .select("weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,visceral_fat_level")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (prof) {
      const days = Math.min(6, Math.max(2, prof.weekly_frequency ?? 3)) as 2 | 3 | 4 | 5 | 6;
      const goal = mapMainGoalToPlanGoal((prof as any).main_goal, prof.goal);
      const goalLabel =
        MAIN_GOAL_LABELS[(prof as any).main_goal as keyof typeof MAIN_GOAL_LABELS] ??
        GOAL_LABELS[goal as keyof typeof GOAL_LABELS] ??
        goal;
      setPrescription({
        daysPerWeek: days,
        goal,
        goalLabel,
        completionPct: (prof as any).profile_completion_pct ?? 0,
      });
    }
    if (bio) setBioInfo(buildBioInfo(bio));
  }

  const profileReady = (prescription?.completionPct ?? 0) >= 80;

  function openDialog() {
    setDialogOpen(true);
  }

  async function loadPlans() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("workout_plans")
      .select(
        `*, workout_days(*, workout_exercises(id))`
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setPlans((data as WorkoutPlan[]) ?? []);
    setLoading(false);
  }

  async function onSubmit(data: CreatePlanForm) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Módulo 0: perfil obrigatório — sem anamnese ≥80% não há prescrição
    if (!prescription || prescription.completionPct < 80) {
      toast.error("Complete seu perfil (mínimo 80%) para criar um plano de treino");
      return;
    }

    // Create plan — dias e objetivo vêm do perfil (anamnese), não do formulário
    const { data: plan, error } = await supabase
      .from("workout_plans")
      .insert({
        user_id: user.id,
        name: data.name,
        description: data.description ?? "",
        days_per_week: prescription.daysPerWeek,
        goal: prescription.goal,
        is_active: plans.length === 0, // First plan becomes active
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar plano");
      return;
    }

    // Create default workout days
    const days =
      DEFAULT_DAYS[prescription.daysPerWeek as keyof typeof DEFAULT_DAYS] ?? [];
    if (days.length > 0) {
      await supabase.from("workout_days").insert(
        days.map((d, i) => ({
          plan_id: plan.id,
          name: d.name,
          order_index: i,
        }))
      );
    }

    toast.success("Plano criado com sucesso!");
    setDialogOpen(false);
    reset();
    loadPlans();
  }

  async function setActivePlan(planId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Deactivate all
    await supabase
      .from("workout_plans")
      .update({ is_active: false })
      .eq("user_id", user.id);

    // Activate selected
    await supabase
      .from("workout_plans")
      .update({ is_active: true })
      .eq("id", planId);

    toast.success("Plano ativado!");
    loadPlans();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Treinos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Seus planos de treino</p>
        </div>
        <Button onClick={openDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Plano
        </Button>
      </div>

      {/* Módulo 0: banner de perfil incompleto */}
      {prescription && !profileReady && (
        <div className="rounded-xl border border-amber-600/30 bg-amber-600/10 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">
              Perfil {prescription.completionPct}% completo
            </p>
            <p className="text-xs text-zinc-400">
              Complete sua anamnese (mínimo 80%) para liberar treinos e nutrição personalizados.
            </p>
          </div>
          <Link href="/app/perfil">
            <Button size="sm" variant="outline" className="gap-1.5 border-amber-700/50 text-amber-300 hover:bg-amber-600/10">
              <UserCog className="h-3.5 w-3.5" />
              Completar
            </Button>
          </Link>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-12 text-center">
          <Dumbbell className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="font-semibold text-zinc-300 mb-2">Nenhum plano criado</h3>
          <p className="text-sm text-zinc-500 mb-5">
            Crie seu primeiro plano de treino e comece a registrar sua progressão
          </p>
          <Button onClick={openDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar primeiro plano
          </Button>
          {bioInfo && (
            <p className="text-xs text-[#D4853A] mt-3 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" />
              A IA vai montar o treino ideal com base no seu perfil e bioimpedância
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const totalExercises =
              plan.workout_days?.reduce(
                (sum, day) => sum + (day.workout_exercises?.length ?? 0),
                0
              ) ?? 0;

            return (
              <div
                key={plan.id}
                className={plan.is_active
                  ? "rounded-2xl border border-[#D4853A]/25 bg-gradient-to-br from-[#D4853A]/10 to-[#D4853A]/[0.03] transition-all group"
                  : "rounded-2xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-all group"}
              >
                <div className="flex items-start justify-between p-5 gap-4">
                  <div className="flex-1 min-w-0">
                    {plan.is_active && (
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#D4853A] mb-1">Plano Ativo</p>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-extrabold italic text-lg text-zinc-100 truncate">{plan.name}</h3>
                      {plan.is_active && (
                        <Badge variant="default" className="text-[10px] gap-1 py-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Ativo
                        </Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
                        {plan.description}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <div className="rounded-lg bg-black/20 py-2.5 px-2 text-center">
                        <p className="text-xl font-black text-[#D4853A] leading-none">{plan.days_per_week}</p>
                        <p className="text-[10px] text-zinc-500 mt-1">dias/sem</p>
                      </div>
                      <div className="rounded-lg bg-black/20 py-2.5 px-2 text-center">
                        <p className="text-xl font-black text-[#D4853A] leading-none">{totalExercises}</p>
                        <p className="text-[10px] text-zinc-500 mt-1">exercícios</p>
                      </div>
                      <div className="rounded-lg bg-black/20 py-2.5 px-1.5 text-center overflow-hidden min-w-0">
                        <p className="text-[11px] font-black text-[#D4853A] leading-tight mt-1 break-words">{GOAL_LABELS[plan.goal as keyof typeof GOAL_LABELS] ?? plan.goal}</p>
                        <p className="text-[10px] text-zinc-500 mt-1.5">objetivo</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <Link href={`/app/treinos/${plan.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        Ver plano
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                    {!plan.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActivePlan(plan.id)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Ativar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create plan dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Plano de Treino</DialogTitle>
          </DialogHeader>

          {/* ── Módulo 0: gate — perfil obrigatório ≥80% ── */}
          {!profileReady ? (
            <div className="space-y-4 mt-2">
              <div className="rounded-xl border border-amber-600/30 bg-amber-600/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-sm font-semibold text-amber-300">
                    Perfil {prescription?.completionPct ?? 0}% completo
                  </p>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  O Coach EDN não prescreve treino sem conhecer o atleta. Complete sua
                  anamnese (mínimo 80%) — objetivos, experiência, disponibilidade,
                  recuperação e limitações — para liberar a criação de planos
                  personalizados.
                </p>
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${prescription?.completionPct ?? 0}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Link href="/app/perfil" className="flex-1">
                  <Button type="button" className="w-full gap-2">
                    <UserCog className="h-4 w-4" />
                    Completar Perfil
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Prescrição vinda do perfil — sem campos manuais de dias/objetivo */}
              <div className="rounded-xl border border-[#D4853A]/30 bg-[#D4853A]/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#D4853A] shrink-0" />
                  <p className="text-xs font-semibold text-[#E09B5A]">
                    Prescrição automática — baseada na sua anamnese
                  </p>
                </div>
                {bioInfo && (
                  <>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Activity className="h-3 w-3 text-zinc-500" />
                      <p className="text-[11px] text-zinc-400">{bioInfo.metrics}</p>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">{bioInfo.reason}</p>
                  </>
                )}
                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                  <span className="text-[11px] text-zinc-500">Do seu perfil:</span>
                  <span className="text-[11px] font-semibold text-[#E09B5A] bg-[#D4853A]/20 px-2 py-0.5 rounded-full">
                    {prescription?.goalLabel}
                  </span>
                  <span className="text-[11px] text-[#E09B5A] bg-[#D4853A]/20 px-2 py-0.5 rounded-full">
                    {prescription?.daysPerWeek}x/semana
                  </span>
                  <Link
                    href="/app/perfil"
                    className="text-[11px] text-zinc-500 underline hover:text-zinc-300"
                  >
                    ajustar no perfil
                  </Link>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-name">Nome do plano</Label>
                  <Input
                    {...register("name")}
                    id="plan-name"
                    placeholder="Ex: Meu Treino ABC"
                    error={errors.name?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plan-desc">Descrição (opcional)</Label>
                  <Input
                    {...register("description")}
                    id="plan-desc"
                    placeholder="Descreva o objetivo deste plano..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" loading={isSubmitting}>
                    Criar Plano
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
