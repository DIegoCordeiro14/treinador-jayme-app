'use server';

import { revalidatePath } from 'next/cache';

/**
 * Invalida o cache (Data Cache + Router Cache) das rotas que dependem do
 * schedule_config, para que o card "Treino de Hoje" do Dashboard seja
 * reprogramado imediatamente após reprogramar os treinos no Calendário.
 */
export async function revalidateAfterSchedule() {
  revalidatePath('/app/dashboard');
  revalidatePath('/app/calendario');
}
