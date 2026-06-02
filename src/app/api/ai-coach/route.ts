import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultProvider, EDN_SYSTEM_PROMPT } from '@/lib/ai-coach';
import type { AIMessage } from '@/lib/ai-coach';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ── Build personalized system prompt with bioimpedance + profile context ───
function buildSystemPrompt(bio: Record<string, any> | null, profile: Record<string, any> | null): string {
  if (!bio && !profile) return EDN_SYSTEM_PROMPT;

  const lines: string[] = [];

  // Profile context (gender + age)
  if (profile?.gender) {
    const genderLabel = profile.gender === 'male' ? 'Masculino' : profile.gender === 'female' ? 'Feminino' : 'Outro';
    lines.push(`Sexo: ${genderLabel}`);
  }
  if (profile?.age) lines.push(`Idade: ${profile.age} anos`);

  // Core bio metrics
  if (bio?.weight_kg)  lines.push(`Peso: ${bio.weight_kg}kg`);
  if (bio?.bmi)        lines.push(`IMC: ${bio.bmi}${bio.bmi >= 30 ? ' (Obeso)' : bio.bmi >= 25 ? ' (Sobrepeso)' : ' (Normal)'}`);
  if (bio?.body_fat_pct) lines.push(`Gordura corporal: ${bio.body_fat_pct}%${bio.body_fat_pct >= 28 ? ' (Alta)' : bio.body_fat_pct >= 20 ? ' (Moderada)' : ' (Normal)'}`);
  if (bio?.skeletal_muscle_mass_kg) lines.push(`Músculo esquelético: ${bio.skeletal_muscle_mass_kg}kg`);
  if (bio?.lean_mass_kg) lines.push(`Massa magra: ${bio.lean_mass_kg}kg`);
  if (bio?.water_pct)  lines.push(`Água corporal: ${bio.water_pct}%${bio.water_pct < 50 ? ' (Baixa)' : ' (Normal)'}`);
  if (bio?.visceral_fat_level) lines.push(`Gordura visceral: nível ${bio.visceral_fat_level}${bio.visceral_fat_level >= 10 ? ' (Alta)' : ' (Normal)'}`);
  if (bio?.basal_metabolic_rate_kcal) lines.push(`Metabolismo basal: ${bio.basal_metabolic_rate_kcal}kcal`);
  if (bio?.protein_pct) lines.push(`Proteína corporal: ${bio.protein_pct}%`);
  if (bio?.body_type)  lines.push(`Tipo corporal: ${bio.body_type}`);
  if (bio?.body_score !== null && bio?.body_score !== undefined) lines.push(`Pontuação corporal: ${bio.body_score}/100`);

  // Automatic EDN rules based on values
  const rules: string[] = [];
  if (bio?.visceral_fat_level >= 10) rules.push('gordura visceral alta → priorize exercícios compostos metabólicos (agachamento, terra, remada), volume moderado, menor densidade de treino');
  if (bio?.bmi >= 28) rules.push('IMC elevado → prefira máquinas nos membros inferiores para reduzir impacto articular, evite saltos e exercícios de alto impacto');
  if (bio?.body_fat_pct >= 28) rules.push('gordura elevada → aumente exercícios multiarticulares de maior gasto calórico, sugira déficit calórico controlado');
  if (bio?.water_pct && bio.water_pct < 50) rules.push('hidratação baixa → evite altíssima intensidade, oriente sobre hidratação antes/durante/após o treino');
  if (bio?.protein_pct && bio.protein_pct < 17) rules.push('proteína corporal baixa → alerte que o aluno precisa aumentar ingestão proteica (mín. 1,6g/kg)');

  // Gender & age rules
  if (profile?.gender === 'female') rules.push('sexo feminino → maior tolerância a volume, ênfase em glúteos e isquiotibiais, exercícios unilaterais, RIR mais conservador');
  if (profile?.age && profile.age >= 50) rules.push('idade ≥50 → priorize mobilidade, baixo impacto articular, descanso generoso, progressão conservadora');
  else if (profile?.age && profile.age >= 40) rules.push('idade ≥40 → aquecimento prolongado, evite cargas máximas sem preparação, descanso mínimo 90s');

  // Workout type suggestion (only when bioimpedance available)
  let suggestedFocus = '';
  if (bio) {
    if (bio.body_fat_pct >= 28 || bio.visceral_fat_level >= 10) {
      suggestedFocus = 'FOCO RECOMENDADO: Emagrecimento/Definição — treino com mais exercícios compostos, volume moderado, descansos mais curtos (60-75s), déficit calórico.';
    } else if (bio.body_fat_pct <= 18 && bio.skeletal_muscle_mass_kg) {
      suggestedFocus = 'FOCO RECOMENDADO: Hipertrofia — condição física favorável, priorize volume e progressão de carga, superávit calórico controlado.';
    } else {
      suggestedFocus = 'FOCO RECOMENDADO: Recomposição — equilíbrio entre ganho muscular e perda de gordura, manutenção calórica com alta proteína.';
    }
  }

  const ctx = `

PERFIL DO ALUNO (use sempre estas informações nas suas respostas):
${lines.join(' | ')}
${suggestedFocus}${rules.length > 0 ? `\nRegras EDN para este perfil: ${rules.join('; ')}.` : ''}`;

  return EDN_SYSTEM_PROMPT + ctx;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messages, conversationId } = await req.json() as {
      messages: AIMessage[];
      conversationId?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Invalid messages' }, { status: 400 });
    }

    // Fetch profile (gender, age) + bioimpedance in parallel
    const [{ data: profileData }, { data: bio }] = await Promise.all([
      supabase.from('profiles').select('gender,age').eq('id', user.id).single(),
      supabase
        .from('bioimpedance_data')
        .select('weight_kg,bmi,body_fat_pct,skeletal_muscle_mass_kg,lean_mass_kg,water_pct,visceral_fat_level,basal_metabolic_rate_kcal,protein_pct,body_type,body_score,source')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const systemPrompt = buildSystemPrompt(bio, profileData);
    const provider = getDefaultProvider();

    // Limit history to last 8 messages (4 turns) to cap token growth
    const trimmedMessages = messages.length > 8 ? messages.slice(-8) : messages;

    // Streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = '';
          for await (const chunk of provider.stream({
            messages: trimmedMessages,
            systemPrompt,
            maxTokens: 700,
          })) {
            if (chunk.text) {
              fullText += chunk.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.text })}\n\n`));
            }
            if (chunk.done) {
              try {
                const assistantMessage: AIMessage = { role: 'assistant', content: fullText };
                const allMessages = [...messages, assistantMessage];
                if (conversationId) {
                  await supabase.from('ai_conversations').update({ messages: allMessages }).eq('id', conversationId).eq('user_id', user.id);
                } else {
                  await supabase.from('ai_conversations').insert({ user_id: user.id, messages: allMessages });
                }
              } catch (_err) { /* Non-fatal */ }
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
            }
          }
        } catch (err: any) {
          console.error('[ai-coach] stream error:', err?.status, err?.message, err?.name);
          const msg: string = err?.message ?? '';
          const status: number = err?.status ?? 0;
          let fallbackMsg: string;
          if (status === 401 || msg.includes('API key') || msg.includes('authentication') || (err?.name ?? '').includes('Authentication')) {
            fallbackMsg = '⚠️ **Chave de API invál