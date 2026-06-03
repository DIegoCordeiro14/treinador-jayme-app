'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AthleteState } from '@/lib/edn/performance-engine';

export function useAthleteState() {
  const [state, setState] = useState<AthleteState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await globalThis.fetch('/api/athlete-state');
      if (res.ok) setState(await res.json());
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  const invalidate = useCallback(async () => {
    try {
      const res = await globalThis.fetch('/api/athlete-state', { method: 'POST' });
      if (res.ok) setState(await res.json());
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { state, loading, refetch: fetch, invalidate };
}
