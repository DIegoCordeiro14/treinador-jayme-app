/**
 * Feedback Loop Engine (§29/§40) — fecha o ciclo
 *   prescrição → execução → dados → análise → ajuste → nova prescrição.
 *
 * Lê a trajetória real de um exercício (carga, reps, RIR ao longo das sessões) e
 * APRENDE qual modelo de progressão aplicar a seguir, interpretando padrões como
 * "a carga subiu mas a margem de esforço caiu". Determinístico e testável.
 * Não substitui suggestProgression (que é por série) — decide a ESTRATÉGIA.
 */

export interface SessionOutcome {
  performedAt: string;   // ISO
  topWeightKg: number;
  reps: number;
  rir: number | null;
  repsMin: number;
  repsMax: number;
}

export type ProgressionModel = 'double_progression' | 'reps_first' | 'consolidate' | 'deload' | 'change_exercise';

export interface FeedbackDecision {
  trajectory: 'progressing' | 'stalling' | 'regressing' | 'overreaching' | 'insufficient';
  model: ProgressionModel;
  loadTrendPct: number | null;      // variação % de carga na janela
  rirTrend: 'rising' | 'flat' | 'falling' | null;
  reason: string;
  learned: string;                  // o que o sistema "aprendeu" com o histórico
  confidence: number;               // 0..1
}

function linearTrendPct(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0], last = values[values.length - 1];
  if (first === 0) return null;
  return Math.round(((last - first) / first) * 1000) / 10;
}

function rirDirection(rirs: (number | null)[]): 'rising' | 'flat' | 'falling' | null {
  const v = rirs.filter((r): r is number => r != null);
  if (v.length < 2) return null;
  const d = v[v.length - 1] - v[0];
  if (d >= 0.75) return 'rising';
  if (d <= -0.75) return 'falling';
  return 'flat';
}

export function analyzeFeedbackLoop(history: SessionOutcome[]): FeedbackDecision {
  const sorted = [...history].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const window = sorted.slice(-5);
  if (window.length < 3) {
    return { trajectory: 'insufficient', model: 'double_progression', loadTrendPct: null, rirTrend: null, reason: 'Histórico insuficiente (mín. 3 sessões) — segue dupla progressão padrão.', learned: 'Ainda coletando dados desse exercício.', confidence: Math.min(0.4, window.length / 5) };
  }

  const weights = window.map(w => w.topWeightKg);
  const loadTrendPct = linearTrendPct(weights);
  const rirTrend = rirDirection(window.map(w => w.rir));
  const last = window[window.length - 1];
  const atTop = last.reps >= last.repsMax;
  const belowMin = last.reps < last.repsMin;
  const stagnantLoad = loadTrendPct != null && Math.abs(loadTrendPct) < 1.0;
  const confidence = Math.min(1, window.length / 5);

  // Carga subiu mas margem caiu → overreaching: consolidar/deload
  if (loadTrendPct != null && loadTrendPct >= 2 && rirTrend === 'falling') {
    const model: ProgressionModel = last.rir != null && last.rir <= 0 ? 'deload' : 'consolidate';
    return { trajectory: 'overreaching', model, loadTrendPct, rirTrend, confidence,
      reason: `A carga subiu ${loadTrendPct}% mas o RIR está caindo — o esforço aumentou mais rápido que a adaptação.`,
      learned: model === 'deload' ? 'Aprendi que este exercício acumulou fadiga: recomendo deload antes de novo avanço.' : 'Aprendi que a última subida foi agressiva: consolidar a carga atual antes de progredir.' };
  }

  // Carga estagnada com RIR baixo e abaixo do mínimo → regressão / trocar estímulo
  if (stagnantLoad && (rirTrend === 'falling' || (last.rir != null && last.rir <= 0)) && belowMin) {
    return { trajectory: 'regressing', model: 'change_exercise', loadTrendPct, rirTrend, confidence,
      reason: `Carga parada e reps abaixo do alvo com pouca margem — sinal de plateau profundo.`,
      learned: 'Aprendi que a progressão travou mesmo perto da falha: considerar trocar o exercício ou variar o estímulo.' };
  }

  // Carga estagnada mas ainda com margem → dupla progressão (subir reps antes da carga)
  if (stagnantLoad && (rirTrend !== 'falling')) {
    const model: ProgressionModel = atTop ? 'double_progression' : 'reps_first';
    return { trajectory: 'stalling', model, loadTrendPct, rirTrend, confidence,
      reason: atTop ? `No topo da faixa com carga estável — pronto para subir carga (dupla progressão).` : `Carga estável e ainda há margem — priorizar ganho de reps antes de subir carga.`,
      learned: 'Aprendi que a carga está madura: o próximo passo é ' + (atTop ? 'subir o peso.' : 'ganhar repetições.') };
  }

  // Carga subindo com RIR estável/alto → progressão saudável
  if (loadTrendPct != null && loadTrendPct >= 1.5 && rirTrend !== 'falling') {
    return { trajectory: 'progressing', model: 'double_progression', loadTrendPct, rirTrend, confidence,
      reason: `Carga subindo ${loadTrendPct}% com margem preservada — adaptação positiva.`,
      learned: 'Aprendi que a progressão está funcionando: manter o modelo atual.' };
  }

  // fallback
  return { trajectory: 'stalling', model: 'reps_first', loadTrendPct, rirTrend, confidence,
    reason: 'Sem tendência clara — priorizar reps dentro da faixa e reavaliar.',
    learned: 'Padrão ambíguo: coletar mais sessões para decidir o modelo.' };
}
