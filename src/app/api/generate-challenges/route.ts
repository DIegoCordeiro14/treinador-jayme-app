import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { addDays, format, startOfWeek } from 'date-fns';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [
      { data: xpData },
      { data: plan },
      { data: recentSessions },
      { data: bioData },
      { data: existingChallenges },
    ] = await Promise.all([
      supabase.from('user_xp').select('xp_total, level').eq('user_id', user.id).single(),
      supabase.from('workout_plans').select('goal, days_per_week').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('workout_sessions')
        .select('started_at, total_volume_kg')
        .eq('user_id', user.id)
        .gte('started_at', format(addDays(new Date(), -28), 'yyyy-MM-dd'))
        .order('started_at', { ascending: false }),
      supabase.from('bioimpedance_data')
        .select('body_fat_pct, skeletal_muscle_mass_kg')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('challenges').select('id').eq('user_id', user.id).eq('is_active', true),
    ]);

    // Deactivate existing personal challenges
    if (existingChallenges && existingChallenges.length > 0) {
      await supabase.from('challenges').update({ is_active: false }).eq('user_id', user.id).eq('is_active', true);
    }

    const level = xpData?.level ?? 1;
    const xpTotal = xpData?.xp_total ?? 0;
    const goal = plan?.goal ?? 'hypertrophy';
    const daysPerWeek = plan?.days_per_week ?? 3;
    const sessions28 = recentSessions ?? [];
    const sessionsPerWeek = Math.round(sessions28.length / 4);
    const totalVolume28 = sessions28.reduce((s, ws) => s + (ws.total_volume_kg ?? 0), 0);
    const avgVolumePerSession = sessions28.length > 0 ? Math.round(totalVolume28 / sessions28.length) : 0;
    const difficultyLevel = Math.min(5, Math.ceil(level / 3));

    const goalMap: Record<string, string> = {
      hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento',
      definition: 'Definicao', strength: 'Forca',
    };

    const bioCtx = bioData
      ? 'BF=' + bioData.body_fat_pct + '% musculo=' + bioData.skeletal_muscle_mass_kg + 'kg'
      : 'sem dados';

    const daysPerWeekNum = daysPerWeek;
    const sessionPerWeekNum = sessionsPerWeek;
    const avgVolNum = avgVolumePerSession;
    const diffNum = difficultyLevel;

    const prompt = [
      'Voce e Jayme De Lamadrid (EDN). Gere 4 desafios pessoais para este atleta.',
      '',
      'PERFIL:',
      '- Nivel ' + level + ' (' + xpTotal + ' XP)',
      '- Objetivo: ' + (goalMap[goal] ?? goal),
      '- Plano: ' + daysPerWeekNum + ' treinos/sem',
      '- Media real: ' + sessionPerWeekNum + ' treinos/sem (4 semanas)',
      '- Volume medio/sessao: ' + avgVolNum + 'kg',
      '- Bioimpedancia: ' + bioCtx,
      '- Dificuldade: ' + diffNum + '/5',
      '',
      'REGRAS:',
      '- Metas moderadamente acima do historico (desafiador mas alcancavel)',
      '- Dificuldade ' + diffNum + '/5: quanto maior, mais exigente',
      '- Misture: 1 consistencia, 1 volume, 1 frequencia, 1 progressao',
      '- XP: dif1=50-100, dif3=150-250, dif5=300-500',
      '',
      'JSON (array de 4 objetos):',
      '[{"title":"","description":"","type":"consistency|progression|volume|frequency","tracking_type":"sessions_count|volume_kg|days_active","tracking_period":"weekly|monthly","target_value":4,"target_unit":"sessoes|kg|dias","xp_reward":100}]',
      '',
      'Apenas JSON.',
    ].join('\n');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'API key not configured' }, { status: 500 });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return Response.json({ error: 'AI did not return valid JSON' }, { status: 422 });

    const generated: any[] = JSON.parse(jsonMatch[0]);
    const now = new Date();
    // A contagem só começa no primeiro treino do usuário após a criação (ver página de Desafios).
    const startDate = format(now, 'yyyy-MM-dd');

    const toInsert = generated.map((c) => ({
      user_id: user.id,
      title: String(c.title),
      description: String(c.description),
      type: String(c.type),
      tracking_type: String(c.tracking_type ?? 'sessions_count'),
      tracking_period: String(c.tracking_period ?? 'weekly'),
      target_value: Number(c.target_value),
      target_unit: String(c.target_unit),
      xp_reward: Number(c.xp_reward),
      difficulty_level: difficultyLevel,
      start_date: startDate,
      end_date: format(addDays(new Date(startDate), c.tracking_period === 'monthly' ? 30 : 7), 'yyyy-MM-dd'),
      is_active: true,
    }));

    const { data: inserted, error } = await supabase.from('challenges').insert(toInsert).select('id');
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (inserted && inserted.length > 0) {
      await supabase.from('challenge_participants').insert(
        inserted.map((c: { id: string }) => ({
          challenge_id: c.id, user_id: user.id, current_value: 0, completed: false,
        }))
      );
    }

    return Response.json({ challenges: toInsert.length, difficulty_level: difficultyLevel });
  } catch (err: any) {
    console.error('[generate-challenges] error:', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
