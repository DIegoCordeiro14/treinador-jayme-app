// performance-composition-matrix.ts
// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 (item 8) — Matriz Performance vs Composição corporal.
//
// Conecta corpo e treino num quadrante e explica prováveis causas:
//              Performance ↑        Performance ↓
//  Comp ↑      🟢 Ideal             🟡 Recuperação
//  Comp ↓      🟡 Estratégia        🔴 Problema
// Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type MatrixQuadrant = 'ideal' | 'recovery' | 'strategy' | 'problem' | 'neutral';

export interface MatrixInput {
  // composição melhorando? (gordura↓ e/ou magra↑)
  compositionDelta: number | null;   // índice: positivo = melhorou
  performanceDelta: number | null;   // % força/volume; positivo = melhorou
  // contexto p/ causas
  recoveryScore?: number | null;
  inDeficit?: boolean;
  sleepShort?: boolean;
  volumeHigh?: boolean;
}

export interface MatrixResult {
  quadrant: MatrixQuadrant;
  emoji: string;
  title: string;
  likelyCauses: string[];
  message: string;
}

const THRESH = 0.5; // zona morta p/ considerar "estável"

export function classifyMatrix(i: MatrixInput): MatrixResult {
  const comp = i.compositionDelta;
  const perf = i.performanceDelta;
  if (comp == null || perf == null) {
    return { quadrant: 'neutral', emoji: '⚪', title: 'Dados insuficientes',
      likelyCauses: [], message: 'Sem dados suficientes de composição e performance.' };
  }
  const compUp = comp > THRESH, compDown = comp < -THRESH;
  const perfUp = perf > THRESH, perfDown = perf < -THRESH;

  if (compUp && perfUp) {
    return { quadrant: 'ideal', emoji: '🟢', title: 'Ideal',
      likelyCauses: ['boa recuperação', 'volume e nutrição adequados'],
      message: 'Composição e performance evoluindo juntas. Não alterar a estratégia.' };
  }
  if (compUp && perfDown) {
    const causes: string[] = [];
    if (i.inDeficit) causes.push('déficit agressivo');
    if (i.sleepShort) causes.push('sono insuficiente');
    if (i.volumeHigh) causes.push('excesso de volume');
    if (i.recoveryScore != null && i.recoveryScore < 45) causes.push('fadiga acumulada');
    if (!causes.length) causes.push('fadiga acumulada');
    return { quadrant: 'recovery', emoji: '🟡', title: 'Recuperação',
      likelyCauses: causes,
      message: 'Corpo melhorando, mas performance caiu — provável limite de recuperação.' };
  }
  if (compDown && perfUp) {
    return { quadrant: 'strategy', emoji: '🟡', title: 'Estratégia',
      likelyCauses: ['fase de ganho/força', 'superávit calórico'],
      message: 'Performance subindo com composição piorando — normal em bulk; monitorar gordura.' };
  }
  if (compDown && perfDown) {
    const causes: string[] = [];
    if (i.sleepShort) causes.push('sono insuficiente');
    if (i.recoveryScore != null && i.recoveryScore < 45) causes.push('recuperação baixa');
    if (i.volumeHigh) causes.push('volume acima do recuperável');
    if (!causes.length) causes.push('sobrecarga/subrecuperação');
    return { quadrant: 'problem', emoji: '🔴', title: 'Problema',
      likelyCauses: causes,
      message: 'Composição e performance piorando — revisar recuperação, volume e nutrição.' };
  }
  return { quadrant: 'neutral', emoji: '⚪', title: 'Estável',
    likelyCauses: [], message: 'Sem mudança significativa em composição ou performance.' };
}
