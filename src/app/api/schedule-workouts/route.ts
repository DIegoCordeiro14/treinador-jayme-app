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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dayMuscleLabel(day: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wes: any[] = day.workout_exercises ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = [...new Set(wes.map((we: any) => we.exercise?.muscle_group).filter(Boolean))] as string[];
  if (groups.length === 0) return day.name;
  return groups.slice(0, 2).map((g: string) => muscleShort(g)).join('/');
}

// ── Distribuição EDN: espaça os dias para respeitar 48–72h de recuperação ──────
function spreadWeekdays(n: number, allowWeekends: boolean): number[] {
  if (n >= 7) return [1, 2, 3, 4, 5, 6, 7];
  if (n <= 1) return [1];
  let pool = allowWeekends ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  if (n > pool.length) pool = [1, 2, 3, 4, 5, 6, 7];
  const L = pool.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.round((i * (L - 1)) / (n - 1))]);
  const uniq = [...new Set(out)];
  for (const d of pool) { if (uniq.length >= n) break; if (!uniq.includes(d)) uniq.push(d); }
  return uniq.slice(0, n).sort((a, b) => a - b);
}

// Ordena os treinos para que dias CONSECUTIVOS não repitam o mesmo agrupamento.
function orderForRecovery(dayGroups: Set<string>[]): number[] {
  const n = dayGroups.length;
  if (n <= 2) return dayGroups.map((_, i) => i);
  const used = new Set<number>([0]);
  const order = [0];
  while (order.length < n) {
    const prev = dayGroups[order[order.length - 1]];
    let best = -1, bestOv = Infinity;
    for (let i = 0; i < n; i++) {
      if (used.has(i)) continue;
      let ov = 0; dayGroups[i].forEach((g) => { if (prev.has(g)) ov++; });
      if (ov < bestOv) { bestOv = ov; best = i; }
    }
    order.push(best); used.add(best);
  }
  return order;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { plan_id: string; start_date: string; allow_weekends?: boolean };
    const { plan_id, start_date } = body;
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
        .select('experience_level, meals_per_day, gender, age, train_weekends')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    if (!plan) return Response.json({ error: 'Plan not found' }, { status: 404 });

    // Preferência de fins de semana: body > profile > default(true)
    const allowWeekends = body.allow_weekends ?? (profile as { train_weekends?: boolean } | null)?.train_weekends ?? true;
    // Persiste a preferência no perfil
    if (body.allow_weekends !== undefined) {
      await supabase.from('profiles').update({ train_weekends: body.allow_weekends }).eq('id', user.id);
    }

    const goalMap: Record<string, string> = {
      hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento',
      definition: 'Definicao', strength: 'Forca',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortedDays = [...(plan.workout_days ?? [])].sort((a: any, b: any) => a.order_index - b.order_index);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayNames = sortedDays.map((d: any) => dayMuscleLabel(d)).join(', ');

    let startWeekday = (() => {
      const d = new Date(start_date + 'T12:00:00').getDay();
      return d === 0 ? 7 : d;
    })();
    // Se fins de semana desativados e o início cai no fim de semana, começa na segunda
    if (!allowWeekends && startWeekday >= 6) startWeekday = 1;

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
    const levelNutritionRules: Record<string, string> = {
      beginner:     'proteína 1.6-2.0g/kg; superávit/déficit moderado ±300kcal; simples e prático',
      intermediate: 'proteína 2.0-2.2g/kg; ciclagem básica carb dias treino vs descanso',
      advanced:     'proteína 2.2-2.5g/kg; ciclagem carb otimizada; timing preciso pré/pós; atenção a micronutrientes; refeições a cada 3-4h máximo',
    };
    const levelRule = levelNutritionRules[experienceLevel] ?? levelNutritionRules['beginner'];
    const mealsTemplate = Array.from({ length: mealsPerDay }, (_, i) => `{"name":"Refeição ${i+1}","time":"00h","calories_pct":${Math.round(100/mealsPerDay)},"focus":"...","example":"..."}`).join(',');

    const daysPerWeek = plan.days_per_week;
    // Domingo (7) é prioridade de descanso: se o início cai no domingo e o
    // usuário não treina os 7 dias, a IA começa na segunda (1).
    if (startWeekday === 7 && daysPerWeek <= 6) startWeekday = 1;
    const weekendRule = allowWeekends
      ? 'Pode usar qualquer dia (1-6), mas PRIORIZE domingo (7) como descanso; só use domingo se treinar 7 dias.'
      : 'NAO use sabado (6) nem domingo (7). Use SOMENTE dias 1 a 5 (Seg-Sex).';
    const prompt = 'Voce e Jayme De Lamadrid (EDN). Monte um plano semanal.\n\n' +
      'DADOS:\n' +
      '- Plano: ' + daysPerWeek + ' treinos/sem, objetivo: ' + (goalMap[plan.goal] ?? plan.goal) + '\n' +
      '- Treinos: ' + dayNames + '\n' +
      '- Inicio: dia da semana ' + startWeekday + ' (1=Seg, 7=Dom)\n' +
      '- Fins de semana: ' + weekendRule + '\n' +
      '- Bioimpedancia: ' + bioCtx + '\n' +
      '- Nivel: ' + (levelMap2[experienceLevel] ?? experienceLevel) + '\n' +
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
      'O pattern deve ter exatamente ' + daysPerWeek + ' dias. Primeiro dia OBRIGATORIO: ' + startWeekday + '. ' + weekendRule + '\n' +
      'Nutrition meals: exatamente ' + mealsPerDay + ' refeicoes com horarios, % calorias e exemplos de alimentos. Apenas JSON.';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI did not return valid JSON' }, { status: 422 });

    const result = JSON.parse(jsonMatch[0]);

    // ── Distribuição EDN determinística (independe do que a IA sugeriu) ─────────
    // Grupos musculares reais de cada treino — funciona para planos montados
    // manualmente (sem "Montar com Coach EDN") ou gerados pela IA.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayGroups: Set<string>[] = sortedDays.map((d: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Set(((d.workout_exercises ?? []).map((we: any) => we.exercise?.muscle_group).filter(Boolean)) as string[])
    );
    // Ordena os treinos para evitar o mesmo agrupamento em dias seguidos
    const order = sortedDays.length > 0 ? orderForRecovery(dayGroups) : [];
    // Espalha os dias de treino na semana com o maior intervalo possível
    const pattern = daysPerWeek <= 1 ? [startWeekday] : spreadWeekdays(daysPerWeek, allowWeekends);
    result.pattern = pattern;

    const dayAssignments: Record<string, string> = {};
    pattern.forEach((weekday: number, i: number) => {
      const planIdx = order.length > 0 ? order[i % order.length] : (i % Math.max(1, sortedDays.length));
      dayAssignments[String(weekday)] = dayMuscleLabel(sortedDays[planIdx]);
    });

    result.reasoning =
      'Distribuição pela metodologia EDN: treinos espaçados para garantir 48–72h de recuperação por grupo muscular, evitando trabalhar o mesmo agrupamento em dias consecutivos.';

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
