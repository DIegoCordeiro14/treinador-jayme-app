import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 45;

export async function POST(_req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoISO = weekAgo.toISOString();

    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [
      { data: profile },
      { data: sessions },
      { data: cardioSessions },
      { data: bio },
      { data: activePlan },
    ] = await Promise.all([
      supabase.from('profiles')
        .select('name, goal, main_goal, experience_level, weight_kg, age, gender')
        .eq('id', user.id).maybeSingle(),

      supabase.from('workout_sessions')
        .select(`
          id, started_at, duration_seconds, total_volume_kg,
          workout_day:workout_days(name),
          session_sets(
            set_number, reps_done, weight_kg, completed, notes,
            exercise:exercises(name, muscle_group)
          )
        `)
        .eq('user_id', user.id)
        .gte('started_at', weekAgoISO)
        .order('started_at', { ascending: true }),

      supabase.from('cardio_sessions')
        .select('type, duration_min, distance_km, intensity, calories_burned, created_at')
        .eq('user_id', user.id)
        .gte('created_at', weekAgoISO)
        .order('created_at', { ascending: true }),

      supabase.from('bioimpedance_data')
        .select('weight_kg, body_fat_pct, skeletal_muscle_mass_kg, basal_metabolic_rate_kcal, protein_pct, water_pct')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1).maybeSingle(),

      supabase.from('workout_plans')
        .select('name, goal, days_per_week, experience_level')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    // ── Build compact training summary ──────────────────────────────────────
    const goalMap: Record<string, string> = {
      hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', fat_loss: 'Emagrecimento',
      definition: 'Definicao', strength: 'Forca', recomposition: 'Recomposicao', performance: 'Performance', mass_gain: 'Ganho de massa', maintenance: 'Manutencao',
    };
    const levelMap: Record<string, string> = {
      beginner: 'Iniciante', intermediate: 'Intermediario', advanced: 'Avancado',
    };

    const sessionsText = (sessions ?? []).map((s: any) => {
      const date = new Date(s.started_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const durMin = s.duration_seconds ? Math.round(s.duration_seconds / 60) : '?';
      const sets = (s.session_sets ?? []).filter((ss: any) => ss.completed);

      // Group sets by exercise
      const byExercise: Record<string, { reps: number[]; weights: number[]; muscle: string }> = {};
      for (const ss of sets) {
        const name = ss.exercise?.name ?? 'Exercicio';
        const muscle = ss.exercise?.muscle_group ?? '';
        if (!byExercise[name]) byExercise[name] = { reps: [], weights: [], muscle };
        byExercise[name].reps.push(ss.reps_done);
        byExercise[name].weights.push(ss.weight_kg);
      }

      const exerciseLines = Object.entries(byExercise).map(([name, data]) => {
        const maxW = Math.max(...data.weights);
        const avgR = Math.round(data.reps.reduce((a, b) => a + b, 0) / data.reps.length);
        return `  - ${name} [${data.muscle}]: ${data.reps.length}x${avgR} reps, max ${maxW}kg`;
      }).join('\n');

      const vol = s.total_volume_kg ? Math.round(s.total_volume_kg) + 'kg vol' : '';
      return `[${date}] ${s.workout_day?.name ?? 'Treino livre'} | ${durMin}min | ${vol}\n${exerciseLines}`;
    }).join('\n\n');

    const cardioText = (cardioSessions ?? []).map((c: any) => {
      const date = new Date(c.created_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
      return `[${date}] ${c.type}: ${c.duration_min}min${c.distance_km ? ', ' + c.distance_km + 'km' : ''}, intensidade ${c.intensity}${c.calories_burned ? ', ' + c.calories_burned + 'kcal' : ''}`;
    }).join('\n');

    const totalVolume = (sessions ?? []).reduce((sum: number, s: any) => sum + (s.total_volume_kg ?? 0), 0);
    const totalSessions = (sessions ?? []).length;
    const totalCardioKm = (cardioSessions ?? []).reduce((sum: number, c: any) => sum + (c.distance_km ?? 0), 0);

    const bioText = bio ? [
      bio.weight_kg && `peso=${bio.weight_kg}kg`,
      bio.body_fat_pct && `BF=${bio.body_fat_pct}%`,
      bio.skeletal_muscle_mass_kg && `musculo=${bio.skeletal_muscle_mass_kg}kg`,
      bio.protein_pct && `prot_corp=${bio.protein_pct}%`,
      bio.basal_metabolic_rate_kcal && `TMB=${bio.basal_metabolic_rate_kcal}kcal`,
    ].filter(Boolean).join(', ') : 'sem dados';

    const profileCtx = [
      `nivel=${levelMap[profile?.experience_level ?? ''] ?? profile?.experience_level ?? 'N/A'}`,
      `objetivo=${goalMap[(profile as any)?.main_goal ?? profile?.goal ?? ''] ?? (profile as any)?.main_goal ?? profile?.goal ?? 'N/A'}`,
      profile?.age && `idade=${profile.age}`,
      profile?.gender && `sexo=${profile.gender}`,
      activePlan && `plano="${activePlan.name}" ${activePlan.days_per_week}x/sem`,
    ].filter(Boolean).join(', ');

    const period = `${weekAgo.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    // ── Fallback determinístico (usado se a IA falhar) ───────────────────────
    const muscleSet = new Set<string>();
    for (const ss of (sessions ?? []).flatMap((s: any) => s.session_sets ?? [])) {
      const mg = ss?.exercise?.muscle_group; if (mg) muscleSet.add(mg);
    }
    const fallbackReport = {
      period,
      sessions_count: totalSessions,
      total_volume_kg: Math.round(totalVolume),
      total_cardio_km: Math.round(totalCardioKm * 10) / 10,
      summary: `Na semana foram ${totalSessions} sessão(ões) de musculação (${Math.round(totalVolume)}kg de volume) e ${totalCardioKm.toFixed(1)}km de cardio.`,
      volume_assessment: totalSessions === 0 ? 'Sem treinos registrados nesta semana.' : totalSessions >= 4 ? 'Volume adequado para a semana.' : 'Volume abaixo do ideal — busque mais consistência.',
      muscle_groups_trained: Array.from(muscleSet),
      progression: { positive: totalSessions > 0 ? ['Treinos registrados na semana'] : [], to_improve: totalSessions < 4 ? ['Aumentar a frequência semanal'] : [] },
      suggestions: [{ category: 'Volume', title: 'Mantenha a consistência', description: 'Registre os treinos e cardio para o relatório ficar mais completo na próxima semana.', priority: 'media' }],
      next_week_focus: 'Manter a consistência e a progressão de carga conforme o plano.',
      edn_tip: 'Progressão sustentável: pequenos incrementos semanais valem mais que saltos bruscos.',
      ai_unavailable: true,
    };

    // ── Call Claude (Jayme) ──────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `Você e o Jayme De Lamadrid, especialista em fisiculturismo natural e criador da Escola dos Naturais (EDN).
Análise os dados de treino da semana e gere um relatorio tecnico detalhado em JSON valido.
Seja direto, tecnico e baseado nos principios EDN: progressao de carga, gestao de fadiga, RIR, mesociclo.
Responda APENAS com JSON valido, sem markdown, sem texto extra.`;

    const userPrompt = `Perfil: ${profileCtx}
Biometria: ${bioText}

=== TREINOS DA SEMANA (${period}) ===
Sessoes: ${totalSessions} | Volume total: ${Math.round(totalVolume)}kg | Cardio: ${totalCardioKm.toFixed(1)}km

${sessionsText || 'Nenhuma sessao de musculacao registrada'}

=== CARDIO ===
${cardioText || 'Nenhuma sessao de cardio registrada'}

Gere o relatorio no formato JSON exato:
{
  "period": "${period}",
  "sessions_count": ${totalSessions},
  "total_volume_kg": ${Math.round(totalVolume)},
  "total_cardio_km": ${Math.round(totalCardioKm * 10) / 10},
  "summary": "resumo executivo em 2-3 frases técnicas sobre a semana",
  "volume_assessment": "avaliacao do volume: adequado/baixo/excessivo e por que",
  "muscle_groups_trained": ["lista", "dos", "grupos", "musculares"],
  "progression": {
    "positive": ["o que esta evoluindo bem (maximo 3 itens)"],
    "to_improve": ["o que precisa melhorar (maximo 3 itens)"]
  },
  "suggestions": [
    {
      "category": "Carga|Volume|Recuperacao|Tecnica|Nutricao|Cardio",
      "title": "titulo curto",
      "description": "descricao técnica detalhada com numeros especificos quando possivel",
      "priority": "alta|media|baixa"
    }
  ],
  "next_week_focus": "orientacao especifica para a proxima semana em 2-3 frases",
  "edn_tip": "dica técnica especifica da metodologia EDN relevante para este atleta"
}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2200,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const raw = ((response.content[0] as any)?.text ?? '').trim();
    let report: any = null;
    const start = raw.indexOf('{');
    if (start >= 0) {
      let jsonStr = raw.slice(start).replace(/```/g, '').trim();
      try { report = JSON.parse(jsonStr); }
      catch {
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
        const o = (jsonStr.match(/[\[{]/g) ?? []).length;
        const c = (jsonStr.match(/[\]}]/g) ?? []).length;
        if (o > c) jsonStr += ']}'.repeat(o - c);
        try { report = JSON.parse(jsonStr); } catch { report = null; }
      }
    }
    if (!report || typeof report !== 'object') report = fallbackReport;
    // garante os campos numéricos oficiais (não confia na IA)
    report.period = period;
    report.sessions_count = totalSessions;
    report.total_volume_kg = Math.round(totalVolume);
    report.total_cardio_km = Math.round(totalCardioKm * 10) / 10;
    return Response.json({ report, generated_at: new Date().toISOString() });
  } catch (err: any) {
    console.error('weekly-report error:', err);
    // Nunca quebra a tela: devolve um relatório determinístico simples.
    return Response.json({
      report: {
        period: 'Semana atual', sessions_count: 0, total_volume_kg: 0, total_cardio_km: 0,
        summary: 'Não foi possível gerar a análise por IA agora, mas seus dados continuam salvos. Tente novamente em instantes.',
        volume_assessment: '—', muscle_groups_trained: [], progression: { positive: [], to_improve: [] },
        suggestions: [], next_week_focus: 'Mantenha a consistência dos registros.', edn_tip: '', ai_unavailable: true,
      },
      generated_at: new Date().toISOString(),
    });
  }
}
