'use client';

import { useEffect, useState } from 'react';
import { MapPin, Bell, HeartPulse, DownloadCloud, ShieldCheck, X } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cap(): any | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor ?? null;
}
function isNative(): boolean {
  const c = cap();
  return !!c && typeof c.isNativePlatform === 'function' && c.isNativePlatform();
}

/**
 * Tela de primeiro uso (apenas no APK nativo). Solicita de uma vez todas as
 * permissões necessárias: localização, notificações, saúde (Health Connect) e
 * orienta sobre a permissão de instalação de apps (REQUEST_INSTALL_PACKAGES,
 * usada pela atualização OTA interna).
 */
export function FirstLaunchPermissions() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    try { if (localStorage.getItem('edn_perms_done') === '1') return; } catch (e) { void e; }
    setShow(true);
  }, []);

  if (!show) return null;

  async function grantAll() {
    setBusy(true);
    const c = cap();
    const P = (c && c.Plugins) || {};
    // 1) Localização (GPS das corridas)
    try { await P.Geolocation?.requestPermissions?.({ permissions: ['location'] }); } catch (e) { void e; }
    // 2) Notificações (serviço em primeiro plano durante a corrida)
    try { await P.LocalNotifications?.requestPermissions?.(); } catch (e) { void e; }
    // 3) Saúde / Health Connect (dados do relógio)
    try {
      await P.HealthPlugin?.requestHealthPermissions?.({
        permissions: ['READ_STEPS', 'READ_ACTIVE_CALORIES', 'READ_TOTAL_CALORIES', 'READ_DISTANCE', 'READ_HEART_RATE', 'READ_WORKOUTS'],
      });
    } catch (e) { void e; }
    try { localStorage.setItem('edn_perms_done', '1'); } catch (e) { void e; }
    setBusy(false);
    setShow(false);
  }

  function later() {
    try { localStorage.setItem('edn_perms_done', '1'); } catch (e) { void e; }
    setShow(false);
  }

  const items = [
    { icon: <MapPin className="h-5 w-5 text-[#D4853A]" />, t: 'Localização (GPS)', d: 'Para rastrear suas corridas com precisão, inclusive em segundo plano.' },
    { icon: <Bell className="h-5 w-5 text-[#D4853A]" />, t: 'Notificações', d: 'Para manter a corrida ativa em primeiro plano e avisar atualizações.' },
    { icon: <HeartPulse className="h-5 w-5 text-[#C0453A]" />, t: 'Saúde / Health Connect', d: 'Para ler batimentos, passos e calorias do seu relógio.' },
    { icon: <DownloadCloud className="h-5 w-5 text-[#5A8A6A]" />, t: 'Instalar atualizações', d: 'Para baixar e instalar novas versões do app por conta própria (OTA). O Android pedirá "permitir desta fonte" na primeira atualização.' },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-zinc-950/95 backdrop-blur-sm">
      <button onClick={later} className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-zinc-300"><X className="h-4 w-4" /></button>
      <div className="flex-1 overflow-y-auto px-6 pt-14 pb-4 max-w-md mx-auto w-full">
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="h-6 w-6 text-[#D4853A]" /><h1 className="text-xl font-black text-zinc-100">Permissões do Coach EDN</h1></div>
        <p className="text-sm text-zinc-400 mb-5">Para o app funcionar por completo, precisamos das permissões abaixo. Você pode ajustá-las depois nas configurações do Android.</p>
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.t} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3.5">
              <div className="shrink-0 mt-0.5">{it.icon}</div>
              <div><p className="text-sm font-semibold text-zinc-100">{it.t}</p><p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{it.d}</p></div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 pb-7 pt-3 max-w-md mx-auto w-full space-y-2">
        <button onClick={grantAll} disabled={busy} className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-black text-lg">{busy ? 'Solicitando…' : 'Permitir tudo'}</button>
        <button onClick={later} className="w-full py-3 rounded-2xl text-zinc-400 font-semibold hover:bg-zinc-900">Agora não</button>
      </div>
    </div>
  );
}
