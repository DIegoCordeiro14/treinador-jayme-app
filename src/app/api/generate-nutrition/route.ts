import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const planId: string | undefined = body.plan_id;

    // ─── Fetch profile ────────────────────────────────────────────────────────
    const [{ data: profile }, { data: bio }, { data: bioHistory }, { data: activePlan }] = await Promise.all([
      supabase.from('profiles')
        .select('experience_level, goal, weight_kg, height_cm, gender, age, meals_per_day')
        .eq('id', user.id).maybeSingle(),
      supabase.from('bioimpedance_data')
        .select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,lean_mass_kg,basal_metabolic_rate_kcal,protein_pct,water_pct,visceral_fat_level')
        .eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('bioimpedance_data')
        .select('weight_kg,body_fat_pct,skeletal_muscle_mass_kg,measured_at')
        .eq('user_id', user.id).order('measured_at', { ascending: false }).limit(4),
      planId
        ? supabase.from('workout_plans').select('id,goal,schedule_config').eq('id', planId).eq('user_id', user.id).maybeSingle()
        : supabase.from('workout_plans').select('id,goal,schedule_config').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    ]);

    const goal = activePlan?.goal ?? profile?.goal ?? 'hypertrophy';
    const experienceLevel = profile?.experience_level ?? 'beginner';
    const mealsPerDay = profile?.meals_per_day ?? 3;

    const goalMap: Record<string, string> = {
      hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento',
      definition: 'Definição', strength: 'Força',
    };
    const levelMap: Record<string, string> = {
      beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado',
    };

    // ─── Biometric context ────────────────────────────────────────────────────
    const effectiveWeight = bio?.weight_kg ?? profile?.weight_kg;
    const effectiveHeight = profile?.height_cm;
    const bmi = effectiveWeight && effectiveHeight
      ? parseFloat((effectiveWeight / Math.pow(effectiveHeight / 100, 2)).toFixed(1)) : bio?.bmi;
    const tmb = bio?.basal_metabolic_rate_kcal;

    const bioCtxParts = [
      effectiveWeight ? `peso=${effectiveWeight}kg` : null,
      effectiveHeight ? `altura=${effectiveHeight}cm` : null,
      bmi ? `IMC=${bmi}` : null,
      bio?.body_fat_pct ? `BF=${bio.body_fat_pct}%` : null,
      bio?.skeletal_muscle_mass_kg ? `músculo=${bio.skeletal_muscle_mass_kg}kg` : null,
      bio?.lean_mass_kg ? `magra=${bio.lean_mass_kg}kg` : null,
      tmb ? `TMB=${tmb}kcal` : null,
      bio?.protein_pct ? `proteína_corporal=${bio.protein_pct}%` : null,
      bio?.water_pct ? `água=${bio.water_pct}%` : null,
      bio?.visceral_fat_level ? `visceral=nível${bio.visceral_fat_level}` : null,
    ].filter(Boolean).join(', ');

    // ─── Evolution trend ──────────────────────────────────────────────────────
    let evolutionCtx = '';
    if (bioHistory && bioHistory.length >= 2) {
      const newest = bioHistory[0];
      const oldest = bioHistory[bioHistory.length - 1];
      const weightDelta = newest.weight_kg && oldest.weight_kg
        ? (newest.weight_kg - oldest.weight_kg).toFixed(1) : null;
      const bfDelta = newest.body_fat_pct && oldest.body_fat_pct
        ? (newest.body_fat_pct - oldest.body_fat_pct).toFixed(1) : null;
      const muscleDelta = newest.skeletal_muscle_mass_kg && oldest.skeletal_muscle_mass_kg
        ? (newest.skeletal_muscle_mass_kg - oldest.skeletal_muscle_mass_kg).toFixed(1) : null;
      if (weightDelta || bfDelta || muscleDelta) {
        evolutionCtx = `\nEvolução recente: ${[
          weightDelta ? `peso ${Number(weightDelta) >= 0 ? '+' : ''}${weightDelta}kg` : null,
          bfDelta ? `BF ${Number(bfDelta) >= 0 ? '+' : ''}${bfDelta}%` : null,
          muscleDelta ? `músculo ${Number(muscleDelta) >= 0 ? '+' : ''}${muscleDelta}kg` : null,
        ].filter(Boolean).join(', ')}.`;
      }
    }

    // ─── Gender/age context ───────────────────────────────────────────────────
    const genderMap: Record<string, string> = { male: 'Masculino', female: 'Feminino', other: 'Outro' };
    const profileCtx = [
      profile?.gender ? genderMap[profile.gender] : null,
      profile?.age ? `${profile.age}anos` : null,
    ].filter(Boolean).join(', ');

    // ─── Level-based caloric multipliers ─────────────────────────────────────
    const levelNutritionRules: Record<string, string> = {
      beginner:     'iniciante: déficit/superávit moderado (±300kcal); proteína 1.6-2.0g/kg; simples e prático',
      intermediate: 'intermediário: ajuste fino por objetivo; proteína 2.0-2.2g/kg; ciclagem básica carb treino/descanso',
      advanced:     'avançado (atleta natural profissional): alto volume proteico 2.2-2.5g/kg; ciclagem carb otimizada (dias treino vs descanso); timing preciso; pré-treino rico em carbs; pós-treino proteína+carbs rápidos; atenção a micronutrientes',
    };
    const levelRule = levelNutritionRules[experienceLevel] ?? levelNutritionRules.beginner;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });

    const prompt = `Você é Jayme De Lamadrid (EDN). Crie um plano nutricional personalizado.

PERFIL: ${levelMap[experienceLevel]}, objetivo=${goalMap[goal] ?? goal}${profileCtx ? `, ${profileCtx}` : ''}, ${mealsPerDay} refeições/dia.
BIOMETRIA: ${bioCtxParts || 'sem dados'}.${evolutionCtx}

REGRAS NUTRICIONAIS (${levelMap[experienceLevel]}): ${levelRule}
Refeições: distribua ${mealsPerDay} refeições ao longo do dia, otimizando timing proteico e energético para o objetivo.

Retorne SOMENTE este JSON (sem markdown):
{
  "strategy": "nome da estratégia",
  "daily_calories": "ex: TMB × 1.5 = 2800kcal (superávit +300)",
  "protein_g_per_kg": 2.2,
  "protein_pct": 35,
  "carbs_pct": 40,
  "fat_pct": 25,
  "pre_workout": "detalhes do que comer antes",
  "post_workout": "detalhes do que comer depois",
  "rest_day_strategy": "como ajustar nos dias de descanso",
  "meals": [
    {"name": "Café da manhã", "time": "07h", "calories_pct": 25, "focus": "proteína + carbs complexos", "example": "3 ovos mexidos + 70g aveia + banana"},
    {"name": "Almoço", "time": "12h", "calories_pct": 35, "focus": "refeição principal", "example": "200g frango + arroz integral + salada"}
  ],
  "key_tips": ["dica específica do EDN 1", "dica 2", "dica 3"]
}

${mealsPerDay} refeições no array meals. Seja específico com gramas e horários. APENAS JSON.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*/);
    if (!jsonMatch) return Response.json({ error: 'AI nao retornou JSON valido', raw: text }, { status: 422 });

    let nutrition;
    try {
      nutrition = JSON.parse(jsonMatch[0]);
    } catch {
      // Try to fix truncated JSON by closing open structures
      let raw = jsonMatch[0].trimEnd();
      // Close unterminated string
      if ((raw.match(/"/g) ?? []).length % 2 !== 0) raw += '"';
      // Close open arrays/objects
      const opens = (raw.match(/[\[\{]/g) ?? []).length;
      const closes = (raw.match(/[\]\}]/g) ?? []).length;
      const diff = opens - closes;
      // Close array items first then objects
      for (let i = 0; i < diff; i++) {
        const lastOpen = Math.max(raw.lastIndexOf('['), raw.lastIndexOf('{'));
        if (raw[lastOpen] === '[') raw = raw.slice(0, lastOpen + 1).trimEnd() + ']' + '}]}'.slice(0, diff - i - 1).split('').map((_, j) => '}').join('');
        else raw += '}';
      }
      try {
        nutrition = JSON.parse(raw);
      } catch {
        return Response.json({ error: 'Resposta da IA foi cortada. Tente novamente.' }, { status: 422 });
      }
    }

    // Save to active plan's schedule_config
    if (activePlan?.id) {
      const existingConfig = (activePlan.schedule_config as any) ?? {};
      await supabase.from('workout_plans')
        .update({ schedule_config: { ...existingConfig, nutrition } })
        .eq('id', activePlan.id)
        .eq('user_id', user.id);
    }

    return Response.json({ nutrition });
  } catch (err: any) {
    console.error('[generate-nutrition] error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
