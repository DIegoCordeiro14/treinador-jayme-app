/**
 * Telemetria + auditoria do AthleteState — AOS Bloco 15
 * Persiste um snapshot versionado do estado APENAS quando a versão muda
 * (dedup por (user, version)), servindo de trilha de auditoria das decisões da IA.
 */
import type { AthleteState } from './athlete-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function persistStateSnapshot(supabase: any, userId: string, state: AthleteState): Promise<void> {
  try {
    await supabase.from('athlete_state_snapshots').upsert({
      user_id: userId,
      version: state.version,
      state,
      next_best_action: state.nextBestAction?.action ?? null,
      confidence: state.nextBestAction?.confidence ?? null,
    }, { onConflict: 'user_id,version' });
  } catch { /* não-fatal (tabela pode faltar) */ }
}
