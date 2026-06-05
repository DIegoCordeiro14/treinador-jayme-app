'use client';
/**
 * Sync automático de wearables (Health Connect / HealthKit).
 * Roda 1x por dia ao abrir o app dentro do shell nativo (APK/iOS):
 * pede permissão na primeira vez, lê HRV/sono/FC repouso/passos/calorias
 * e envia para /api/wearable-sync (alimenta o Recovery Engine).
 * No navegador/PWA não faz nada.
 */

import { useEffect } from 'react';
import { autoSync, isNativeShell } from '@/lib/integrations/wearable-hub';

const KEY = 'wearable_autosync_date';

export function WearableAutoSync() {
  useEffect(() => {
    if (!isNativeShell()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(KEY) === today) return;

    // aguarda o app assentar antes de pedir permissão/ler dados
    const t = setTimeout(async () => {
      try {
        const r = await autoSync();
        if (r.ok) {
          localStorage.setItem(KEY, today);
          console.info('[wearable] sync ok via', r.source);
        } else {
          console.info('[wearable] sync indisponível:', r.error);
        }
      } catch (e) {
        console.info('[wearable] sync falhou', e);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  return null;
}
