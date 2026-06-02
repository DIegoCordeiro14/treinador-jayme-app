import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDefaultProvider, EDN_SYSTEM_PROMPT } from "@/lib/ai-coach";

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
      gender,    // 'male' | 'female' | 'other' | null
      age,       // number | null
      exercises, // Exercise[] — full list with id, name, muscle_group, difficulty
      dayCount,  // number of workout_days in the plan
    } = body;

    const provider = getDefaultProvider();

    // ─── Fetch latest bioimpedance data ────────────────────────────────────────
    const { data: bioData } = await supabase
      .from('bioimpedance_data')
      .select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,water_pct,visceral_fat_level,basal_metabolic_rate_kcal,protein_pct,bone_mass_kg,body_type,body_score,lean_mass_kg')
      .eq('user_id', user.id)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ─── Exercise catalog ──────────────────────────────────────────────────────
    const exerciseCatalog = (exercises as any[])
      .map((ex: any) => `${ex.id}|${ex.name}${ex.difficulty === 'advanced' ? '[ADV]' : ''}`)
      .join('\n');

    // ─── Biometric context (prefer bioimpedance over manual input) ─────────────
    const effectiveWeight = bioData?.weight_kg ?? weightKg;
    const effectiveBmi    = bioData?.bmi ?? (weightKg && heightCm ? parseFloat((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1)) : null);
    const effectiveBF     = bioData?.body_fat_pct ?? bodyFatPct;

    const biometricCtx = [
      effectiveWeight ? `peso=${effectiveWeight}kg` : null,
      heightCm        ? `altura=${heightCm}cm` : null,
      effectiveBmi    ? `IMC=${effectiveBmi}` : null,
      effectiveBF     ? `BF=${effectiveBF}%` : null,
    ].filter(Boolean).join(' ') || 'n/a';

    // ─── Bioimpedance context (extra intelligence when available) ──────────────
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
    const bioCtx = bioCtxParts.length > 0
      ? `\nBioimpedância: ${bioCtxParts.join(' ')}.`
      : '';

    // ─── EDN bioimpedance-specific rules ──────────────────────────────────────
    const bioRules: string[] = [];
    if (bioData?.visceral_fat_level && bioData.visceral_fat_level >= 10) {
      bioRules.push('gordura_visceral≥10=priorizar compostos metabólicos e volume moderado');
    }
    if (effectiveBmi && effectiveBmi >= 28) {
      bioRules.push('IMC≥28=preferir máquinas nos membros inferiores, reduzir impacto articular');
    }
    if (bioData?.body_fat_pct && bioData.body_fat_pct >= 28) {
      bioRules.push('BF≥28%=adicionar exercícios multiarticulares de maior gasto calórico');
    }
    if (bioData?.water_pct && bioData.water_pct < 50) {
      bioRules.push('hidratação_baixa=evitar exercícios de altíssima intensidade, preferir volume moderado');
    }
    if (bioData?.protein_pct && bioData.protein_pct < 17) {
      bioRules.push('proteína_baixa=anotar nas notes que o usuário precisa aumentar ingestão proteica');
    }
    const bioRulesStr = bioRules.length > 0 ? `\nRegras extras (bioimpedância): ${bioRules.join('; ')}.` : '';

    // ─── Gender & age rules ────────────────────────────────────────────────────
    const genderMap: Record<string, string> = { male: 'Masculino', female: 'Feminino', other: 'Outro' };
    const genderStr = gender ? genderMap[gender] ?? '' : '';
    const ageStr = age ? `${age}anos` : '';
    const profileCtx = [genderStr, ageStr].filter(Boolean).join(', ');

    const genderRules: string[] = [];
    if (gender === 'female') {
      genderRules.push('sexo=feminino → maior tolerância a volume, prefira 4-5 séries em multiarticulares, inclua mais glúteos e isquiotibiais, descanso 60-75s, mais exercícios unilaterais');
    }
    if (age && age >= 40) {
      genderRules.push(`idade≥40 → priorize mobilidade articular no aquecimento, avoid high-impact moves, descanso mínimo 90s, progressão conservadora`);
    } else if (age && age >= 50) {
      genderRules.push(`idade≥50 → exercícios de baixo impacto, evite cargas máximas, inclua exercícios de equilíbrio e estabilidade`);
    }
    const genderRulesStr = genderRules.length > 0 ? `\nRegras por perfil (sexo/idade): ${genderRules.join('; ')}.` : '';

    const goalMap: Record<string, string> = {
      definition: 'Definição',
      weight_loss: 'Emagrecimento',
      hypertrophy: 'Hipertrofia',
      strength: 'Força',
    };
    const levelMap: Record<string, string> = {
      beginner: 'Iniciante',
      intermediate: 'Intermediário',
      advanced: 'Avançado',
    };

    // ─── Level-specific training rules ────────────────────────────────────────
    const levelRulesMap: Record<string, string> = {
      beginner:     'Iniciante: sem[ADV]; 3séries; RIR 3-4; 4-5ex/dia; descanso+30s; notes="foco na técnica"',
      intermediate: 'Intermediário: [ADV]opcionais; 4séries; RIR 2-3; 5-6ex/dia; notes="RIR atual"',
      advanced:     'Avançado(atleta natural profissional): todos[ADV] prioritários; compostos=TopSet+2BackOffs(−10%carga)=5-6séries totais; isolados=4-5séries; RIR 0-2; 6-8ex/dia; descanso compostos=120-180s; descanso isolados=60-90s; notes="Top Set RIR[n] + 2 Back-offs −10%"',
    };
    con