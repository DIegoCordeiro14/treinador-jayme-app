import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * V7.11 — Briefing de corrida orientado por IA.
 * Recebe a corrida recém-concluída, compara com o histórico do atleta e
 * gera análise de pace/evolução/recuperação + recomendação de próximo treino.
 * Nunca retorna 500: parse robusto + fallback determinístico.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const distanceKm: number = Number(body.distance_km) || 0;
    const durationSec: number = Number(body.duration_sec) || 0;
    const avgPaceSecPerKm: number = Number(body.avg_pace_sec) || (distanceKm > 0 ? durationSec / distanceKm : 0);
    const maxSpeedKmh: number = Number(body.max_speed_kmh) || 0;
    const sprintCount: number = Number(body.sprint_count) || 0;

    // Histórico recente de corridas para detectar evolução
    const { data: history } = await supabase
      .from('cardio_sessions')
      .select('distance_km, duration_min, created_at')
      .eq('user_id', user.id)
      .eq('type', 'Corrida')
      .order('created_at', { ascending: false })
      .limit(8);

    const prevPaces = (history ?? [])
      .filter((h) => h.distance_km && h.duration_min && h.distance_km > 0)
      .map((h) => (h.duration_min! * 60) / h.distance_km!);
    const prevAvg = prevPaces.length ? prevPaces.reduce((a, b) => a + b, 0) / prevPaces.length : null;
    const paceDeltaSec = prevAvg && avgPaceSecPerKm ? Math.round(prevAvg - avgPaceSecPerKm) : null; // >0 = melhorou

    const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

    // Recuperação estimada simples (h) por distância + intensidade
    const recoveryH = Math.max(8, Math.round(distanceKm * 2 + (maxSpeedKmh > 14 ? 6 : 0)));

    const fallback = () => {
      const parts: string[] = [];
      parts.push(`Você correu ${distanceKm.toFixed(2)} km.`);
      if (avgPaceSecPerKm) parts.push(`Pace médio: ${fmtPace(avgPaceSecPerKm)}/km.`);
      if (paceDeltaSec != null) {
        parts.push(paceDeltaSec > 0
          ? `Melhora de ${paceDeltaSec}s/km vs sua média recente — capacidade aeróbica evoluindo.`
          : paceDeltaSec < 0 ? `Pace ${Math.abs(paceDeltaSec)}s/km mais lento que sua média — pode ser dia de recuperação.`
          : `Pace em linha com sua média recente.`);
      }
      if (sprintCount > 0) parts.push(`${sprintCount} tiro(s) acima de 16 km/h.`);
      parts.push(`Recuperação estimada: ~${recoveryH} horas.`);
      parts.push(paceDeltaSec != null && paceDeltaSec > 0
        ? 'Recomendação: treino leve amanhã e intervalado em 48 horas.'
        : 'Recomendação: treino leve nas próximas 24h para consolidar a adaptação.');
      return { briefing: parts.join(' '), recovery_hours: recoveryH, pace_delta_sec: paceDeltaSec, source: 'fallback' };
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json(fallback());

    const prompt = `Você é Jayme De Lamadrid (EDN), coach de corrida. Gere um briefing curto e direto em pt-BR sobre a corrida abaixo.
DADOS:
- Distância: ${distanceKm.toFixed(2)} km
- Duração: ${Math.round(durationSec / 60)} min
- Pace médio: ${avgPaceSecPerKm ? fmtPace(avgPaceSecPerKm) : '?'}/km
- Vel. máx: ${maxSpeedKmh.toFixed(1)} km/h
- Tiros (>16km/h): ${sprintCount}
- Média de pace recente: ${prevAvg ? fmtPace(prevAvg) : 'sem histórico'}
- Variação de pace: ${paceDeltaSec != null ? (paceDeltaSec > 0 ? `+${paceDeltaSec}s/km melhor` : `${paceDeltaSec}s/km`) : '?'}
- Recuperação estimada: ~${recoveryH}h

Responda SOMENTE com JSON (sem markdown):
{"briefing":"2-4 frases interpretando pace, evolução e recuperação + 1 recomendação concreta de próximo treino","recovery_hours":${recoveryH},"pace_delta_sec":${paceDeltaSec ?? 0}}`;

    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '';
    let raw = text.replace(/```json\n?|\n?```/g, '').trim();
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s < 0 || e < 0) return Response.json(fallback());
    raw = raw.slice(s, e + 1);
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.briefing) return Response.json(fallback());
      return Response.json({
        briefing: String(parsed.briefing),
        recovery_hours: Number(parsed.recovery_hours) || recoveryH,
        pace_delta_sec: paceDeltaSec,
        source: 'ai',
      });
    } catch {
      return Response.json(fallback());
    }
  } catch (err: any) {
    return Response.json({ error: err?.message ?? 'Erro interno', briefing: null }, { status: 200 });
  }
}
