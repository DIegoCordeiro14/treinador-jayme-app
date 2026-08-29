// nutrition-decision-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §1 — Motor ÚNICO de diagnóstico nutricional.
//
// Substitui a sobreposição entre detectNutritionAdjustments / diagnoseProgress /
// nutrition-diagnosis. Decide UM estado (nunca sinais contraditórios) via
// hierarquia de prioridade, com fator limitante e ação recomendada. A IA apenas
// narra o resultado; nunca decide números. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

import type { CanonicalGoal } from './nutrition-goal-map';

export type Trend = 'up' | 'down' | 'flat' | 'unknown';

export interface NutritionDecisionInput {
  goal: CanonicalGoal;
  periodDays: number;
  // corpo (deltas no período)
  weightTrendKg: number | null;       // negativo = perdeu
  bodyFatTrendPct: number | null;     // negativo = perdeu gordura
  leanMassTrendKg: number | null;     // positivo = ganhou magra
  // treino
  strengthTrendPct: number | null;    // performance
  volumeTrendPct: number | null;
  // cardio / energia
  cardioLoad: number | null;          // km ou índice
  // recuperação
  recoveryScore: number | null;       // 0..100
  hrvTrend: Trend;
  sleepTrend: Trend;
  // aderência (0..1)
  loggingAdherence: number | null;
  targetAdherence: number | null;
  // confiança global dos dados (0..1) — do confidence system
  dataConfidence: number | null;
}

export type NutritionState =
  | 'progressing' | 'plateau' | 'recomposition' | 'muscle_loss_risk'
  | 'bulk_too_fast' | 'cut_too_aggressive' | 'low_adherence'
  | 'recovery_risk' | 'low_energy_availability_risk' | 'insufficient_data';

export type LimitingFactor = 'nutrition' | 'training' | 'recovery' | 'cardio' | 'adherence' | null;

export type RecommendedAction =
  | 'maintain' | 'improve_adherence' | 'review_recovery' | 'recalculate_targets'
  | 'reduce_deficit' | 'review_surplus' | 'collect_more_data';

export interface NutritionSignal { level: 'positivo' | 'info' | 'atencao'; title: string; message: string; }

export interface NutritionDecision {
  state: NutritionState;
  confidence: number;              // 0..1
  primarySignal: NutritionSignal;
  secondarySignals: NutritionSignal[];
  limitingFactor: LimitingFactor;
  recommendedAction: RecommendedAction;
  adjustmentAllowed: boolean;
  reasons: string[];
}

const isCut = (g: CanonicalGoal) => g === 'weight_loss' || g === 'definition';
const isBulk = (g: CanonicalGoal) => g === 'hypertrophy' || g === 'lean_bulk';

function sig(level: NutritionSignal['level'], title: string, message: string): NutritionSignal {
  return { level, title, message };
}

// Confiança do diagnóstico: cresce com período, dados e aderência de registro.
function decisionConfidence(i: NutritionDecisionInput): number {
  const periodScore = Math.min(1, i.periodDays / 21);
  const dataScore = i.dataConfidence ?? 0.5;
  const logScore = i.loggingAdherence ?? 0.5;
  return Math.round((0.4 * periodScore + 0.35 * dataScore + 0.25 * logScore) * 100) / 100;
}

export function decideNutrition(i: NutritionDecisionInput): NutritionDecision {
  const reasons: string[] = [];
  const confidence = decisionConfidence(i);
  const weeklyRate = i.weightTrendKg != null && i.periodDays > 0
    ? i.weightTrendKg / (i.periodDays / 7) : null;

  const recoveryPoor = (i.recoveryScore != null && i.recoveryScore < 45) || i.hrvTrend === 'down' || i.sleepTrend === 'down';
  const lowLogging = i.loggingAdherence != null && i.loggingAdherence < 0.6;

  // ── Hierarquia de prioridade (a primeira que casar vence; sem contradições) ──

  // 0) Dados insuficientes
  if (i.weightTrendKg == null && i.strengthTrendPct == null && i.bodyFatTrendPct == null) {
    return build('insufficient_data', sig('info', 'Dados insuficientes', 'Registre peso, composição e refeições para um diagnóstico confiável.'),
      [], null, 'collect_more_data', false, ['sem séries corporais/performance']);
  }
  if (i.periodDays < 10 || confidence < 0.35) {
    return build('insufficient_data', sig('info', 'Coletando dados', 'Período/confiança ainda baixos para decidir com segurança.'),
      [], null, 'collect_more_data', false, [`período ${i.periodDays}d, confiança ${confidence}`]);
  }

  // 1) Baixa disponibilidade energética (sinal conservador — §11) — precedência de saúde
  const bigDeficit = weeklyRate != null && weeklyRate <= -0.9;
  const highCardio = (i.cardioLoad ?? 0) >= 20;
  const perfDown = i.strengthTrendPct != null && i.strengthTrendPct < -3;
  if (isCut(i.goal) && bigDeficit && highCardio && perfDown && recoveryPoor) {
    reasons.push('déficit alto + cardio alto + performance↓ + recuperação↓');
    return build('low_energy_availability_risk',
      sig('atencao', 'Revisar disponibilidade energética', 'A combinação entre ingestão, treino e recuperação sugere revisar a disponibilidade energética. Não é diagnóstico clínico — considere aumentar a ingestão e/ou reduzir a demanda.'),
      [], 'nutrition', 'reduce_deficit', true, reasons);
  }

  // 2) Risco de recuperação (fadiga/subrecuperação)
  if (recoveryPoor && perfDown) {
    reasons.push('recuperação baixa com queda de performance');
    return build('recovery_risk',
      sig('atencao', 'Recuperação limitando', 'Sinais de recuperação baixos acompanham a queda de performance — priorizar sono/estresse e conter a agressividade do plano antes de mudar calorias.'),
      [], 'recovery', 'review_recovery', false, reasons);
  }

  // 3) Baixa aderência de registro (não dá pra confiar em outros sinais)
  if (lowLogging) {
    reasons.push(`aderência de registro baixa (${Math.round((i.loggingAdherence ?? 0) * 100)}%)`);
    return build('low_adherence',
      sig('atencao', 'Aderência insuficiente', 'Poucos registros no período — melhorar o registro alimentar antes de ajustar metas.'),
      [], 'adherence', 'improve_adherence', false, reasons);
  }

  // 4) Perda de massa magra (corte) — precedência sobre platô
  const muscleLoss = (i.leanMassTrendKg != null && i.leanMassTrendKg <= -0.5) ||
    (i.strengthTrendPct != null && i.strengthTrendPct <= -8);
  if (isCut(i.goal) && muscleLoss && (i.weightTrendKg ?? 0) < 0) {
    reasons.push('massa magra/força caindo durante o corte');
    return build('muscle_loss_risk',
      sig('atencao', 'Risco de perda muscular', 'Massa magra/força caindo no déficit — reduzir a agressividade do déficit e reforçar proteína.'),
      [], 'nutrition', 'reduce_deficit', true, reasons);
  }

  // 5) Recomposição (peso estável + gordura↓ e magra/força↑)
  const weightStable = i.weightTrendKg != null && Math.abs(i.weightTrendKg) < 0.6;
  const bodyImproving = (i.bodyFatTrendPct != null && i.bodyFatTrendPct <= -0.3) || (i.leanMassTrendKg != null && i.leanMassTrendKg >= 0.3);
  const anabolic = (i.strengthTrendPct != null && i.strengthTrendPct >= 3) || (i.leanMassTrendKg != null && i.leanMassTrendKg >= 0.3);
  if (weightStable && bodyImproving && anabolic) {
    reasons.push('peso estável com melhora de composição e performance');
    return build('recomposition',
      sig('positivo', 'Recomposição em curso', 'Peso estável com gordura↓ e massa/força↑ — manter estratégia atual.'),
      [], null, 'maintain', false, reasons);
  }

  // 6) Bulk acelerado
  if (isBulk(i.goal) && weeklyRate != null && weeklyRate > 0.6 && i.periodDays >= 14) {
    reasons.push(`ganho ${weeklyRate.toFixed(2)}kg/sem acima do ideal`);
    return build('bulk_too_fast',
      sig('atencao', 'Bulk acelerado', 'Ganho de peso acima do ideal para minimizar gordura — reduzir o superávit.'),
      [], 'nutrition', 'review_surplus', true, reasons);
  }

  // 7) Corte agressivo demais (sem perda muscular ainda, mas ritmo alto)
  if (isCut(i.goal) && weeklyRate != null && weeklyRate <= -1.0) {
    reasons.push(`perda ${weeklyRate.toFixed(2)}kg/sem — ritmo agressivo`);
    return build('cut_too_aggressive',
      sig('atencao', 'Corte agressivo', 'Ritmo de perda alto — reduzir o déficit para preservar massa e performance.'),
      [], 'nutrition', 'reduce_deficit', true, reasons);
  }

  // 8) Progresso claro alinhado ao objetivo
  const progressingCut = isCut(i.goal) && (i.weightTrendKg ?? 0) < -0.2 && !muscleLoss;
  const progressingBulk = isBulk(i.goal) && weeklyRate != null && weeklyRate >= 0.1 && weeklyRate <= 0.6;
  if (progressingCut || progressingBulk) {
    reasons.push('progresso alinhado ao objetivo');
    return build('progressing',
      sig('positivo', 'Progredindo', 'Evolução coerente com o objetivo — manter e seguir a progressão.'),
      [], null, 'maintain', false, reasons);
  }

  // 9) Platô (só quando nada acima casou)
  const bfFlat = i.bodyFatTrendPct == null || Math.abs(i.bodyFatTrendPct) < 0.2;
  if (weightStable && bfFlat && i.periodDays >= 21) {
    reasons.push(`peso e composição estagnados há ${i.periodDays} dias`);
    return build('plateau',
      sig('atencao', 'Platô', 'Peso e composição estagnados no período — considerar recalcular as metas (energia/atividade).'),
      [], 'nutrition', 'recalculate_targets', true, reasons);
  }

  // fallback
  return build('progressing', sig('info', 'Em progresso', 'Sem sinais fortes de desvio — manter o plano.'),
    [], null, 'maintain', false, ['sem sinais fortes']);

  function build(state: NutritionState, primary: NutritionSignal, secondary: NutritionSignal[],
    limiting: LimitingFactor, action: RecommendedAction, adj: boolean, rs: string[]): NutritionDecision {
    return { state, confidence, primarySignal: primary, secondarySignals: secondary, limitingFactor: limiting, recommendedAction: action, adjustmentAllowed: adj && confidence >= 0.5, reasons: rs };
  }
}
