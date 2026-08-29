import { NextRequest } from 'next/server';
import { createClient as createCookieClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/delete-account — exclusão de conta ROBUSTA e definitiva.
 *
 * Diferente do antigo delete de `profiles` (que deixava órfãos por toda parte),
 * esta rota purga TODOS os dados do usuário de forma determinística:
 *   1. Autentica o usuário pela sessão (cookie) — nunca aceita user_id do corpo.
 *   2. Remove os arquivos dos 3 buckets de storage sob a pasta `${user.id}/`.
 *   3. Apaga as linhas de todas as tabelas com `user_id` (best-effort, ordenado
 *      para respeitar FKs; nenhuma falha isolada interrompe a purga).
 *   4. Apaga a linha canônica em `profiles`.
 *   5. Remove o usuário do Auth (auth.admin.deleteUser) — irreversível.
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY (as tabelas têm RLS; a purga cross-tabela
 * precisa do service role). Sem ela, retorna 500 e nada é apagado.
 */

// Ordem importa: filhos antes de pais para não violar FKs.
const USER_TABLES: string[] = [
  // dependentes de sessões/planos/condições primeiro
  'workout_exercise_sets', 'workout_discomfort_logs', 'cardio_gps_points',
  'cardio_heart_rate_samples', 'cardio_session_sources', 'cardio_import_tombstones',
  'physical_condition_documents', 'activity_comments', 'activity_reactions',
  'activity_audit_logs', 'challenge_participants', 'team_members', 'xp_logs',
  'nutrition_logs', 'nutrition_vision_events', 'nutrition_telemetry',
  'workout_plan_versions', 'pending_wearable_enrichment', 'activity_fatigue_signals',
  // registros longitudinais / decisões / snapshots
  'athlete_daily_snapshots', 'athlete_state_snapshots', 'athlete_decisions',
  'athlete_memory', 'athlete_timeline', 'coach_decisions', 'cardio_decisions',
  'nutrition_decisions', 'deloads', 'progressions', 'recovery_logs',
  'personal_records', 'achievements', 'activity_feed', 'leaderboard', 'user_xp',
  // dados brutos e perfis derivados
  'bioimpedance_data', 'body_measurements', 'body_weight_logs', 'wearable_metrics',
  'food_logs', 'user_food_preferences', 'user_meal_templates', 'exercise_preferences',
  'nutrition_goals', 'running_goals', 'cardio_response_profiles',
  'training_response_profiles',
  // pais
  'active_cardio_sessions', 'cardio_sessions', 'workout_sessions',
  'ai_conversations', 'physical_conditions', 'challenges', 'workout_plans',
];

const STORAGE_BUCKETS = ['avatars', 'meal-photos', 'medical-docs'];

async function purgeBucket(admin: SupabaseClient, bucket: string, userId: string) {
  // lista recursiva rasa: arquivos diretos + um nível de subpasta (medical-docs usa `${uid}/${condId}/...`)
  const removed: string[] = [];
  const { data: top } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
  for (const entry of top ?? []) {
    if (entry.id === null) {
      // é uma "pasta" (sem id) — desce um nível
      const sub = `${userId}/${entry.name}`;
      const { data: inner } = await admin.storage.from(bucket).list(sub, { limit: 1000 });
      for (const f of inner ?? []) removed.push(`${sub}/${f.name}`);
    } else {
      removed.push(`${userId}/${entry.name}`);
    }
  }
  if (removed.length) {
    try { await admin.storage.from(bucket).remove(removed); } catch { /* best-effort */ }
  }
  return removed.length;
}

export async function POST(_req: NextRequest) {
  const supabase = createCookieClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json(
      { error: 'Exclusão indisponível: service role não configurado no servidor.' },
      { status: 500 },
    );
  }
  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } });
  const userId = user.id;

  const tableErrors: Record<string, string> = {};
  let filesRemoved = 0;

  // 1) storage
  for (const b of STORAGE_BUCKETS) {
    try { filesRemoved += await purgeBucket(admin, b, userId); }
    catch (e) { tableErrors[`storage:${b}`] = (e as Error).message; }
  }

  // 2) tabelas (best-effort; tabela inexistente ou erro isolado não aborta)
  for (const t of USER_TABLES) {
    const { error } = await admin.from(t).delete().eq('user_id', userId);
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      tableErrors[t] = error.message;
    }
  }

  // 3) profiles (linha canônica; PK = id)
  {
    const { error } = await admin.from('profiles').delete().eq('id', userId);
    if (error) tableErrors['profiles'] = error.message;
  }

  // 4) auth user — irreversível; por último para que uma falha antes não deixe
  //    o login ativo sem dados.
  let authDeleted = false;
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) tableErrors['auth.user'] = error.message;
    else authDeleted = true;
  } catch (e) {
    tableErrors['auth.user'] = (e as Error).message;
  }

  const ok = authDeleted && Object.keys(tableErrors).length === 0;
  return Response.json(
    { ok, authDeleted, filesRemoved, tablesPurged: USER_TABLES.length, errors: tableErrors },
    { status: ok ? 200 : 207 },
  );
}
