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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import type { WorkoutPlan } from "@/types";
import { GOAL_LABELS } from "@/types";

const createPlanSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mÃ­nimo 2 caracteres"),
  description: z.string().optional(),
  days_per_week: z.number().min(2).max(6),
  goal: z.enum(["hypertrophy", "weight_loss", "definition", "strength"]),
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

// ââ Bioimpedance suggestion helper ââââââââââââââââââââââââââââââââââââââââââââ
type BioSuggestion = {
  goal: CreatePlanForm["goal"];
  label: string;
  reason: string;
  metrics: string;
  days: number;
};

function buildSuggestion(bio: Record<string, any>): BioSuggestion {
  const bf = bio.body_fat_pct as number | null;
  const visceral = bio.visceral_fat_level as number | null;
  const bmi = bio.bmi as number | null;
  const muscle = bio.skeletal_muscle_mass_kg as number | null;

  const metrics: string[] = [];
  if (bio.weight_kg) metrics.push(`${bio.weight_kg}kg`);
  if (bmi)           metrics.push(`IMC ${bmi}`);
  if (bf)            metrics.push(`Gordura ${bf}%`);
  if (muscle)        metrics.push(`MÃºsculo ${muscle}kg`);
  if (visceral)      metrics.push(`Visceral nÃ­vel ${visceral}`);

  if ((bf && bf >= 28) || (visceral && visceral >= 10)) {
    return {
      goal: "weight_loss",
      label: "Emagrecimento",
      reason: "Gordura corporal elevada e/ou gordura visceral alta. A EDN recomenda foco em emagrecimento com exercÃ­cios compostos e dÃ©ficit calÃ³rico.",
      metrics: metrics.join(" Â· "),
      days: 4,
    };
  }
  if (bf && bf >= 20) {
    return {
      goal: "definition",
      label: "DefiniÃ§Ã£o",
      reason: "Gordura acima do ideal para hipertrofia pura. A EDN recomenda definiÃ§Ã£o para melhorar composiÃ§Ã£o corporal antes de focar em massa.",
      metrics: metrics.join(" Â· "),
      days: 4,
    };
  }
  return {
    goal: "hypertrophy",
    label: "Hipertrofia",
    reason: "ComposiÃ§Ã£o corporal favorÃ¡vel. A EDN recomenda foco em hipertrofia com progressÃ£o de carga e superÃ¡vit calÃ³rico controlado.",
    metrics: metrics.join(" Â· "),
    days: 4,
  };
}

export default function TreinosPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bioSuggestion, setBioSuggestion] = useState<BioSuggestion | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePlanForm>({
    resolver: zodResolver(createPlanSchema),
    defaultValues: {
      days_per_week: 3,
      goal: "hypertrophy",
    },
  });

  useEffect(() => {
    loadPlans();
    loadBioSuggestion();
  }, []);

  async function loadBioSuggestion() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("bioimpedance_data")
      .select("weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,visceral_fat_level")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setBioSuggestion(buildSuggestion(data));
  }

  function openDialog() {
    if (bioSuggestion) {
      setValue("goal", bioSuggestion.goal);
      setValue("days_per_week", bioSuggestion.days as 2|3|4|5|6);
    }
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

    // Create plan
    const { data: plan, error } = await supabase
      .from("workout_plans")
      .insert({
        user_id: user.id,
        name: data.name,
        description: data.description ?? "",
        days_per_week: data.days_per_week,
        goal: data.goal,
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
      DEFAULT_DAYS[data.days_per_week as keyof typeof DEFAULT_DAYS] ?? [];
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

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-12 text-center">
          <Dumbbell className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="font-semibold text-zinc-300 mb-2">Nenhum plano criado</h3>
          <p className="text-sm text-zinc-500 mb-5">
            Crie seu primeiro plano de treino e comece a registrar sua progressÃ£o
          </p>
          <Button onClick={openDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar primeiro plano
          </Button>
          {bioSuggestion && (
            <p className="text-xs text-blue-400 mt-3 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" />
              A IA vai sugerir o treino ideal com base na sua bioimpedÃ¢ncia
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
                className="rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-all group"
              >
                <div className="flex items-start justify-between p-5 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-zinc-100 truncate">{plan.name}</h3>
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
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Calendar className="h-3 w-3" />
                        {plan.days_per_week}x por semana
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Target className="h-3 w-3" />
                        {GOAL_LABELS[plan.goal as keyof typeof GOAL_LABELS] ?? plan.goal}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Dumbbell className="h-3 w-3" />
                        {totalExercises} exercÃ­cios
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

          {/* AI suggestion banner */}
          {bioSuggestion && (
            <div className="rounded-xl border border-blue-600/30 bg-blue-600/10 p-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
                <p className="text-xs font-semibold text-blue-300">SugestÃ£o da IA â baseada na sua bioimpedÃ¢ncia</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Activity className="h-3 w-3 text-zinc-500" />
                <p className="text-[11px] text-zinc-400">{bioSuggestion.metrics}</p>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{bioSuggestion.reason}</p>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[11px] text-zinc-500">PrÃ©-selecionado:</span>
                <span className="text-[11px] font-semibold text-blue-300 bg-blue-600/20 px-2 py-0.5 rounded-full">{bioSuggestion.label}</span>
                <span className="text-[11px] text-blue-300 bg-blue-600/20 px-2 py-0.5 rounded-full">{bioSuggestion.days}x/semana</span>
              </div>
            </div>
          )}

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
              <Label htmlFor="plan-desc">DescriÃ§Ã£o (opcional)</Label>
              <Input
                {...register("description")}
                id="plan-desc"
                placeholder="Descreva o objetivo deste plano..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Dias por semana</Label>
                <Select
                  value={String(watch("days_per_week"))}
                  onValueChange={(v) =>
                    setValue("days_per_week", Number(v) as 2 | 3 | 4 | 5 | 6)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} dias
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Objetivo</Label>
                <Select
                  value={watch("goal")}
                  onValueChange={(v) =>
                    setValue("goal", v as CreatePlanForm["goal"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hypertrophy">Hipertrofia</SelectItem>
                    <SelectItem value="strength">ForÃ§a</SelectItem>
                    <SelectItem value="definition">DefiniÃ§Ã£o</SelectItem>
                    <SelectItem value="weight_loss">Emagrecimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
