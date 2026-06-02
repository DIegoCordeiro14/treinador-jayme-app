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

    const [{ data: plan }, { data: bio }, { data: profile }] = await Promise.all([
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
      supabase
        .from('profiles')
        .select('experience_level, meals_per_day, gender, age')
        .eq('id', user.id)
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

    const mealsPerDay = profile?.meals_per_day ?? 3;
    const experienceLevel = profile?.experience_level ?? 'beginner';
    const levelMap: Record<string, string> = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
    const levelNutritionRules: Record<string, string> = {
      beginner:     'proteína 1.6-2.0g/kg; superávit/déficit moderado ±300kcal; simples e prático',
      intermediate: 'proteína 2.0-2.2g/kg; ciclagem básica carb dias treino vs descanso',
      advanced:     'proteína 2.2-2.5g/kg; ciclagem carb otimizada; timing preciso pré/pós; atenção a micronutrientes; refeições a cada 3-4h máximo',
    };
    const levelRule = levelNutritionRules[experienceLevel] ?? levelNutritionRules['beginner'];

    const mealsTemplate = Array.from({ length: mealsPerDay }, (_, i) => `{"name":"Refeição ${i+1}","time":"00h","calories_pct":${Math.round(100/mealsPerDay)},"focus":"...","example":"..."}`).join(',');

    const daysPerWeek = plan.days_per_week;
    const prompt = 'Voce e Jayme De Lamadrid (EDN). Monte um plano semanal.\n\n' +
      'DADOS:\n' +
      '- Plano: ' + daysPerWeek + ' treinos/sem, objetivo: ' + (goalMap[plan.goal] ?? plan.goal) + '\n' +
      '- Nível: ' + (levelMap[experienceLevel] ?? experienceLevel) + '\n' +
      '- Treinos: ' + dayNames + '\n' +
      '- Inicio: dia da semana ' + startWeekday + ' (1=Seg, 7=Dom)\n' +
      '- Bioimpedancia: ' + bioCtx + '\n' +
      '- Refeicoes/dia: ' + mealsPerDay + '\n\n' +
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
      '    "meals": [' + mealsTemplate + '],\n' +
      '    "key_tips": ["dica 1 ' + levelRule.slice(0, 30) + '...", "dica 2", "dica 3"]\n' +
      '  }\n' +
      '}\n\n' +
      'Nutrition meals: exatamente ' + mealsPerDay + ' refeicoes com horarios, % calorias e exemplos de alimentos.\n' +
      'O pattern deve ter exatamente ' + daysPerWeek + ' dias (1-7). Primeiro dia OBRIGATORIO: ' + startWeekday + '. Apenas JSON.';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });
    const response = await client.me