/**
 * Progress Intelligence Engine — EDN V8.1
 * Centro de diagnóstico da aba Evolução. Interpreta a evolução corporal +
 * treino (não só mostra gráficos): detecta evolução positiva, platô, perda
 * muscular e recomposição, e sugere o próximo ajuste. 100% determinístico.
 */

export interface ProgressInput {
  weightTrendKg: number | null;     // variação de peso no período
  bfTrendPct: number | null;        // variação de BF (- = perdeu gordura)
  leanTrendKg: number | null;       // variação de massa magra
  volumeTrendPct: number | null;    // variação do volume de treino
  goal: string | null;              // fat_loss | hypertrophy | recomposition | ...
  periodDays: number;
}

export type ProgressStatus = 'evolucao_positiva' | 'plato' | 'perda_muscular' | 'recomposicao' | 'ganho_saudavel' | 'dados_insuficientes';

export interface ProgressDiagnosis {
  status: ProgressStatus;
  title: string;
  bodyLine: string;       // "BF caiu 3%, massa magra preservada"
  message: string;        // interpretação
  nextAdjustment: string; // próximo ajuste recomendado
}

const fmt = (v: number) => `${v > 0 ? '+' : ''}${v}`;

export function analyzeProgress(i: ProgressInput): ProgressDiagnosis {
  const w = i.weightTrendKg, bf = i.bfTrendPct, lean = i.leanTrendKg, vol = i.volumeTrendPct;
  const cutting = i.goal === 'fat_loss' || i.goal === 'weight_loss' || i.goal === 'definition';

  if (w == null && bf == null && lean == null) {
    return { status: 'dados_insuficientes', title: 'Dados insuficientes', bodyLine: 'Registre peso/bioimpedância para o diagnóstico.', message: 'Sem dados de composição corporal no período.', nextAdjustment: 'Registre peso e bioimpedância nesta semana.' };
  }

  const bodyParts: string[] = [];
  if (w != null) bodyParts.push(`peso ${fmt(w)}kg`);
  if (bf != null) bodyParts.push(`BF ${fmt(bf)}%`);
  if (lean != null) bodyParts.push(`massa magra ${fmt(lean)}kg`);
  if (vol != null) bodyParts.push(`volume ${fmt(vol)}%`);
  const bodyLine = bodyParts.join(', ');

  // Perda muscular: peso caiu rápido + massa magra reduziu (ou força/volume caiu muito)
  if (w != null && w < -0.5 && ((lean != null && lean < -0.4) || (vol != null && vol < -10))) {
    return { status: 'perda_muscular', title: 'Risco de perda muscular', bodyLine,
      message: 'Peso caiu rápido e a massa magra/volume reduziu — sinal de catabolismo.',
      nextAdjustment: 'Aumentar disponibilidade energética (reduzir déficit), manter proteína alta e priorizar compostos pesados.' };
  }

  // Recomposição: peso estável, BF caindo e/ou massa magra subindo
  if (w != null && Math.abs(w) < 0.6 && ((bf != null && bf < -0.3) || (lean != null && lean > 0.3))) {
    return { status: 'recomposicao', title: 'Recomposição corporal', bodyLine,
      message: 'Peso estável, mas gordura caiu e/ou massa magra subiu — recomposição em curso.',
      nextAdjustment: 'Não mexer nas calorias. Manter proteína e progressão de carga.' };
  }

  // Evolução positiva em corte: perdeu peso/gordura preservando massa magra
  if (cutting && w != null && w < -0.3 && (lean == null || lean >= -0.2) && (bf == null || bf <= 0)) {
    return { status: 'evolucao_positiva', title: 'Evolução positiva', bodyLine,
      message: 'Você perdeu gordura mantendo a massa magra — cutting eficiente.',
      nextAdjustment: 'Manter a estratégia atual; reavaliar em 1–2 semanas.' };
  }

  // Platô: peso parado por 21+ dias mesmo com volume subindo
  if (w != null && Math.abs(w) < 0.3 && i.periodDays >= 21) {
    const meta = vol != null && vol > 5 ? ' Volume aumentou — possível adaptação metabólica.' : '';
    return { status: 'plato', title: 'Platô', bodyLine,
      message: `Peso praticamente parado há ${i.periodDays} dias.${meta}`,
      nextAdjustment: cutting ? 'Reavaliar aderência; se ok, pequeno corte adicional ou +cardio.' : 'Aumentar carga/volume progressivo ou ajustar calorias conforme objetivo.' };
  }

  // Ganho saudável (bulk/hipertrofia): peso subindo controlado + volume/força ok
  if (!cutting && w != null && w > 0.1 && (vol == null || vol >= 0)) {
    return { status: 'ganho_saudavel', title: 'Construção saudável', bodyLine,
      message: 'Ganho de peso controlado com treino progredindo.',
      nextAdjustment: 'Manter superávit; vigiar BF a cada 2–3 semanas.' };
  }

  return { status: 'evolucao_positiva', title: 'Em progresso', bodyLine,
    message: 'Evolução dentro do esperado para o período.',
    nextAdjustment: 'Manter consistência e seguir registrando.' };
}

// Projeção de atleta (peso + BF + massa magra) em 30/60/90 dias.
export interface AthleteProjectionInput {
  currentWeightKg: number;
  currentBfPct: number | null;
  currentLeanKg: number | null;
  weeklyWeightDeltaKg: number;   // ritmo atual
  adherencePct: number;          // 0–100 (escala o ritmo)
}
export interface AthleteProjection { day: number; weightKg: number; bfPct: number | null; leanKg: number | null; }

export function projectAthlete(i: AthleteProjectionInput): AthleteProjection[] {
  const factor = Math.max(0.3, Math.min(1, i.adherencePct / 100));
  const wkDelta = i.weeklyWeightDeltaKg * factor;
  return [30, 60, 90].map((day) => {
    const weeks = day / 7;
    const dw = wkDelta * weeks;
    // ~75% da perda de peso vem da gordura quando há proteína/treino; ganho ~60% magro
    const fatShare = dw < 0 ? 0.8 : 0.4;
    const fatKg = dw * fatShare;
    const leanKg = dw * (1 - fatShare);
    const newWeight = Math.round((i.currentWeightKg + dw) * 10) / 10;
    const newBf = i.currentBfPct != null && i.currentWeightKg > 0
      ? Math.round((((i.currentBfPct / 100) * i.currentWeightKg + fatKg) / newWeight) * 1000) / 10
      : null;
    const newLean = i.currentLeanKg != null ? Math.round((i.currentLeanKg + leanKg) * 10) / 10 : null;
    return { day, weightKg: newWeight, bfPct: newBf, leanKg: newLean };
  });
}
