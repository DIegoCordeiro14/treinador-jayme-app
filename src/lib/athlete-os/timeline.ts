/**
 * Timeline Inteligente — AOS Bloco 11
 * Registra automaticamente marcos do atleta (PR, mudança de fase, novo plano,
 * deload, nova prova, decisão da IA…) numa linha do tempo reutilizável por
 * Coach, Dashboard, Relatórios, Feed e Evolução.
 */
export type TimelineKind =
  | 'pr' | 'phase_change' | 'new_plan' | 'mesocycle' | 'deload' | 'nutrition_change'
  | 'bioimpedance' | 'weight_change' | 'race_scheduled' | 'goal_change'
  | 'specialization_change' | 'ai_decision' | 'achievement';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logTimeline(supabase: any, userId: string, kind: TimelineKind, title: string, detail?: string, meta?: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from('athlete_timeline').insert({ user_id: userId, kind, title, detail: detail ?? null, meta: meta ?? null });
  } catch { /* tabela pode faltar — não-fatal */ }
}
