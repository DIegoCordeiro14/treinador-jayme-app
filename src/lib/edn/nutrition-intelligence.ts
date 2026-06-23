/**
 * Nutrition Intelligence Engine — EDN V7.2
 *
 * Camada de DECISÃO nutricional esportiva sobre o Nutrition Autopilot.
 * 100% determinística: recebe primitivos já calculados (fase, recuperação,
 * tendências, treino do dia, cardio) e devolve ciclo do atleta, demanda de
 * treino, conselho de recuperação, modo endurance, diagnóstico, simulações e
 * o painel "Seu momento atual". A IA apenas narra o que sai daqui.
 */

import type { NutritionPhase } from './nutrition-autopilot';

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

// ── 1. Ciclo do atleta ──────────────────────────────────────────────────────
export type AthleteCycle =
  | 'preparation'
  | 'cutting'
  | 'maintenance'
  | 'build'
  | 'peak_performance'
  | 'recovery'
  | 'deload';

export const CYCLE_LABEL: Record<AthleteCycle, string> = {
  preparation: 'Preparação',
  cutting: 'Cutting Estratégico',
  maintenance: 'Manutenção',
  build: 'Construção (Build)',
  peak_performance: 'Pico de Performance',
  recovery: 'Recuperação',
  deload: 'Deload',
};

export interface CycleInput {
  phase: NutritionPhase;
  recoveryCategory: RecoveryCategory;
  bodyFatPct: number | null;
  cardioKmThisWeek: number;
  sessionsLast7: number;
  upcomingRaceWeeks?: number | null;
}

export interface AthleteCycleResult {
  cycle: AthleteCycle;
  label: string;
  objective: string;
  priority: string;
}

export function deriveAthleteCycle(i: CycleInput): AthleteCycleResult {
  // Recuperação baixa + muito treino → o ciclo passa a ser recuperação/deload
  if ((i.recoveryCategory === 'critical') || (i.recoveryCategory === 'low' && i.sessionsLast7 >= 5)) {
    const deload = i.recoveryCategory === 'low';
    return {
      cycle: deload ? 'deload' : 'recovery',
      label: CYCLE_LABEL[deload ? 'deload' : 'recovery'],
      objective: 'Restaurar a recuperação antes de progredir',
      priority: 'Sono, proteína mantida e energia adequada — sem déficit agressivo',
    };
  }
  // Prova/endurance próxima
  if (i.upcomingRaceWeeks != null && i.upcomingRaceWeeks >= 0) {
    if (i.upcomingRaceWeeks <= 2) {
      return { cycle: 'peak_performance', label: CYCLE_LABEL.peak_performance, objective: 'Chegar na prova com energia máxima', priority: 'Carboidrato alto e recuperação — tapering' };
    }
    return { cycle: 'preparation', label: CYCLE_LABEL.preparation, objective: 'Sustentar treino e recuperação na preparação', priority: 'Carboidrato estratégico em volume crescente' };
  }
  // Senão, deriva da fase nutricional
  switch (i.phase) {
    case 'cutting':
    case 'definicao':
      return { cycle: 'cutting', label: CYCLE_LABEL.cutting, objective: 'Reduzir gordura preservando performance e massa magra', priority: 'Proteína alta + déficit controlado' };
    case 'hipertrofia':
    case 'lean_bulk':
      return { cycle: 'build', label: CYCLE_LABEL.build, objective: 'Construir músculo com superávit controlado', priority: 'Superávit limitado + carboidrato no treino' };
    case 'recomposicao':
      return { cycle: 'maintenance', label: CYCLE_LABEL.maintenance, objective: 'Recompor: perder gordura mantendo/ganhando músculo', priority: 'Proteína alta na manutenção calórica' };
    case 'performance':
      return { cycle: 'preparation', label: CYCLE_LABEL.preparation, objective: 'Disponibilidade energética para o treino/corrida', priority: 'Carboidrato estratégico e recuperação' };
    default:
      return { cycle: 'maintenance', label: CYCLE_LABEL.maintenance, objective: 'Estabilidade corporal, saúde e performance', priority: 'Equilíbrio energético e proteína adequada' };
  }
}

// ── 2/3. Demanda de treino do dia ───────────────────────────────────────────
const LARGE_GROUPS = ['perna', 'pernas', 'leg', 'quadriceps', 'posterior', 'costas', 'back', 'gluteo'];
const PUSH_PULL = ['peito', 'chest', 'ombro', 'shoulder', 'biceps', 'triceps', 'arms', 'braco'];

export interface TrainingDemandInput {
  isRestDay: boolean;
  todayLabel: string | null;       // rótulo do dia (ex.: "Pernas + abdômen")
  todayHasCardio: boolean;
  cardioKmToday?: number | null;
  recoveryCategory: RecoveryCategory;
}

export interface TrainingDemandResult {
  score: number;                   // 0–100
  level: 'Descanso' | 'Baixa' | 'Moderada' | 'Alta';
  strategy: string;
}

export function computeTrainingDemand(i: TrainingDemandInput): TrainingDemandResult {
  if (i.isRestDay && !i.todayHasCardio) {
    return { score: 25, level: 'Descanso', strategy: 'Manter proteína elevada e reduzir energia (menos carboidrato).' };
  }
  let score = 45; // treino base
  const label = (i.todayLabel ?? '').toLowerCase();
  if (LARGE_GROUPS.some((g) => label.includes(g))) score += 35;
  else if (PUSH_PULL.some((g) => label.includes(g))) score += 18;
  else score += 22; // dia de treino sem rótulo claro
  if (i.todayHasCardio) score += Math.min(25, 10 + (i.cardioKmToday ?? 0) * 1.2);
  if (i.recoveryCategory === 'low') score -= 8;
  if (i.recoveryCategory === 'critical') score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const level: TrainingDemandResult['level'] = score >= 75 ? 'Alta' : score >= 50 ? 'Moderada' : score >= 30 ? 'Baixa' : 'Descanso';
  const strategy = score >= 75
    ? 'Maior disponibilidade de carboidrato; reforçar carbo pré-treino e priorizar a refeição pós-treino.'
    : score >= 50
      ? 'Carboidrato moderado ao redor do treino; manter proteína.'
      : 'Carboidrato mais baixo; manter proteína alta.';
  return { score, level, strategy };
}

// ── 4. Recuperação nutricional ──────────────────────────────────────────────
export interface RecoveryNutritionInput {
  recoveryCategory: RecoveryCategory;
  recoveryScore: number;
  sessionsLast7: number;
  phase: NutritionPhase;
}

export interface RecoveryNutritionAdvice {
  active: boolean;          // true quando a recuperação deve mudar a estratégia do dia
  level: 'positivo' | 'info' | 'atencao';
  title: string;
  message: string;
}

export function recoveryNutritionAdvice(i: RecoveryNutritionInput): RecoveryNutritionAdvice {
  const cutting = i.phase === 'cutting' || i.phase === 'definicao';
  if (i.recoveryCategory === 'critical' || (i.recoveryCategory === 'low' && i.sessionsLast7 >= 5)) {
    return {
      active: true, level: 'atencao', title: 'Baixa recuperação — priorize recuperar',
      message: cutting
        ? 'Seu corpo mostra sinais de baixa recuperação. Hoje a prioridade é recuperação, não déficit agressivo: suba para manutenção calórica, reforce carbo e proteína e durma mais.'
        : 'Sinais de baixa recuperação. Mantenha energia e proteína altas, priorize sono e considere reduzir o volume hoje.',
    };
  }
  if (i.recoveryCategory === 'moderate') {
    return { active: false, level: 'info', title: 'Recuperação moderada', message: 'Mantenha a estratégia, mas cuide do sono e da proteína ao longo do dia.' };
  }
  return { active: false, level: 'positivo', title: 'Boa recuperação', message: 'Recuperação em dia — siga o plano da fase normalmente.' };
}

// ── 5. Modo endurance ───────────────────────────────────────────────────────
export interface EnduranceInput {
  cardioKmThisWeek: number;
  upcomingRaceWeeks?: number | null;
}

export interface EnduranceModeResult {
  active: boolean;
  phase: string;
  priority: string;
  note: string;
}

export function enduranceMode(i: EnduranceInput): EnduranceModeResult | null {
  const heavy = i.cardioKmThisWeek >= 20;
  const race = i.upcomingRaceWeeks != null && i.upcomingRaceWeeks >= 0;
  if (!heavy && !race) return null;
  if (race && (i.upcomingRaceWeeks as number) <= 2) {
    return { active: true, phase: 'Pico / Tapering', priority: 'Carboidrato alto, volume reduzido', note: 'Prova próxima: reduzir volume e carregar carboidrato para chegar com energia máxima.' };
  }
  if (race) {
    return { active: true, phase: 'Preparação', priority: 'Carboidrato estratégico', note: `Prova em ~${i.upcomingRaceWeeks} semanas: manter performance e recuperação com carbo crescente nos dias de volume.` };
  }
  return { active: true, phase: 'Base de endurance', priority: 'Reposição de carboidrato', note: `${i.cardioKmThisWeek.toFixed(0)}km/semana: reponha carboidrato nos dias longos e cuide da recuperação.` };
}

// ── 6. Diagnóstico de progresso ─────────────────────────────────────────────
export interface DiagnosisInput {
  phase: NutritionPhase;
  weightTrendKg: number | null;
  bfTrendPct: number | null;
  strengthTrendPct: number | null;
  periodDays: number;
}

export interface ProgressDiagnosis {
  diagnosis: string[];     // observações dos dados
  conclusion: string;
  action: string;
}

export function diagnoseProgress(i: DiagnosisInput): ProgressDiagnosis {
  const d: string[] = [];
  if (i.weightTrendKg != null) d.push(`Peso ${i.weightTrendKg > 0 ? '+' : ''}${i.weightTrendKg}kg em ${i.periodDays} dias.`);
  if (i.bfTrendPct != null) d.push(`Gordura ${i.bfTrendPct > 0 ? '+' : ''}${i.bfTrendPct}%.`);
  if (i.strengthTrendPct != null) d.push(`Força/volume ${i.strengthTrendPct > 0 ? '+' : ''}${i.strengthTrendPct}%.`);

  const cutting = i.phase === 'cutting' || i.phase === 'definicao';
  const w = i.weightTrendKg, bf = i.bfTrendPct, str = i.strengthTrendPct;

  if (cutting && w != null && w < -0.4 && (bf == null || bf <= 0) && (str == null || str >= -2)) {
    return { diagnosis: d, conclusion: 'Cutting eficiente — perdendo peso/gordura com força preservada.', action: 'Manter a estratégia atual.' };
  }
  if (cutting && w != null && w < -0.4 && str != null && str < -8 && (bf == null || Math.abs(bf) < 0.3)) {
    return { diagnosis: d, conclusion: 'Possível perda muscular — peso caiu, gordura igual e força caiu bastante.', action: 'Aumentar a disponibilidade energética (reduzir déficit / mais carbo no pré-treino).' };
  }
  if (cutting && w != null && Math.abs(w) < 0.3 && i.periodDays >= 21) {
    return { diagnosis: d, conclusion: 'Platô de emagrecimento.', action: 'Reavaliar aderência ou aplicar pequeno corte adicional / mais cardio.' };
  }
  if ((i.phase === 'lean_bulk' || i.phase === 'hipertrofia') && w != null) {
    const perWeek = w / Math.max(1, i.periodDays / 7);
    if (perWeek > 0.6) return { diagnosis: d, conclusion: 'Ganho acelerado — risco de acúmulo de gordura.', action: 'Reduzir levemente o superávit.' };
    if (perWeek > 0.05 && (str == null || str >= 0)) return { diagnosis: d, conclusion: 'Construção saudável — ganho controlado com força mantida.', action: 'Manter a estratégia.' };
  }
  return { diagnosis: d.length ? d : ['Dados insuficientes para diagnóstico.'], conclusion: 'Sem mudança recomendada no momento.', action: 'Manter o plano e seguir registrando.' };
}

// ── 7. Simulador de resultados ──────────────────────────────────────────────
export interface SimulationInput {
  phase: NutritionPhase;
  tdeeKcal: number;
  weightTrendKgPerWeek: number | null; // ritmo atual
}

export interface SimulationOption {
  id: string;
  label: string;
  predictedPerWeekKg: number;   // variação prevista de peso/semana
  note: string;
}

export function simulateAdjustments(i: SimulationInput): SimulationOption[] {
  const base = i.weightTrendKgPerWeek ?? 0;
  const kgPerKcalWeek = 7 / 7700; // kg por (kcal/dia) por semana
  const opts: SimulationOption[] = [];
  const cutting = i.phase === 'cutting' || i.phase === 'definicao';

  if (cutting) {
    opts.push({ id: 'cut_150', label: 'Reduzir 150 kcal/dia', predictedPerWeekKg: Math.round((base - 150 * kgPerKcalWeek) * 100) / 100, note: 'Acelera a perda sem cortar treino.' });
    opts.push({ id: 'cardio_plus', label: 'Adicionar 3x cardio (~900 kcal/sem)', predictedPerWeekKg: Math.round((base - 900 / 7700) * 100) / 100, note: 'Mais gasto sem mexer na comida.' });
    opts.push({ id: 'hold', label: 'Manter como está', predictedPerWeekKg: Math.round(base * 100) / 100, note: 'Se a aderência ainda não está 100%, primeiro estabilize.' });
  } else if (i.phase === 'lean_bulk' || i.phase === 'hipertrofia') {
    opts.push({ id: 'add_150', label: 'Adicionar 150 kcal/dia', predictedPerWeekKg: Math.round((base + 150 * kgPerKcalWeek) * 100) / 100, note: 'Acelera o ganho se está parado.' });
    opts.push({ id: 'hold', label: 'Manter como está', predictedPerWeekKg: Math.round(base * 100) / 100, note: 'Se a força sobe, não precisa mudar.' });
    opts.push({ id: 'cut_100', label: 'Reduzir 100 kcal/dia', predictedPerWeekKg: Math.round((base - 100 * kgPerKcalWeek) * 100) / 100, note: 'Se está ganhando gordura rápido demais.' });
  } else {
    opts.push({ id: 'cut_150', label: 'Reduzir 150 kcal/dia', predictedPerWeekKg: Math.round((base - 150 * kgPerKcalWeek) * 100) / 100, note: 'Inclina para perda de gordura.' });
    opts.push({ id: 'add_150', label: 'Adicionar 150 kcal/dia', predictedPerWeekKg: Math.round((base + 150 * kgPerKcalWeek) * 100) / 100, note: 'Inclina para construção.' });
    opts.push({ id: 'hold', label: 'Manter como está', predictedPerWeekKg: Math.round(base * 100) / 100, note: 'Estabilidade.' });
  }
  return opts;
}

// ── 9/10. Painel "Seu momento atual" ────────────────────────────────────────
export interface MomentInput {
  phaseLabel: string;
  cycleLabel: string;
  score: number;
  scoreLabel: string;
  recoveryCategory: RecoveryCategory;
  scoreBreakdown: { label: string; points: number; max: number }[];
  // Personalização
  sex?: string | null;
  experience?: string | null;
}

export interface MomentDashboard {
  phase: string;
  cycle: string;
  score: number;
  evolution: string;       // Excelente / Bom / Regular / Atenção
  limiter: string;         // principal limitador
  nextAction: string;
  personalNote: string | null;
}

export function buildMoment(i: MomentInput): MomentDashboard {
  // Limitador = componente com menor aproveitamento, mas recuperação baixa tem prioridade
  let limiter = 'Nada crítico';
  let nextAction = 'Manter a consistência e seguir registrando.';
  if (i.recoveryCategory === 'low' || i.recoveryCategory === 'critical') {
    limiter = 'Recuperação / Sono';
    nextAction = 'Priorizar sono e recuperação antes de qualquer ajuste de déficit.';
  } else {
    let worst: { label: string; ratio: number } | null = null;
    for (const b of i.scoreBreakdown) {
      const ratio = b.max > 0 ? b.points / b.max : 1;
      if (!worst || ratio < worst.ratio) worst = { label: b.label, ratio };
    }
    if (worst && worst.ratio < 0.6) {
      limiter = worst.label;
      nextAction = /trein/i.test(worst.label) ? 'Aumentar a consistência de treino na semana.'
        : /ader/i.test(worst.label) ? 'Registrar as refeições com mais frequência.'
        : 'Ajustar a estratégia para destravar o progresso.';
    }
  }

  let personalNote: string | null = null;
  const sex = (i.sex ?? '').toLowerCase();
  if (sex === 'female' || sex === 'feminino') personalNote = 'Perfil feminino: foco em composição corporal e performance; proteína e força preservadas.';
  else if (sex === 'male' || sex === 'masculino') personalNote = 'Perfil masculino: foco em massa magra, força e controle de BF.';

  return {
    phase: i.phaseLabel,
    cycle: i.cycleLabel,
    score: i.score,
    evolution: i.scoreLabel,
    limiter,
    nextAction,
    personalNote,
  };
}
