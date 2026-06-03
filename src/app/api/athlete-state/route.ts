import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeAthleteState } from '@/lib/edn/performance-engine';

export const runtime = 'nodejs';
export const maxDuration = 15;

// Cache simples em memória por userId — TTL 30min
const cache = new Map<string, { data: unknown; exp: number }>();

export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const cached = cache.get(user.id);
  if (cached && Date.now() < cached.exp) {
    return Response.json(cached.data, { headers: { 'X-Cache': 'HIT' } });
  }

  const state = await computeAthleteState(user.id);
  cache.set(user.id, { data: state, exp: Date.now() + 30 * 60 * 1000 });
  return Response.json(state);
}

export async function POST(_req: NextRequest) {
  // Invalida cache (chamado após novo treino, nutrição, etc.)
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  cache.delete(user.id);
  const state = await computeAthleteState(user.id);
  cache.set(user.id, { data: state, exp: Date.now() + 30 * 60 * 1000 });
  return Response.json(state);
}
