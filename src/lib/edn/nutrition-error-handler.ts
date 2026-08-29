// nutrition-error-handler.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §18/§20 — Resposta de erro estruturada (nunca 500 cru quando há
// fallback determinístico possível). Puro.
// ─────────────────────────────────────────────────────────────────────────────

export type NutritionErrorCode =
  | 'NUTRITION_CONTEXT_UNAVAILABLE'
  | 'NUTRITION_CALC_FAILED'
  | 'NUTRITION_PERSIST_FAILED'
  | 'NUTRITION_UNKNOWN';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nutritionErrorPayload(code: NutritionErrorCode, message: string, fallback: any = null) {
  return { success: false, fallback: fallback != null, errorCode: code, message, data: fallback };
}
