/**
 * Coach Alert Engine — EDN V8.1
 * Detecta alertas proativos do atleta (treino, nutrição, cardio, recuperação)
 * a partir de scores/tendências já calculados pelos motores. Determinístico.
 */

export type AlertSeverity = 'info' | 'atencao' | 'critico' | 'positivo';
export type AlertDomain = 'treino' | 'nutricao' | 'cardio' | 'recuperacao' | 'evolucao';

export interface CoachAlert {
  domain: AlertDomain;
  severity: AlertSeverity;
  title: string;
  reason: string;
  action: string;      // ação recomendada (texto)
  ask: string;         // prompt pré-preenchido para o chat
}

export interface AlertInput {
  recoveryCategory: 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
  hrvDropPct: number | null;        // queda de HRV vs baseline (negativo = caiu)
  nutritionScore: number;
  adherencePct: number | null;
  weightTrendKg: number | null;
  goalIsCut: boolean;
  strengthTrendPct: number | null;
  volumeTrendPct: number | null;
  cardioLoadRisk: 'baixo' | 'ideal' | 'elevado' | 'alto' | null;
  periodDays: number;
}

export function buildCoachAlerts(i: AlertInput): CoachAlert[] {
  const out: CoachAlert[] = [];

  // ── Recuperação ───────────────────────────────────────────────────────────
  if (i.recoveryCategory === 'critical' || i.recoveryCategory === 'low') {
    out.push({
      domain: 'recuperacao', severity: i.recoveryCategory === 'critical' ? 'critico' : 'atencao',
      title: 'Recuperação baixa',
      reason: i.hrvDropPct != null && i.hrvDropPct < 0 ? `HRV ${i.hrvDropPct}% abaixo da média / sono insuficiente.` : 'Sinais de baixa recuperação (sono/fadiga).',
      action: 'Reduzir intensidade/volume hoje e priorizar sono.',
      ask: 'Minha recuperação está baixa hoje. Como devo ajustar o treino e a estratégia?',
    });
  }

  // ── Treino ────────────────────────────────────────────────────────────────
  if (i.volumeTrendPct != null && i.volumeTrendPct <= -20) {
    out.push({
      domain: 'treino', severity: 'atencao', title: 'Volume de treino caiu',
      reason: `Volume ${i.volumeTrendPct}% vs a semana anterior — possível fadiga ou desmotivação.`,
      action: 'Revisar consistência e recuperação; talvez um deload.',
      ask: 'Meu volume de treino caiu bastante. É fadiga? Devo fazer deload?',
    });
  } else if (i.strengthTrendPct != null && i.strengthTrendPct < -5 && (i.recoveryCategory === 'good' || i.recoveryCategory === 'excellent')) {
    out.push({
      domain: 'treino', severity: 'atencao', title: 'Força em queda',
      reason: `Força/volume ${i.strengthTrendPct}% mesmo com boa recuperação.`,
      action: 'Checar progressão e nutrição (energia/proteína).',
      ask: 'Minha força caiu mesmo descansado. O que pode estar acontecendo?',
    });
  }

  // ── Nutrição ──────────────────────────────────────────────────────────────
  if (i.adherencePct != null && i.adherencePct < 50) {
    out.push({
      domain: 'nutricao', severity: 'atencao', title: 'Aderência alimentar baixa',
      reason: `Você registrou pouco (${Math.round(i.adherencePct)}%) — sem dados, o ajuste fica no escuro.`,
      action: 'Registrar as refeições nos próximos dias.',
      ask: 'Como melhorar minha aderência alimentar e o que ajustar na dieta?',
    });
  }
  // Platô em corte
  if (i.goalIsCut && i.weightTrendKg != null && Math.abs(i.weightTrendKg) < 0.3 && i.periodDays >= 21) {
    out.push({
      domain: 'nutricao', severity: 'atencao', title: 'Platô de emagrecimento',
      reason: `Peso estável há ${i.periodDays} dias.`,
      action: 'Reavaliar aderência; se ok, pequeno corte ou +cardio.',
      ask: 'Meu peso travou no emagrecimento. O que ajustar?',
    });
  }
  // Perda acelerada em corte
  if (i.goalIsCut && i.weightTrendKg != null && i.weightTrendKg < -1.2 && i.strengthTrendPct != null && i.strengthTrendPct < -5) {
    out.push({
      domain: 'nutricao', severity: 'critico', title: 'Perda acelerada com queda de força',
      reason: 'Peso caindo rápido e força em queda — risco de perda muscular.',
      action: 'Reduzir o déficit e reforçar proteína/carbo no treino.',
      ask: 'Estou perdendo peso rápido e a força caiu. Como preservar músculo?',
    });
  }

  // ── Cardio ────────────────────────────────────────────────────────────────
  if (i.cardioLoadRisk === 'alto') {
    out.push({
      domain: 'cardio', severity: 'atencao', title: 'Carga de corrida elevada',
      reason: 'Aumento de volume acima do recomendado (ACWR alto) — risco de lesão.',
      action: 'Segurar a progressão de km nesta semana.',
      ask: 'Minha carga de corrida subiu demais. Como ajustar para não me lesionar?',
    });
  }

  // ── Evolução positiva (reforço) ───────────────────────────────────────────
  if (i.goalIsCut && i.weightTrendKg != null && i.weightTrendKg < -0.3 && (i.strengthTrendPct == null || i.strengthTrendPct >= -2)) {
    out.push({
      domain: 'evolucao', severity: 'positivo', title: 'Cutting eficiente',
      reason: 'Perdendo peso mantendo a força — recomposição/corte no caminho certo.',
      action: 'Manter a estratégia atual.',
      ask: 'Estou perdendo peso sem perder força. Mantenho tudo como está?',
    });
  }

  return out;
}
