import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { computeNutritionTargets } from '@/lib/edn/nutrition-autopilot';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MUSCLE_SHORT: Record<string, string> = {
  'Peito': 'Peito', 'Peitoral': 'Peito',
  'Triceps': 'Tri', 'Ombros': 'Ombros',
  'Costas': 'Costas', 'Dorsais': 'Costas',
  'Biceps': 'Bic', 'Pernas': 'Pernas',
  'Quadriceps': 'Quad', 'Posteriores': 'Post',
  'Deltoides': 'Ombros', 'Gluteos': 'Glut',
  'Abdomen': 'Abd', 'Core': 'Core',
  'Panturrilha': 'Pant', 'Trapezio': 'Trap',
};

function muscleShort(g: string): string {
  return MUSCLE_SHORT[g] ?? MUSCLE_SHORT[g.normalize('NFD').replace(/\p{Diacritic}/gu, '')] ?? g;
}

function dayMuscleLabel(day: any): string {
  const wes: any[] = day.workout_exercises ?? [];
  const groups = [...new Set(wes.map((we: any) => we.exercise?.muscle_group).filter(Boolean))] as string[];
  if (groups.length === 0) return day.name;
  return groups.slice(0, 2).map((g: string) => muscleShort(g)).join('/');
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { plan_id, start_date } = await req.json() as { plan_id: string; start_date: string };
    if (!plan_id || !start_date) return Response.json({ error: 'Missing params' }, { status: 400 });

    const [{ data: plan }, { data: bio }, { data: profile }] = await Promise.all([
      supabase
        .from('workout_plans')
        .select('*, workout_days(id, name, order_index, workout_exercises(exercise:exercises(muscle_group)))')
        .eq('id', plan_id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('bioimpedance_data')
        .select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,lean_mass_kg,visceral_fat_level,water_pct,basal_metabolic_rate_kcal,protein_pct,measured_at')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('experience_level, meals_per_day, gender, age, weight_kg, height_cm, main_goal, goal, weekly_frequency, work_type, cardio_frequency')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    if (!plan) return Response.json({ error: 'Plan not found' }, { status: 404 });

    // ── FONTE ÚNICA: Nutrition Autopilot (mesmos números das outras telas) ────
    const targets = computeNutritionTargets({
      bio: bio ?? null,
      profile: {
        weight_kg: profile?.weight_kg ?? null,
        height_cm: profile?.height_cm ?? null,
        age: profile?.age ?? null,
        gender: profile?.gender ?? null,
        main_goal: (profile as any)?.main_goal ?? null,
        weekly_frequency: (profile as any)?.weekly_frequency ?? plan.days_per_week ?? null,
        work_type: (profile as any)?.work_type ?? null,
        cardio_frequency: (profile as any)?.cardio_frequency ?? null,
        meals_per_day: profile?.meals_per_day ?? null,
      },
    });

    const proteinPct = targets ? Math.round((targets.proteinG * 4 / targets.targetKcal) * 100) : null;
    const fatPct = targets ? Math.round((targets.fatG * 9 / targets.targetKcal) * 100) : null;
    const carbsPct = targets && proteinPct != null && fatPct != null ? Math.max(0, 100 - proteinPct - fatPct) : null;
    const adjLabel = targets
      ? (targets.goalAdjustmentKcal === 0 ? 'manutenção' : `${targets.goalAdjustmentKcal > 0 ? '+' : ''}${targets.goalAdjustmentKcal} ${targets.goalAdjustmentKcal < 0 ? 'déficit' : 'superávit'}`)
      : null;
    const dailyCaloriesLabel = targets ? `${targets.targetKcal}kcal (${adjLabel})` : null;

    const goalMap: Record<string, string> = {
      hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', fat_loss: 'Emagrecimento',
      definition: 'Definicao', strength: 'Forca', recomposition: 'Recomposicao', performance: 'Performance',
    };

    const sortedDays = [...(plan.workout_days ?? [])].sort((a: any, b: any) => a.order_index - b.order_index);
    const dayNames = sortedDays.map((d: any) => dayMuscleLabel(d)).join(', ');

    const startWeekday = (() => {
      const d = new Date(start_date + 'T12:00:00').getDay();
      return d === 0 ? 7 : d;
    })();

    const bioCtx = bio ? [
      bio.weight_kg && 'peso=' + bio.weight_kg + 'kg',
      bio.bmi && 'IMC=' + bio.bmi,
      bio.body_fat_pct && 'BF=' + bio.body_fat_pct + '%',
      bio.skeletal_muscle_mass_kg && 'musculo=' + bio.skeletal_muscle_mass_kg + 'kg',
      bio.basal_metabolic_rate_kcal && 'TMB=' + bio.basal_metabolic_rate_kcal + 'kcal',
    ].filter(Boolean).join(' ') : 'sem dados';

    const mealsPerDay = profile?.meals_per_day ?? 3;
    const experienceLevel = profile?.experience_level ?? 'beginner';
    const levelMap2: Record<string, string> = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
    const mealsTemplate = Array.from({ length: mealsPerDay }, (_, i) => `{"name":"Refeição ${i+1}","time":"00h","calories_pct":${Math.round(100/mealsPerDay)},"focus":"...","example":"..."}`).join(',');

    const targetsCtx = targets
      ? 'ALVOS OFICIAIS (Autopilot EDN — use EXATAMENTE, nao recalcule): Calorias=' + targets.targetKcal + 'kcal/dia (TDEE ' + targets.tdeeKcal + ', ' + adjLabel + ') | Proteina=' + targets.proteinG + 'g (' + targets.proteinGPerKg + 'g/kg) | Carbs=' + targets.carbsG + 'g (' + carbsPct + '%) | Gordura=' + targets.fatG + 'g (' + fatPct + '%)\n'
      : '';

    const daysPerWeek = plan.days_per_week;
    const prompt = 'Voce e Jayme De Lamadrid (EDN). Monte um plano semanal.\n\n' +
      'DADOS:\n' +
      '- Plano: ' + daysPerWeek + ' treinos/sem, objetivo: ' + (goalMap[plan.goal] ?? plan.goal) + '\n' +
      '- Treinos: ' + dayNames + '\n' +
      '- Inicio: dia da semana ' + startWeekday + ' (1=Seg, 7=Dom)\n' +
      '- Bioimpedancia: ' + bioCtx + '\n' +
      '- Nivel: ' + (levelMap2[experienceLevel] ?? experienceLevel) + '\n' +
      '- Refeicoes/dia: ' + mealsPerDay + '\n' +
      targetsCtx + '\n' +
      'Retorne SOMENTE este JSON (sem markdown):\n' +
      '{\n' +
      '  "pattern": [' + startWeekday + '],\n' +
      '  "reasoning": "motivo da distribuicao em 1-2 frases",\n' +
      '  "cardio": {\n' +
      '    "training_days": {"type": "HIIT 15min", "duration_min": 15, "intensity": "moderada", "when": "apos treino", "notes": "dica curta"},\n' +
      '    "rest_days": {"type": "caminhada", "duration_min": 30, "intensity": "leve", "notes": "dica curta"},\n' +
      '    "frequency_per_week": 3,\n' +
      '    "general_notes": "orientacao geral"\n' +
      '  },\n' +
      '  "nutrition": {\n' +
      '    "strategy": "nome da estrategia",\n' +
      '    "daily_calories": "' + (dailyCaloriesLabel ?? 'ex: 2200kcal') + '",\n' +
      '    "protein_g_per_kg": ' + (targets?.proteinGPerKg ?? 2.0) + ',\n' +
      '    "carbs_pct": ' + (carbsPct ?? 45) + ',\n' +
      '    "fat_pct": ' + (fatPct ?? 25) + ',\n' +
      '    "pre_workout": "o que comer antes",\n' +
      '    "post_workout": "o que comer depois",\n' +
      '    "rest_day_strategy": "como comer nos dias de descanso",\n' +
      '    "meals": [' + mealsTemplate + '],\n' +
      '    "key_tips": ["dica 1", "dica 2", "dica 3"]\n' +
      '  }\n' +
      '}\n\n' +
      'O pattern deve ter exatamente ' + daysPerWeek + ' dias (1-7). Primeiro dia OBRIGATORIO: ' + startWeekday + '.\n' +
      'Nutrition meals: exatamente ' + mealsPerDay + ' refeicoes com horarios, % calorias e exemplos somando os ALVOS OFICIAIS. Apenas JSON.';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI did not return valid JSON' }, { status: 422 });

    const result = JSON.parse(jsonMatch[0]);
    result.pattern = (result.pattern as number[]).map(Number).sort((a: number, b: number) => a - b);

    // ── SYNC: numeros do Autopilot SEMPRE sobrescrevem a IA ──────────────────
    if (targets && result.nutrition) {
      result.nutrition.daily_calories = dailyCaloriesLabel;
      result.nutrition.protein_g_per_kg = targets.proteinGPerKg;
      result.nutrition.protein_pct = proteinPct;
      result.nutrition.carbs_pct = carbsPct;
      result.nutrition.fat_pct = fatPct;
      result.nutrition.protein_g = targets.proteinG;
      result.nutrition.carbs_g = targets.carbsG;
      result.nutrition.fat_g = targets.fatG;
      result.nutrition.target_kcal = targets.targetKcal;
      result.nutrition.tdee_kcal = targets.tdeeKcal;
      result.nutrition.source = 'autopilot_v65';
    }

    // Build dayAssignments from actual muscle groups (server-side, not from AI)
    const dayAssignments: Record<string, string> = {};
    result.pattern.forEach((weekday: number, i: number) => {
      const day = sortedDays[i % sortedDays.length];
      dayAssignments[String(weekday)] = dayMuscleLabel(day);
    });

    const scheduleConfig = {
      start_date,
      pattern: result.pattern,
      day_assignments: dayAssignments,
      reasoning: result.reasoning ?? '',
      cardio: result.cardio ?? null,
      nutrition: result.nutrition ?? null,
    };

    await supabase
      .from('workout_plans')
      .update({ schedule_config: scheduleConfig })
      .eq('id', plan_id)
      .eq('user_id', user.id);

    return Response.json({ schedule: scheduleConfig });
  } catch (err: any) {
    console.error('[schedule-workouts] error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
