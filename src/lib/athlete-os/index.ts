/**
 * Athlete Operating System (AOS) — EDN V8
 * Camada de coordenação ACIMA dos motores. Não substitui nenhum motor: recebe
 * os fatos já calculados (determinísticos), aplica a HIERARQUIA DE PRIORIDADES,
 * elimina decisões conflitantes, anexa CONFIANÇA + MOTIVO + EVIDÊNCIA e devolve
 * a "próxima melhor ação" única e coerente. (Blocos 1, 5, 6, 13, 14.)
 */

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
export type Domain = 'recovery' | 'injury' | 'overreaching' | 'plateau' | 'training' | 'nutrition' | 'cardio' | 'gamification';
export type DecisionKind = 'reduce' | 'deload' | 'maintain' | 'increase' | 'inform';

// Bloco 5 — hierarquia (quanto maior, mais prioritário)
export const DOMAIN_PRIORITY: Record<Domain, number> = {
  recovery: 100, injury: 95, overreaching: 85, plateau: 70, training: 55, nutrition: 45, cardio: 35, gamification: 10,
};

export interface AthleteDecision {
  domain: Domain;
  kind: DecisionKind;
  action: string;
  confidence: number;         // 0–100 (Bloco 6)
  reason: string;             // Bloco 13
  evidence: string[];         // Bloco 13
  rank: number;               // = DOMAIN_PRIORITY
  suppressed?: boolean;       // Bloco 14
  suppressedBy?: Domain;
}

export interface AOSFacts {
  recoveryCategory: RecoveryCategory;
  recoveryScore: number | null;
  hrvDropPct: number | null;         // negativo = HRV caiu
  sleepHours: number | null;
  injuryRisk: 'none' | 'low' | 'high';
  overreaching: boolean;             // volume↑ forte + performance↓
  plateau: boolean;                  // peso/força estagnados
  inDeload: boolean;
  cardioLoadRisk: 'baixo' | 'ideal' | 'elevado' | 'alto' | null;
  strengthTrendPct: number | null;
  weightTrendKg: number | null;
  goalIsCut: boolean;
  nutritionScore: number | null;
  adherencePct: number | null;
  weakPointMuscle: string | null;
  prReady: boolean;                  // motor sinaliza que dá pra tentar PR
}

// Confiança: cada evidência disponível adiciona pontos (dado real > estimativa).
function conf(evidence: string[], base = 55): number {
  return Math.max(0, Math.min(100, base + evidence.length * 8));
}

// Bloco 1/13 — constrói as decisões candidatas de cada domínio.
export function buildDecisions(f: AOSFacts): AthleteDecision[] {
  const out: AthleteDecision[] = [];
  const push = (d: Omit<AthleteDecision, 'rank'>) => out.push({ ...d, rank: DOMAIN_PRIORITY[d.domain] });

  // RECUPERAÇÃO
  if (f.recoveryCategory === 'critical' || f.recoveryCategory === 'low' || (f.hrvDropPct != null && f.hrvDropPct <= -15)) {
    const ev: string[] = [`recuperação ${f.recoveryCategory}`];
    if (f.hrvDropPct != null) ev.push(`HRV ${f.hrvDropPct}%`);
    if (f.sleepHours != null) ev.push(`sono ${f.sleepHours}h`);
    push({ domain: 'recovery', kind: 'reduce', action: 'Reduzir volume/intensidade hoje e priorizar sono.', confidence: conf(ev, 65), reason: 'Sinais de baixa recuperação — treinar pesado agora piora fadiga e limita a evolução.', evidence: ev });
  }

  // LESÃO
  if (f.injuryRisk === 'high') {
    push({ domain: 'injury', kind: 'reduce', action: 'Evitar progressão e cargas máximas; priorizar técnica/mobilidade.', confidence: 80, reason: 'Risco de lesão elevado — nenhuma progressão deve ser aplicada.', evidence: ['risco de lesão alto'] });
  }

  // OVERREACHING
  if (f.overreaching) {
    push({ domain: 'overreaching', kind: 'deload', action: 'Aplicar deload (-40% volume) esta semana.', confidence: conf(['volume acelerado', 'performance em queda']), reason: 'Volume subiu rápido com performance caindo — fadiga acumulada.', evidence: ['volume↑', 'performance↓'] });
  }

  // PLATÔ
  if (f.plateau) {
    push({ domain: 'plateau', kind: 'inform', action: 'Trocar estímulo / ajustar déficit ou volume para destravar.', confidence: conf(['peso/força estáveis']), reason: 'Estagnação detectada — o estímulo atual não está gerando adaptação.', evidence: ['estagnação'] });
  }

  // TREINO (progressão / PR)
  if (f.prReady) {
    const ev = ['histórico de progressão', 'RIR', 'consistência'];
    push({ domain: 'training', kind: 'increase', action: 'Tentar novo PR / subir carga no exercício principal.', confidence: conf(ev, 60), reason: 'Progressão consistente indica prontidão para subir carga.', evidence: ev });
  }
  if (f.weakPointMuscle) {
    push({ domain: 'training', kind: 'increase', action: `Especializar ${f.weakPointMuscle} (+frequência/volume).`, confidence: conf(['evolução de volume por grupo']), reason: `${f.weakPointMuscle} está atrasado vs os demais grupos.`, evidence: ['volume por músculo'] });
  }

  // NUTRIÇÃO
  if (f.goalIsCut && f.weightTrendKg != null && f.weightTrendKg < -1.2 && f.strengthTrendPct != null && f.strengthTrendPct < -5) {
    push({ domain: 'nutrition', kind: 'reduce', action: 'Reduzir o déficit e reforçar proteína/carbo no treino.', confidence: conf(['peso', 'força']), reason: 'Perda rápida com força caindo — risco de perder músculo.', evidence: ['peso↓ rápido', 'força↓'] });
  } else if (f.adherencePct != null && f.adherencePct < 50) {
    push({ domain: 'nutrition', kind: 'inform', action: 'Melhorar a aderência: registrar as refeições.', confidence: conf(['registros alimentares']), reason: 'Sem dados de alimentação, o ajuste fica no escuro.', evidence: [`aderência ${Math.round(f.adherencePct)}%`] });
  }

  // CARDIO
  if (f.cardioLoadRisk === 'alto') {
    push({ domain: 'cardio', kind: 'reduce', action: 'Segurar a progressão de km nesta semana.', confidence: conf(['ACWR']), reason: 'Carga de corrida acima do recomendado (risco de lesão).', evidence: ['ACWR alto'] });
  }

  if (!out.length) {
    push({ domain: 'training', kind: 'maintain', action: 'Manter o plano — sem ajustes necessários agora.', confidence: 60, reason: 'Nenhum sinal crítico nos dados atuais.', evidence: ['estado estável'] });
  }
  return out;
}

export interface AOSResult {
  decisions: AthleteDecision[];      // ordenadas por prioridade (com suprimidas marcadas)
  nextBestAction: AthleteDecision;   // decisão única do sistema
  conflictsResolved: number;
}

// Bloco 5/14 — ordena por prioridade e SUPRIME decisões conflitantes.
export function orchestrate(f: AOSFacts): AOSResult {
  const decisions = buildDecisions(f).sort((a, b) => b.rank - a.rank);

  const recoveryBlocks = f.recoveryCategory === 'critical' || f.recoveryCategory === 'low' || (f.hrvDropPct != null && f.hrvDropPct <= -15);
  const injuryBlocks = f.injuryRisk === 'high';
  const deloadBlocks = f.inDeload || f.overreaching;

  let conflictsResolved = 0;
  for (const d of decisions) {
    if (d.kind !== 'increase') continue;
    // Bloco 14 — proibições: nada de aumentar carga/volume/intensidade sob esses estados.
    if (recoveryBlocks) { d.suppressed = true; d.suppressedBy = 'recovery'; conflictsResolved++; }
    else if (injuryBlocks) { d.suppressed = true; d.suppressedBy = 'injury'; conflictsResolved++; }
    else if (deloadBlocks) { d.suppressed = true; d.suppressedBy = 'overreaching'; conflictsResolved++; }
  }

  const nextBestAction = decisions.find((d) => !d.suppressed) ?? decisions[0];
  return { decisions, nextBestAction, conflictsResolved };
}
