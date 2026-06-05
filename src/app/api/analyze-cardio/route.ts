import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Extrai e repara JSON vindo da IA (cercas markdown, texto extra, truncamento)
function parseAiJson(raw: string): any | null {
  let s = raw.replace(/```json\n?|\n?```/g, '').trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  s = s.slice(start);
  const end = s.lastIndexOf('}');
  if (end > 0) s = s.slice(0, end + 1);
  try { return JSON.parse(s); } catch { /* tenta reparo */ }
  try {
    s = s.replace(/,\s*([\]\}])/g, '$1');
    const opens = (s.match(/[\[{]/g) ?? []).length;
    const closes = (s.match(/[\]}]/g) ?? []).length;
    for (let i = 0; i < opens - closes; i++) s += '}';
    return JSON.parse(s);
  } catch { return null; }
}

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
      .select('goal, main_goal, experience_level, age, gender, weight_kg')
      .eq('id', user.id)
      .maybeSingle();

    if (!sessions || sessions.length === 0) {
      return Response.json({
        analysis: {
          summary: 'Nenhuma sessao de cardio registrada ainda. Comece a correr para receber analises personalizadas do Coach EDN!',
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

    // Fallback determinístico — usado se a IA falhar (nunca 500 para o usuário)
    const fallbackAnalysis = {
      summary: `Você acumulou ${totalKm.toFixed(1)}km em ${running.length} corrida(s), com ${last7.length} sessão(ões) nos últimos 7 dias${avgPaceMin > 0 ? ` e pace médio de ${Math.floor(avgPaceMin)}:${String(Math.round((avgPaceMin % 1) * 60)).padStart(2, '0')}/km` : ''}.`,
      insights: [
        `${last30.length} sessões nos últimos 30 dias`,
        running.length > 0 ? `Distância média de ${(totalKm / running.length).toFixed(1)}km por corrida` : 'Registre corridas com GPS para análise de pace',
        'Mantenha a regularidade — consistência vale mais que volume isolado',
      ],
      recommendation: last7.length === 0
        ? 'Nenhum cardio esta semana — agende uma sessão de Zona 2 de 20-30min.'
        : 'Continue no ritmo atual e aumente a duração gradualmente (~10%/semana).',
      fatigue_level: 'normal',
      trend: 'stable',
      pace_trend: 'stable',
      volume_alert: null,
      ai: false,
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ analysis: fallbackAnalysis });
    }

    try {
      const client = new Anthropic();
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: 'Você e o Coach EDN, treinador de corrida da Escola dos Naturais. Análise os dados e responda em JSON valido apenas, sem markdown.',
        messages: [{
          role: 'user',
          content: `Perfil: nivel=${profile?.experience_level ?? 'n/d'}, objetivo=${(profile as any)?.main_goal ?? profile?.goal ?? 'n/d'}, idade=${profile?.age ?? 'n/d'}, sexo=${profile?.gender ?? 'n/d'}
Total corridas: ${running.length} | Total km: ${totalKm.toFixed(1)} | Pace medio: ${avgPaceMin > 0 ? Math.floor(avgPaceMin) + ':' + String(Math.round((avgPaceMin % 1) * 60)).padStart(2, '0') + '/km' : 'N/A'}
Sessoes últimos 7 dias: ${last7.length} | Sessoes últimos 30 dias: ${last30.length}

Histórico recente:
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

      const raw = res.content[0]?.type === 'text' ? res.content[0].text : '';
      const analysis = parseAiJson(raw);
      if (analysis?.summary) {
        return Response.json({ analysis: { ...analysis, ai: true } });
      }
      console.error('[analyze-cardio] JSON inválido da IA:', raw.slice(0, 200));
      return Response.json({ analysis: fallbackAnalysis });
    } catch (aiErr: any) {
      console.error('[analyze-cardio] IA falhou:', aiErr?.message);
      return Response.json({ analysis: fallbackAnalysis });
    }
  } catch (err: any) {
    console.error('[analyze-cardio] erro:', err?.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
