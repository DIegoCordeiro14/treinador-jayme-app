/**
 * Serviço de sincronização de saúde (orquestração).
 * Usa CoachEdnHealth (bridge nativo) + funções puras de native-normalize + Supabase.
 * Cursor incremental (profiles.last_health_sync_at), dedup por provider+externalId,
 * dedup vs força (enriquece workout_session correspondente), estados de sync.
 */
import { CoachEdnHealth } from '@/native/health';
import type { NativeWorkout, SyncState } from '@/native/health/definitions';
import { incrementalWindow, dedupWorkouts, dedupKey, classifyNativeWorkout, toCardioRow, computeSyncState, type StrengthSessionRef } from './native-normalize';
import { mapSetPhysiology } from './strength-physiology';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface SyncResult { state: SyncState; imported: number; enriched: number; skipped: number; lastSyncAt: string; error?: string }

export async function runHealthSync(supabase: SB, userId: string): Promise<SyncResult> {
  const now = new Date().toISOString();
  const avail = await CoachEdnHealth.isAvailable();
  if (!avail.available) return { state: 'not_connected', imported: 0, enriched: 0, skipped: 0, lastSyncAt: now };
  let perms = await CoachEdnHealth.getHealthPermissionsStatus();
  // Sem permissão -> abre a tela do Health Connect para conceder (inclui READ_EXERCISE) e reavalia.
  if (!perms.granted) {
    try { perms = await CoachEdnHealth.requestHealthPermissions(); } catch { /* usuário pode recusar */ }
  }
  if (!perms.granted) return { state: 'permission_required', imported: 0, enriched: 0, skipped: 0, lastSyncAt: now };

  // cursor
  const prof = (await supabase.from('profiles').select('last_health_sync_at, age, resting_hr').eq('id', userId).maybeSingle()).data ?? {};
  const win = incrementalWindow(prof.last_health_sync_at ?? null, now);

  let workouts: NativeWorkout[] = [];
  let withErrors = false;
  try { workouts = (await CoachEdnHealth.queryWorkouts({ startTime: win.startTime, endTime: win.endTime })).workouts; }
  catch { withErrors = true; }

  // dedup por já-importados
  const seen = new Set<string>();
  const { data: existing } = await supabase.from('cardio_sessions').select('source_provider, external_id').eq('user_id', userId).not('external_id', 'is', null);
  for (const e of (existing ?? [])) if (e.external_id) seen.add(dedupKey({ provider: e.source_provider ?? 'health_connect', externalId: e.external_id }));
  const tomb = (await supabase.from('cardio_import_tombstones').select('external_id').eq('user_id', userId)).data ?? [];
  for (const t of tomb) if (t.external_id) seen.add(dedupKey({ provider: 'health_connect', externalId: t.external_id }));
  const fresh = dedupWorkouts(workouts, seen);

  // sessões de força na janela para matching
  const { data: strengthRows } = await supabase.from('workout_sessions').select('id, started_at, finished_at').eq('user_id', userId).gte('started_at', win.startTime);
  const strengthSessions: StrengthSessionRef[] = (strengthRows ?? []).map((s: { id: string; started_at: string; finished_at: string | null }) => ({ id: s.id, startedAt: s.started_at, endedAt: s.finished_at }));

  let imported = 0, enriched = 0, skipped = 0;
  for (const w of fresh) {
    const decision = classifyNativeWorkout(w, strengthSessions);
    if (decision.destination === 'skip') { skipped++; continue; }
    let details;
    try { details = await CoachEdnHealth.queryWorkoutDetails({ externalId: w.externalId, startTime: w.startedAt, endTime: w.endedAt }); }
    catch { withErrors = true; continue; }

    if (decision.destination === 'enrich_strength' && decision.strengthSessionId) {
      await enrichStrengthSession(supabase, userId, decision.strengthSessionId, details.heartRateSamples, details.caloriesActive ?? details.caloriesTotal, prof.age ?? null);
      enriched++; continue;
    }
    // cardio
    const row = toCardioRow(details);
    await supabase.from('cardio_sessions').insert({ user_id: userId, notes: 'Importado do relógio', intensity: 'moderada', ...row });
    imported++;
  }

  await supabase.from('profiles').update({ last_health_sync_at: now }).eq('id', userId);
  const partial = fresh.some(w => w.hasRoute === false && (w.distanceMeters ?? 0) > 0);
  const state = computeSyncState({ available: true, granted: true, syncing: false, found: fresh.length, withErrors, partial });
  return { state, imported, enriched, skipped, lastSyncAt: now, error: withErrors ? 'Alguns registros falharam ao ler' : undefined };
}

/** Enriquece uma sessão de força com FC por série (usa timestamps das séries). */
export async function enrichStrengthSession(supabase: SB, userId: string, sessionId: string, hrSamples: { timestamp: string; bpm: number }[], calories: number | null | undefined, age: number | null): Promise<boolean> {
  if (!hrSamples?.length) return false;
  const { data: sets } = await supabase.from('session_sets').select('id, set_number, started_at, ended_at, max_hr').eq('session_id', sessionId).order('set_number', { ascending: true });
  if (!sets?.length) return false;
  const samples = hrSamples.map(h => ({ t: new Date(h.timestamp).getTime(), bpm: h.bpm })).filter(s => Number.isFinite(s.t));
  const windows = (sets as { id: string; started_at: string | null; ended_at: string | null }[])
    .filter(s => s.started_at && s.ended_at)
    .map((s, i) => ({ setNumber: i, startMs: new Date(s.started_at as string).getTime(), endMs: new Date(s.ended_at as string).getTime(), id: s.id }));
  if (!windows.length) return false;
  const phys = mapSetPhysiology({ sets: windows.map(w => ({ setNumber: w.setNumber, startMs: w.startMs, endMs: w.endMs })), hrSamples: samples, age });
  for (let i = 0; i < windows.length; i++) {
    const p = phys[i]; if (p.avgHr == null) continue;
    await supabase.from('session_sets').update({ avg_hr: p.avgHr, max_hr: p.maxHr, pct_hr_max: p.pctHrMax, hr_zone: p.zone, calories: p.calories }).eq('id', windows[i].id);
  }
  // atualiza resumo na sessão
  const allBpm = samples.map(s => s.bpm);
  if (allBpm.length) {
    const avg = Math.round(allBpm.reduce((a, b) => a + b, 0) / allBpm.length);
    await supabase.from('workout_sessions').update({ avg_hr: avg, max_hr: Math.max(...allBpm), ...(calories != null ? { calories_burned: Math.round(calories) } : {}) }).eq('id', sessionId);
  }
  return true;
}
