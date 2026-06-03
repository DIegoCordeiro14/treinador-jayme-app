import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;  // reduzido de 45→30

export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [
      { data: profile },
      { data: bio },
      { data: weightLogs },
      { data: workoutSessions },
      { data: cardioSessions },
    ] = await Promise.all([
      supabase.from('profiles').select('name,experience_level,goal,weight_kg,height_cm,age,gender,target_weight_kg,calorie_target').eq('id', user.id).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,body_fat_pct,skeletal_muscle_mass_kg,basal_metabolic_rate_kcal,water_pct,visceral_fat_level').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('body_weight_logs').select('log_date,weight_kg').eq('user_id', user.id).order('log_date', { ascending: false }).limit(14),
      supabase.from('workout_sessions').select('started_at,total_volume_kg').eq('user_id', user.id).gte('started_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('started_at', { ascending: false }),
      supabase.from('cardio_sessions').select('distance_km').eq('user_id', user.id).gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString()),
    ]);

    // ── Computed values ───────────────────────────────────────────────────────
    const goalMap: Record<string, string> = { hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', definition: 'Definição', strength: 'Força' };
    const currentWeight = weightLogs?.[0]?.weight_kg ?? bio?.weight_kg ?? profile?.weight_kg ?? 80;
    const targetWeight = (profile as any)?.target_weight_kg;
    const weekWorkouts = workoutSessions?.length ?? 0;
    const weekCardioKm = (cardioSessions ?? []).reduce((s, c) => s + (c.distance_km ?? 0), 0);
    const weekVolume = (workoutSessions ?? []).reduce((s, w) => s + (w.total_volume_kg ?? 0), 0);
    const weightTrend = weightLogs && weightLogs.length >= 2
      ? parseFloat((weightLogs[0].weight_kg - weightLogs[weightLogs.length - 1].weight_kg).toFixed(1))
      : null;

    // ── Smart macros (deterministic — always returns) ─────────────────────────
    const tmb = bio?.basal_metabolic_rate_kcal ?? (profile?.gender === 'male' ? currentWeight * 24 : currentWeight * 22);
    const activityMult = weekWorkouts >= 5 ? 1.55 : weekWorkouts >= 3 ? 1.45 : 1.35;
    const tdee = Math.round(tmb * activityMult + weekCardioKm * 60);
    const goal = (profile as any)?.goal ?? 'hypertrophy';
    const calorieAdj = goal === 'weight_loss' ? -500 : goal === 'definition' ? -250 : goal === 'hypertrophy' ? 300 : 0;
    const targetCal = tdee + calorieAdj;
    const proteinG = Math.round(currentWeight * (goal === 'weight_loss' ? 2.4 : 2.0));
    const fatG = Math.round(currentWeight * 0.8);
    const carbsG = Math.max(50, Math.round((targetCal - proteinG * 4 - fatG * 9) / 4));
    const smartMacros = { tdee, target_calories: targetCal, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG };

    // ── AI Analysis (compact prompt for reliability) ──────────────────────────
    const ctx = `Atleta: ${profile?.name ?? 'Diego'}, ${goalMap[goal] ?? goal}, ${profile?.experience_level ?? 'intermediário'}
Peso: ${currentWeight}kg${targetWeight ? ` → meta ${targetWeight}kg` : ''}${weightTrend !== null ? ` (14d: ${weightTrend > 0 ? '+' : ''}${weightTrend}kg)` : ''}
Bio: BF=${bio?.body_fat_pct ?? '?'}% músculo=${bio?.skeletal_muscle_mass_kg ?? '?'}kg TMB=${bio?.basal_metabolic_rate_kcal ?? Math.round(tmb)}kcal
Treino 14d: ${weekWorkouts} sessões volume=${Math.round(weekVolume)}kg cardio=${weekCardioKm.toFixed(1)}km
TDEE estimado: ${tdee}kcal meta: ${targetCal}kcal (${calorieAdj >= 0 ? '+' : ''}${calorieAdj}kcal)`;

    let analysis: any = null;
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,  // aumentado de 1200→2000
        system: 'Você é o Nutricionista IA EDN. Responda APENAS em JSON válido.',
        messages: [{
          role: 'user',
          content: `${ctx}

JSON puro (sem markdown):
{"status":"otimo|bom|atencao|critico","headline":"frase curta","summary":"2 frases com números","calorie_recommendation":{"tdee":${tdee},"target":${targetCal},"surplus_deficit":${calorieAdj},"rationale":"explicação"},"macro_targets":{"protein_g":${proteinG},"carbs_g":${carbsG},"fat_g":${fatG},"protein_per_kg":${(proteinG/currentWeight).toFixed(1)}},"carb_cycling":{"heavy_training":${Math.round(carbsG*1.2)},"light_training":${carbsG},"rest_day":${Math.round(carbsG*0.7)},"rationale":"ciclagem EDN"},"alerts":[{"type":"info","message":"observação específica"}],"plateau_detected":false,"plateau_reason":null,"weight_projection":{"in_30d":${(currentWeight + calorieAdj/7700*30).toFixed(1)},"in_60d":${(currentWeight + calorieAdj/7700*60).toFixed(1)},"in_90d":${(currentWeight + calorieAdj/7700*90).toFixed(1)}},"nutrient_timing":{"pre_workout":"carbs 1h antes","post_workout":"proteína+carbs rápidos","rest_day":"proteína distribuída","before_bed":"caseína ou ovo"},"priority_action":"ação mais importante","edn_principle":"princípio EDN aplicado"}

Ajuste os valores com base na análise. APENAS JSON.`
        }],
      });

      const raw = ((res.content[0] as any).text ?? '').trim();
      const start = raw.indexOf('{');
      if (start >= 0) {
        let jsonStr = raw.slice(start).replace(/```/g, '').trim();
        try {
          analysis = JSON.parse(jsonStr);
        } catch {
          // Try repairing truncated JSON
          jsonStr = jsonStr.replace(/,\s*([\]\}])/g, '$1');
          const o = (jsonStr.match(/[\[{]/g) ?? []).length;
          const c = (jsonStr.match(/[\]}]/g) ?? []).length;
          if (o > c) jsonStr += ']}'.slice(0, o - c);
          try { analysis = JSON.parse(jsonStr); } catch { /* fall through to fallback */ }
        }
      }
    } catch (aiErr: any) {
      console.warn('[nutrition-coach] AI error (using fallback):', aiErr.message);
    }

    // ── Fallback analysis if AI failed or truncated ───────────────────────────
    if (!analysis) {
      const projMult = calorieAdj / 7700;
      analysis = {
        status: goal === 'weight_loss' ? 'atencao' : 'bom',
        headline: goal === 'weight_loss' ? 'Déficit ativo — acompanhe o progresso' : 'Plano nutricional configurado',
        summary: `TDEE estimado em ${tdee}kcal. Meta de ${targetCal}kcal (${calorieAdj >= 0 ? '+' : ''}${calorieAdj}kcal/dia). Proteína alvo: ${proteinG}g/dia (${(proteinG/currentWeight).toFixed(1)}g/kg).`,
        calorie_recommendation: { tdee, target: targetCal, surplus_deficit: calorieAdj, rationale: 'Calculado pelo Performance Engine EDN.' },
        macro_targets: { protein_g: proteinG, carbs_g: carbsG, fat_g: fatG, protein_per_kg: parseFloat((proteinG/currentWeight).toFixed(1)) },
        carb_cycling: { heavy_training: Math.round(carbsG * 1.2), light_training: carbsG, rest_day: Math.round(carbsG * 0.7), rationale: 'Mais carbs nos dias de treino intenso para sustentar a performance.' },
        alerts: weekWorkouts < 2 ? [{ type: 'warning', message: 'Menos de 2 treinos registrados nos últimos 14 dias.' }] : [],
        plateau_detected: weightTrend !== null && Math.abs(weightTrend) < 0.3,
        plateau_reason: weightTrend !== null && Math.abs(weightTrend) < 0.3 ? 'Variação de peso < 0.3kg em 14 dias.' : null,
        weight_projection: {
          in_30d: parseFloat((currentWeight + projMult * 30).toFixed(1)),
          in_60d: parseFloat((currentWeight + projMult * 60).toFixed(1)),
          in_90d: parseFloat((currentWeight + projMult * 90).toFixed(1)),
        },
        nutrient_timing: {
          pre_workout: 'Carbs complexos + proteína 60-90 min antes.',
          post_workout: 'Proteína rápida + carbs simples em até 30 min após.',
          rest_day: 'Proteína distribuída em 4-5 refeições. Carbs reduzidos.',
          before_bed: 'Caseína ou ovos para síntese proteica noturna.',
        },
        priority_action: goal === 'weight_loss' ? `Manter déficit de ${Math.abs(calorieAdj)}kcal/dia e proteína ≥ ${proteinG}g.` : `Atingir superávit de ${calorieAdj}kcal com ${proteinG}g de proteína.`,
        edn_principle: 'Progressão sustentável com preservação máxima de massa muscular.',
      };
    }

    return Response.json({
      analysis,
      smart_macros: smartMacros,
      current_weight: currentWeight,
      target_weight: targetWeight ?? null,
      weight_trend: weightTrend,
      bio: bio ? { bf: bio.body_fat_pct, muscle: bio.skeletal_muscle_mass_kg, tmb: bio.basal_metabolic_rate_kcal } : null,
    });
  } catch (err: any) {
    console.error('[nutrition-coach] fatal error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno no servidor' }, { status: 500 });
  }
}
