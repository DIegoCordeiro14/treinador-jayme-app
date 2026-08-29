// priority-response-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §11 — Priority Response Engine.
//
// Monitora semanalmente o músculo prioritário. Se responde bem: MAINTAIN. Se
// estagna: INVESTIGATE (checar recuperação → técnica → RIR → volume → seleção →
// frequência) ANTES de aumentar volume ou trocar exercício. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface PriorityResponseInput {
  loadProgressionPct: number | null;
  repsProgressionPct: number | null;
  avgRir: number | null;
  volumeTolerated: boolean;
  discomfort: boolean;
  recoveryOk: boolean;
  weeksSinceProgress: number;
}

export type ResponseAction = 'MAINTAIN' | 'INVESTIGATE';

export interface PriorityResponse {
  action: ResponseAction;
  investigationOrder: string[];   // ordem determinística de causas a checar
  recommendation: string;
}

export function evaluatePriorityResponse(i: PriorityResponseInput): PriorityResponse {
  const progressing = (i.loadProgressionPct ?? 0) >= 2 || (i.repsProgressionPct ?? 0) >= 3;
  if (progressing && !i.discomfort) {
    return { action: 'MAINTAIN', investigationOrder: [], recommendation: 'Boa resposta — manter estímulo e progressão atual.' };
  }

  // Estagnou: INVESTIGAR na ordem certa antes de mexer em volume/exercício
  const order: string[] = [];
  if (!i.recoveryOk) order.push('recuperação');
  order.push('técnica');
  if (i.avgRir != null && i.avgRir >= 3) order.push('RIR (treino frouxo — aproximar da falha)');
  if (!i.volumeTolerated) order.push('reduzir volume (não recuperado)');
  else order.push('volume (aumentar só se houver folga)');
  order.push('seleção de exercício');
  order.push('frequência');

  return {
    action: 'INVESTIGATE',
    investigationOrder: order,
    recommendation: `Estagnado há ${i.weeksSinceProgress} semana(s). Investigar antes de trocar: ${order.join(' → ')}.`,
  };
}
