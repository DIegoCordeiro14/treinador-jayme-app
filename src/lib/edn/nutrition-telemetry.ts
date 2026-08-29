// nutrition-telemetry.ts
// ─────────────────────────────────────────────────────────────────────────────
// v-Nutrição §22 — Telemetria LEVE (privacidade em 1º lugar).
//
// Registra apenas METADADOS para entender uso/qualidade (recalibração, decisões,
// confiança média, campos estimados). NUNCA registra imagens de refeições,
// documentos médicos ou dados sensíveis brutos. Helper fire-and-forget.
// ─────────────────────────────────────────────────────────────────────────────

export type NutritionTelemetryEvent = 'targets_computed' | 'decision' | 'recalibration' | 'coach_analysis';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logNutritionTelemetry(supabase: any, userId: string, event: NutritionTelemetryEvent, payload: Record<string, unknown>) {
  try {
    // sanitiza: só chaves permitidas (metadados), remove qualquer valor grande/binário
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v == null) continue;
      if (typeof v === 'string' && v.length > 120) continue;   // evita textos longos/base64
      if (typeof v === 'object') continue;                     // evita objetos aninhados grandes
      safe[k] = v;
    }
    await supabase.from('nutrition_telemetry').insert({ user_id: userId, event, payload: safe });
  } catch { /* telemetria nunca bloqueia o fluxo */ }
}
