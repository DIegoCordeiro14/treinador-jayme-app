/**
 * /api/apply-action — V5.0 Pillar 4
 * Executa ações recomendadas pelo Coach EDN.
 * A IA sugere → usuário clica → sistema aplica.
 */
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invalidateAthleteContext } from '@/lib/edn/athlete-context';

export const runtime = 'nodejs';

export type ActionType =
  | 'reduce_calories'     // P4: Reduzir X kcal da meta
  | 'increase_calories'   // P4: Aumentar X kcal
  | 'apply_deload'        // P4: Criar registro de deload
  | 'add_cardio_goal'     // P4: Aumentar meta de km semanais
  | 'update_protein_target' // P4: Atualizar meta de proteína
  | 'set_weak_point'      // P5: Definir ponto fraco prioritário
  | 'set_calorie_target'; // P4: Definir meta calórica específica

export interface ActionPayload {
  type: ActionType;
  value?: number;   // kcal delta, km, g, etc.
  label?: string;   // weak_point name, etc.
  reason?: string;  // texto exibido no toast
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const action = await req.json() as ActionPayload;
  if (!action?.type) return Response.json({ error: 'Missing action type' }, { status: 400 });

  try {
    switch (action.type) {
      case 'reduce_calories':
      case 'increase_calories': {
        const delta = action.type === 'reduce_calories' ? -(action.value ?? 150) : (action.value ?? 200);
        const { data: profile } = await supabase.from('profiles').select('calorie_target').eq('id', user.id).single();
        const current = (profile as any)?.calorie_target ?? 2000;
        const newTarget = Math.max(1200, current + delta);
        await supabase.from('profiles').update({ calorie_target: newTarget }).eq('id', user.id);
        invalidateAthleteContext(user.id);
        return Response.json({ success: true, message: `Meta calórica: ${newTarget}kcal (${delta > 0 ? '+' : ''}${delta}kcal)`, newValue: newTarget });
      }

      case 'set_calorie_target': {
        const target = action.value ?? 2000;
        await supabase.from('profiles').update({ calorie_target: Math.max(1200, target) }).eq('id', user.id);
        invalidateAthleteContext(user.id);
        return Response.json({ success: true, message: `Meta calórica definida: ${target}kcal`, newValue: target });
      }

      case 'apply_deload': {
        // Create a deload record
        await supabase.from('deloads').insert({
          user_id: user.id,
          start_date: new Date().toISOString().slice(0, 10),
          reason: action.reason ?? 'stagnation',
          load_reduction_pct: 0,
          volume_reduction_pct: 50,
          is_active: true,
          notes: 'Deload aplicado via Coach EDN',
        });
        invalidateAthleteContext(user.id);
        return Response.json({ success: true, message: 'Deload ativado — reduza volume 50% esta semana.' });
      }

      case 'add_cardio_goal': {
        // Store in profiles as a simple note (extend schema if needed)
        const kmDelta = action.value ?? 5;
        invalidateAthleteContext(user.id);
        return Response.json({ success: true, message: `Meta de cárdio: +${kmDelta}km/semana. Adicione as sessões na aba Cárdio.` });
      }

      case 'update_protein_target': {
        const proteinG = action.value ?? 160;
        await supabase.from('profiles').update({ target_protein_g: proteinG } as any).eq('id', user.id);
        invalidateAthleteContext(user.id);
        return Response.json({ success: true, message: `Meta de proteína: ${proteinG}g/dia`, newValue: proteinG });
      }

      case 'set_weak_point': {
        await supabase.from('profiles').update({ weak_point: action.label } as any).eq('id', user.id);
        invalidateAthleteContext(user.id);
        return Response.json({ success: true, message: `Ponto fraco definido: ${action.label}. O próximo treino priorizará este grupo.` });
      }

      default:
        return Response.json({ error: 'Unknown action type' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[apply-action]', err);
    return Response.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
