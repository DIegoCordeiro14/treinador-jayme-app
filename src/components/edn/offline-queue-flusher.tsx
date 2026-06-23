'use client';

import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { startQueueAutoFlush } from '@/lib/offline-queue';

// Monta-se uma vez no layout. Reenvia automaticamente qualquer treino/registro
// que tenha sido salvo offline assim que a conexão voltar.
export function OfflineQueueFlusher() {
  const supabase = useMemo(() => createClient(), []);
  useEffect(() => {
    const stop = startQueueAutoFlush(supabase, (n) => {
      toast.success(n === 1 ? 'Registro pendente enviado ✓' : `${n} registros pendentes enviados ✓`);
    });
    return stop;
  }, [supabase]);
  return null;
}
