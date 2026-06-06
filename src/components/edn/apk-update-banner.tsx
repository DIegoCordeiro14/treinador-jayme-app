'use client';
/**
 * OTA do shell nativo (APK).
 * O conteúdo web já é OTA por natureza (WebView -> Vercel). Este banner cuida
 * da camada nativa: compara a versão do APK instalado (versionCode) com a
 * última Release do GitHub (tag apk-vN publicada pelo CI) e oferece o
 * download direto quando há atualização.
 * Renderiza null fora do shell Capacitor (PWA/browser não mostram nada).
 */

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const REPO = 'DIegoCordeiro14/treinador-jayme-app';
const DISMISS_KEY = 'apk_update_dismissed_build';

type UpdateInfo = { tag: string; build: number; url: string };

export function ApkUpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    (async () => {
      try {
        // versão instalada (versionCode definido pelo CI = run_number)
        let currentBuild = 0;
        try {
          const info = await cap.Plugins?.App?.getInfo?.();
          currentBuild = parseInt(String(info?.build ?? '0'), 10) || 0;
        } catch { /* plugin ausente em builds antigos -> 0 força aviso */ }

        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const rel = await res.json();
        const latestBuild = parseInt(String(rel.tag_name ?? '').replace(/\D/g, ''), 10) || 0;
        const apk = (rel.assets ?? []).find((a: any) => a.name?.endsWith('.apk'));
        if (!apk || latestBuild <= currentBuild) return;
        if (localStorage.getItem(DISMISS_KEY) === String(latestBuild)) return;

        setUpdate({ tag: rel.tag_name, build: latestBuild, url: apk.browser_download_url });
      } catch { /* offline ou rate limit: silencioso */ }
    })();
  }, []);

  if (!update) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 rounded-xl border border-[#D4853A]/40 bg-zinc-900 shadow-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#D4853A]/15">
          <Download className="h-4 w-4 text-[#D4853A]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">Atualização do app disponível</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Nova versão {update.tag} do Coach EDN. Baixe e instale por cima — seus dados são mantidos.
          </p>
          <div className="flex gap-2 mt-3">
            <a
              href="/app/atualizacoes"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4853A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#B8702E] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Atualizar agora
            </a>
            <button
              onClick={() => { localStorage.setItem(DISMISS_KEY, String(update.build)); setUpdate(null); }}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Depois
            </button>
          </div>
        </div>
        <button
          onClick={() => { localStorage.setItem(DISMISS_KEY, String(update.build)); setUpdate(null); }}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
