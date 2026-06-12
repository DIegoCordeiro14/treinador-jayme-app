import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDefaultProvider, EDN_SYSTEM_PROMPT } from "@/lib/ai-coach";
import {
  getEffectiveObjective,
  getSexMuscleOrder,
  buildWorkoutRationale,
  type SexType,
  type ExperienceLevel,
} from "@/lib/edn/exercise-selector";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Types ────────────────────────────────────────────────────────────────────
export type AIWorkoutDay = {
  dayIndex: number;
  focusLabel: string;
  exercises: Array<{
    exerciseId: string;
    sets: number;
    repsMin: number;
    repsMax: number;
    restSeconds: number;
    notes: string;
  }>;
};

// ─── Módulo 0 — label helpers ────────────────────────────────────────────────
const MUSCLE_PT: Record<string, string> = {
  chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Bíceps',
  triceps: 'Tríceps', legs: 'Pernas', glutes: 'Glúteos', abs: 'Abdômen',
  calves: 'Panturrilha', forearms: 'Antebraço', full_body: 'Corpo Todo',
};
const SLEEP_PT: Record<string, string> = { lt_5h: '<5h', '5_6h': '5-6h', '7_8h': '7-8h', gt_8h: '>8h' };
const STRESS_PT: Record<string, string> = { low: 'baixo', medium: 'médio', high: 'alto' };
const WORK_PT: Record<string, string> = { sedentary: 'sedentário', moderate: 'moderadamente ativo', active: 'muito ativo' };
const CARDIO_PT: Record<string, string> = { none: 'nenhum', '1_2x': '1-2x/sem', '3_4x': '3-4x/sem', '5x_plus': '5x+/sem' };
const LOCATION_PT: Record<string, string> = { full_gym: 'academia completa', basic_gym: 'academia básica', condo: 'condomínio', home: 'casa', bodyweight: 'apenas peso corporal' };
const YEARS_PT: Record<string, string> = { lt_6m: '<6 meses', '6m_2y': '6m-2anos', '2y_5y': '2-5anos', gt_5y: '>5anos' };
const LIMITATION_PT: Record<string, string> = { shoulder: 'ombro', knee: 'joelho', lower_back: 'lombar', hip: 'quadril', elbow: 'cotovelo', wrist: 'punho' };

// ─── JSON repair (respostas truncadas da IA) ─────────────────────────────────
function repairWorkoutJson(raw: string): any | null {
  try {
    // Remove vírgula final antes de fechar colchete/chave
    let s = raw.replace(/,\s*([\]\}])/g, '$1');
    // Corta um possível objeto de exercício incompleto no final
    const lastComplete = s.lastIndexOf('}');
    if (lastComplete > 0) s = s.slice(0, lastComplete + 1);
    s = s.replace(/,\s*$/, '');
    // Fecha colchetes/chaves abertos na ordem correta usando uma pilha
    const stack: string[] = [];
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') stack.pop();
    }
    if (inStr) s += '"';
    while (stack.length > 0) {
      const open = stack.pop();
      s += open === '[' ? ']' : '}';
    }
    return JSON.parse(s);
  } catch { return null; }
}

// ─── POST /api/generate-workout ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let whyText = "";
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      goal,
      daysPerWeek,
      experienceLevel,
      weightKg,
      heightCm,
      bodyFatPct,
      exercises,
      dayCount,
    } = body;

    const provider = getDefaultProvider();

    // ─── Módulo 0: Fetch FULL anamnese profile + bioimpedance ─────────────────
    const [{ data: profileData }, { data: bioData }] = await Promise.all([
      supabase
        .from('profiles')
        .select(`gender, age, weight_kg, height_cm, main_goal, aesthetic_goal,
          priority_muscle_1, priority_muscle_2,
          experience_level, training_years, has_periodization_exp, knows_rir,
          has_used_top_set, has_used_back_off, has_used_deload,
          weekly_frequency, session_duration_min, preferred_time,
          training_location, available_equipment,
          sleep_hours, sleep_quality, stress_level, work_type,
          cardio_frequency, cardio_types,
          limitations, limitation_description,
          favorite_exercises, disliked_exercises, forbidden_exercises,
          edn_phase, progression_potential, recommended_complexity, profile_completion_pct`)
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('bioimpedance_data')
        .select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,water_pct,visceral_fat_level,basal_metabolic_rate_kcal,protein_pct,bone_mass_kg,body_type,body_score,lean_mass_kg')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // ─── Módulo 0: Gate — anamnese mínima de 80% ──────────────────────────────
    const completionPct = profileData?.profile_completion_pct ?? 0;
    if (completionPct < 80) {
      return Response.json({
        error: "profile_incomplete",
        message: `Perfil ${completionPct}% completo. O Coach EDN precisa de pelo menos 80% da anamnese preenchida para prescrever um treino personalizado. Complete seu perfil.`,
        completionPct,
      }, { status: 412 });
    }

    // ─── Resolve sex ──────────────────────────────────────────────────────────
    const gender = profileData?.gender ?? null;
    const sex: SexType | null = gender === 'male' || gender === 'female' ? gender : null;
    const mainGoal  = profileData?.main_goal ?? goal ?? 'hypertrophy';
    const aestheticGoal = profileData?.aesthetic_goal ?? null;
    const effectiveExperience = profileData?.experience_level ?? experienceLevel ?? 'beginner';

    // ─── Biometrics (bioimpedance > manual) ───────────────────────────────────
    const effectiveWeight  = bioData?.weight_kg  ?? profileData?.weight_kg ?? weightKg;
    const effectiveHeight  = profileData?.height_cm ?? heightCm;
    const effectiveBF      = bioData?.body_fat_pct ?? bodyFatPct;
    const effectiveBmi     = bioData?.bmi ?? (effectiveWeight && effectiveHeight ? parseFloat((effectiveWeight / Math.pow(effectiveHeight / 100, 2)).toFixed(1)) : null);
    const muscleMassKg     = bioData?.skeletal_muscle_mass_kg ?? null;

    const biometricCtx = [
      profileData?.age ? `idade=${profileData.age}` : null,
      effectiveWeight ? `peso=${effectiveWeight}kg`  : null,
      effectiveHeight ? `altura=${effectiveHeight}cm` : null,
      effectiveBmi    ? `IMC=${effectiveBmi}`          : null,
      effectiveBF     ? `BF=${effectiveBF}%`           : null,
    ].filter(Boolean).join(' ') || 'n/a';

    const bioCtxParts: string[] = [];
    if (bioData) {
      if (bioData.skeletal_muscle_mass_kg) bioCtxParts.push(`músculo=${bioData.skeletal_muscle_mass_kg}kg`);
      if (bioData.lean_mass_kg)            bioCtxParts.push(`massa_magra=${bioData.lean_mass_kg}kg`);
      if (bioData.water_pct)               bioCtxParts.push(`água=${bioData.water_pct}%`);
      if (bioData.visceral_fat_level)      bioCtxParts.push(`visceral=nível${bioData.visceral_fat_level}`);
      if (bioData.basal_metabolic_rate_kcal) bioCtxParts.push(`TMB=${bioData.basal_metabolic_rate_kcal}kcal`);
      if (bioData.protein_pct)             bioCtxParts.push(`proteína=${bioData.protein_pct}%`);
      if (bioData.body_type)               bioCtxParts.push(`tipo_corpo=${bioData.body_type}`);
    }
    const bioCtx = bioCtxParts.length > 0 ? `\nBioimpedância: ${bioCtxParts.join(' ')}.` : '';

    // ─── V3.2: BF Override + Effective Objective ─────────────────────────────
    const effectiveObjective = getEffectiveObjective(mainGoal, sex, effectiveBF ?? null);
    const bfOverrideApplied  = effectiveObjective === 'recomp' && !mainGoal.includes('recomp');

    // ─── V3.2: Sex-based muscle group priority string ─────────────────────────
    const muscleOrder = sex ? getSexMuscleOrder(sex, aestheticGoal ?? undefined) : null;
    const sexRuleStr = muscleOrder
      ? `\nPrioridade muscular (${sex === 'male' ? 'Masculino' : 'Feminino'}${aestheticGoal ? ` · Foco: ${aestheticGoal}` : ''}): ${muscleOrder.slice(0, 6).join(' > ')}.`
      : '';

    // ─── V3.2: Sex-specific exercise rules ───────────────────────────────────
    const sexExerciseRules: string[] = [];
    if (sex === 'female') {
      sexExerciseRules.push('feminino=priorizar Hip Thrust, Agachamento Búlgaro, Terra Romeno, Leg Press, Abdutora, Coice para glúteos e posteriores');
      sexExerciseRules.push('feminino=evitar dependência de cardio; usar musculação progressiva para emagrecimento');
    } else if (sex === 'male') {
      sexExerciseRules.push('masculino=maior volume em Supinos, Remadas, Barras Fixas, Desenvolvimentos para shape em V');
      sexExerciseRules.push('masculino=incluir pelo menos 1 exercício heavy compound por sessão (barbell)');
    }
    const sexRulesStr = sexExerciseRules.length > 0 ? `\nRegras por sexo: ${sexExerciseRules.join('; ')}.` : '';

    // ─── V3.2: Aesthetic goal rules ───────────────────────────────────────────
    const aestheticRuleStr = aestheticGoal
      ? `\nObjetivo estético declarado: ${aestheticGoal} — concentre 40% do volume neste grupo muscular.`
      : '';

    // ─── V3.2: BF override rule ───────────────────────────────────────────────
    const bfOverrideStr = bfOverrideApplied
      ? `\nBF override: usuário declarou ${mainGoal} mas BF=${effectiveBF}% exige recomposição — priorize multiarticulares metabólicos + menor descanso (45-60s).`
      : '';

    // ─── Módulo 0 BLOCO 3: Prioridades musculares ─────────────────────────────
    const priorities = [profileData?.priority_muscle_1, profileData?.priority_muscle_2].filter(Boolean) as string[];
    const prioritiesStr = priorities.length > 0
      ? `\nPRIORIDADES MUSCULARES do atleta: ${priorities.map((m, i) => `${i + 1}º ${MUSCLE_PT[m] ?? m}`).join(', ')} — estes grupos recebem MAIOR frequência (2x/sem se possível), MAIOR volume (+30%) e prioridade na progressão. Posicione-os no início das sessões.`
      : '';

    // ─── Módulo 0 BLOCO 4: Experiência real ───────────────────────────────────
    const expParts: string[] = [];
    if (profileData?.training_years) expParts.push(`tempo_treino=${YEARS_PT[profileData.training_years] ?? profileData.training_years}`);
    if (profileData?.has_periodization_exp != null) expParts.push(`periodização=${profileData.has_periodization_exp ? 'sim' : 'não'}`);
    if (profileData?.knows_rir != null) expParts.push(`conhece_RIR=${profileData.knows_rir ? 'sim' : 'não'}`);
    if (profileData?.has_used_top_set) expParts.push('já_usou_top_set');
    if (profileData?.has_used_back_off) expParts.push('já_usou_back_off');
    if (profileData?.has_used_deload) expParts.push('já_usou_deload');
    const knowsRir = profileData?.knows_rir ?? false;
    const expStr = expParts.length > 0
      ? `\nExperiência real: ${expParts.join(' ')}.${!knowsRir ? ' Atleta NÃO conhece RIR — escreva notes em linguagem simples ("pare 2-3 reps antes da falha") em vez de "RIR 2-3".' : ''}`
      : '';

    // ─── Módulo 0 BLOCO 5: Disponibilidade (tempo de sessão) ──────────────────
    const sessionMin = profileData?.session_duration_min ?? null;
    let maxExPerDay: number | null = null;
    if (sessionMin) {
      maxExPerDay = sessionMin <= 30 ? 4 : sessionMin <= 45 ? 5 : sessionMin <= 60 ? 6 : sessionMin <= 75 ? 7 : 8;
    }
    const availabilityStr = sessionMin
      ? `\nDisponibilidade: ${sessionMin}min/sessão${profileData?.preferred_time ? ` (${profileData.preferred_time === 'morning' ? 'manhã' : profileData.preferred_time === 'afternoon' ? 'tarde' : 'noite'})` : ''} — MÁXIMO ${maxExPerDay} exercícios/dia para caber no tempo. ${sessionMin <= 45 ? 'Priorize compostos e considere bi-sets nos isolados.' : ''}`
      : '';

    // ─── Módulo 0 BLOCO 6: Estrutura disponível ───────────────────────────────
    const equipment = (profileData?.available_equipment as string[] | null) ?? [];
    const structureStr = profileData?.training_location || equipment.length > 0
      ? `\nEstrutura: local=${LOCATION_PT[profileData?.training_location ?? ''] ?? 'n/a'}${equipment.length > 0 ? ` equipamentos=[${equipment.join(',')}]` : ''} — use APENAS exercícios compatíveis com os equipamentos disponíveis.`
      : '';

    // ─── Módulo 0 BLOCO 7: Recovery profile ───────────────────────────────────
    const recoveryParts: string[] = [];
    if (profileData?.sleep_hours) recoveryParts.push(`sono=${SLEEP_PT[profileData.sleep_hours] ?? profileData.sleep_hours}`);
    if (profileData?.sleep_quality) recoveryParts.push(`qualidade_sono=${profileData.sleep_quality}`);
    if (profileData?.stress_level) recoveryParts.push(`estresse=${STRESS_PT[profileData.stress_level] ?? profileData.stress_level}`);
    if (profileData?.work_type) recoveryParts.push(`trabalho=${WORK_PT[profileData.work_type] ?? profileData.work_type}`);
    const poorRecovery = profileData?.sleep_hours === 'lt_5h' || profileData?.stress_level === 'high' || profileData?.sleep_quality === 'poor';
    const recoveryStr = recoveryParts.length > 0
      ? `\nRecovery profile: ${recoveryParts.join(' ')}.${poorRecovery ? ' RECUPERAÇÃO COMPROMETIDA — reduza volume total em ~20%, evite falha concêntrica, aumente descanso entre séries e distribua grupos grandes em dias não consecutivos.' : ''}`
      : '';

    // ─── Módulo 0 BLOCO 8: Cardio atual ──────────────────────────────────────
    const cardioTypes = (profileData?.cardio_types as string[] | null) ?? [];
    const cardioStr = profileData?.cardio_frequency
      ? `\nCardio atual: ${CARDIO_PT[profileData.cardio_frequency] ?? profileData.cardio_frequency}${cardioTypes.length > 0 ? ` (${cardioTypes.join(',')})` : ''} — considere a fadiga sistêmica do cardio ao distribuir volume de pernas.`
      : '';

    // ─── Módulo 0 BLOCO 9: Limitações ────────────────────────────────────────
    const limitations = (profileData?.limitations as string[] | null) ?? [];
    const limitationStr = limitations.length > 0 || profileData?.limitation_description
      ? `\nLIMITAÇÕES FÍSICAS: ${limitations.map((l) => LIMITATION_PT[l] ?? l).join(', ') || 'ver descrição'}${profileData?.limitation_description ? ` — "${profileData.limitation_description}"` : ''}. EVITE exercícios que sobrecarreguem essas articulações; prefira máquinas/variações seguras e anote alternativas nas notes.`
      : '';

    // ─── Módulo 0 BLOCO 10: Preferências (proibidos filtrados do catálogo) ────
    const forbiddenIds = new Set(((profileData?.forbidden_exercises as string[] | null) ?? []));
    const dislikedIds = new Set(((profileData?.disliked_exercises as string[] | null) ?? []));
    const favoriteIds = new Set(((profileData?.favorite_exercises as string[] | null) ?? []));
    const allowedExercises = (exercises as any[]).filter((ex: any) => !forbiddenIds.has(ex.id));
    const favoriteNames = allowedExercises.filter((ex: any) => favoriteIds.has(ex.id)).map((ex: any) => ex.name);
    const dislikedNames = allowedExercises.filter((ex: any) => dislikedIds.has(ex.id)).map((ex: any) => ex.name);
    const preferencesStr = (favoriteNames.length > 0 || dislikedNames.length > 0)
      ? `\nPreferências: ${favoriteNames.length > 0 ? `FAVORITOS (incluir quando coerente): ${favoriteNames.slice(0, 8).join(', ')}. ` : ''}${dislikedNames.length > 0 ? `NÃO GOSTA (usar somente se não houver alternativa): ${dislikedNames.slice(0, 8).join(', ')}.` : ''}`
      : '';

    // ─── Módulo 0 BLOCO 11: Avaliação automática EDN ──────────────────────────
    const ednEvalStr = profileData?.edn_phase
      ? `\nAvaliação EDN: fase=${profileData.edn_phase} potencial_progressão=${profileData.progression_potential ?? 'n/a'}/100 complexidade_recomendada=${profileData.recommended_complexity ?? 'n/a'} — alinhe a estrutura do plano a esta fase.`
      : '';

    // ─── EDN bioimpedance-specific rules ──────────────────────────────────────
    const bioRules: string[] = [];
    if (bioData?.visceral_fat_level && bioData.visceral_fat_level >= 10)
      bioRules.push('gordura_visceral≥10=priorizar compostos metabólicos e volume moderado');
    if (effectiveBmi && effectiveBmi >= 28)
      bioRules.push('IMC≥28=preferir máquinas nos membros inferiores, reduzir impacto articular');
    if (effectiveBF && effectiveBF >= 28)
      bioRules.push('BF≥28%=adicionar exercícios multiarticulares de maior gasto calórico');
    if (bioData?.water_pct && bioData.water_pct < 50)
      bioRules.push('hidratação_baixa=evitar altíssima intensidade, preferir volume moderado');
    if (bioData?.protein_pct && bioData.protein_pct < 17)
      bioRules.push('proteína_baixa=anotar nas notes que o usuário precisa aumentar ingestão proteica');
    const bioRulesStr = bioRules.length > 0 ? `\nRegras extras (bioimpedância): ${bioRules.join('; ')}.` : '';

    const goalMap: Record<string, string> = {
      fat_loss: 'Emagrecimento', weight_loss: 'Emagrecimento',
      hypertrophy: 'Hipertrofia', recomposition: 'Recomposição Corporal',
      performance: 'Performance', definition: 'Definição', strength: 'Força',
    };
    const levelMap: Record<string, string> = {
      beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado',
    };
    const objMap: Record<string, string> = {
      hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', definition: 'Definição',
      strength: 'Força', recomp: 'Recomposição', running: 'Performance', health: 'Saúde',
    };

    const levelRulesMap: Record<string, string> = {
      beginner:     'Iniciante: sem[ADV]; 3séries; RIR 3-4; 4-5ex/dia; descanso+30s; notes="foco na técnica"',
      intermediate: 'Intermediário: [ADV]opcionais; 4séries; RIR 2-3; 5-6ex/dia; notes="RIR atual"',
      advanced:     'Avançado(atleta natural profissional): todos[ADV] prioritários; compostos=TopSet+2BackOffs(−10%carga)=5-6séries totais; isolados=4-5séries; RIR 0-2; 6-8ex/dia; descanso compostos=120-180s; descanso isolados=60-90s; notes="Top Set RIR[n] + 2 Back-offs −10%"',
    };
    // Módulo 0: recommended_complexity da avaliação EDN sobrepõe o nível declarado
    const complexityToLevel: Record<string, string> = { basic: 'beginner', intermediate: 'intermediate', advanced: 'advanced' };
    const effectiveLevelKey = profileData?.recommended_complexity
      ? complexityToLevel[profileData.recommended_complexity] ?? effectiveExperience
      : effectiveExperience;
    const levelRule = levelRulesMap[effectiveLevelKey] ?? levelRulesMap['beginner'];

    // ─── V3.2: Build "Por que este treino?" rationale (pure logic, always works) ─
    whyText = buildWorkoutRationale({
      sex,
      mainGoal,
      aestheticGoal,
      experience: (effectiveLevelKey ?? 'beginner') as ExperienceLevel,
      bodyFatPct: effectiveBF ?? null,
      muscleMassKg,
      daysPerWeek,
      effectiveObjective,
    });

    // ─── Exercise catalog (já sem os PROIBIDOS — nunca sugeridos) ──────────────
    const exerciseCatalog = allowedExercises
      .map((ex: any) => `${ex.id}|${ex.name}${ex.difficulty === 'advanced' ? '[ADV]' : ''}`)
      .join('\n');

    // ─── Prompt ───────────────────────────────────────────────────────────────
    const userPrompt = `Nível: ${levelRule}
Crie plano EDN considerando o CONTEXTO COMPLETO do atleta (anamnese ${completionPct}% completa), como um treinador profissional em avaliação presencial. Perfil: ${goalMap[effectiveObjective] ?? objMap[effectiveObjective] ?? mainGoal}, ${daysPerWeek}dias/sem, ${levelMap[effectiveLevelKey] ?? effectiveLevelKey}, ${biometricCtx}.${bioCtx}${sexRuleStr}${sexRulesStr}${aestheticRuleStr}${bfOverrideStr}${prioritiesStr}${expStr}${availabilityStr}${structureStr}${recoveryStr}${cardioStr}${limitationStr}${preferencesStr}${ednEvalStr}

Regras base: iniciante=sem[ADV]; definição/emagrecimento=12-20rep,45-75s,3-4s; hipertrofia=8-15rep,75-90s,3-4s; força=4-8rep,120-180s,4-5s; compostos antes isolados; ${dayCount} dias equilibrados; ${maxExPerDay ? `máx ${maxExPerDay}ex/dia` : '4-7ex/dia'}.${bioRulesStr}

IDs disponíveis (id|nome, [ADV]=avançado):
${exerciseCatalog}
JSON puro (sem markdown): {"days":[{"dayIndex":0,"focusLabel":"Peito+Tríceps","exercises":[{"exerciseId":"ID","sets":4,"repsMin":10,"repsMax":15,"restSeconds":75,"notes":"RIR 2"}]}]}
Mantenha as notes com no máximo 6 palavras. ${dayCount} dias (dayIndex 0-${dayCount - 1}). APENAS JSON.`;

    // ─── AI call ──────────────────────────────────────────────────────────────
    let fullText = "";
    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: userPrompt }],
      systemPrompt: EDN_SYSTEM_PROMPT,
      maxTokens: 4000, // 2000 truncava o JSON em planos de 4+ dias
    })) {
      if (chunk.text) fullText += chunk.text;
    }

    // ─── Parse JSON (com limpeza de fences e reparo de truncamento) ───────────
    let cleaned = fullText.replace(/```json\n?|\n?```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart < 0) {
      return Response.json({ error: "AI não retornou JSON válido", raw: fullText.slice(0, 200) }, { status: 422 });
    }
    cleaned = cleaned.slice(jsonStart);

    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = repairWorkoutJson(cleaned);
    }

    if (!parsed?.days || !Array.isArray(parsed.days)) {
      return Response.json({ days: [], whyText, aiError: true, error: "Estrutura JSON inválida" }, { status: 200 });
    }

    // Validar IDs + garantir que PROIBIDOS jamais entrem no plano
    const validIds = new Set(allowedExercises.map((ex: any) => ex.id));
    for (const day of parsed.days) {
      day.exercises = (day.exercises ?? []).filter((ex: any) => validIds.has(ex.exerciseId) && !forbiddenIds.has(ex.exerciseId));
    }

    // ─── Isométricos: prescrever por TEMPO (segundos), nunca por reps ──────────
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allIds = [...new Set(parsed.days.flatMap((d: any) => (d.exercises ?? []).map((e: any) => e.exerciseId)))];
      if (allIds.length) {
        const { data: isoRows } = await supabase.from('exercises').select('id').eq('is_isometric', true).in('id', allIds as string[]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isoSet = new Set((isoRows ?? []).map((r: any) => r.id));
        for (const day of parsed.days) {
          for (const ex of (day.exercises ?? [])) {
            if (isoSet.has(ex.exerciseId)) { ex.repsMin = 30; ex.repsMax = 60; ex.notes = 'Sustentar 30-60s, técnica limpa'; }
          }
        }
      }
    } catch { /* não-fatal */ }

    return Response.json({ days: parsed.days, whyText, effectiveObjective, completionPct });
  } catch (err: any) {
    console.error("[generate-workout] error:", err);
    // AI falhou — retornar 200 com whyText para o client mostrar o card
    return Response.json({ days: [], whyText, aiError: true, error: err?.message ?? "Erro interno" }, { status: 200 });
  }
}
