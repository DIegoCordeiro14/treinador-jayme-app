/**
 * Nutrition Autopilot — EDN V6.5 (Pilar 6)
 * Recalcula automaticamente TDEE, calorias e macros a partir dos dados
 * MAIS RECENTES de bioimpedância — nunca pede ao usuário o que já existe.
 *
 * Prioridade de fontes:
 *  1. TMB medida pela bioimpedância (Katch-McArdle implícito no aparelho)
 *  2. Katch-McArdle calculado da massa magra (quando há BF%)
 *  3. Mifflin-St Jeor (peso/altura/idade/sexo do perfil)
 */

export interface NutritionAutopilotInput {
  // Bioimpedância (mais recente — pode ser null)
  bio: {
    weight_kg: number | null;
    body_fat_pct: number | null;
    lean_mass_kg: number | null;
    basal_metabolic_rate_kcal: number | null;
    measured_at?: string | null;
  } | null;
  // Perfil (fallback + contexto)
  profile: {
    weight_kg: number | null;
    height_cm: number | null;
    age: number | null;
    gender: string | null;          // male | female
    main_goal: string | null;       // fat_loss | hypertrophy | recomposition | performance
    weekly_frequency: number | null;
    work_type: string | null;       // sedentary | moderate | active
    cardio_frequency: string | null;// none | 1_2x | 3_4x | 5x_plus
    meals_per_day: number | null;
  };
}

export interface NutritionTargets {
  tmbKcal: number;
  tdeeKcal: number;
  activityFactor: number;
  targetKcal: number;          // TDEE ± ajuste do objetivo
  goalAdjustmentKcal: number;  // ex: -400 (déficit) ou +250 (superávit)
  proteinG: number;
  proteinGPerKg: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  source: 'bioimpedance_tmb' | 'katch_mcardle' | 'mifflin';
  explanation: string[];       // Camada 2 — como cada número foi calculado
}

export function computeNutritionTargets(input: NutritionAutopilotInput): NutritionTargets | null {
  const { bio, profile } = input;
  const weight = bio?.weight_kg ?? profile.weight_kg;
  if (!weight) return null; // sem peso não há prescrição

  const explanation: string[] = [];

  // ── 1. TMB ─────────────────────────────────────────────────────────────────
  let tmb: number;
  let source: NutritionTargets['source'];

  if (bio?.basal_metabolic_rate_kcal) {
    tmb = bio.basal_metabolic_rate_kcal;
    source = 'bioimpedance_tmb';
    explanation.push(`TMB ${Math.round(tmb)}kcal medida pela bioimpedância${bio.measured_at ? ` (${bio.measured_at.slice(0, 10)})` : ''}.`);
  } else if (bio?.body_fat_pct != null || bio?.lean_mass_kg != null) {
    const leanMass = bio.lean_mass_kg ?? weight * (1 - (bio.body_fat_pct ?? 20) / 100);
    tmb = 370 + 21.6 * leanMass;
    source = 'katch_mcardle';
    explanation.push(`TMB ${Math.round(tmb)}kcal via Katch-McArdle (massa magra ${leanMass.toFixed(1)}kg da bioimpedância).`);
  } else {
    const h = profile.height_cm ?? 175;
    const a = profile.age ?? 30;
    tmb = profile.gender === 'female'
      ? 10 * weight + 6.25 * h - 5 * a - 161
      : 10 * weight + 6.25 * h - 5 * a + 5;
    source = 'mifflin';
    explanation.push(`TMB ${Math.round(tmb)}kcal via Mifflin-St Jeor (sem bioimpedância — importe uma para maior precisão).`);
  }

  // ── 2. Fator de atividade → TDEE ──────────────────────────────────────────
  const freq = profile.weekly_frequency ?? 3;
  let af = 1.2; // sedentário base
  af += Math.min(0.25, freq * 0.04); // treinos de força
  if (profile.work_type === 'moderate') af += 0.05;
  if (profile.work_type === 'active') af += 0.12;
  if (profile.cardio_frequency === '1_2x') af += 0.03;
  else if (profile.cardio_frequency === '3_4x') af += 0.06;
  else if (profile.cardio_frequency === '5x_plus') af += 0.1;
  af = Math.round(af * 100) / 100;

  const tdee = Math.round(tmb * af);
  explanation.push(`TDEE ${tdee}kcal = TMB × ${af} (${freq}x musculação/sem, trabalho ${profile.work_type ?? 'n/d'}, cardio ${profile.cardio_frequency ?? 'n/d'}).`);

  // ── 3. Ajuste pelo objetivo ───────────────────────────────────────────────
  const goal = profile.main_goal ?? 'hypertrophy';
  let adj = 0;
  if (goal === 'fat_loss') adj = -Math.round(Math.min(500, tdee * 0.18));
  else if (goal === 'hypertrophy') adj = 250;
  else if (goal === 'recomposition') adj = -150;
  else adj = 0; // performance: manutenção
  const targetKcal = tdee + adj;
  explanation.push(adj === 0
    ? `Alvo ${targetKcal}kcal — manutenção (objetivo: performance).`
    : `Alvo ${targetKcal}kcal — ${adj > 0 ? `superávit de +${adj}` : `déficit de ${adj}`}kcal para ${goal === 'fat_loss' ? 'emagrecimento' : goal === 'recomposition' ? 'recomposição' : 'hipertrofia'} sustentável de um natural.`);

  // ── 4. Macros ─────────────────────────────────────────────────────────────
  const bf = bio?.body_fat_pct ?? null;
  // Proteína por kg: mais alta em déficit/BF alto (preserva massa magra)
  const proteinPerKg = goal === 'fat_loss' || goal === 'recomposition'
    ? (bf != null && bf > 25 ? 2.0 : 2.2)
    : 1.8;
  const proteinG = Math.round(weight * proteinPerKg);
  const fatG = Math.round((targetKcal * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4));
  explanation.push(`Proteína ${proteinG}g (${proteinPerKg}g/kg), gordura ${fatG}g (25% das kcal), carboidrato ${carbsG}g (restante — combustível do treino).`);

  // ── 5. Água ───────────────────────────────────────────────────────────────
  const waterMl = Math.round((weight * 40) / 100) * 100;

  return {
    tmbKcal: Math.round(tmb),
    tdeeKcal: tdee,
    activityFactor: af,
    targetKcal,
    goalAdjustmentKcal: adj,
    proteinG,
    proteinGPerKg: proteinPerKg,
    carbsG,
    fatG,
    waterMl,
    source,
    explanation,
  };
}
