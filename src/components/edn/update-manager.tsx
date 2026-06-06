'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle2, AlertTriangle, Smartphone, Loader2, ShieldCheck } from 'lucide-react';

const REPO = 'DIegoCordeiro14/treinador-jayme-app';

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

type Status = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';

interface Latest { tag: string; build: number; url: string; notes: string; sizeMB: number; published: string; }

/**
 * Central de Atualizações OTA do APK (Coach EDN).
 * Baixa e instala a nova versão por dentro do app, sem abrir o navegador.
 * Usa Filesystem.downloadFile (download nativo, com progresso) + FileOpener
 * (abre o instalador do sistema via FileProvider). REQUEST_INSTALL_PACKAGES
 * já declarado no manifesto permite a instalação a partir do app.
 */
export function UpdateManager() {
  const [status, setStatus] = useState<Status>('idle');
  const [currentBuild, setCurrentBuild] = useState<number | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [latest, setLatest] = useState<Latest | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const native = isNative();

  const loadCurrent = useCallback(async () => {
    const c = cap();
    try {
      const info = await c?.Plugins?.App?.getInfo?.();
      if (info) {
        setCurrentBuild(parseInt(String(info.build ?? '0'), 10) || 0);
        setCurrentVersion(String(info.version ?? ''));
      }
    } catch (e) { void e; }
  }, []);

  const check = useCallback(async () => {
    setError(''); setStatus('checking');
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('Não foi possível consultar atualizações agora.');
      const rel = await r.json();
      const build = parseInt(String(rel.tag_name ?? '').replace(/\D/g, ''), 10) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apk = (rel.assets ?? []).find((a: any) => String(a.name).endsWith('.apk'));
      if (!apk) throw new Error('Nenhum APK publicado na última versão.');
      const info: Latest = { tag: rel.tag_name, build, url: apk.browser_download_url, notes: String(rel.body ?? '').slice(0, 1200), sizeMB: Math.round((apk.size / 1048576) * 10) / 10, published: rel.published_at };
      setLatest(info);
      setStatus(build > (currentBuild ?? 0) ? 'available' : 'uptodate');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao verificar.'); setStatus('error');
    }
  }, [currentBuild]);

  useEffect(() => { if (native) { loadCurrent(); } }, [native, loadCurrent]);

  async function installApk(uri?: string) {
    const c = cap();
    const Opener = c?.Plugins?.FileOpener;
    const path = uri || filePath;
    if (!Opener || !path) { setError('Arquivo baixado, mas o instalador não pôde ser aberto automaticamente.'); setStatus('downloaded'); return; }
    try {
      setStatus('installing');
      await Opener.open({ filePath: path, contentType: 'application/vnd.android.package-archive' });
    } catch (e) {
      setError('Não foi possível abrir o instalador: ' + (e instanceof Error ? e.message : '')); setStatus('downloaded');
    }
  }

  async function downloadAndInstall() {
    if (!latest) return;
    const c = cap();
    const Fs = c?.Plugins?.Filesystem;
    if (!native || !Fs) { setError('A instalação automática só funciona no app instalado (APK Android).'); setStatus('error'); return; }
    setError(''); setStatus('downloading'); setProgress(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handle: any;
    try {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handle = await Fs.addListener('progress', (e: any) => {
          if (e?.contentLength) setProgress(Math.min(99, Math.round((e.bytes / e.contentLength) * 100)));
        });
      } catch (e) { void e; }
      const res = await Fs.downloadFile({ url: latest.url, path: `coach-edn-${latest.tag}.apk`, directory: 'EXTERNAL', progress: true });
      setProgress(100);
      const uri = res?.path || res?.uri || '';
      setFilePath(uri);
      setStatus('downloaded');
      await installApk(uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no download.'); setStatus('error');
    } finally {
      try { if (handle?.remove) await handle.remove(); } catch (e) { void e; }
    }
  }

  const upToDate = status === 'uptodate';
  const hasUpdate = status === 'available' || status === 'downloading' || status === 'downloaded' || status === 'installing';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#D4853A]/15"><RefreshCw className="h-5 w-5 text-[#D4853A]" /></div>
        <div>
          <h1 className="text-xl font-black text-zinc-100">Atualizações</h1>
          <p className="text-xs text-zinc-500">Baixe e instale novas versões sem sair do app.</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-zinc-400" /><span className="text-sm text-zinc-300">Versão instalada</span></div>
          <span className="text-sm font-bold text-zinc-100">{native ? (currentVersion ? `v${currentVersion}` : '—') + (currentBuild != null ? ` (build ${currentBuild})` : '') : 'Web / PWA'}</span>
        </div>
      </div>

      {!native && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex gap-3">
          <ShieldCheck className="h-5 w-5 text-[#5A8A6A] shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-400">No navegador/PWA o app já atualiza sozinho. A instalação interna de APK só aparece dentro do aplicativo Android.</p>
        </div>
      )}

      <button onClick={check} disabled={status === 'checking' || status === 'downloading' || status === 'installing'} className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2">
        {status === 'checking' ? <><Loader2 className="h-4 w-4 animate-spin" /> Verificando…</> : <><RefreshCw className="h-4 w-4" /> Verificar atualização</>}
      </button>

      {status === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex gap-3"><AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" /><p className="text-sm text-red-300">{error}</p></div>
      )}

      {upToDate && (
        <div className="rounded-xl border border-[#5A8A6A]/30 bg-[#5A8A6A]/10 p-4 flex gap-3"><CheckCircle2 className="h-5 w-5 text-[#5A8A6A] shrink-0 mt-0.5" /><div><p className="text-sm font-semibold text-zinc-100">Você está na versão mais recente</p>{latest && <p className="text-xs text-zinc-500 mt-0.5">Última publicada: {latest.tag}</p>}</div></div>
      )}

      {hasUpdate && latest && (
        <div className="rounded-xl border border-[#D4853A]/40 bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-zinc-100">Nova versão {latest.tag}</p><p className="text-xs text-zinc-500">{latest.sizeMB} MB · build {latest.build}</p></div>
            <Download className="h-5 w-5 text-[#D4853A]" />
          </div>
          {latest.notes && (
            <div className="rounded-lg bg-white/[0.03] p-3 max-h-40 overflow-y-auto"><p className="text-xs text-zinc-400 whitespace-pre-line leading-relaxed">{latest.notes}</p></div>
          )}
          {(status === 'downloading' || status === 'downloaded' || status === 'installing') && (
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#D4853A] transition-all duration-200" style={{ width: `${progress}%` }} /></div>
              <p className="text-[11px] text-zinc-500">{status === 'installing' ? 'Abrindo instalador…' : status === 'downloaded' ? 'Download concluído' : `Baixando… ${progress}%`}</p>
            </div>
          )}
          {status === 'available' && (
            <button onClick={downloadAndInstall} className="w-full py-3 rounded-xl bg-[#D4853A] hover:bg-[#E09B5A] text-white font-bold flex items-center justify-center gap-2"><Download className="h-4 w-4" /> Baixar e instalar</button>
          )}
          {status === 'downloading' && (
            <button disabled className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-400 font-bold flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Baixando…</button>
          )}
          {(status === 'downloaded' || status === 'installing') && (
            <button onClick={() => installApk()} className="w-full py-3 rounded-xl bg-[#5A8A6A] hover:opacity-90 text-white font-bold flex items-center justify-center gap-2"><Smartphone className="h-4 w-4" /> Instalar atualização</button>
          )}
        </div>
      )}

      <p className="text-[11px] text-zinc-600 text-center">Na primeira instalação o Android pedirá para permitir “instalar apps desta fonte”. Seus dados e login são mantidos.</p>
    </div>
  );
}
