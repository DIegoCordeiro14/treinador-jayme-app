// src/lib/athlete-data/realtime-sync.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sync cross-device (§17/§19). Assina mudanças (Supabase Realtime) nas tabelas
// corporais do próprio atleta e reemite um athlete-event local — assim, um peso
// registrado no celular atualiza o dashboard aberto no desktop, sem polling.
//
// Defensivo: se o Realtime não estiver habilitado, apenas não dispara (sem erro).
// Só assina linhas do próprio user_id; nunca observa dados de terceiros.
// ─────────────────────────────────────────────────────────────────────────────

import { emitAthleteEvent } from './athlete-events';
import type { AthleteEventType } from './athlete-events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

const TABLE_EVENT: Record<string, AthleteEventType> = {
  body_weight_logs: 'WEIGHT_UPDATED',
  bioimpedance_data: 'BIOIMPEDANCE_IMPORTED',
  athlete_measurements: 'BODY_MEASUREMENT_CREATED',
};

/**
 * Inicia a assinatura realtime das medições corporais do usuário. Retorna uma
 * função de limpeza (remove o canal). Chamar uma vez por sessão de UI.
 */
export function subscribeAthleteRealtime(supabase: SupabaseLike, userId: string): () => void {
  if (!supabase?.channel || !userId) return () => {};
  const channel = supabase.channel(`athlete-body:${userId}`);
  for (const [table, eventType] of Object.entries(TABLE_EVENT)) {
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table, filter: `user_id=eq.${userId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        emitAthleteEvent({
          userId, eventType, occurredAt: new Date().toISOString(),
          entityId: payload?.new?.id ?? null,
          source: table === 'bioimpedance_data' ? 'bioimpedance' : table === 'athlete_measurements' ? 'manual' : 'evolution',
        });
      },
    );
  }
  channel.subscribe();
  return () => { try { supabase.removeChannel(channel); } catch { /* */ } };
}
