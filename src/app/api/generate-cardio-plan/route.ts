import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function formatPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { goal_km = 10, best_pace, sessions_per_week = 3 } = await req.json();

  const base = best_pace ?? 7.0; // min/km
  const easyPace = base * 1.3;
  const tempoPace = base * 1.05;
  const longPace  = base * 1.2;

  const plans: Record<number, { goal: string; weeks: unknown[] }> = {
    5: {
      goal: '5km — Base e velocidade',
      weeks: [
        { week: 1, sessions: [{ type: 'Fácil', dist_km: 3, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Intervalado 400m', dist_km: 4, pace: formatPace(tempoPace), zone: 'Z4' }, { type: 'Longão', dist_km: 5, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 2, sessions: [{ type: 'Fácil', dist_km: 3.5, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Tempo Run 20min', dist_km: 4.5, pace: formatPace(tempoPace), zone: 'Z3' }, { type: 'Longão', dist_km: 6, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 3, sessions: [{ type: 'Fácil', dist_km: 4, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Intervalado 800m', dist_km: 5, pace: formatPace(tempoPace), zone: 'Z4' }, { type: 'Longão', dist_km: 7, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 4, sessions: [{ type: 'Deload — Fácil', dist_km: 3, pace: formatPace(easyPace * 1.1), zone: 'Z1' }, { type: 'Fácil', dist_km: 3, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Simulado 5km', dist_km: 5, pace: formatPace(base * 0.98), zone: 'Z4' }] },
      ],
    },
    10: {
      goal: '10km — Resistência e ritmo',
      weeks: [
        { week: 1, sessions: [{ type: 'Fácil', dist_km: 5, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Intervalado 1km', dist_km: 6, pace: formatPace(tempoPace), zone: 'Z4' }, { type: 'Longão', dist_km: 8, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 2, sessions: [{ type: 'Fácil', dist_km: 5, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Tempo Run 30min', dist_km: 7, pace: formatPace(tempoPace), zone: 'Z3' }, { type: 'Longão', dist_km: 10, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 3, sessions: [{ type: 'Fácil', dist_km: 6, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Progressivo', dist_km: 8, pace: formatPace(tempoPace), zone: 'Z3-Z4' }, { type: 'Longão', dist_km: 12, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 4, sessions: [{ type: 'Deload', dist_km: 4, pace: formatPace(easyPace * 1.1), zone: 'Z1' }, { type: 'Fácil', dist_km: 5, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Simulado 10km', dist_km: 10, pace: formatPace(base * 0.99), zone: 'Z4' }] },
      ],
    },
    21: {
      goal: 'Meia Maratona — Volume e base aeróbica',
      weeks: [
        { week: 1, sessions: [{ type: 'Fácil', dist_km: 8, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Tempo 40min', dist_km: 10, pace: formatPace(tempoPace), zone: 'Z3' }, { type: 'Longão', dist_km: 14, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 2, sessions: [{ type: 'Fácil', dist_km: 8, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Intervalado 2km', dist_km: 12, pace: formatPace(tempoPace), zone: 'Z4' }, { type: 'Longão', dist_km: 16, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 3, sessions: [{ type: 'Fácil', dist_km: 10, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Progressivo', dist_km: 12, pace: formatPace(tempoPace), zone: 'Z3-Z4' }, { type: 'Longão', dist_km: 18, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 4, sessions: [{ type: 'Deload', dist_km: 6, pace: formatPace(easyPace * 1.1), zone: 'Z1' }, { type: 'Fácil', dist_km: 8, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Longão final', dist_km: 21, pace: formatPace(base * 1.02), zone: 'Z3' }] },
      ],
    },
    42: {
      goal: 'Maratona — Ultra resistência',
      weeks: [
        { week: 1, sessions: [{ type: 'Fácil', dist_km: 12, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Tempo', dist_km: 15, pace: formatPace(tempoPace), zone: 'Z3' }, { type: 'Longão', dist_km: 22, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 2, sessions: [{ type: 'Fácil', dist_km: 14, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Progressivo', dist_km: 16, pace: formatPace(tempoPace), zone: 'Z3' }, { type: 'Longão', dist_km: 28, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 3, sessions: [{ type: 'Fácil', dist_km: 12, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Tempo', dist_km: 15, pace: formatPace(tempoPace), zone: 'Z3-Z4' }, { type: 'Longão', dist_km: 32, pace: formatPace(longPace), zone: 'Z2' }] },
        { week: 4, sessions: [{ type: 'Deload', dist_km: 10, pace: formatPace(easyPace * 1.1), zone: 'Z1' }, { type: 'Fácil', dist_km: 12, pace: formatPace(easyPace), zone: 'Z2' }, { type: 'Race pace', dist_km: 20, pace: formatPace(base * 1.01), zone: 'Z3' }] },
      ],
    },
  };

  const plan = plans[goal_km] ?? plans[10];
  return Response.json(plan);
}
