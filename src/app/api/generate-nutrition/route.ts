import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { computeNutritionTargets } from '@/lib/edn/nutrition-autopilot';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * V6.5 SYNC — FONTE ÚNICA: os números (calorias, macros, água) vêm do
 * Nutrition Autopilot; a IA monta apenas refeições/dicas e os valores
 * numéricos são sobrescritos após o parse. Assim o plano exibe EXATAMENTE
 * os mesmos números do card Autopilot e do Nutricionista IA.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const planId: string | undefined = body.plan_id;

    const [{ data: profile }, { data: bio }, { data: bioHistory }, { data: activePlan }] = await Promise.all([
      supabase.from('profiles').select('experience_level,goal,main_goal,aesthetic_goal,weight_kg,height_cm,gender,age,meals_per_day,profile_completion_pct,sleep_hours,stress_level,work_type,cardio_frequency,weekly_frequency').eq('id', user.id).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,lean_mass_kg,basal_metabolic_rate_kcal,protein_pct,water_pct,visceral_fat_level,measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,body_fat_pct,skeletal_muscle_mass_kg,measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(4),
      planId
        ? supabase.from('workout_plans').select('id,goal,schedule_config').eq('id', planId).eq('user_id', user.id).maybeSingle()
        : supabase.from('workout_plans').select('id,goal,schedule_config').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    ]);

    // ── Gate Módulo 0 ──────────────────────────────────────────────────────
    const completionPct = (profile as any)?.profile_completion_pct ?? 0;
    if (completionPct < 80) {
      return Response.json({
        error: 'profile_incomplete',
        message: `Perfil ${completionPct}% completo. O Coach EDN precisa de pelo menos 80% da anamnese preenchida para prescrever um plano nutricional. Complete seu perfil.`,
        completionPct,
      }, { status: 412 });
    }

    // ── FONTE ÚNICA: Nutrition Autopilot ──────────────────────────────────
    const targets = computeNutritionTargets({
      bio: bio ?? null,
      profile: {
        weight_kg: profile?.weight_kg ?? null,
        height_cm: profile?.height_cm ?? null,
        age: profile?.age ?? null,
        gender: profile?.gender ?? null,
        main_goal: (profile as any)?.main_goal ?? null,
        weekly_frequency: (profile as any)?.weekly_frequency ?? null,
        work_type: (profile as any)?.work_type ?? null,
        cardio_frequency: (profile as any)?.cardio_frequency ?? null,
        meals_per_day: profile?.meals_per_day ?? null,
      },
    });
    if (!targets) return Response.json({ error: 'Sem peso registrado — complete o perfil ou importe uma bioimpedância.' }, { status: 422 });

    const goal = (profile as any)?.main_goal ?? activePlan?.goal ?? profile?.goal ?? 'hypertrophy';
    const experienceLevel = profile?.experience_level ?? 'beginner';
    const mealsPerDay = Math.min(profile?.meals_per_day ?? 3, 5);

    const goalMap: Record<string, string> = { hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', definition: 'Definição', strength: 'Força', fat_loss: 'Emagrecimento', recomposition: 'Recomposição Corporal', performance: 'Performance' };
    const levelMap: Record<string, string> = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };

    const proteinPct = Math.round((targets.proteinG * 4 / targets.targetKcal) * 100);
    const fatPct = Math.round((targets.fatG * 9 / targets.targetKcal) * 100);
    const carbsPct = Math.max(0, 100 - proteinPct - fatPct);
    const adjLabel = targets.goalAdjustmentKcal === 0
      ? 'manutenção'
      : `${targets.goalAdjustmentKcal > 0 ? '+' : ''}${targets.goalAdjustmentKcal} ${targets.goalAdjustmentKcal < 0 ? 'déficit' : 'superávit'}`;
    const dailyCaloriesLabel = `${targets.targetKcal}kcal (${adjLabel})`;

    let evolutionCtx = '';
    if (bioHistory && bioHistory.length >= 2) {
      const n = bioHistory[0], o = bioHistory[bioHistory.length - 1];
      const wD = n.weight_kg && o.weight_kg ? (n.weight_kg - o.weight_kg).toFixed(1) : null;
      if (wD) evolutionCtx = ` Evolução: peso${Number(wD)>=0?'+':''}${wD}kg.`;
    }

    const lifestyleParts: string[] = [];
    if ((profile as any)?.sleep_hours) lifestyleParts.push(`sono=${(profile as any).sleep_hours}`);
    if ((profile as any)?.stress_level) lifestyleParts.push(`estresse=${(profile as any).stress_level}`);
    if ((profile as any)?.work_type) lifestyleParts.push(`trabalho=${(profile as any).work_type}`);
    if ((profile as any)?.cardio_frequency) lifestyleParts.push(`cardio=${(profile as any).cardio_frequency}`);
    const lifestyleCtx = lifestyleParts.length > 0 ? ` Rotina: ${lifestyleParts.join(', ')}.` : '';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });

    const prompt = `Crie plano nutricional EDN. Perfil: ${levelMap[experienceLevel] ?? experienceLevel}, ${goalMap[goal] ?? goal}, ${profile?.age ?? '?'}anos/${profile?.gender ?? '?'}, ${mealsPerDay} refeições.${evolutionCtx}${lifestyleCtx}

ALVOS OFICIAIS (Autopilot EDN — use EXATAMENTE estes números, não recalcule):
Calorias=${targets.targetKcal}kcal/dia (TDEE ${targets.tdeeKcal}, ${adjLabel}) · Proteína=${targets.proteinG}g (${targets.proteinGPerKg}g/kg, ${proteinPct}%) · Carboidratos=${targets.carbsG}g (${carbsPct}%) · Gordura=${targets.fatG}g (${fatPct}%) · Água=${(targets.waterMl / 1000).toFixed(1)}L

Monte as ${mealsPerDay} refeições somando EXATAMENTE ${targets.targetKcal}kcal e ${targets.proteinG}g de proteína.

JSON PURO (sem markdown):
{"strategy":"nome","daily_calories":"${dailyCaloriesLabel}","protein_g_per_kg":${targets.proteinGPerKg},"protein_pct":${proteinPct},"carbs_pct":${carbsPct},"fat_pct":${fatPct},"pre_workout":"descrição curta","post_workout":"descrição curta","rest_day_strategy":"descrição curta","meals":[{"name":"Café da manhã","time":"07h","calories_pct":25,"focus":"proteína+carbs","example":"3 ovos + 60g aveia"}],"key_tips":["dica 1","dica 2","dica 3"]}

Gere exatamente ${mealsPerDay} refeições. Seja conciso. APENAS JSON.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    let raw = text.replace(/```json\n?|\n?```/g, '').trim();
    const jsonStart = raw.indexOf('{');
    if (jsonStart < 0) return Response.json({ error: 'IA não retornou JSON válido', raw: text.slice(0, 200) }, { status: 422 });
    raw = raw.slice(jsonStart);

    let nutrition: any;
    try {
      nutrition = JSON.parse(raw);
    } catch {
      nutrition = repairJson(raw);
      if (!nutrition) {
        return Response.json({ error: 'Resposta da IA foi cortada. Tente novamente.' }, { status: 422 });
      }
    }

    if (!nutrition.meals) nutrition.meals = [];
    if (!nutrition.key_tips) nutrition.key_tips = [];

    // ── SYNC: números do Autopilot SEMPRE sobrescrevem a IA ────────────────
    nutrition.daily_calories = dailyCaloriesLabel;
    nutrition.protein_g_per_kg = targets.proteinGPerKg;
    nutrition.protein_pct = proteinPct;
    nutrition.carbs_pct = carbsPct;
    nutrition.fat_pct = fatPct;
    nutrition.protein_g = targets.proteinG;
    nutrition.carbs_g = targets.carbsG;
    nutrition.fat_g = targets.fatG;
    nutrition.target_kcal = targets.targetKcal;
    nutrition.tdee_kcal = targets.tdeeKcal;
    nutrition.water_ml = targets.waterMl;
    nutrition.source = 'autopilot_v65';

    // Persiste os alvos no perfil (mesma fonte para todo o app)
    await supabase.from('profiles').update({ calorie_target: targets.targetKcal, water_target_ml: targets.waterMl }).eq('id', user.id);

    if (activePlan?.id) {
      const cfg = (activePlan.schedule_config as any) ?? {};
      await supabase.from('workout_plans').update({ schedule_config: { ...cfg, nutrition } }).eq('id', activePlan.id).eq('user_id', user.id);
    }

    return Response.json({ nutrition });
  } catch (err: any) {
    console.error('[generate-nutrition] error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}

// ── JSON Repair ───────────────────────────────────────────────────────────────
function repairJson(raw: string): any | null {
  try {
    let s = raw.replace(/,\s*([\]\}])/g, '$1');
    const opens = (s.match(/[\[{]/g) ?? []).length;
    const closes = (s.match(/[\]}]/g) ?? []).length;
    const diff = opens - closes;
    if (diff > 0) {
      if (s.lastIndexOf('[') > s.lastIndexOf(']')) s += ']';
      for (let i = 0; i < Math.max(0, opens - (closes + (diff > 0 && s.endsWith(']') ? 1 : 0))); i++) s += '}';
    }
    return JSON.parse(s);
  } catch { return null; }
}
