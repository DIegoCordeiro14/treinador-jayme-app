"use client";
import { ExercisePreferenceToggle } from "@/components/workout/exercise-preference-toggle";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Play, Plus, Trash2, Clock, ChevronLeft, Dumbbell, Sparkles,
  AlertCircle, ChevronDown, ChevronUp, TrendingUp, BarChart2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_COLORS } from "@/types";
import type { WorkoutPlan, Exercise, WorkoutExerciseWithExercise, MuscleGroup } from "@/types";
import { cn } from "@/lib/utils";

// ─── Split Templates (fallback) ───────────────────────────────────────────────
const SPLIT_TEMPLATES: Record<number, MuscleGroup[][]> = {
  2: [["chest","shoulders","triceps","abs"],["back","biceps","legs","calves"]],
  3: [["chest","triceps","shoulders"],["back","biceps"],["legs","calves","abs"]],
  4: [["chest","triceps","abs"],["back","biceps"],["shoulders","abs"],["legs","calves"]],
  5: [["chest","triceps"],["back","biceps"],["legs","calves"],["shoulders","abs"],["chest","back","legs"]],
  6: [["chest","triceps"],["back","biceps"],["legs","calves"],["shoulders","abs"],["chest","back"],["legs","abs"]],
};

type GoalParams = { setsCompound:number; setsIsolation:number; repsMinCompound:number; repsMaxCompound:number; repsMinIsolation:number; repsMaxIsolation:number; restCompound:number; restIsolation:number };
const GOAL_PARAMS: Record<string,GoalParams> = {
  definition: { setsCompound:4, setsIsolation:3, repsMinCompound:10, repsMaxCompound:15, repsMinIsolation:12, repsMaxIsolation:20, restCompound:75, restIsolation:60 },
  weight_loss: { setsCompound:3, setsIsolation:3, repsMinCompound:12, repsMaxCompound:18, repsMinIsolation:15, repsMaxIsolation:20, restCompound:60, restIsolation:45 },
  hypertrophy: { setsCompound:4, setsIsolation:3, repsMinCompound:8, repsMaxCompound:12, repsMinIsolation:10, repsMaxIsolation:15, restCompound:90, restIsolation:75 },
  strength: { setsCompound:5, setsIsolation:4, repsMinCompound:4, repsMaxCompound:6, repsMinIsolation:6, repsMaxIsolation:10, restCompound:180, restIsolation:120 },
};
const COMPOUND_KW = ["Supino","Agachamento","Levantamento Terra","Remada Curvada","Puxada","Desenvolvimento com Barra","Stiff","Leg Press"];
const MUSCLE_PRIORITY: Partial<Record<MuscleGroup,string[]>> = {
  chest:["Supino Reto","Supino Inclinado","Crucifixo"],
  back:["Puxada Frontal","Remada Curvada","Levantamento Terra"],
  shoulders:["Desenvolvimento com Barra","Desenvolvimento Arnold","Elevação Lateral"],
  biceps:["Rosca Direta","Rosca Scott"],
  triceps:["Tríceps Testa","Tríceps Corda"],
  legs:["Agachamento","Leg Press 45°","Stiff","Cadeira Extensora","Cadeira Flexora"],
  calves:["Panturrilha em Pé"],
  abs:["Abdominal Crunch"],
};
const DAY_LABELS: Record<string,string> = {
  "chest,triceps,abs":"Peito + Tríceps + Abs","chest,triceps":"Peito + Tríceps",
  "chest,triceps,shoulders":"Push (Empurra)","back,biceps":"Costas + Bíceps",
  "shoulders,abs":"Ombros + Abs","legs,calves":"Pernas","legs,calves,abs":"Pernas + Abs",
};
function getDayLabel(g: MuscleGroup[]){ const k=g.join(","); return DAY_LABELS[k]??g.map(x=>MUSCLE_GROUP_LABELS[x]??x).join(" + "); }
function isCompound(n:string){ return COMPOUND_KW.some(k=>n.includes(k)); }

// ─── Types ────────────────────────────────────────────────────────────────────
type AutoExercise = {
  exerciseId:string; exerciseName:string; muscleGroup:MuscleGroup;
  sets:number; repsMin:number; repsMax:number; restSeconds:number;
  orderIndex:number; notes?:string;
};
type DayPlan = { dayId:string; dayName:string; focusLabel:string; muscleGroups:MuscleGroup[]; exercises:AutoExercise[] };

// ─── Fallback generator ───────────────────────────────────────────────────────
function generateFallback(sortedDays:{id:string;name:string}[], daysPerWeek:number, goal:string, pool:Exercise[], level:string, highBMI:boolean): DayPlan[] {
  const template = SPLIT_TEMPLATES[Math.min(daysPerWeek,6)] ?? SPLIT_TEMPLATES[3];
  let effectiveGoal = goal; if(level==="beginner"&&goal==="hypertrophy") effectiveGoal="hypertrophy";
  const params = GOAL_PARAMS[effectiveGoal] ?? GOAL_PARAMS["hypertrophy"];
  const filtered = pool.filter(ex => level!=="beginner"||ex.difficulty!=="advanced");
  return sortedDays.map((day,i) => {
    const mgs = template[i%template.length];
    const dayEx: AutoExercise[] = [];
    let order = 0;
    mgs.forEach((mg,mgIdx) => {
      const prio = MUSCLE_PRIORITY[mg]??[];
      let exs = filtered.filter(e=>e.muscle_group===mg).sort((a,b)=>{
        const aP=prio.indexOf(a.name); const bP=prio.indexOf(b.name);
        return (aP===-1?99:aP)-(bP===-1?99:bP);
      });
      if(highBMI&&mg==="legs") exs=[...exs.filter(e=>e.equipment==="machine"),...exs.filter(e=>e.equipment!=="machine")];
      const max = mgIdx===0?3:mgIdx===1?2:1;
      exs.slice(0,Math.min(max,exs.length)).forEach(ex=>{
        const comp=isCompound(ex.name);
        dayEx.push({ exerciseId:ex.id, exerciseName:ex.name, muscleGroup:ex.muscle_group,
          sets:comp?params.setsCompound:params.setsIsolation,
          repsMin:comp?params.repsMinCompound:params.repsMinIsolation,
          repsMax:comp?params.repsMaxCompound:params.repsMaxIsolation,
          restSeconds:comp?params.restCompound:params.restIsolation,
          orderIndex:order++ });
      });
    });
    return { dayId:day.id, dayName:day.name, focusLabel:getDayLabel(mgs), muscleGroups:mgs, exercises:dayEx };
  });
}

// ─── Progression history type ─────────────────────────────────────────────────
type ProgressionEntry = { weight_kg:number; reps:number; recorded_at:string };
type ExerciseHistory = Record<string, ProgressionEntry[]>; // exerciseId → entries

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.id as string;
  const supabase = createClient();

  const [plan, setPlan] = useState<WorkoutPlan|null>(null);
  const [loading, setLoading] = useState(true);

  // manual add
  const [addExerciseDialog, setAddExerciseDialog] = useState<string|null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [sets, setSets] = useState(3);
  const [repsMin, setRepsMin] = useState(8);
  const [repsMax, setRepsMax] = useState(12);
  const [restSeconds, setRestSeconds] = useState(90);

  // auto-populate (AI)
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const [autoPreview, setAutoPreview] = useState<DayPlan[]>([]);
  const [expandedDay, setExpandedDay] = useState<string|null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [builderResult, setBuilderResult] = useState<{
    split_type: string; difficulty_score: number; difficulty_label: string;
    reasoning: string; reasoning_points: string[]; jayme_quote: string;
    adaptation_hint?: string; rir_target: number;
    rep_range: { min: number; max: number }; focus_muscle?: string | null;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [biometricNote, setBiometricNote] = useState("");
  const [aiError, setAiError] = useState<string|null>(null);
  const [whyText, setWhyText] = useState<string|null>(null);

  // evolution
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistory>({});
  const [showEvolution, setShowEvolution] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // delete plan
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { loadPlan(); loadExercises(); }, [planId]);

  async function loadPlan() {
    const { data } = await supabase.from("workout_plans")
      .select("*, workout_days(*, workout_exercises(*, exercise:exercises(*)))")
      .eq("id", planId).single();
    setPlan(data as WorkoutPlan);
    setLoading(false);
  }

  async function loadExercises() {
    const { data } = await supabase.from("exercises").select("*").eq("is_public",true).order("name");
    setAllExercises((data as Exercise[]) ?? []);
  }

  async function loadEvolution() {
    if (!plan) return;
    setLoadingHistory(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingHistory(false); return; }

    // Gather all exercise IDs from this plan
    const exIds = plan.workout_days?.flatMap(d =>
      (d.workout_exercises??[]).map(we => we.exercise_id)
    ) ?? [];
    const uniqueIds = [...new Set(exIds)];
    if (!uniqueIds.length) { setLoadingHistory(false); return; }

    const { data } = await supabase.from("progressions")
      .select("exercise_id, weight_kg, reps, recorded_at")
      .eq("user_id", user.id)
      .in("exercise_id", uniqueIds)
      .eq("set_type", "topset")
      .order("recorded_at", { ascending: false })
      .limit(200);

    if (data) {
      const hist: ExerciseHistory = {};
      for (const row of data as any[]) {
        if (!hist[row.exercise_id]) hist[row.exercise_id] = [];
        if (hist[row.exercise_id].length < 8) {
          hist[row.exercise_id].push({ weight_kg: row.weight_kg, reps: row.reps, recorded_at: row.recorded_at });
        }
      }
      setExerciseHistory(hist);
    }
    setLoadingHistory(false);
    setShowEvolution(true);
  }

  async function addExercise(dayId: string) {
    if (!selectedExerciseId) { toast.error("Selecione um exercício"); return; }
    const existing = plan?.workout_days?.find(d=>d.id===dayId)?.workout_exercises?.length??0;
    const { error } = await supabase.from("workout_exercises").insert({
      workout_day_id:dayId, exercise_id:selectedExerciseId, sets, reps_min:repsMin, reps_max:repsMax, rest_seconds:restSeconds, order_index:existing,
    });
    if (error) { toast.error("Erro ao adicionar exercício"); return; }
    toast.success("Exercício adicionado!");
    setAddExerciseDialog(null); setSelectedExerciseId(""); setSets(3); setRepsMin(8); setRepsMax(12); setRestSeconds(90);
    loadPlan();
  }

  async function removeExercise(weId: string) {
    await supabase.from("workout_exercises").delete().eq("id",weId);
    toast.success("Exercício removido"); loadPlan();
  }

  async function deletePlan() {
    setIsDeleting(true);
    const { error } = await supabase.from("workout_plans").delete().eq("id",planId);
    if (error) { toast.error("Erro ao excluir plano"); setIsDeleting(false); return; }
    toast.success("Plano excluído!");
    router.push("/app/treinos");
  }

  // ─── AI Workout Generation ────────────────────────────────────────────────
  async function handleAutoPopulate() {
    if (!plan) return;
    setIsGenerating(true); setAiError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsGenerating(false); return; }

    const { data: rawProfile } = await supabase.from("profiles").select("experience_level,weight_kg,height_cm").eq("id",user.id).single();
    const profile = rawProfile as { experience_level:string; weight_kg:number|null; height_cm:number|null }|null;

    const { data: rawMeasurement } = await supabase.from("body_measurements").select("body_fat_pct,weight_kg").eq("user_id",user.id).order("date",{ascending:false}).limit(1).maybeSingle();
    const measurement = rawMeasurement as { body_fat_pct:number|null; weight_kg:number|null }|null;

    const weightKg = measurement?.weight_kg??profile?.weight_kg??null;
    const heightCm = profile?.height_cm??null;
    const bmi = weightKg&&heightCm ? weightKg/Math.pow(heightCm/100,2) : null;
    const bodyFatPct = measurement?.body_fat_pct??null;
    const highBMI = !!bmi&&bmi>28;
    const experienceLevel = profile?.experience_level??"beginner";

    // Build biometric note
    const notes: string[] = [];
    if (experienceLevel==="beginner") notes.push("Iniciante: exercícios avançados adaptados");
    if (highBMI) notes.push(`IMC ${bmi!.toFixed(1)}: ajuste para articulações`);
    if (bodyFatPct&&bodyFatPct>25) notes.push(`Gordura ${bodyFatPct}%: foco em definição`);
    if (weightKg&&heightCm) notes.push(`${weightKg}kg · ${heightCm}cm`);
    if (!weightKg&&!heightCm) notes.push("Sem dados biométricos — atualize seu perfil");
    setBiometricNote(notes.join(" · "));

    let exercises = allExercises;
    if (!exercises.length) {
      const { data } = await supabase.from("exercises").select("*").eq("is_public",true);
      exercises = (data as Exercise[])??[];
      setAllExercises(exercises);
    }

    const sortedDays = [...(plan.workout_days??[])].sort((a,b)=>a.order_index-b.order_index);

    try {
      // ── Try AI generation ──────────────────────────────────────────────────
      // Read V3 config stored in schedule_config
      const v3cfg = (plan as any).schedule_config ?? {};

      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: plan.goal, daysPerWeek: plan.days_per_week,
          experienceLevel, weightKg, heightCm, bodyFatPct,
          exercises, dayCount: sortedDays.length,
          // V3 Motor fields
          minutesPerSession: v3cfg.minutes_per_session ?? 60,
          sleepHours:        v3cfg.sleep_hours ?? null,
          focusMuscle:       v3cfg.focus_muscle ?? null,
        }),
      });

      let preview: DayPlan[] = [];

      if (res.ok) {
        const json = await res.json();
        const exMap = Object.fromEntries(exercises.map(e=>[e.id,e]));

        preview = sortedDays.map((day,i) => {
          const aiDay = json.days?.[i];
          const mgs = (aiDay?.focusLabel ? [] : []) as MuscleGroup[];
          const dayExercises: AutoExercise[] = (aiDay?.exercises??[]).map((e:any,idx:number) => {
            const ex = exMap[e.exerciseId];
            if (!ex) return null;
            return { exerciseId:e.exerciseId, exerciseName:ex.name, muscleGroup:ex.muscle_group,
              sets:e.sets??3, repsMin:e.repsMin??8, repsMax:e.repsMax??12,
              restSeconds:e.restSeconds??90, orderIndex:idx, notes:e.notes };
          }).filter(Boolean) as AutoExercise[];
          return { dayId:day.id, dayName:day.name, focusLabel:aiDay?.focusLabel??`Treino ${day.name}`, muscleGroups:mgs, exercises:dayExercises };
        });
        setAiError(null);
        // V3: store builder reasoning
        if (json.builder) setBuilderResult(json.builder);
      } else {
        // ── Fallback ─────────────────────────────────────────────────────────
        setAiError("IA indisponível — usando algoritmo EDN padrão");
        preview = generateFallback(sortedDays, plan.days_per_week, plan.goal, exercises, experienceLevel, highBMI);
      }

      setAutoPreview(preview);
      setExpandedDay(preview[0]?.dayId??null);
      setShowAutoDialog(true);
    } catch (err) {
      const fallback = generateFallback(sortedDays, plan.days_per_week, plan.goal, exercises, experienceLevel, highBMI);
      setAiError("Erro na IA — usando algoritmo EDN padrão");
      setWhyText(null);
      setAutoPreview(fallback);
      setExpandedDay(fallback[0]?.dayId??null);
      setShowAutoDialog(true);
    } finally {
      setIsGenerating(false);
    }
  }

  async function confirmAutoPopulate() {
    if (!autoPreview.length) return;
    setIsConfirming(true);
    try {
      for (const dayPlan of autoPreview) {
        if (replaceExisting) {
          await supabase.from("workout_exercises").delete().eq("workout_day_id",dayPlan.dayId);
        }
        let startIdx = replaceExisting ? 0 : (plan?.workout_days?.find(d=>d.id===dayPlan.dayId)?.workout_exercises?.length??0);
        const inserts = dayPlan.exercises.map((ex,idx)=>({
          workout_day_id:dayPlan.dayId, exercise_id:ex.exerciseId, sets:ex.sets,
          reps_min:ex.repsMin, reps_max:ex.repsMax, rest_seconds:ex.restSeconds,
          order_index:startIdx+idx, notes:"",
        }));
        if (inserts.length) {
          const { error } = await supabase.from("workout_exercises").insert(inserts);
          if (error) throw error;
        }
      }
      toast.success("Treino montado pelo Treinador Jayme!");
      setShowAutoDialog(false); loadPlan();
    } catch (err) {
      toast.error("Erro ao salvar treino");
    } finally {
      setIsConfirming(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
  if (!plan) return (
    <div className="text-center py-20">
      <p className="text-zinc-400">Plano não encontrado</p>
      <Link href="/app/treinos"><Button variant="outline" className="mt-4">Voltar</Button></Link>
    </div>
  );

  const sortedDays = [...(plan.workout_days??[])].sort((a,b)=>a.order_index-b.order_index);
  const hasAnyExercise = sortedDays.some(d=>(d.workout_exercises?.length??0)>0);

  // All exercises in the plan for the evolution view
  const allPlanExercises = sortedDays.flatMap(d=>
    ([...(d.workout_exercises??[])].sort((a,b)=>a.order_index-b.order_index) as WorkoutExerciseWithExercise[])
      .map(we=>we.exercise)
  );
  const uniquePlanExercises = allPlanExercises.filter((e,i,arr)=>arr.findIndex(x=>x.id===e.id)===i);

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <Link href="/app/treinos" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-3">
          <ChevronLeft className="h-4 w-4" />Treinos
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{plan.name}</h1>
            {plan.description && <p className="text-sm text-zinc-400 mt-1">{plan.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{plan.days_per_week}x por semana</Badge>
              <Badge variant="outline">{plan.goal}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={handleAutoPopulate} loading={isGenerating} className="gap-2" variant="outline">
              <Sparkles className="h-4 w-4 text-blue-400" />Montar com IA Jayme
            </Button>
            <Button onClick={()=>setShowDeleteDialog(true)} variant="outline" size="icon" className="text-zinc-500 hover:text-red-400 hover:border-red-500/30">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tabs per day ───────────────────────────────────────────────────── */}
      {sortedDays.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50">
          <p className="text-zinc-500">Nenhuma divisão encontrada</p>
        </div>
      ) : (
        <Tabs defaultValue={sortedDays[0]?.id}>
          <TabsList className="flex gap-1 flex-wrap h-auto">
            {sortedDays.map(day=>(
              <TabsTrigger key={day.id} value={day.id} className="text-xs">{day.name}</TabsTrigger>
            ))}
          </TabsList>

          {sortedDays.map(day => {
            const dayExs = ([...(day.workout_exercises??[])].sort((a,b)=>a.order_index-b.order_index)) as WorkoutExerciseWithExercise[];
            return (
              <TabsContent key={day.id} value={day.id} className="space-y-3">
                <Link href={`/app/treinos/${planId}/executar?day=${day.id}`}>
                  <Button className="w-full gap-2"><Play className="h-4 w-4" />Iniciar {day.name}</Button>
                </Link>

                {dayExs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-8 text-center">
                    <Dumbbell className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-zinc-400 mb-3">Nenhum exercício neste treino ainda</p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleAutoPopulate} loading={isGenerating}>
                      <Sparkles className="h-3.5 w-3.5 text-blue-400" />Montar com IA Jayme
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dayExs.map((we,idx) => {
                      const hist = exerciseHistory[we.exercise_id];
                      return (
                        <div key={we.id} className="rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-colors">
                          <div className="flex items-center gap-3 p-4">
                            <span className="text-xs font-bold text-zinc-600 w-5 text-center shrink-0">{idx+1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-zinc-100 text-sm flex-1">{we.exercise.name}</p>
                              <ExercisePreferenceToggle exerciseId={we.exercise.id} exerciseName={we.exercise.name} />
                            </div>
                              <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border mt-1",
                                MUSCLE_GROUP_COLORS[we.exercise.muscle_group])}>
                                {MUSCLE_GROUP_LABELS[we.exercise.muscle_group]}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-semibold text-zinc-100">{we.sets} × {we.reps_min}–{we.reps_max}</p>
                                <div className="flex items-center gap-1 text-[11px] text-zinc-500 justify-end">
                                  <Clock className="h-2.5 w-2.5" />{we.rest_seconds}s
                                </div>
                              </div>
                              <button onClick={()=>removeExercise(we.id)} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {/* Progression mini-history */}
                          {hist && hist.length > 0 && showEvolution && (
                            <div className="border-t border-zinc-800 px-4 pb-3 pt-2">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <TrendingUp className="h-3 w-3 text-green-400" />
                                <span className="text-[10px] text-zinc-500 font-medium">Top Set — últimas sessões</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[...hist].reverse().map((entry,i)=>(
                                  <span key={i} className="text-[10px] bg-zinc-800 text-zinc-300 rounded px-1.5 py-0.5 font-mono">
                                    {entry.weight_kg}kg×{entry.reps}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button variant="outline" className="w-full gap-2" onClick={()=>setAddExerciseDialog(day.id)}>
                  <Plus className="h-4 w-4" />Adicionar Exercício
                </Button>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* ── Evolution toggle button ────────────────────────────────────────── */}
      {hasAnyExercise && (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={showEvolution ? ()=>setShowEvolution(false) : loadEvolution}
          loading={loadingHistory}
        >
          {showEvolution
            ? <><ChevronUp className="h-4 w-4" />Ocultar Evolução</>
            : <><BarChart2 className="h-4 w-4 text-green-400" />Ver Evolução do Treino</>
          }
        </Button>
      )}

      {/* ── Evolution panel (no history yet) ─────────────────────────────── */}
      {showEvolution && hasAnyExercise && Object.keys(exerciseHistory).length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          <BarChart2 className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Nenhuma sessão registrada ainda.</p>
          <p className="text-xs text-zinc-600 mt-1">Complete treinos para ver a evolução do Top Set.</p>
        </div>
      )}

      {/* ── Manual Add Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!addExerciseDialog} onOpenChange={open=>!open&&setAddExerciseDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Exercício</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Exercício</Label>
              <Select value={selectedExerciseId} onValueChange={setSelectedExerciseId}>
                <SelectTrigger><SelectValue placeholder="Selecionar exercício..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {allExercises.map(ex=>(
                    <SelectItem key={ex.id} value={ex.id}>{ex.name} — {MUSCLE_GROUP_LABELS[ex.muscle_group]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Séries</Label><Input type="number" value={sets} onChange={e=>setSets(Number(e.target.value))} min={1} max={10}/></div>
              <div className="space-y-1.5"><Label>Descanso (seg)</Label><Input type="number" value={restSeconds} onChange={e=>setRestSeconds(Number(e.target.value))} min={30} max={300} step={15}/></div>
              <div className="space-y-1.5"><Label>Reps mín</Label><Input type="number" value={repsMin} onChange={e=>setRepsMin(Number(e.target.value))} min={1} max={30}/></div>
              <div className="space-y-1.5"><Label>Reps máx</Label><Input type="number" value={repsMax} onChange={e=>setRepsMax(Number(e.target.value))} min={1} max={30}/></div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={()=>setAddExerciseDialog(null)}>Cancelar</Button>
              <Button className="flex-1" onClick={()=>addExerciseDialog&&addExercise(addExerciseDialog)}>Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={open=>!open&&setShowDeleteDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir plano de treino</DialogTitle>
            <DialogDescription>
              Esta ação é permanente. O plano <strong className="text-zinc-100">"{plan.name}"</strong> e todos os seus treinos serão removidos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={()=>setShowDeleteDialog(false)} disabled={isDeleting}>Cancelar</Button>
            <Button variant="destructive" className="flex-1 gap-2" onClick={deletePlan} loading={isDeleting}>
              <Trash2 className="h-4 w-4" />Excluir plano
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI Auto-populate Preview Dialog ───────────────────────────────── */}
      <Dialog open={showAutoDialog} onOpenChange={open=>{ if(!open){ setShowAutoDialog(false); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-400" />Treino Treinador Jayme
            </DialogTitle>
            <DialogDescription>
              Divisão {plan.days_per_week}x/semana · <span className="capitalize">{plan.goal}</span>
            </DialogDescription>
          </DialogHeader>

          {/* V3 Jayme Reasoning Card */}
          {builderResult && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-600/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold bg-violet-600/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded">V3</span>
                  <span className="text-xs font-semibold text-violet-300">{builderResult.split_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    builderResult.difficulty_score >= 81 ? "bg-red-900/30 text-red-400 border-red-500/30" :
                    builderResult.difficulty_score >= 61 ? "bg-orange-900/30 text-orange-400 border-orange-500/30" :
                    builderResult.difficulty_score >= 31 ? "bg-yellow-900/30 text-yellow-400 border-yellow-500/30" :
                    "bg-green-900/30 text-green-400 border-green-500/30"
                  }`}>{builderResult.difficulty_label} {builderResult.difficulty_score}/100</span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-300 italic leading-relaxed">"{builderResult.jayme_quote}"</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{builderResult.reasoning}</p>
              {builderResult.reasoning_points.length > 0 && (
                <ul className="space-y-1">
                  {builderResult.reasoning_points.map((pt, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                      <span className="text-violet-400 mt-0.5 shrink-0">›</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              )}
              {builderResult.adaptation_hint && (
                <div className="flex items-start gap-2 rounded-lg bg-blue-600/10 border border-blue-500/20 p-2.5">
                  <span className="text-blue-400 text-[11px] shrink-0">📈</span>
                  <p className="text-[11px] text-blue-300">{builderResult.adaptation_hint}</p>
                </div>
              )}
            </div>
          )}

          {biometricNote && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{biometricNote}</span>
            </div>
          )}

          {aiError && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{aiError}</span>
            </div>
          )}

          {/* ── V3.2 Por que este treino? ──────────────────────────────────── */}
          {whyText && (
            <details className="group rounded-xl border border-emerald-500/25 bg-emerald-600/5 overflow-hidden">
              <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none text-xs font-semibold text-emerald-400 hover:bg-emerald-600/10 transition-colors list-none">
                <span className="text-base">🧠</span>
                <span>Por que este treino foi criado?</span>
                <span className="ml-auto text-zinc-500 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-2">
                {whyText.split('\n\n').map((line, i) => (
                  <p key={i} className="text-[11px] text-zinc-300 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-zinc-100">$1</strong>') }}
                  />
                ))}
              </div>
            </details>
          )}

          {hasAnyExercise && (
            <div className="flex items-center gap-3 rounded-lg bg-zinc-800/50 border border-zinc-700 p-3">
              <input type="checkbox" id="replace" checked={replaceExisting} onChange={e=>setReplaceExisting(e.target.checked)} className="h-4 w-4 accent-blue-500"/>
              <label htmlFor="replace" className="text-xs text-zinc-400 cursor-pointer">
                Substituir exercícios existentes
              </label>
            </div>
          )}

          <div className="space-y-2">
            {autoPreview.map(dayPlan=>(
              <div key={dayPlan.dayId} className="rounded-lg border border-zinc-800 overflow-hidden">
                <button className="w-full flex items-center justify-between p-3 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
                  onClick={()=>setExpandedDay(expandedDay===dayPlan.dayId?null:dayPlan.dayId)}>
                  <div>
                    <span className="text-sm font-semibold text-zinc-100">{dayPlan.dayName}</span>
                    <span className="text-xs text-zinc-500 ml-2">{dayPlan.focusLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{dayPlan.exercises.length} exercícios</span>
                    {expandedDay===dayPlan.dayId ? <ChevronUp className="h-4 w-4 text-zinc-500"/> : <ChevronDown className="h-4 w-4 text-zinc-500"/>}
                  </div>
                </button>
                {expandedDay===dayPlan.dayId && (
                  <div className="divide-y divide-zinc-800/50">
                    {dayPlan.exercises.map((ex,idx)=>(
                      <div key={ex.exerciseId} className="px-3 py-2.5 bg-zinc-950/50">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-600 w-4 text-center">{idx+1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200">{ex.exerciseName}</p>
                            <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border mt-0.5",
                              MUSCLE_GROUP_COLORS[ex.muscleGroup])}>
                              {MUSCLE_GROUP_LABELS[ex.muscleGroup]}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-zinc-300">{ex.sets} × {ex.repsMin}–{ex.repsMax}</p>
                            <p className="text-[10px] text-zinc-600">{ex.restSeconds}s</p>
                          </div>
                        </div>
                        {ex.notes && (
                          <p className="text-[10px] text-zinc-600 mt-1 ml-7 italic">{ex.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={()=>setShowAutoDialog(false)} disabled={isConfirming}>Cancelar</Button>
            <Button className="flex-1 gap-2" onClick={confirmAutoPopulate} loading={isConfirming}>
              <Sparkles className="h-4 w-4" />Confirmar e adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
