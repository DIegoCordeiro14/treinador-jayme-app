/**
 * Exclusão de corridas — soft delete, restaurar, exclusão definitiva.
 * Soft delete marca deleted_at (some de tudo, para de influenciar scores),
 * cria tombstone (não reimporta) e registra auditoria. RLS garante o dono.
 */
import { computeFingerprint } from './activity-fingerprint';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = any;

function fingerprintOf(userId: string, s: Session): string {
  const coords = s.gps_track?.coordinates ?? [];
  return computeFingerprint({
    userId,
    performedAt: s.performed_at || s.created_at,
    durationSeconds: (s.duration_min ?? 0) * 60,
    distanceMeters: s.distance_km != null ? s.distance_km * 1000 : null,
    activityType: s.type ?? 'Corrida',
    routeStart: coords.length ? { latitude: coords[0].lat, longitude: coords[0].lng } : null,
  });
}

async function audit(supabase: SB, userId: string, sessionId: string, action: string, reason?: string, source?: string) {
  try { await supabase.from('activity_audit_logs').insert({ user_id: userId, session_id: sessionId, action, reason: reason ?? null, source: source ?? null }); } catch { /* non-fatal */ }
}

export async function softDeleteCardio(supabase: SB, userId: string, session: Session, reason = 'manual'): Promise<boolean> {
  const { error } = await supabase.from('cardio_sessions').update({ deleted_at: new Date().toISOString(), deleted_by: userId, deletion_reason: reason }).eq('id', session.id).eq('user_id', userId);
  if (error) return false;
  // secundárias em segundo plano — não bloqueiam a UI
  void (async () => {
    try {
      await supabase.from('cardio_import_tombstones').insert({
        user_id: userId, provider: session.source_provider ?? null, external_id: session.external_id ?? null,
        activity_fingerprint: fingerprintOf(userId, session),
        expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
      });
    } catch { /* non-fatal */ }
    await audit(supabase, userId, session.id, 'soft_deleted', reason, session.source_provider ?? 'coach_edn');
  })();
  return true;
}

export async function restoreCardio(supabase: SB, userId: string, session: Session): Promise<boolean> {
  const { error } = await supabase.from('cardio_sessions').update({ deleted_at: null, deleted_by: null, deletion_reason: null }).eq('id', session.id).eq('user_id', userId);
  if (error) return false;
  try { await supabase.from('cardio_import_tombstones').delete().eq('user_id', userId).eq('activity_fingerprint', fingerprintOf(userId, session)); } catch { /* non-fatal */ }
  await audit(supabase, userId, session.id, 'restored');
  return true;
}

export async function permanentlyDeleteCardio(supabase: SB, userId: string, sessionId: string): Promise<boolean> {
  await audit(supabase, userId, sessionId, 'permanently_deleted');
  const { error } = await supabase.from('cardio_sessions').delete().eq('id', sessionId).eq('user_id', userId);
  return !error;
}
