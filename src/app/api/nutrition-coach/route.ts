import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { computeNutritionTargets } from '@/lib/edn/nutrition-autopilot';
import { deriveSportProfile } from '@/lib/edn/nutrition-intelligence';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Nutricionista IA — V6.5 SYNC
 * FONTE ÚNICA DE VERDADE: computeNutritionTargets (Nutrition Autopilot).
 * A IA gera apenas a INTERPRETAÇÃO (textos, alertas, timing); todos os
 * NÚMEROS (TDEE, calorias, macros, ciclagem, projeção) são do Autopilot e
 * sobrescritos após o parse — garantindo o mesmo valor em todas as telas.
 */
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
      supabase.from('profiles').select('name,experience_level,goal,main_goal,weight_kg,height_cm,age,gender,target_weight_kg,calorie_target,weekly_frequency,work_type,cardio_frequency,meals_per_day,athlete_sport').eq('id', user.id).maybeSingle(),
      supabase.from('bioimpedance_data').select('weight_kg,body_fat_pct,skeletal_muscle_mass_kg,lean_mass_kg,basal_metabolic_rate_kcal,water_pct,visceral_fat_level,measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('body_weight_logs').select('log_date,weight_kg').eq('user_id', user.id).order('log_date', { ascending: false }).limit(14),
      supabase.from('workout_sessions').select('started_at,total_volume_kg').eq('user_id', user.id).gte('started_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('started_at', { ascending: false }),
      supabase.from('cardio_sessions').select('distance_km').eq('user_id', user.id).is('deleted_at', null).gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString()),
    ]);

    const _sessions = workoutSessions ?? [];
    const _cardioKm = (cardioSessions ?? []).reduce((s, c) => s + (c.distance_km ?? 0), 0);
    const _volume = _sessions.reduce((s, w) => s + (w.total_volume_kg ?? 0), 0);
    const _sessions7 = _sessions.filter(w => new Date(w.started_at).getTime() >= Date.now() - 7 * 86400000).length;
    const sport = deriveSportProfile((profile as any)?.athlete_sport ?? null);

    // ── FONTE ÚNICA: Nutrition Autopilot ──────────────────────────────────────
    const targets = computeNutritionTargets({
      bio: bio ?? null,
      training: { sessionsLast7: _sessions7, weeklyVolumeKg: _volume / 2, cardioKmThisWeek: _cardioKm },
      profile: {
        weight_kg: profile?.weight_kg ?? null,
        height_cm: profile?.height_cm ?? null,
        age: profile?.age ?? null,
        gender: profile?.gender ?? null,
        main_goal: (profile as any)?.main_goal ?? null,
        weekly_frequency: profile?.weekly_frequency ?? null,
        work_type: (profile as any)?.work_type ?? null,
        cardio_frequency: (profile as any)?.cardio_frequency ?? null,
        meals_per_day: profile?.meals_per_day ?? null,
      },
    });
    if (!targets) return Response.json({ error: 'Sem peso registrado — complete o perfil ou importe uma bioimpedância.' }, { status: 422 });

    const goalMap: Record<string, string> = { hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', fat_loss: 'Emagrecimento', definition: 'Definição', strength: 'Força', recomposition: 'Recomposição', performance: 'Performance' };
    const goal = (profile as any)?.main_goal ?? (profile as any)?.goal ?? 'hypertrophy';
    const currentWeight = bio?.weight_kg ?? weightLogs?.[0]?.weight_kg ?? profile?.weight_kg ?? 80;
    const targetWeight = (profile as any)?.target_weight_kg;
    const weekWorkouts = workoutSessions?.length ?? 0;
    const weekCardioKm = (cardioSessions ?? []).reduce((s, c) => s + (c.distance_km ?? 0), 0);
    const weekVolume = (workoutSessions ?? []).reduce((s, w) => s + (w.total_volume_kg ?? 0), 0);
    const weightTrend = weightLogs && weightLogs.length >= 2
      ? parseFloat((weightLogs[0].weight_kg - weightLogs[weightLogs.length - 1].weight_kg).toFixed(1))
      : null;

    const { tdeeKcal: tdee, targetKcal: targetCal, goalAdjustmentKcal: calorieAdj, proteinG, carbsG, fatG } = targets;
    const smartMacros = { tdee, target_calories: targetCal, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG };
    const projMult = calorieAdj / 7700;
    const projection = {
      in_30d: parseFloat((currentWeight + projMult * 30).toFixed(1)),
      in_60d: parseFloat((currentWeight + projMult * 60).toFixed(1)),
      in_90d: parseFloat((currentWeight + projMult * 90).toFixed(1)),
    };
    const carbCycling = {
      heavy_training: Math.round(carbsG * 1.2),
      light_training: carbsG,
      rest_day: Math.round(carbsG * 0.7),
    };

    // ── IA: apenas interpretação (números vêm prontos) ────────────────────────
    const ctx = `Atleta: ${profile?.name ?? 'Atleta'}, ${goalMap[goal] ?? goal}, ${profile?.experience_level ?? 'n/d'}
Peso: ${currentWeight}kg${targetWeight ? ` → meta ${targetWeight}kg` : ''}${weightTrend !== null ? ` (14d: ${weightTrend > 0 ? '+' : ''}${weightTrend}kg)` : ''}
Bio: BF=${bio?.body_fat_pct ?? '?'}% músculo=${bio?.skeletal_muscle_mass_kg ?? '?'}kg TMB=${targets.tmbKcal}kcal
Treino 14d: ${weekWorkouts} sessões volume=${Math.round(weekVolume)}kg cardio=${weekCardioKm.toFixed(1)}km
ESPORTE/ESPECIALISTA: ${sport.sport} → ${sport.agentLabel}. Foco: ${sport.focus}. Prioridades: ${sport.priorities.join('; ')}.
FASE NUTRICIONAL: ${targets.phaseLabel} — ${targets.phaseReason}
ALINHAMENTO TREINO: ${targets.trainingAlignment ?? 'sem observação específica'}
DAY TYPES (carbo): alta=${targets.dayTypes[0].carbsG}g · moderado=${targets.dayTypes[1].carbsG}g · descanso=${targets.dayTypes[2].carbsG}g
ALVOS OFICIAIS (Autopilot EDN — use EXATAMENTE estes números, não recalcule):
TDEE=${tdee}kcal · Meta=${targetCal}kcal (${calorieAdj >= 0 ? '+' : ''}${calorieAdj}kcal) · Proteína=${proteinG}g (${targets.proteinGPerKg}g/kg) · Carbs=${carbsG}g · Gordura=${fatG}g`;

    let analysis: any = null;
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: `Você é o ${sport.agentLabel} — nutricionista esportivo. Especialize a leitura para o esporte do atleta. Estruture TODA análise em 4 camadas: Análise (o que está acontecendo), Interpretação (por que importa), Estratégia (o que fazer) e Ação (ajuste a aplicar). Responda APENAS em JSON válido. Nunca altere os números dos ALVOS OFICIAIS.`,
        messages: [{
          role: 'user',
          content: `${ctx}

JSON puro (sem markdown):
{"status":"otimo|bom|atencao|critico","phase":"${targets.phaseLabel}","sport_agent":"${sport.agentLabel}","headline":"frase curta","analysis":"o que está acontecendo (dados)","interpretation":"por que isso importa para ${sport.sport}","strategy":"o que fazer","action":"ajuste concreto a aplicar","why_this_plan":"explique em 1-2 frases por que essa estratégia para ESTE atleta agora","summary":"2 frases com números","calorie_recommendation":{"tdee":${tdee},"target":${targetCal},"surplus_deficit":${calorieAdj},"rationale":"explicação"},"macro_targets":{"protein_g":${proteinG},"carbs_g":${carbsG},"fat_g":${fatG},"protein_per_kg":${targets.proteinGPerKg}},"carb_cycling":{"heavy_training":${carbCycling.heavy_training},"light_training":${carbCycling.light_training},"rest_day":${carbCycling.rest_day},"rationale":"ciclagem EDN"},"alerts":[{"type":"info","message":"observação específica"}],"plateau_detected":false,"plateau_reason":null,"weight_projection":{"in_30d":${projection.in_30d},"in_60d":${projection.in_60d},"in_90d":${projection.in_90d}},"nutrient_timing":{"pre_workout":"carbs 1h antes","post_workout":"proteína+carbs rápidos","rest_day":"proteína distribuída","before_bed":"caseína ou ovo"},"priority_action":"ação mais importante","edn_principle":"princípio EDN aplicado"}

Escreva os textos com base na análise; mantenha os números como estão. APENAS JSON.`
        }],
      });

      const raw = ((res.content[0] as any).text ?? '').trim();
      const start = raw.indexOf('{');
      if (start >= 0) {
        let jsonStr = raw.slice(start).replace(/```/g, '').trim();
        try {
          analysis = JSON.parse(jsonStr);
        } catch {
          jsonStr = jsonStr.replace(/,\s*([\]\}])/g, '$1');
          const o = (jsonStr.match(/[\[{]/g) ?? []).length;
          const c = (jsonStr.match(/[\]}]/g) ?? []).length;
          if (o > c) jsonStr += ']}'.slice(0, o - c);
          try { analysis = JSON.parse(jsonStr); } catch { /* fallback abaixo */ }
        }
      }
    } catch (aiErr: any) {
      console.warn('[nutrition-coach] AI error (using fallback):', aiErr.message);
    }

    if (!analysis) {
      analysis = {
        status: goal === 'fat_loss' || goal === 'weight_loss' ? 'atencao' : 'bom',
        headline: goal === 'fat_loss' || goal === 'weight_loss' ? 'Déficit ativo — acompanhe o progresso' : 'Plano nutricional configurado',
        sport_agent: sport.agentLabel,
        analysis: `${weekWorkouts} treinos/14d, ${weekCardioKm.toFixed(1)}km de cardio. Meta ${targetCal}kcal, proteína ${proteinG}g.`,
        interpretation: `Para ${sport.sport}, ${sport.focus.toLowerCase()}.`,
        strategy: sport.priorities.slice(0, 2).join('; ') + '.',
        action: calorieAdj < 0 ? `Manter déficit de ${Math.abs(calorieAdj)}kcal e proteína ≥ ${proteinG}g.` : `Atingir ${targetCal}kcal com ${proteinG}g de proteína.`,
        summary: `TDEE ${tdee}kcal. Meta de ${targetCal}kcal (${calorieAdj >= 0 ? '+' : ''}${calorieAdj}kcal/dia). Proteína alvo: ${proteinG}g/dia (${targets.proteinGPerKg}g/kg).`,
        alerts: weekWorkouts < 2 ? [{ type: 'warning', message: 'Menos de 2 treinos registrados nos últimos 14 dias.' }] : [],
        plateau_detected: weightTrend !== null && Math.abs(weightTrend) < 0.3,
        plateau_reason: weightTrend !== null && Math.abs(weightTrend) < 0.3 ? 'Variação de peso < 0.3kg em 14 dias.' : null,
        nutrient_timing: {
          pre_workout: 'Carbs complexos + proteína 60-90 min antes.',
          post_workout: 'Proteína rápida + carbs simples em até 30 min após.',
          rest_day: 'Proteína distribuída em 4-5 refeições. Carbs reduzidos.',
          before_bed: 'Caseína ou ovos para síntese proteica noturna.',
        },
        priority_action: calorieAdj < 0 ? `Manter déficit de ${Math.abs(calorieAdj)}kcal/dia e proteína ≥ ${proteinG}g.` : `Atingir a meta de ${targetCal}kcal com ${proteinG}g de proteína.`,
        edn_principle: 'Progressão sustentável com preservação máxima de massa muscular.',
      };
    }

    // ── SYNC: números do Autopilot SEMPRE sobrescrevem a IA ──────────────────
    analysis.calorie_recommendation = {
      ...(analysis.calorie_recommendation ?? {}),
      tdee, target: targetCal, surplus_deficit: calorieAdj,
      rationale: analysis.calorie_recommendation?.rationale ?? targets.explanation.join(' '),
    };
    analysis.macro_targets = {
      ...(analysis.macro_targets ?? {}),
      protein_g: proteinG, carbs_g: carbsG, fat_g: fatG, protein_per_kg: targets.proteinGPerKg,
    };
    analysis.carb_cycling = {
      ...(analysis.carb_cycling ?? {}),
      ...carbCycling,
    };
    analysis.weight_projection = projection;
    analysis.phase = targets.phaseLabel;
    analysis.phase_reason = targets.phaseReason;
    analysis.sport_agent = sport.agentLabel;
    if (!analysis.why_this_plan) analysis.why_this_plan = targets.whyThisPlan.join(' ');
    analysis.day_types = targets.dayTypes;

    return Response.json({
      analysis,
      smart_macros: smartMacros,
      autopilot: targets,
      phase: targets.phaseLabel,
      sport: sport,
      why_this_plan: targets.whyThisPlan,
      day_types: targets.dayTypes,
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
