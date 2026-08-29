// cardio-adherence-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cardio OS §11 — Cardio Adherence Score.
//
// Diferencia "não evoluiu porque não treinou" de "não evoluiu apesar de seguir o
// plano". Mede aderência em dimensões: sessões, volume, intensidade e tipos de
// treino cumpridos. Puro/determinístico. Melhora a interpretação do diagnóstico/IA.
// ─────────────────────────────────────────────────────────────────────────────

export interface CardioAdherenceInput {
  plannedSessions: number;
  doneSessions: number;
  plannedKm: number;
  doneKm: number;
  // tipos planejados vs realizados (ex: {long_run:1, interval:1, easy:1})
  plannedTypes?: Record<string, number>;
  doneTypes?: Record<string, number>;
  // intensidade: fração do tempo na zona correta (0..1), se conhecido
  intensityCompliance?: number | null;
}

export interface CardioAdherenceResult {
  overall: number;                 // 0..100
  sessions: number;                // 0..100
  volume: number;
  intensity: number;
  types: number;
  interpretation: 'followed_plan' | 'partial' | 'did_not_train';
  note: string;
}

const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

export function computeCardioAdherence(i: CardioAdherenceInput): CardioAdherenceResult {
  const sessions = i.plannedSessions > 0 ? pct(i.doneSessions / i.plannedSessions) : (i.doneSessions > 0 ? 100 : 0);
  const volume = i.plannedKm > 0 ? pct(i.doneKm / i.plannedKm) : (i.doneKm > 0 ? 100 : 0);
  const intensity = i.intensityCompliance != null ? pct(i.intensityCompliance) : 70; // neutro se desconhecido

  // tipos: fração de tipos planejados cumpridos (contagem)
  let types = 100;
  if (i.plannedTypes && Object.keys(i.plannedTypes).length) {
    let planned = 0, met = 0;
    for (const [t, n] of Object.entries(i.plannedTypes)) { planned += n; met += Math.min(n, i.doneTypes?.[t] ?? 0); }
    types = planned > 0 ? pct(met / planned) : 100;
  }

  // score geral ponderado: sessões 35 + volume 30 + intensidade 20 + tipos 15
  const overall = Math.round(sessions * 0.35 + volume * 0.30 + intensity * 0.20 + types * 0.15);

  const interpretation: CardioAdherenceResult['interpretation'] =
    overall >= 80 ? 'followed_plan' : overall >= 40 ? 'partial' : 'did_not_train';

  const note = interpretation === 'followed_plan'
    ? 'Plano seguido — se não evoluiu, revisar a estratégia (não a aderência).'
    : interpretation === 'did_not_train'
      ? 'Baixa aderência — o principal fator é a falta de execução do plano.'
      : 'Aderência parcial — execução incompleta limita a leitura de progresso.';

  return { overall, sessions, volume, intensity, types, interpretation, note };
}
