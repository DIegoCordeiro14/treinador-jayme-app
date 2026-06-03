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

// ─── POST /api/generate-workout ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let whyText = ''; // declared outside try so catch can always return it
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

    // ─── Fetch profile (sex, main_goal, aesthetic_goal) ───────────────────────
    const [{ data: profileData }, { data: bioData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('gender, main_goal, aesthetic_goal, limitations, available_equipment')
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

    // ─── Resolve sex ──────────────────────────────────────────────────────────
    const gender = profileData?.gender ?? null;
    const sex: SexType | null = gender === 'male' || gender === 'female' ? gender : null;
    const mainGoal  = profileData?.main_goal ?? goal ?? 'hypertrophy';
    const aestheticGoal = profileData?.aesthetic_goal ?? null;

    // ─── Biometrics (bioimpedance > manual) ───────────────────────────────────
    const effectiveWeight  = bioData?.weight_kg  ?? weightKg;
    const effectiveBF      = bioData?.body_fat_pct ?? bodyFatPct;
    const effectiveBmi     = bioData?.bmi ?? (weightKg && heightCm ? parseFloat((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1)) : null);
    const muscleMassKg     = bioData?.skeletal_muscle_mass_kg ?? null;

    const biometricCtx = [
      effectiveWeight ? `peso=${effectiveWeight}kg`  : null,
      heightCm        ? `altura=${heightCm}cm`        : null,
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
    const levelRule = levelRulesMap[experienceLevel] ?? levelRulesMap['beginner'];

    // ─── V3.2: Build "Por que este treino?" rationale (pure logic, always works) ─
    whyText = buildWorkoutRationale({
      sex,
      mainGoal,
      aestheticGoal,
      experience: (experienceLevel ?? 'beginner') as ExperienceLevel,
      bodyFatPct: effectiveBF ?? null,
      muscleMassKg,
      daysPerWeek,
      effectiveObjective,
    });

    // ─── Exercise catalog ──────────────────────────────────────────────────────
    const exerciseCatalog = (exercises as any[])
      .map((ex: any) => `${ex.id}|${ex.name}${ex.difficulty === 'advanced' ? '[ADV]' : ''}`)
      .join('\n');

    // ─── Prompt ───────────────────────────────────────────────────────────────
    const userPrompt = `Nível: ${levelRule}
Crie plano EDN. Perfil: ${goalMap[effectiveObjective] ?? objMap[effectiveObjective] ?? mainGoal}, ${daysPerWeek}dias/sem, ${levelMap[experienceLevel] ?? experienceLevel}, ${biometricCtx}.${bioCtx}${sexRuleStr}${sexRulesStr}${aestheticRuleStr}${bfOverrideStr}

Regras base: iniciante=sem[ADV]; definição/emagrecimento=12-20rep,45-75s,3-4s; hipertrofia=8-15rep,75-90s,3-4s; força=4-8rep,120-180s,4-5s; compostos antes isolados; ${dayCount} dias equilibrados; 4-7ex/dia.${bioRulesStr}

IDs disponíveis (id|nome, [ADV]=avançado):
${exerciseCatalog}
JSON puro (sem markdown): {"days":[{"dayIndex":0,"focusLabel":"Peito+Tríceps","exercises":[{"exerciseId":"ID","sets":4,"repsMin":10,"repsMax":15,"restSeconds":75,"notes":"RIR 2"}]}]}
${dayCount} dias (dayIndex 0-${dayCount - 1}). APENAS JSON.`;

    // ─── AI call: complete() é mais estável que stream() para geração de JSON ────
    // stream() pode travar em cold starts no Vercel; complete() é um POST simples
    let fullText = "";
    // System prompt focado em geração JSON — não usar EDN_SYSTEM_PROMPT (persona de coach gera texto extra)
    const JSON_GENERATION_PROMPT = "Você é um gerador de planos de treino. Responda APENAS com JSON válido. Sem markdown. Sem \`\`\`json. Sem texto antes ou depois. Sua resposta começa com { e termina com }. Estrutura obrigatória: {\"days\":[{\"dayIndex\":0,\"focusLabel\":\"...\",\"exercises\":[{\"exerciseId\":\"...\",\"sets\":3,\"repsMin\":10,\"repsMax\":15,\"restSeconds\":75,\"notes\":\"...\"}]}]}";
    const aiResult = await Promise.race([
      provider.complete({
        messages: [{ role: "user", content: userPrompt }],
        systemPrompt: JSON_GENERATION_PROMPT,
        maxTokens: 1800,  // 4 dias × 6-7 ex × UUID(36ch)+campos = ~1400-1600 tokens
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), 25000)
      ),
    ]);
    fullText = aiResult;

    // ─── Parse JSON ───────────────────────────────────────────────────────────
    // Extrai o primeiro objeto JSON balanceado (evita regex greedy capturar {} em texto após o JSON)
    function extractBalancedJSON(text: string): string | null {
      let depth = 0, start = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (text[i] === '}') { depth--; if (depth === 0 && start !== -1) return text.slice(start, i + 1); }
      }
      return null;
    }
    // Strip markdown code blocks que o Haiku gera mesmo com instrução "sem markdown"
    const strippedText = fullText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const rawJson = extractBalancedJSON(strippedText);
    if (!rawJson) {
      console.error("[generate-workout] sem JSON na resposta. fullText:", JSON.stringify(fullText.slice(0, 500)));
      return Response.json({ days: [], whyText, aiError: true, error: "AI não retornou JSON" }, { status: 200 });
    }
    // Limpar trailing commas que o Haiku gera
    const cleanJson = rawJson
      .replace(/,\s*([\]\}])/g, '$1')
      .replace(/([\[,])\s*,/g, '$1');

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error("[generate-workout] JSON parse failed:", (parseErr as Error).message, "\nraw (300):", cleanJson.slice(0, 300));
      return Response.json({ days: [], whyText, aiError: true, error: "JSON inválido do modelo" }, { status: 200 });
    }
    if (!parsed?.days || !Array.isArray(parsed.days)) {
      return Response.json({ days: [], whyText, aiError: true, error: "Estrutura JSON inválida" }, { status: 200 });
    }

    const validIds = new Set((exercises as any[]).map((ex: any) => ex.id));
    for (const day of parsed.days) {
      day.exercises = (day.exercises ?? []).filter((ex: any) => validIds.has(ex.exerciseId));
    }

    return Response.json({ days: parsed.days, whyText, effectiveObjective });
  } catch (err: any) {
    console.error("[generate-workout] error:", err);
    // AI falhou — retornar 200 com whyText para o client mostrar o card
    return Response.json({ days: [], whyText, aiError: true, error: err?.message ?? "Erro interno" }, { status: 200 });
  }
}
