/**
 * /api/daily-briefing — V5.0 Pillar 3
 * Gera briefing diário via IA usando AthleteContext.
 * Cache por userId × data (1 por dia).
 */
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedAthleteContext, serializeAthleteContext } from '@/lib/edn/athlete-context';
import { getDefaultProvider } from '@/lib/ai-coach';

export const runtime = 'nodejs';
export const maxDuration = 25;

interface BriefingResponse {
  greeting: string;
  highlights: string[];
  todayAction: string;
  alert: string | null;
  score: number;
  league: string;
  generatedAt: string;
  fromCache: boolean;
}

// Cache por userId + date (TTL: até meia-noite)
const cache = new Map<string, { data: BriefingResponse; exp: number }>();

function cacheKey(userId: string, neverTrained = false): string {
  return `${userId}:${new Date().toISOString().slice(0, 10)}:${neverTrained ? 'new' : 'active'}`;
}

export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const key = cacheKey(user.id);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.exp) return Response.json({ ...hit.data, fromCache: true });

  const ctx = await getCachedAthleteContext(user.id);
  const ctxStr = serializeAthleteContext(ctx);

  // ── Deterministic fallback (always works) ───────────────────────────────────
  const t = ctx.training;
  const n = ctx.nutrition;
  const b = ctx.bodyComposition;
  const r = ctx.recovery;
  const s = ctx.scores;

  const highlights: string[] = [];
  const neverTrained = t.daysSinceLastWorkout >= 100;
  if (t.daysSinceLastWorkout === 0) highlights.push('✅ Treino concluído hoje. Foco em recuperação e hidratação.');
  else if (neverTrained) highlights.push('💪 Nenhum treino registrado ainda — seu plano está pronto. Comece hoje!');
  else if (t.daysSinceLastWorkout >= 3) highlights.push(`⚠️ ${t.daysSinceLastWorkout} dias sem treinar — retome hoje.`);
  else highlights.push(`🔥 Último treino há ${t.daysSinceLastWorkout} dia(s). Sequência mantida.`);

  if (b.weightTrend14d !== null) {
    if (b.weightTrend14d < -0.3) highlights.push(`📉 Peso caiu ${Math.abs(b.weightTrend14d).toFixed(1)}kg em 14 dias — déficit no alvo.`);
    else if (b.weightTrend14d > 0.3) highlights.push(`📈 Peso subiu ${b.weightTrend14d.toFixed(1)}kg em 14 dias.`);
    else highlights.push(`⚖️ Peso estável nos últimos 14 dias.`);
  }

  if (n.avgProteinG !== null && n.targetProteinG !== null && n.avgProteinG < n.targetProteinG - 20) {
    highlights.push(`🥩 Proteína média ${n.avgProteinG}g/dia — abaixo da meta de ${n.targetProteinG}g. Principal limitador da evolução.`);
  }

  if (t.volumeDeltaPct !== null && t.volumeDeltaPct > 8) {
    highlights.push(`📊 Volume de treino aumentou ${t.volumeDeltaPct.toFixed(0)}% em relação à semana anterior.`);
  }

  if (s.overall >= 80) highlights.push(`⭐ Score EDN ${s.overall}/100 — excelente semana.`);
  else if (s.overall < 50) highlights.push(`📉 Score EDN ${s.overall}/100 — foco em consistência esta semana.`);

  const todayAction = neverTrained
    ? `Acesse Treinos, crie ou configure seu plano e execute seu primeiro treino hoje. Seu Coach EDN já tem tudo pronto.`
    : t.daysSinceLastWorkout === 0
    ? 'Recuperação ativa: caminhada leve, hidratação elevada, proteína em dia.'
    : `Execute ${ctx.training.activePlanName ? 'o próximo dia de ' + ctx.training.activePlanName : 'seu treino'} hoje com foco em progressão de carga. Registre o RIR de cada série.`;

  const alert = neverTrained
    ? null  // new user — no alerts, just encouragement
    : t.plateauDetected
    ? 'Platô de peso detectado. Recomendação: reduzir 100-150kcal ou adicionar 1 sessão Zona 2.'
    : r.deloadRecommended
    ? 'Deload recomendado esta semana. Reduza volume 50%, mantenha as cargas.'
    : null;

  const fallback: BriefingResponse = {
    greeting: `${getGreeting()}, ${ctx.profile.name?.split(' ')[0] ?? 'atleta'}.`,
    highlights: highlights.slice(0, 4),
    todayAction,
    alert,
    score: s.overall,
    league: s.league,
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };

  // ── Try AI enrichment ───────────────────────────────────────────────────────
  try {
    const provider = getDefaultProvider();
    const prompt = `${ctxStr}

Gere um briefing diário COMPACTO em JSON. Use os dados reais acima. Responda APENAS com JSON válido:
{"greeting":"Bom dia/tarde/noite [nome]","highlights":["frase1","frase2","frase3"],"todayAction":"ação específica para hoje","alert":"aviso urgente ou null"}

Regras: greeting personalizado com hora, highlights com dados numéricos reais, todayAction com treino ou recuperação específico, alert apenas se platô/deload/urgência real. Se o usuário nunca treinou (primeiro treino), seja encorajador — NÃO mencione "999 dias" ou consistência zero. Foco em boas-vindas e próximos passos.`;

    let raw = '';
    for await (const chunk of provider.stream({ messages: [{ role: 'user', content: prompt }], systemPrompt: 'Você gera briefings de atletas. Responda SOMENTE JSON válido, sem markdown.', maxTokens: 400 })) {
      if (chunk.text) raw += chunk.text;
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.greeting && Array.isArray(parsed.highlights)) {
        const result: BriefingResponse = {
          greeting: parsed.greeting,
          highlights: parsed.highlights.slice(0, 4),
          todayAction: parsed.todayAction ?? fallback.todayAction,
          alert: parsed.alert ?? null,
          score: s.overall,
          league: s.league,
          generatedAt: new Date().toISOString(),
          fromCache: false,
        };
        const midnight = new Date(); midnight.setHours(23, 59, 59, 999);
        cache.set(key, { data: result, exp: midnight.getTime() });
        return Response.json(result);
      }
    }
  } catch (_e) { /* fallback below */ }

  const midnight = new Date(); midnight.setHours(23, 59, 59, 999);
  cache.set(key, { data: fallback, exp: midnight.getTime() });
  return Response.json(fallback);
}

export async function POST(_req: NextRequest) {
  // Invalidate cache (force refresh)
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  cache.delete(cacheKey(user.id));
  return GET(_req);
}

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
