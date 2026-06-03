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

    const [{ data: profile }, { data: bio }, { data: bioHistory }, { data: activePlan }] = await Promise.all([
      supabase.from('profiles').select('experience_level,goal,main_goal,aesthetic_goal,weight_kg,height_cm,gender,age,meals_per_day,profile_completion_pct,sleep_hours,stress_level,work_type,cardio_frequency').eq('id', user.id).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,lean_mass_kg,basal_metabolic_rate_kcal,protein_pct,water_pct,visceral_fat_level').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,body_fat_pct,skeletal_muscle_mass_kg,measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(4),
      planId
        ? supabase.from('workout_plans').select('id,goal,schedule_config').eq('id', planId).eq('user_id', user.id).maybeSingle()
        : supabase.from('workout_plans').select('id,goal,schedule_config').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    ]);

    // ── Módulo 0: gate — anamnese mínima de 80% para qualquer prescrição ──────
    const completionPct = (profile as any)?.profile_completion_pct ?? 0;
    if (completionPct < 80) {
      return Response.json({
        error: 'profile_incomplete',
        message: `Perfil ${completionPct}% completo. O Coach EDN precisa de pelo menos 80% da anamnese preenchida para prescrever um plano nutricional. Complete seu perfil.`,
        completionPct,
      }, { status: 412 });
    }

    const goal = activePlan?.goal ?? (profile as any)?.main_goal ?? profile?.goal ?? 'hypertrophy';
    const aestheticGoal = (profile as any)?.aesthetic_goal ?? null;
    const experienceLevel = profile?.experience_level ?? 'beginner';
    const mealsPerDay = Math.min(profile?.meals_per_day ?? 3, 5); // cap at 5

    const goalMap: Record<string, string> = { hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', definition: 'Definição', strength: 'Força', fat_loss: 'Emagrecimento', recomposition: 'Recomposição Corporal', performance: 'Performance' };
    const levelMap: Record<string, string> = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };

    const w = bio?.weight_kg ?? profile?.weight_kg;
    const h = profile?.height_cm;
    const tmb = bio?.basal_metabolic_rate_kcal;

    const bioCtx = [
      w ? `peso=${w}kg` : null,
      h ? `altura=${h}cm` : null,
      bio?.body_fat_pct ? `BF=${bio.body_fat_pct}%` : null,
      bio?.skeletal_muscle_mass_kg ? `músculo=${bio.skeletal_muscle_mass_kg}kg` : null,
      tmb ? `TMB=${tmb}kcal` : null,
      bio?.visceral_fat_level ? `visceral=nível${bio.visceral_fat_level}` : null,
    ].filter(Boolean).join(', ');

    let evolutionCtx = '';
    if (bioHistory && bioHistory.length >= 2) {
      const n = bioHistory[0], o = bioHistory[bioHistory.length - 1];
      const wD = n.weight_kg && o.weight_kg ? (n.weight_kg - o.weight_kg).toFixed(1) : null;
      if (wD) evolutionCtx = ` Evolução: peso${Number(wD)>=0?'+':''}${wD}kg.`;
    }

    // ── Módulo 0: contexto de rotina/recuperação na nutrição ──────────────────
    const lifestyleParts: string[] = [];
    if ((profile as any)?.sleep_hours) lifestyleParts.push(`sono=${(profile as any).sleep_hours}`);
    if ((profile as any)?.stress_level) lifestyleParts.push(`estresse=${(profile as any).stress_level}`);
    if ((profile as any)?.work_type) lifestyleParts.push(`trabalho=${(profile as any).work_type}`);
    if ((profile as any)?.cardio_frequency) lifestyleParts.push(`cardio=${(profile as any).cardio_frequency}`);
    const lifestyleCtx = lifestyleParts.length > 0 ? ` Rotina: ${lifestyleParts.join(', ')}.` : '';

    const levelRules: Record<string, string> = {
      beginner:     'déficit/superávit ±300kcal, proteína 1.6-2.0g/kg, simples',
      intermediate: 'ajuste fino, proteína 2.0-2.2g/kg, ciclagem básica carb',
      advanced:     'proteína 2.2-2.5g/kg, ciclagem carb otimizada, timing preciso',
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });

    // Compact prompt to minimise token usage
    const prompt = `Crie plano nutricional EDN. Perfil: ${levelMap[experienceLevel]}, ${goalMap[goal]??goal}, ${profile?.age??'?'}anos/${profile?.gender??'?'}, ${mealsPerDay} refeições. Bio: ${bioCtx||'sem dados'}.${evolutionCtx}${lifestyleCtx} Regra: ${levelRules[experienceLevel]}.

JSON PURO (sem markdown):
{"strategy":"nome","daily_calories":"ex: 2800kcal (+300 superávit)","protein_g_per_kg":2.2,"protein_pct":35,"carbs_pct":40,"fat_pct":25,"pre_workout":"descrição curta","post_workout":"descrição curta","rest_day_strategy":"descrição curta","meals":[{"name":"Café da manhã","time":"07h","calories_pct":25,"focus":"proteína+carbs","example":"3 ovos + 60g aveia"}],"key_tips":["dica 1","dica 2","dica 3"]}

Gere exatamente ${mealsPerDay} refeições. Seja conciso. APENAS JSON.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,   // aumentado de 2000 → 3000
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON (handle markdown fences)
    let raw = text.replace(/```json\n?|\n?```/g, '').trim();
    const jsonStart = raw.indexOf('{');
    if (jsonStart < 0) return Response.json({ error: 'IA não retornou JSON válido', raw: text.slice(0, 200) }, { status: 422 });
    raw = raw.slice(jsonStart);

    let nutrition: any;
    try {
      nutrition = JSON.parse(raw);
    } catch {
      // Attempt structural repair
      nutrition = repairJson(raw);
      if (!nutrition) {
        return Response.json({ error: 'Resposta da IA foi cortada. Tente novamente.' }, { status: 422 });
      }
    }

    // Ensure required fields exist
    if (!nutrition.meals) nutrition.meals = [];
    if (!nutrition.key_tips) nutrition.key_tips = [];

    // Save to plan
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
    // Remove trailing comma before closing bracket/brace
    let s = raw.replace(/,\s*([\]\}])/g, '$1');
    // Count brackets
    const opens = (s.match(/[\[{]/g) ?? []).length;
    const closes = (s.match(/[\]}]/g) ?? []).length;
    const diff = opens - closes;
    if (diff > 0) {
      // Close any open array first (meals), then objects
      if (s.lastIndexOf('[') > s.lastIndexOf(']')) s += ']';
      for (let i = 0; i < Math.max(0, opens - (closes + (diff > 0 && s.endsWith(']') ? 1 : 0))); i++) s += '}';
    }
    return JSON.parse(s);
  } catch { return null; }
}
