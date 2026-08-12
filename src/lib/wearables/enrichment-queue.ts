/**
 * Fila de enriquecimento pós-treino com backoff.
 * Após WorkoutCompleted, o relógio pode ainda não ter sincronizado. Enfileira uma
 * tentativa e reprocessa em 30s / 2min / 5min / 15min (ou na próxima abertura do app).
 * Quando os dados chegam, enriquece a sessão de força e emite WorkoutWearableEnriched.
 */
import { runHealthSync, enrichStrengthSession } from './health-sync';
import { CoachEdnHealth } from '@/native/health';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/** Backoff em segundos: 30s, 2min, 5min, 15min. Depois, só na abertura do app. */
export const BACKOFF_SECONDS = [30, 120, 300, 900];

export function nextAttemptDelaySeconds(attempts: number): number | null {
  if (attempts < 0) return null;
  return attempts < BACKOFF_SECONDS.length ? BACKOFF_SECONDS[attempts] : null;
}

export function computeNextAttemptAt(attempts: number, fromIso: string): string | null {
  const d = nextAttemptDelaySeconds(attempts);
  if (d == null) return null;
  return new Date(new Date(fromIso).getTime() + d * 1000).toISOString();
}

/** Enfileira enriquecimento de uma sessão recém-finalizada. */
export async function queueWearableEnrichment(supabase: SB, userId: string, sessionId: string, windowStart: string, windowEnd: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from('pending_wearable_enrichment').insert({
    user_id: userId, workout_session_id: sessionId, target_kind: 'strength',
    window_start: windowStart, window_end: windowEnd,
    attempts: 0, next_attempt_at: computeNextAttemptAt(0, now) ?? now, status: 'pending',
  });
}

/** Processa itens vencidos da fila (chamar na abertura do app / timers). */
export async function processEnrichmentQueue(supabase: SB, userId: string): Promise<{ processed: number; enriched: number; retried: number; gaveUp: number }> {
  const now = new Date().toISOString();
  const { data: items } = await supabase.from('pending_wearable_enrichment')
    .select('*').eq('user_id', userId).eq('status', 'pending').lte('next_attempt_at', now).order('next_attempt_at', { ascending: true }).limit(20);
  let enriched = 0, retried = 0, gaveUp = 0;
  const list = items ?? [];
  const prof = (await supabase.from('profiles').select('age').eq('id', userId).maybeSingle()).data ?? {};
  for (const it of list) {
    let ok = false;
    try {
      const res = await CoachEdnHealth.queryHeartRateSamples({ startTime: it.window_start, endTime: it.window_end });
      if (res.samples?.length) {
        ok = await enrichStrengthSession(supabase, userId, it.workout_session_id, res.samples, null, prof.age ?? null);
      }
    } catch { ok = false; }
    if (ok) {
      await supabase.from('pending_wearable_enrichment').update({ status: 'done', attempts: it.attempts + 1, updated_at: now }).eq('id', it.id);
      enriched++;
    } else {
      const nextAt = computeNextAttemptAt(it.attempts + 1, now);
      if (nextAt) { await supabase.from('pending_wearable_enrichment').update({ attempts: it.attempts + 1, next_attempt_at: nextAt, updated_at: now }).eq('id', it.id); retried++; }
      else { await supabase.from('pending_wearable_enrichment').update({ status: 'gave_up', attempts: it.attempts + 1, updated_at: now }).eq('id', it.id); gaveUp++; }
    }
  }
  return { processed: list.length, enriched, retried, gaveUp };
}

/** Conveniência: roda sync geral + processa fila (na abertura do app). */
export async function onAppOpenHealthTasks(supabase: SB, userId: string): Promise<void> {
  try { await runHealthSync(supabase, userId); } catch { /* */ }
  try { await processEnrichmentQueue(supabase, userId); } catch { /* */ }
}
