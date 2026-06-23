/**
 * Nutrition Autopilot — EDN V7.0 (Nutricionista Esportivo Adaptativo)
 *
 * FONTE ÚNICA DE VERDADE DETERMINÍSTICA.
 * Este motor calcula TODOS os números (TMB, TDEE, calorias, macros, água,
 * day types) e deriva a estratégia (fase nutricional, "por que esse plano").
 * A IA NÃO calcula nada — apenas interpreta, explica, monta refeições e gera
 * alertas a partir do que sai daqui.
 *
 * Prioridade de fontes corporais:
 *  Peso:    bioimpedância → perfil
 *  TMB:     bioimpedância → Katch-McArdle (massa magra) → Mifflin-St Jeor
 *  Gordura: bioimpedância.body_fat_pct (nunca pergunta de novo se já existe)
 */

// ── Fases nutricionais ──────────────────────────────────────────────────────
export type NutritionPhase =
  | 'cutting'
  | 'definicao'
  | 'hipertrofia'
  | 'lean_bulk'
  | 'recomposicao'
  | 'performance'
  | 'manutencao';

export const PHASE_LABEL: Record<NutritionPhase, string> = {
  cutting: 'Cutting',
  definicao: 'Definição',
  hipertrofia: 'Hipertrofia',
  lean_bulk: 'Lean Bulk',
  recomposicao: 'Recomposição',
  performance: 'Performance',
  manutencao: 'Manutenção',
};

export type NutritionDayKind = 'high' | 'moderate' | 'rest';

export interface NutritionDayType {
  kind: NutritionDayKind;
  label: string;
  kcal: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  note: string;
}

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
    main_goal: string | null;       // fat_loss | definition | hypertrophy | mass_gain | recomposition | performance | maintenance
    weekly_frequency: number | null;
    work_type: string | null;       // sedentary | moderate | active
    cardio_frequency: string | null;// none | 1_2x | 3_4x | 5x_plus
    meals_per_day: number | null;
  };
  // Alinhamento com o treino real (Módulo 4) — opcional
  training?: {
    sessionsLast7?: number | null;       // nº de treinos de força nos últimos 7 dias
    weeklyVolumeKg?: number | null;       // volume total semanal
    cardioKmThisWeek?: number | null;     // km de corrida/cardio na semana
  } | null;
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
  // ── V7 ──
  phase: NutritionPhase;
  phaseLabel: string;
  phaseReason: string;          // "Você está em Cutting porque..."
  whyThisPlan: string[];        // narrativa "Por que esse plano?"
  dayTypes: NutritionDayType[]; // periodização: high / moderate / rest
  trainingAlignment: string | null; // observação sobre o treino atual
}

// Normaliza objetivos heterogêneos do banco para uma fase nutricional.
function deriveGoalPhase(rawGoal: string | null): NutritionPhase {
  const g = (rawGoal ?? 'hypertrophy').toLowerCase();
  if (g === 'fat_loss' || g === 'weight_loss' || g === 'emagrecimento') return 'cutting';
  if (g === 'definition' || g === 'definicao' || g === 'cutting') return 'definicao';
  if (g === 'mass_gain' || g === 'bulk' || g === 'lean_bulk' || g === 'ganho_massa') return 'lean_bulk';
  if (g === 'recomposition' || g === 'recomposicao' || g === 'recomp') return 'recomposicao';
  if (g === 'performance' || g === 'endurance' || g === 'corrida') return 'performance';
  if (g === 'maintenance' || g === 'manutencao') return 'manutencao';
  return 'hipertrofia';
}

export function computeNutritionTargets(input: NutritionAutopilotInput): NutritionTargets | null {
  const { bio, profile, training } = input;
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
  // Usa o treino REAL dos últimos 7 dias quando disponível; senão a frequência do perfil.
  const realSessions = training?.sessionsLast7 ?? null;
  const freq = realSessions != null && realSessions > 0 ? realSessions : (profile.weekly_frequency ?? 3);
  let af = 1.2; // sedentário base
  af += Math.min(0.25, freq * 0.04); // treinos de força
  if (profile.work_type === 'moderate') af += 0.05;
  if (profile.work_type === 'active') af += 0.12;
  const cardioKm = training?.cardioKmThisWeek ?? null;
  if (cardioKm != null && cardioKm > 0) {
    // ~0.9 kcal/kg/km já é embutido como leve aumento do fator de atividade
    af += Math.min(0.12, (cardioKm / 100));
  } else if (profile.cardio_frequency === '1_2x') af += 0.03;
  else if (profile.cardio_frequency === '3_4x') af += 0.06;
  else if (profile.cardio_frequency === '5x_plus') af += 0.1;
  af = Math.round(af * 100) / 100;

  const tdee = Math.round(tmb * af);
  explanation.push(`TDEE ${tdee}kcal = TMB × ${af} (${freq}x musculação/sem${realSessions != null ? ' — treino real 7d' : ''}, trabalho ${profile.work_type ?? 'n/d'}${cardioKm ? `, ${cardioKm.toFixed(1)}km cardio/sem` : ''}).`);

  // ── 3. Fase + ajuste pelo objetivo ────────────────────────────────────────
  const phase = deriveGoalPhase(profile.main_goal);
  const bf = bio?.body_fat_pct ?? null;
  let adj = 0;
  if (phase === 'cutting') adj = -Math.round(Math.min(500, tdee * 0.18));
  else if (phase === 'definicao') adj = -Math.round(Math.min(450, tdee * 0.15));
  else if (phase === 'hipertrofia') adj = Math.round(Math.min(350, tdee * 0.1));
  else if (phase === 'lean_bulk') adj = Math.round(Math.min(400, tdee * 0.12));
  else if (phase === 'recomposicao') adj = -150;
  else adj = 0; // performance / manutenção
  const targetKcal = tdee + adj;

  const phaseStrategy: Record<NutritionPhase, string> = {
    cutting: 'perda de gordura preservando massa muscular e performance',
    definicao: 'redução de gordura com proteína alta e controle energético fino',
    hipertrofia: 'crescimento muscular com superávit controlado e boa recuperação',
    lean_bulk: 'ganho de massa com superávit limitado para conter gordura',
    recomposicao: 'perder gordura mantendo/ganhando músculo na manutenção calórica',
    performance: 'disponibilidade energética e recuperação para o treino/corrida',
    manutencao: 'estabilidade corporal, saúde e performance',
  };
  explanation.push(adj === 0
    ? `Alvo ${targetKcal}kcal — manutenção (fase: ${PHASE_LABEL[phase]}).`
    : `Alvo ${targetKcal}kcal — ${adj > 0 ? `superávit de +${adj}` : `déficit de ${adj}`}kcal para ${phaseStrategy[phase]}.`);

  // ── 4. Macros ─────────────────────────────────────────────────────────────
  // Proteína por kg: mais alta em fases de corte/BF alto (preserva massa magra)
  let proteinPerKg: number;
  if (phase === 'definicao') proteinPerKg = bf != null && bf > 25 ? 2.2 : 2.4;
  else if (phase === 'cutting' || phase === 'recomposicao') proteinPerKg = bf != null && bf > 25 ? 2.0 : 2.2;
  else if (phase === 'performance') proteinPerKg = 1.8;
  else if (phase === 'manutencao') proteinPerKg = 1.8;
  else proteinPerKg = 2.0; // hipertrofia / lean bulk
  const proteinG = Math.round(weight * proteinPerKg);
  // Gordura: performance um pouco menor (mais carbo); demais 25%
  const fatPct = phase === 'performance' ? 0.22 : 0.25;
  const fatG = Math.round((targetKcal * fatPct) / 9);
  const carbsG = Math.max(0, Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4));
  explanation.push(`Proteína ${proteinG}g (${proteinPerKg}g/kg), gordura ${fatG}g (${Math.round(fatPct * 100)}% das kcal), carboidrato ${carbsG}g (restante — combustível do treino).`);

  // ── 5. Água ───────────────────────────────────────────────────────────────
  const waterMl = Math.round((weight * 40) / 100) * 100;

  // ── 6. Periodização: day types (Módulo 6) ─────────────────────────────────
  const highCarbs = Math.round(carbsG * 1.25);
  const restCarbs = Math.round(carbsG * 0.65);
  const dayTypes: NutritionDayType[] = [
    {
      kind: 'high', label: 'Dia de Alta Performance',
      carbsG: highCarbs, proteinG, fatG,
      kcal: proteinG * 4 + fatG * 9 + highCarbs * 4,
      note: 'Treino pesado/pernas ou corrida longa — abastecer performance e recuperação. Carbo concentrado ao redor do treino.',
    },
    {
      kind: 'moderate', label: 'Dia Moderado',
      carbsG, proteinG, fatG,
      kcal: targetKcal,
      note: 'Treino padrão — macros base da fase.',
    },
    {
      kind: 'rest', label: 'Dia de Descanso',
      carbsG: restCarbs, proteinG, fatG,
      kcal: proteinG * 4 + fatG * 9 + restCarbs * 4,
      note: 'Sem treino — proteína mantida elevada, demanda energética reduzida.',
    },
  ];

  // ── 7. Alinhamento com o treino ───────────────────────────────────────────
  let trainingAlignment: string | null = null;
  if (training) {
    const s = training.sessionsLast7 ?? 0;
    const km = training.cardioKmThisWeek ?? 0;
    if (km >= 15 && (phase === 'cutting' || phase === 'definicao')) {
      trainingAlignment = `Você tem volume alto de cardio (${km.toFixed(0)}km/sem) em fase de corte — o déficit foi mantido moderado para não comprometer performance nem massa muscular.`;
    } else if (s >= 4) {
      trainingAlignment = `Seu treino tem ${s} sessões/semana e alta demanda de recuperação — o plano prioriza suporte energético e proteína distribuída ao redor do treino.`;
    } else if (km > 0) {
      trainingAlignment = `Inclui ${km.toFixed(0)}km de cardio na semana — há reposição de carboidrato nos dias de corrida longa.`;
    }
  }

  // ── 8. Fase + "Por que esse plano?" ───────────────────────────────────────
  const bfDesc = bf == null ? null : bf >= 25 ? 'BF elevado' : bf >= 18 ? 'BF moderado' : 'BF baixo';
  const phaseReason = `Você está em fase de ${PHASE_LABEL[phase]} porque seu objetivo${bfDesc ? ` e composição corporal (${bfDesc})` : ''} indicam ${phaseStrategy[phase]}.`;

  const whyThisPlan: string[] = [];
  whyThisPlan.push(
    `${bfDesc ? `Você possui ${bfDesc}, ` : ''}treina ${freq}x por semana${cardioKm ? ` e corre ~${cardioKm.toFixed(0)}km/sem` : ''} e está em fase de ${PHASE_LABEL[phase]}.`
  );
  whyThisPlan.push(`A estratégia prioriza ${phaseStrategy[phase]}.`);
  whyThisPlan.push(
    adj === 0
      ? `Por isso as calorias ficam na manutenção (${targetKcal}kcal), com proteína de ${proteinPerKg}g/kg para sustentar o músculo.`
      : `Por isso aplicamos ${adj > 0 ? `superávit de +${adj}` : `déficit de ${Math.abs(adj)}`}kcal (${targetKcal}kcal/dia) e proteína de ${proteinPerKg}g/kg (${proteinG}g) para preservar massa magra.`
  );
  if (trainingAlignment) whyThisPlan.push(trainingAlignment);

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
    phase,
    phaseLabel: PHASE_LABEL[phase],
    phaseReason,
    whyThisPlan,
    dayTypes,
    trainingAlignment,
  };
}

// ── Módulo 7: detecção automática de ajustes ────────────────────────────────
export interface AdjustmentInput {
  phase: NutritionPhase;
  weightTrendKg: number | null;     // variação de peso no período (+ ganho / - perda)
  bfTrendPct: number | null;        // variação de BF (- = perdeu gordura)
  strengthTrendPct: number | null;  // variação de volume/carga (% , + = subiu)
  periodDays: number;
}

export interface NutritionSignal {
  level: 'positivo' | 'info' | 'atencao';
  title: string;
  message: string;
}

export function detectNutritionAdjustments(i: AdjustmentInput): NutritionSignal[] {
  const out: NutritionSignal[] = [];
  const w = i.weightTrendKg;
  const bf = i.bfTrendPct;
  const str = i.strengthTrendPct;

  // Recomposição em curso: peso estável mas BF caiu e/ou força subiu → NÃO ajustar
  if (w != null && Math.abs(w) < 0.6 && ((bf != null && bf < -0.3) || (str != null && str > 3))) {
    out.push({
      level: 'positivo',
      title: 'Recomposição corporal em curso',
      message: 'Peso estável, mas a gordura caiu e/ou a força subiu. Não ajustar calorias — há sinais positivos de recomposição.',
    });
  }

  // Déficit impactando performance: perdendo peso mas força caiu
  if ((i.phase === 'cutting' || i.phase === 'definicao') && w != null && w < -0.4 && str != null && str < -3) {
    out.push({
      level: 'atencao',
      title: 'Déficit pode estar impactando a performance',
      message: 'Você está perdendo peso, mas a força/volume caiu. Considere reduzir o déficit ou aumentar a proteína e o carbo no pré-treino.',
    });
  }

  // Platô real de emagrecimento: peso e BF parados
  if ((i.phase === 'cutting' || i.phase === 'definicao') && w != null && Math.abs(w) < 0.3 &&
      (bf == null || Math.abs(bf) < 0.2) && i.periodDays >= 21) {
    out.push({
      level: 'atencao',
      title: 'Platô de emagrecimento',
      message: `Peso e gordura praticamente parados em ${i.periodDays} dias. Reavaliar aderência ou aplicar um pequeno corte adicional de calorias.`,
    });
  }

  // Bulk ganhando rápido demais
  if ((i.phase === 'lean_bulk' || i.phase === 'hipertrofia') && w != null && i.periodDays >= 14) {
    const perWeek = w / (i.periodDays / 7);
    if (perWeek > 0.6) {
      out.push({
        level: 'atencao',
        title: 'Ganho de peso acelerado',
        message: `Ganhando ~${perWeek.toFixed(1)}kg/semana — acima do ideal para um natural. Reduzir levemente o superávit para limitar acúmulo de gordura.`,
      });
    } else if (perWeek > 0.1 && (str == null || str >= 0)) {
      out.push({
        level: 'positivo',
        title: 'Ganho de massa no ritmo certo',
        message: 'Ganho de peso controlado e força mantida/subindo — manter a estratégia.',
      });
    }
  }

  if (out.length === 0) {
    out.push({
      level: 'info',
      title: 'Sem ajustes necessários',
      message: 'Os dados ainda não indicam necessidade de mudança. Mantenha o plano e registre peso/treino para a análise evoluir.',
    });
  }
  return out;
}

// ── Módulo 11: Nutrition Score ──────────────────────────────────────────────
export interface NutritionScoreInput {
  phase: NutritionPhase;
  weightTrendKg: number | null;
  bfTrendPct: number | null;
  sessionsLast7: number | null;
  plannedPerWeek: number | null;
  loggedDays: number | null;   // dias com registro alimentar no período
  periodDays: number;
}

export interface NutritionScore {
  score: number;          // 0–100
  label: string;          // Excelente / Bom / Regular / Atenção
  breakdown: { label: string; points: number; max: number }[];
}

export function computeNutritionScore(i: NutritionScoreInput): NutritionScore {
  const breakdown: { label: string; points: number; max: number }[] = [];

  // 1) Progresso alinhado ao objetivo (40)
  let progress = 20; // neutro por padrão
  const w = i.weightTrendKg;
  const losing = i.phase === 'cutting' || i.phase === 'definicao';
  const gaining = i.phase === 'lean_bulk' || i.phase === 'hipertrofia';
  if (w != null) {
    if (losing) progress = w < -0.2 ? 40 : w < 0.1 ? 28 : 12;
    else if (gaining) progress = w > 0.1 && w < 1.2 ? 40 : w >= 1.2 ? 26 : 16;
    else progress = Math.abs(w) < 0.6 ? 38 : 22; // recomp/manutenção: estabilidade
  }
  if (i.bfTrendPct != null && i.bfTrendPct < -0.3) progress = Math.min(40, progress + 4);
  breakdown.push({ label: 'Progresso vs objetivo', points: progress, max: 40 });

  // 2) Consistência de treino (30)
  let training = 12;
  if (i.sessionsLast7 != null) {
    const planned = i.plannedPerWeek ?? 3;
    const ratio = planned > 0 ? i.sessionsLast7 / planned : 0;
    training = Math.round(Math.min(1, ratio) * 30);
  }
  breakdown.push({ label: 'Consistência de treino', points: training, max: 30 });

  // 3) Aderência alimentar (30)
  let adherence = 9;
  if (i.loggedDays != null && i.periodDays > 0) {
    adherence = Math.round(Math.min(1, i.loggedDays / i.periodDays) * 30);
  }
  breakdown.push({ label: 'Aderência (registros)', points: adherence, max: 30 });

  const score = Math.max(0, Math.min(100, progress + training + adherence));
  const label = score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Regular' : 'Atenção';
  return { score, label, breakdown };
}
