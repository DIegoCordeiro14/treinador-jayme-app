import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultProvider } from '@/lib/ai-coach';
import { format, subDays } from 'date-fns';

export const runtime = 'nodejs';
export const maxDuration = 20;

const cache = new Map<string, { data: unknown; exp: number }>();

export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const cached = cache.get(user.id);
  if (cached && Date.now() < cached.exp) return Response.json(cached.data, { headers: { 'X-Cache': 'HIT' } });

  const now = new Date();
  const d14 = subDays(now, 14);

  const [
    { data: foodLogs },
    { data: bioList },
    { data: weightLogs },
    { data: sessions },
    { data: profile },
  ] = await Promise.all([
    supabase.from('food_logs').select('protein_g, calories_kcal, logged_at').eq('user_id', user.id).gte('logged_at', format(d14, 'yyyy-MM-dd')).order('logged_at', { ascending: false }),
    supabase.from('bioimpedance_data').select('weight_kg, body_fat_pct, skeletal_muscle_mass_kg, measured_at').eq('user_id', user.id).order('measured_at', { ascending: false }).limit(3),
    supabase.from('body_weight_logs').select('weight_kg, log_date').eq('user_id', user.id).gte('log_date', format(d14, 'yyyy-MM-dd')).order('log_date', { ascending: true }),
    supabase.from('workout_sessions').select('id').eq('user_id', user.id).gte('started_at', d14.toISOString()),
    supabase.from('profiles').select('goal, weight_kg').eq('id', user.id).single(),
  ]);

  const wLogs = weightLogs ?? [];
  const weightChange = wLogs.length >= 2 ? wLogs[wLogs.length - 1].weight_kg - wLogs[0].weight_kg : null;
  const latestBio = bioList?.[0];
  const prevBio   = bioList?.[1];
  const muscleChange = (latestBio && prevBio) ? latestBio.skeletal_muscle_mass_kg - prevBio.skeletal_muscle_mass_kg : null;

  const logs = foodLogs ?? [];
  const daysLogged = new Set(logs.map((l: { logged_at: string }) => l.logged_at)).size;
  const avgProtein = logs.length > 0 ? logs.reduce((s: number, l: { protein_g: number | null }) => s + (l.protein_g ?? 0), 0) / Math.max(daysLogged, 1) : null;
  const proteinTarget = (profile?.weight_kg ?? 80) * 2.2;

  const fallback = {
    status: daysLogged === 0 ? 'atencao' : weightChange !== null && Math.abs(weightChange) > 0.2 ? 'aprovado' : 'atencao',
    headline: weightChange !== null
      ? `${weightChange < 0 ? 'Perdeu' : 'Ganhou'} ${Math.abs(weightChange).toFixed(1)}kg em 14 dias${muscleChange !== null && muscleChange >= -0.2 ? ' com massa muscular preservada' : ''}`
      : 'Registre peso regularmente para diagnóstico completo',
    analysis: [
      weightChange !== null ? `Variação de peso: ${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}kg` : 'Sem dados de peso suficientes',
      avgProtein ? `Proteína média: ${Math.round(avgProtein)}g/dia (meta: ${Math.round(proteinTarget)}g)` : 'Registre refeições para análise de proteína',
      muscleChange !== null ? `Massa muscular: ${muscleChange >= -0.2 ? 'preservada ✅' : `perda de ${Math.abs(muscleChange).toFixed(2)}kg ⚠️`}` : 'Atualize bioimpedância para acompanhar composição corporal',
    ],
    alerts: avgProtein !== null && avgProtein < proteinTarget * 0.8 ? [`Proteína média (${Math.round(avgProtein)}g) abaixo de 80% da meta (${Math.round(proteinTarget)}g)`] : [],
    recommendation: daysLogged < 5 ? 'Registre refeições diariamente para diagnóstico preciso' : muscleChange !== null && muscleChange < -0.3 ? 'Aumente proteína e reduza o déficit calórico — risco de perda muscular' : 'Estratégia atual aprovada — mantenha consistência',
    muscle_preserved: muscleChange !== null ? muscleChange >= -0.2 : null,
  };
  cache.set(user.id, { data: fallback, exp: Date.now() + 60 * 60 * 1000 });
  return Response.json(fallback);
}
