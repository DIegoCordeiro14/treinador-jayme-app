import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultProvider, EDN_SYSTEM_PROMPT } from '@/lib/ai-coach';
import { buildWorkout, formatBuilderOutputForAI, type BuilderInput, type MuscleGroup } from '@/lib/edn/workout-builder';
import { selectExercises, formatSelectionForAI, type Limitation } from '@/lib/edn/exercise-selector';
import { subDays } from 'date-fns';

export const runtime  = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      goal, daysPerWeek, experienceLevel,
      weightKg, heightCm, bodyFatPct,
      exercises,   // Exercise[] — full catalog
      dayCount,    // number of workout_days in the plan
      // V3 extras
      minutesPerSession, sleepHours, focusMuscle,
      stagnantExercises, favoriteExercises, injuries,
    } = body;

    // ── Fetch full profile context from Supabase ───────────────────────────────
    const now = new Date();
    const [
      { data: bioData },
      { data: recentSessions },
      { data: recentPRs },
      { data: athleteXP },
    ] = await Promise.all([
      supabase.from('bioimpedance_data')
        .select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,lean_mass_kg,water_pct,visceral_fat_level,basal_metabolic_rate_kcal,protein_pct,body_type,body_score')
        .eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('workout_sessions')
        .select('started_at,total_volume_kg')
        .eq('user_id', user.id).gte('started_at', subDays(now, 28).toISOString())
        .order('started_at', { ascending: false }),
      supabase.from('personal_records')
        .select('achieved_at').eq('user_id', user.id)
        .gte('achieved_at', subDays(now, 28).toISOString()).limit(1),
      supabase.from('user_xp')
        .select('edn_score,recovery_score').eq('user_id', user.id).maybeSingle(),
    ]);

    const lastSession = recentSessions?.[0];
    const daysSinceLast = lastSession
      ? Math.floor((now.getTime() - new Date(lastSession.started_at).getTime()) / 86400000)
      : 999;

    // ── Fetch preferences + limitations ──────────────────────────────────────
    const [{ data: preferences }, { data: profileFull }] = await Promise.all([
      supabase.from('exercise_preferences').select('exercise_id, preference').eq('user_id', user.id),
      supabase.from('profiles').select('limitations, available_equipment, mesocycle_number').eq('id', user.id).maybeSingle(),
    ]);

    const likedIds    = (preferences ?? []).filter((p: any) => p.preference === 'liked').map((p: any) => p.exercise_id);
    const dislikedIds = (preferences ?? []).filter((p: any) => p.preference === 'disliked').map((p: any) => p.exercise_id);
    const limitations  = ((profileFull as any)?.limitations ?? []) as Limitation[];
    const availableEquip = ((profileFull as any)?.available_equipment ?? []) as string[];
    const mesocycleNum   = ((profileFull as any)?.mesocycle_number ?? 1) as number;

    // ── Run deterministic builder engine ──────────────────────────────────────
    const builderInput: BuilderInput = {
      sex:                 body.sex,
      age:                 body.age,
      weight_kg:           bioData?.weight_kg ?? weightKg,
      height_cm:           heightCm,
      body_fat_pct:        bioData?.body_fat_pct ?? bodyFatPct,
      muscle_mass_kg:      bioData?.skeletal_muscle_mass_kg,
      experience_level:    experienceLevel ?? 'beginner',
      training_years:      body.trainingYears,
      goal:                goal ?? 'hypertrophy',
      days_per_week:       daysPerWeek ?? 3,
      minutes_per_session: minutesPerSession ?? 60,
      sleep_hours:         sleepHours,
      recovery_score:      (athleteXP as any)?.recovery_score ?? undefined,
      has_pr_last_4_weeks: (recentPRs?.length ?? 0) > 0,
      stagnant_exercises:  stagnantExercises ?? [],
      favorite_exercises:  favoriteExercises ?? [],
      injuries:            injuries ?? [],
      days_since_last_workout: daysSinceLast,
      focus_muscle:        focusMuscle as MuscleGroup | undefined,
    };

    const builderOutput = buildWorkout(builderInput);
    const structuredContext = formatBuilderOutputForAI(builderOutput, builderInput);

    // ── Exercise Selection V3.1 ────────────────────────────────────────────────
    const firstSession = builderOutput.sessions[0];
    const selectionResult = selectExercises(exercises as any[], {
      objective:            (goal ?? 'hypertrophy') as any,
      experience:           (experienceLevel ?? 'beginner') as any,
      limitations,
      liked_ids:            likedIds,
      disliked_ids:         dislikedIds,
      focus_muscle:         focusMuscle as MuscleGroup | null,
      available_equipment:  availableEquip.length > 0 ? availableEquip : undefined,
      mesocycle_number:     mesocycleNum,
      previous_exercise_ids: body.previousExerciseIds ?? [],
      exercises_per_session: builderOutput.exercises_per_session,
      muscle_groups_in_session: firstSession?.muscle_groups ?? [],
    });
    const selectionContext = formatSelectionForAI(selectionResult);

    // ── Bioimpedance extra rules ───────────────────────────────────────────────
    const bioRules: string[] = [];
    if (bioData?.visceral_fat_level && bioData.visceral_fat_level >= 10)
      bioRules.push('gordura_visceral≥10: priorizar compostos metabólicos');
    if (bioData?.body_fat_pct && bioData.body_fat_pct >= 28)
      bioRules.push('BF≥28%: exercícios multiarticulares de maior gasto calórico');
    if (bioData?.water_pct && bioData.water_pct < 50)
      bioRules.push('hidratação baixa: evitar intensidade máxima');
    const bioRulesStr = bioRules.length ? `\nRegras bioimpedância: ${bioRules.join('; ')}.` : '';

    // ── Exercise catalog ──────────────────────────────────────────────────────
    const catalog = (exercises as any[])
      .map((ex: any) => `${ex.id}|${ex.name}|${ex.muscle_group}${ex.difficulty === 'advanced' ? '[ADV]' : ''}`)
      .join('\n');

    // ── AI prompt (usando estrutura + seleção pré-filtrada) ───────────────────
    const userPrompt = `${structuredContext}${bioRulesStr}

${selectionContext}

Catálogo completo disponível para fallback (id|nome|grupo[ADV=avançado]):
${catalog}

Instrução: Selecione exercícios do catálogo respeitando EXATAMENTE a estrutura acima.
- Compostos primeiro, isolados depois
- ${builderOutput.sets_per_compound} séries nos compostos, ${builderOutput.sets_per_isolation} nos isolados
- Reps: ${builderOutput.rep_range.min}–${builderOutput.rep_range.max}, RIR ${builderOutput.rir_target}
- Descanso compostos: ${builderOutput.rest_compound_s}s, isolados: ${builderOutput.rest_isolation_s}s
- Nível avançado: notes="Top Set RIR${builderOutput.rir_target} + 2 Back-offs −10%"
${builderOutput.sessions.map(s => `Dia ${s.day_index} (${s.focus_label}): ${builderOutput.exercises_per_session} exercícios, grupos: ${s.muscle_groups.join(',')}`).join('\n')}

JSON puro: {"days":[{"dayIndex":0,"focusLabel":"...","exercises":[{"exerciseId":"ID","sets":4,"repsMin":8,"repsMax":15,"restSeconds":90,"notes":"RIR 2"}]}]}
${dayCount} dias (dayIndex 0–${dayCount - 1}). APENAS JSON.`;

    // ── Call AI ───────────────────────────────────────────────────────────────
    const provider = getDefaultProvider();
    let fullText = '';
    for await (const chunk of provider.stream({
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt: EDN_SYSTEM_PROMPT,
      maxTokens: 2500,
    })) {
      if (chunk.text) fullText += chunk.text;
    }

    // ── Parse & validate JSON ─────────────────────────────────────────────────
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI não retornou JSON válido', raw: fullText }, { status: 422 });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed?.days || !Array.isArray(parsed.days))
      return Response.json({ error: 'Estrutura JSON inválida', raw: fullText }, { status: 422 });

    const validIds = new Set((exercises as any[]).map((ex: any) => ex.id));
    for (const day of parsed.days) {
      day.exercises = (day.exercises ?? []).filter((ex: any) => validIds.has(ex.exerciseId));
    }

    // ── Return plan + full builder metadata ───────────────────────────────────
    return Response.json({
      days: parsed.days,
      builder: {
        split_type:        builderOutput.split_type,
        selection_explanation: selectionResult.explanation,
        selection_bullets:     selectionResult.reasoning_bullets,
        difficulty_score:  builderOutput.difficulty_score,
        difficulty_label:  builderOutput.difficulty_label,
        reasoning:         builderOutput.reasoning,
        reasoning_points:  builderOutput.reasoning_points,
        jayme_quote:       builderOutput.jayme_quote,
        adaptation_hint:   builderOutput.adaptation_hint,
        rir_target:        builderOutput.rir_target,
        rep_range:         builderOutput.rep_range,
        focus_muscle:      focusMuscle ?? null,
      },
    });
  } catch (err: any) {
    console.error('[generate-workout] error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
