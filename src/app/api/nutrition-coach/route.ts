import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 45;

export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [
      { data: profile },
      { data: bio },
      { data: weightLogs },
      { data: nutLogs },
      { data: workoutSessions },
      { data: cardioSessions },
      { data: activePlan },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('bioimpedance_data').select('*').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(3),
      supabase.from('body_weight_logs').select('*').eq('user_id', user.id).order('log_date', { ascending: false }).limit(14),
      supabase.from('nutrition_logs').select('*').eq('user_id', user.id).order('log_date', { ascending: false }).limit(14),
      supabase.from('workout_sessions').select('started_at,total_volume_kg,duration_seconds').eq('user_id', user.id).gte('started_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('started_at', { ascending: false }),
      supabase.from('cardio_sessions').select('created_at,distance_km,duration_min,intensity').eq('user_id', user.id).gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('created_at', { ascending: false }),
      supabase.from('workout_plans').select('goal,days_per_week,experience_level').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    ]);

    const goalMap: Record<string, string> = { hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', definition: 'Definicao', strength: 'Forca' };
    const levelMap: Record<string, string> = { beginner: 'Iniciante', intermediate: 'Intermediario', advanced: 'Avancado' };

    const latestBio = bio?.[0];
    const currentWeight = weightLogs?.[0]?.weight_kg ?? latestBio?.weight_kg ?? profile?.weight_kg;
    const targetWeight = profile?.target_weight_kg;

    // Weight trend (last 2 weeks)
    const weightTrend = weightLogs && weightLogs.length >= 2
      ? (weightLogs[0].weight_kg - weightLogs[weightLogs.length - 1].weight_kg).toFixed(1)
      : null;

    // Training load
    const weekVolume = workoutSessions?.reduce((s, w) => s + (w.total_volume_kg ?? 0), 0) ?? 0;
    const weekCardioKm = cardioSessions?.reduce((s, c) => s + (c.distance_km ?? 0), 0) ?? 0;
    const weekWorkouts = workoutSessions?.length ?? 0;

    // Adherence (from nutrition logs)
    const avgAdherence = nutLogs && nutLogs.length > 0
      ? Math.round(nutLogs.filter(l => l.adherence_score).reduce((s, l) => s + (l.adherence_score ?? 0), 0) / nutLogs.filter(l => l.adherence_score).length)
      : null;

    const ctx = `
PERFIL: ${profile?.name ?? 'Atleta'}, ${levelMap[profile?.experience_level ?? ''] ?? ''}, ${goalMap[profile?.goal ?? ''] ?? ''}, ${profile?.age ?? '?'}anos, ${profile?.gender ?? ''}
PESO: Atual=${currentWeight ?? '?'}kg${targetWeight ? ' | Meta=' + targetWeight + 'kg' : ''}${weightTrend ? ' | Variacao14d=' + weightTrend + 'kg' : ''}
BIO: BF=${latestBio?.body_fat_pct ?? '?'}% | Musculo=${latestBio?.skeletal_muscle_mass_kg ?? '?'}kg | TMB=${latestBio?.basal_metabolic_rate_kcal ?? '?'}kcal | Agua=${latestBio?.water_pct ?? '?'}%
TREINO 14d: ${weekWorkouts} sessoes | Volume=${Math.round(weekVolume)}kg | Cardio=${weekCardioKm.toFixed(1)}km
PLANO: ${activePlan ? goalMap[activePlan.goal] + ' ' + activePlan.days_per_week + 'x/sem' : 'sem plano ativo'}
ADERENCIA: ${avgAdherence ? avgAdherence + '%' : 'sem registro'}
PESO_LOGS: ${weightLogs?.slice(0, 7).map(l => l.log_date + ':' + l.weight_kg + 'kg').join(', ') ?? 'sem dados'}`;

    const client = new Anthropic();
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: `Voce e o Nutricionista IA da Escola dos Naturais (EDN), especialista em nutricao esportiva para atletas naturais.
Analise os dados e responda APENAS em JSON valido. Seja preciso com numeros. Detecte riscos reais.`,
      messages: [{
        role: 'user',
        content: `${ctx}

Gere analise nutricional completa em JSON:
{
  "status": "otimo|bom|atencao|critico",
  "headline": "frase de status em ate 10 palavras",
  "summary": "analise tecnica em 2-3 frases com numeros especificos",
  "calorie_recommendation": {
    "tdee": numero_estimado,
    "target": numero_calorias_alvo,
    "surplus_deficit": numero_com_sinal,
    "rationale": "explicacao tecnica"
  },
  "macro_targets": {
    "protein_g": numero,
    "carbs_g": numero,
    "fat_g": numero,
    "protein_per_kg": numero
  },
  "carb_cycling": {
    "heavy_training": numero_g,
    "light_training": numero_g,
    "rest_day": numero_g,
    "rationale": "explicacao"
  },
  "alerts": [
    {"type": "warning|info|danger", "message": "alerta especifico com numero"}
  ],
  "plateau_detected": true_or_false,
  "plateau_reason": "motivo se detectado ou null",
  "weight_projection": {
    "in_30d": numero_kg,
    "in_60d": numero_kg,
    "in_90d": numero_kg
  },
  "nutrient_timing": {
    "pre_workout": "recomendacao especifica",
    "post_workout": "recomendacao especifica",
    "rest_day": "recomendacao especifica",
    "before_bed": "recomendacao especifica"
  },
  "priority_action": "acao mais importante agora em 1 frase",
  "edn_principle": "principio EDN aplicado a esta situacao"
}`
      }]
    });

    const raw = (res.content[0] as any).text.trim();
    const json = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'));
    const analysis = JSON.parse(json);

    // Smart macro calculation (regardless of AI)
    const weight = currentWeight ?? 80;
    const tmb = latestBio?.basal_metabolic_rate_kcal ?? (profile?.gender === 'male' ? weight * 24 : weight * 22);
    const activityMult = weekWorkouts >= 5 ? 1.55 : weekWorkouts >= 3 ? 1.45 : 1.35;
    const tdee = Math.round(tmb * activityMult + weekCardioKm * 60);

    const goal = profile?.goal ?? 'hypertrophy';
    const calorieAdj = goal === 'weight_loss' ? -500 : goal === 'definition' ? -250 : goal === 'hypertrophy' ? 300 : 0;
    const targetCal = tdee + calorieAdj;
    const proteinG = Math.round(weight * (goal === 'weight_loss' ? 2.4 : 2.0));
    const fatG = Math.round(weight * 0.8);
    const carbsG = Math.round((targetCal - proteinG * 4 - fatG * 9) / 4);

    return Response.json({
      analysis,
      smart_macros: { tdee, target_calories: targetCal, protein_g: proteinG, carbs_g: Math.max(carbsG, 50), fat_g: fatG },
      current_weight: currentWeight,
      target_weight: targetWeight,
      weight_trend: weightTrend ? parseFloat(weightTrend) : null,
      bio: latestBio ? { bf: latestBio.body_fat_pct, muscle: latestBio.skeletal_muscle_mass_kg, tmb: latestBio.basal_metabolic_rate_kcal } : null,
    });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
