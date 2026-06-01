import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

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

    const [{ data: plan }, { data: bio }] = await Promise.all([
      supabase
        .from('workout_plans')
        .select('*, workout_days(id, name, order_index, workout_exercises(exercise:exercises(muscle_group)))')
        .eq('id', plan_id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('bioimpedance_data')
        .select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,visceral_fat_level,water_pct,basal_metabolic_rate_kcal,protein_pct')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!plan) return Response.json({ error: 'Plan not found' }, { status: 404 });

    const goalMap: Record<string, string> = {
      hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento',
      definition: 'Definicao', strength: 'Forca',
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

    const daysPerWeek = plan.days_per_week;
    const prompt = 'Voce e Jayme De Lamadrid (EDN). Monte um plano semanal.\n\n' +
      'DADOS:\n' +
      '- Plano: ' + daysPerWeek + ' treinos/sem, objetivo: ' + (goalMap[plan.goal] ?? plan.goal) + '\n' +
      '- Treinos: ' + dayNames + '\n' +
      '- Inicio: dia da semana ' + startWeekday + ' (1=Seg, 7=Dom)\n' +
      '- Bioimpedancia: ' + bioCtx + '\n\n' +
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
      '    "daily_calories": "ex: TMB x 1.4 - 400kcal",\n' +
      '    "protein_g_per_kg": 2.0,\n' +
      '    "carbs_pct": 45,\n' +
      '    "fat_pct": 25,\n' +
      '    "pre_workout": "o que comer antes",\n' +
      '    "post_workout": "o que comer depois",\n' +
      '    "rest_day_strategy": "como comer nos dias de descanso",\n' +
      '    "key_tips": ["dica 1", "dica 2", "dica 3"]\n' +
      '  }\n' +
      '}\n\n' +
      'O pattern deve ter exatamente ' + daysPerWeek + ' dias (1-7). Primeiro dia OBRIGATORIO: ' + startWeekday + '. Apenas JSON.';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI did not return valid JSON' }, { status: 422 });

    const result = JSON.parse(jsonMatch[0]);
    result.pattern = (result.pattern as number[]).map(Number).sort((a: number, b: number) => a - b);

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
