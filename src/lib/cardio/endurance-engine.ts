/**
 * Endurance Engine — EDN Cardio V8.0
 * Núcleo DETERMINÍSTICO do treinador de endurance. Calcula nível do corredor,
 * carga de treino, zonas de FC, evolução/platô/fadiga, fase de prova, ajuste
 * adaptativo, GPS Confidence e o painel "Meu momento na corrida".
 * A IA apenas interpreta o que sai daqui — nunca inventa pace/FC/zonas/carga.
 */

export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

// ── 2. Classificação do corredor ────────────────────────────────────────────
export type RunnerLevel = 'iniciante' | 'intermediario' | 'avancado' | 'competitivo';
export const RUNNER_LEVEL_LABEL: Record<RunnerLevel, string> = {
  iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado', competitivo: 'Atleta competitivo',
};

export interface RunnerClassInput {
  weeklyKmAvg: number;      // média de km/semana (últimas 4-8 semanas)
  sessionsPerWeek: number;  // média de sessões/semana
  weeksConsistent: number;  // semanas seguidas com ≥1 corrida
  longestKm: number;        // maior corrida registrada
}

export interface RunnerClassResult {
  level: RunnerLevel;
  label: string;
  reasons: string[];
}

export function classifyRunner(i: RunnerClassInput): RunnerClassResult {
  const reasons: string[] = [];
  let level: RunnerLevel = 'iniciante';
  if (i.weeklyKmAvg >= 50 && i.weeksConsistent >= 12 && i.longestKm >= 21) level = 'competitivo';
  else if (i.weeklyKmAvg >= 30 && i.weeksConsistent >= 8) level = 'avancado';
  else if (i.weeklyKmAvg >= 12 && i.sessionsPerWeek >= 2 && i.weeksConsistent >= 4) level = 'intermediario';
  else level = 'iniciante';
  reasons.push(`Volume ~${i.weeklyKmAvg.toFixed(0)}km/sem`);
  reasons.push(`${i.sessionsPerWeek.toFixed(1)} sessões/sem`);
  reasons.push(`${i.weeksConsistent} sem. consistentes`);
  if (i.longestKm > 0) reasons.push(`maior corrida ${i.longestKm.toFixed(0)}km`);
  return { level, label: RUNNER_LEVEL_LABEL[level], reasons };
}

// ── 3. Carga de treino (Cardio Load Score) ──────────────────────────────────
export interface CardioLoadInput {
  km7: number;
  km28: number;
  km90: number;
  sessions7: number;
}

export interface CardioLoadResult {
  score: number;            // 0–100 (carga aguda relativa)
  acwr: number;             // razão carga aguda/crônica (km7 / média semanal de 28d)
  rampPct: number;          // variação do volume da semana vs média de 28d
  risk: 'baixo' | 'ideal' | 'elevado' | 'alto';
  note: string;
}

export function computeCardioLoad(i: CardioLoadInput): CardioLoadResult {
  const chronicWeekly = i.km28 > 0 ? i.km28 / 4 : 0;
  const acwr = chronicWeekly > 0 ? Math.round((i.km7 / chronicWeekly) * 100) / 100 : (i.km7 > 0 ? 2 : 0);
  const rampPct = chronicWeekly > 0 ? Math.round(((i.km7 - chronicWeekly) / chronicWeekly) * 100) : 0;
  // Score: zona ideal de ACWR ~0.8-1.3. Acima sobe rápido.
  let score: number;
  if (acwr <= 1.3) score = Math.round(Math.min(70, acwr * 54));     // até 70 dentro do saudável
  else score = Math.round(Math.min(100, 70 + (acwr - 1.3) * 60));   // acima de 1.3 cresce o risco
  const risk: CardioLoadResult['risk'] = acwr === 0 ? 'baixo' : acwr < 0.8 ? 'baixo' : acwr <= 1.3 ? 'ideal' : acwr <= 1.5 ? 'elevado' : 'alto';
  const note = risk === 'alto'
    ? `Você aumentou ~${rampPct}% o volume vs sua média. Risco de fadiga/lesão elevado — segure a progressão.`
    : risk === 'elevado'
      ? `Volume ${rampPct > 0 ? '+' : ''}${rampPct}% acima da média. Progressão na borda — monitore a recuperação.`
      : risk === 'baixo'
        ? 'Carga baixa — há espaço para progredir com segurança.'
        : 'Carga na zona ideal de progressão (ACWR saudável).';
  return { score, acwr, rampPct, risk, note };
}

// ── 4. Zonas de treino ──────────────────────────────────────────────────────
export interface ZonesInput {
  age: number | null;
  maxHrMeasured: number | null;   // FC máx real do relógio (prioridade)
  restingHr: number | null;       // FC repouso (Karvonen)
}

export interface HrZone { zone: string; label: string; hrLow: number; hrHigh: number; }
export interface ZonesResult {
  source: 'medido' | 'estimado';
  maxHr: number;
  zones: HrZone[];
}

export function computeTrainingZones(i: ZonesInput): ZonesResult | null {
  const maxHr = i.maxHrMeasured ?? (i.age ? 220 - i.age : null);
  if (!maxHr) return null;
  const source: ZonesResult['source'] = i.maxHrMeasured ? 'medido' : 'estimado';
  const rest = i.restingHr ?? null;
  // Karvonen quando há FC repouso; senão % da FC máx
  const at = (pct: number) => rest != null ? Math.round(rest + (maxHr - rest) * pct) : Math.round(maxHr * pct);
  const zones: HrZone[] = [
    { zone: 'Z1', label: 'Recuperação', hrLow: at(0.50), hrHigh: at(0.60) },
    { zone: 'Z2', label: 'Base aeróbica', hrLow: at(0.60), hrHigh: at(0.70) },
    { zone: 'Z3', label: 'Ritmo', hrLow: at(0.70), hrHigh: at(0.80) },
    { zone: 'Z4', label: 'Limiar', hrLow: at(0.80), hrHigh: at(0.90) },
    { zone: 'Z5', label: 'Esforço máximo', hrLow: at(0.90), hrHigh: maxHr },
  ];
  return { source, maxHr, zones };
}

// ── 7/8. Analista de performance + platô ────────────────────────────────────
export interface RunPoint { dateMs: number; km: number; durationMin: number; avgHr: number | null; }
export interface PerfInput { runs: RunPoint[]; periodDays: number; }
export interface PerfResult {
  status: 'evolucao' | 'plato' | 'fadiga' | 'dados_insuficientes';
  paceTrendPct: number | null;   // negativo = mais rápido (melhor)
  hrTrendPct: number | null;     // negativo = menos esforço (melhor)
  message: string;
  biggestImprovement: string | null;
}

function avgPace(runs: RunPoint[]): number | null {
  const valid = runs.filter((r) => r.km > 0 && r.durationMin > 0);
  if (!valid.length) return null;
  return valid.reduce((a, r) => a + r.durationMin / r.km, 0) / valid.length;
}
function avgHr(runs: RunPoint[]): number | null {
  const valid = runs.filter((r) => r.avgHr != null && r.avgHr > 0);
  if (!valid.length) return null;
  return valid.reduce((a, r) => a + (r.avgHr as number), 0) / valid.length;
}

export function analyzeRunPerformance(i: PerfInput): PerfResult {
  const runs = [...i.runs].sort((a, b) => a.dateMs - b.dateMs);
  if (runs.length < 4) return { status: 'dados_insuficientes', paceTrendPct: null, hrTrendPct: null, message: 'Registre mais corridas para a análise de evolução.', biggestImprovement: null };
  const mid = Math.floor(runs.length / 2);
  const older = runs.slice(0, mid), recent = runs.slice(mid);
  const p1 = avgPace(older), p2 = avgPace(recent);
  const h1 = avgHr(older), h2 = avgHr(recent);
  const paceTrendPct = p1 && p2 ? Math.round(((p2 - p1) / p1) * 1000) / 10 : null;
  const hrTrendPct = h1 && h2 ? Math.round(((h2 - h1) / h1) * 1000) / 10 : null;

  let status: PerfResult['status'] = 'plato';
  let message = 'Seu pace está estável no período — considere variar estímulos (intervalado/limiar).';
  let biggestImprovement: string | null = null;

  if (paceTrendPct != null && paceTrendPct <= -2) {
    status = 'evolucao';
    biggestImprovement = 'Pace';
    message = hrTrendPct != null && hrTrendPct <= 0
      ? `Seu pace melhorou ${Math.abs(paceTrendPct)}% mantendo/baixando a FC — sua eficiência aeróbica evoluiu.`
      : `Seu pace melhorou ${Math.abs(paceTrendPct)}% no período.`;
  } else if (paceTrendPct != null && paceTrendPct >= 3 && hrTrendPct != null && hrTrendPct >= 2) {
    status = 'fadiga';
    message = `Seu pace piorou ${paceTrendPct}% mesmo com FC mais alta — sinais de fadiga/baixa recuperação.`;
  } else if (hrTrendPct != null && hrTrendPct <= -3) {
    status = 'evolucao';
    biggestImprovement = 'Eficiência (FC)';
    message = `Mesma corrida com FC ${Math.abs(hrTrendPct)}% menor — eficiência aeróbica em alta.`;
  }
  return { status, paceTrendPct, hrTrendPct, message, biggestImprovement };
}

// ── 6. Periodização de prova ────────────────────────────────────────────────
export interface RacePhaseInput { weeksToRace: number | null; }
export interface RacePhaseResult { phase: 'base' | 'construcao' | 'pico' | 'taper' | null; label: string; objective: string; }

export function deriveRacePhase(i: RacePhaseInput): RacePhaseResult {
  const w = i.weeksToRace;
  if (w == null || w < 0) return { phase: null, label: 'Sem prova marcada', objective: 'Treino livre conforme objetivo atual.' };
  if (w <= 1) return { phase: 'taper', label: 'Taper', objective: 'Reduzir volume, manter intensidade leve — chegar descansado.' };
  if (w <= 3) return { phase: 'pico', label: 'Pico', objective: 'Maior intensidade específica de prova, volume começando a cair.' };
  if (w <= 8) return { phase: 'construcao', label: 'Construção', objective: 'Aumentar intensidade (limiar/ritmo de prova) sobre a base.' };
  return { phase: 'base', label: 'Base', objective: 'Construir volume e resistência aeróbica (Z2).' };
}

// ── 5. Treino adaptativo ────────────────────────────────────────────────────
export interface AdaptiveInput {
  plannedKm: number | null;
  plannedZone: string | null;       // ex: 'Z4'
  recoveryCategory: RecoveryCategory;
}
export interface AdaptiveResult { adjusted: boolean; km: number | null; zone: string | null; reason: string; }

export function adaptiveWorkout(i: AdaptiveInput): AdaptiveResult {
  if (i.plannedKm == null) return { adjusted: false, km: null, zone: i.plannedZone, reason: 'Sem treino planejado para hoje.' };
  if (i.recoveryCategory === 'critical') {
    return { adjusted: true, km: Math.max(0, Math.round(i.plannedKm * 0.5)), zone: 'Z1', reason: 'Recuperação crítica — sessão reduzida e em Z1, prioridade é recuperar.' };
  }
  if (i.recoveryCategory === 'low') {
    return { adjusted: true, km: Math.round(i.plannedKm * 0.75), zone: 'Z2', reason: 'Recuperação baixa — volume reduzido e intensidade rebaixada para Z2.' };
  }
  return { adjusted: false, km: i.plannedKm, zone: i.plannedZone, reason: 'Recuperação adequada — manter o treino planejado.' };
}

// ── 14. GPS Confidence Score ────────────────────────────────────────────────
export interface GpsConfidenceInput { totalPoints: number; removedPoints: number; weakSignalSeconds: number; }
export interface GpsConfidenceResult { score: number; issues: string[]; }

export function computeGpsConfidence(i: GpsConfidenceInput): GpsConfidenceResult {
  const issues: string[] = [];
  if (i.totalPoints <= 0) return { score: 0, issues: ['Sem pontos de GPS.'] };
  const removedRatio = i.removedPoints / Math.max(1, i.totalPoints + i.removedPoints);
  let score = 100 - Math.round(removedRatio * 100) - Math.min(20, Math.round(i.weakSignalSeconds / 3));
  score = Math.max(0, Math.min(100, score));
  if (i.removedPoints > 0) issues.push(`${i.removedPoints} ponto(s) removido(s) por anomalia`);
  if (i.weakSignalSeconds > 0) issues.push(`Sinal fraco por ~${i.weakSignalSeconds}s`);
  if (!issues.length) issues.push('Sinal estável durante toda a corrida.');
  return { score, issues };
}

// ── 12. Dashboard "Meu momento na corrida" ──────────────────────────────────
export interface RunnerMomentInput {
  levelLabel: string;
  performanceStatus: PerfResult['status'];
  biggestImprovement: string | null;
  loadRisk: CardioLoadResult['risk'];
  recoveryCategory: RecoveryCategory;
  nextWorkout: string;
}
export interface RunnerMoment {
  level: string;
  form: string;          // forma atual
  biggestImprovement: string;
  limiter: string;
  nextWorkout: string;
}

export function buildRunnerMoment(i: RunnerMomentInput): RunnerMoment {
  const form = i.performanceStatus === 'evolucao' ? 'Boa evolução'
    : i.performanceStatus === 'fadiga' ? 'Sinais de fadiga'
    : i.performanceStatus === 'plato' ? 'Estável (platô)' : 'Em construção';
  let limiter = 'Nada crítico';
  if (i.recoveryCategory === 'low' || i.recoveryCategory === 'critical') limiter = 'Recuperação';
  else if (i.loadRisk === 'alto' || i.loadRisk === 'elevado') limiter = 'Carga de treino';
  else if (i.performanceStatus === 'plato') limiter = 'Variedade de estímulo';
  return {
    level: i.levelLabel,
    form,
    biggestImprovement: i.biggestImprovement ?? '—',
    limiter,
    nextWorkout: i.nextWorkout,
  };
}

// ── Cardio Score (0–100) para o EDN 360 ─────────────────────────────────────
export function computeCardioScore(i: { cardioSessions7: number; targetSessions?: number; loadRisk: CardioLoadResult['risk'] }): number {
  const target = i.targetSessions ?? 3;
  const consistency = Math.round(Math.min(1, i.cardioSessions7 / Math.max(1, target)) * 70);
  const loadBonus = i.loadRisk === 'ideal' ? 30 : i.loadRisk === 'baixo' ? 18 : i.loadRisk === 'elevado' ? 10 : 0;
  return Math.max(0, Math.min(100, consistency + loadBonus));
}
