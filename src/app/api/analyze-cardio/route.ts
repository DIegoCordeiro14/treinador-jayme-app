import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: sessions } = await supabase
      .from('cardio_sessions')
      .select('type,duration_min,distance_km,intensity,avg_heart_rate,perceived_effort,performed_at,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: profile } = await supabase
      .from('profiles')
      .select('goal, experience_level, age, gender, weight_kg')
      .eq('id', user.id)
      .single();

    if (!sessions || sessions.length === 0) {
      return Response.json({
        analysis: {
          summary: 'Nenhuma sessao de cardio registrada ainda. Comece a correr para receber analises personalizadas do Coach Jayme!',
          insights: [],
          recommendation: 'Registre sua primeira corrida para comecar a acompanhar sua evolucao.',
          fatigue_level: 'normal',
          trend: 'neutral',
        }
      });
    }

    // Build stats
    const running = sessions.filter(s => s.type === 'Corrida' && s.distance_km);
    const last30 = sessions.filter(s => {
      const d = new Date(s.performed_at || s.created_at);
      return Date.now() - d.getTime() < 30 * 86400000;
    });
    const last7 = sessions.filter(s => {
      const d = new Date(s.performed_at || s.created_at);
      return Date.now() - d.getTime() < 7 * 86400000;
    });

    const totalKm = running.reduce((s, r) => s + (r.distance_km ?? 0), 0);
    const avgPace = running.length > 0
      ? running.map(r => r.distance_km! > 0 ? r.duration_min / r.distance_km! : 0).filter(p => p > 0)
      : [];
    const avgPaceMin = avgPace.length > 0 ? avgPace.reduce((a, b) => a + b, 0) / avgPace.length : 0;

    const sessionsSummary = sessions.slice(0, 10).map(s => {
      const date = new Date(s.performed_at || s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      const pace = s.distance_km && s.distance_km > 0 ? `${Math.floor(s.duration_min / s.distance_km)}:${String(Math.round((s.duration_min / s.distance_km % 1) * 60)).padStart(2, '0')} /km` : '';
      return `[${date}] ${s.type} ${s.duration_min}min${s.distance_km ? ' ' + s.distance_km + 'km' + (pace ? ' pace=' + pace : '') : ''} intensidade=${s.intensity}${s.perceived_effort ? ' esforco=' + s.perceived_effort + '/10' : ''}`;
    }).join('\n');

    const client = new Anthropic();
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: 'Voce e o Coach Jayme, treinador de corrida da Escola dos Naturais. Analise os dados e responda em JSON valido apenas.',
      messages: [{
        role: 'user',
        content: `Perfil: nivel=${profile?.experience_level}, objetivo=${profile?.goal}, idade=${profile?.age}, sexo=${profile?.gender}
Total corridas: ${running.length} | Total km: ${totalKm.toFixed(1)} | Pace medio: ${avgPaceMin > 0 ? Math.floor(avgPaceMin) + ':' + String(Math.round((avgPaceMin % 1) * 60)).padStart(2, '0') + '/km' : 'N/A'}
Sessoes ultimos 7 dias: ${last7.length} | Sessoes ultimos 30 dias: ${last30.length}

Historico recente:
${sessionsSummary}

Responda APENAS em JSON:
{
  "summary": "resumo de 2-3 frases sobre o desempenho atual",
  "insights": ["insight 1 especifico com numero", "insight 2", "insight 3"],
  "recommendation": "recomendacao principal para a proxima semana",
  "fatigue_level": "normal|atencao|alta",
  "trend": "improving|stable|declining",
  "pace_trend": "improving|stable|declining",
  "volume_alert": null
}`
      }]
    });

    const raw = (res.content[0] as any).text.trim();
    const json = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'));
    const analysis = JSON.parse(json);
    return Response.json({ analysis });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
