'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LMap } from 'leaflet';
import { X, Play, Square, Share2, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export interface RunDetail {
  coordinates: { lat: number; lng: number }[];
  distanceKm: number;
  durationMin: number;
  paceLabel: string;
  dateLabel: string;
  calories?: number | null;
  coachAnalysis?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hrMetrics?: any | null;
  sourceLabel?: string | null;
}
interface Props { run: RunDetail; onClose: () => void; }

function fmtDur(totalMin: number): string {
  const total = Math.round(totalMin * 60);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Salvar / compartilhar (nativo Capacitor + fallback web) ──────────────────
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = rej; r.readAsDataURL(blob);
  });
}
async function saveOrShare(blob: Blob, filename: string, mime: string, text: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (typeof window !== 'undefined' ? (window as any).Capacitor : null);
  if (cap?.isNativePlatform?.() && cap?.Plugins?.Filesystem) {
    try {
      const FS = cap.Plugins.Filesystem;
      const b64 = await blobToBase64(blob);
      await FS.writeFile({ path: filename, data: b64, directory: 'CACHE' });
      const { uri } = await FS.getUri({ path: filename, directory: 'CACHE' });
      const Share = cap.Plugins.Share, FO = cap.Plugins.FileOpener;
      if (Share?.share) { try { await Share.share({ url: uri, title: 'Minha corrida', text }); return 'shared'; } catch { /* */ } }
      if (FO?.open) { try { await FO.open({ filePath: uri, contentType: mime }); return 'opened'; } catch { /* */ } }
      try { await FS.writeFile({ path: filename, data: b64, directory: 'DOCUMENTS' }); return 'saved'; } catch { /* */ }
      return 'cache';
    } catch { /* cai para web */ }
  }
  const file = new File([blob], filename, { type: mime });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title: 'Minha corrida', text }); return 'shared'; } catch { /* */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return 'downloaded';
}

// ── Composição do mapa real (tiles OpenStreetMap) ────────────────────────────
type Pt = { lat: number; lng: number };
type Proj = (p: Pt) => { x: number; y: number };
const TILE = 256;
const lon2px = (lon: number, z: number) => ((lon + 180) / 360) * Math.pow(2, z) * TILE;
const lat2px = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z) * TILE;
};
function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => res(null); img.src = url;
  });
}
function isTainted(canvas: HTMLCanvasElement): boolean {
  try { canvas.getContext('2d')!.getImageData(0, 0, 1, 1); return false; } catch { return true; }
}
async function composeMapInto(ctx: CanvasRenderingContext2D, pts: Pt[], x0: number, y0: number, w: number, h: number): Promise<Proj | null> {
  // escolhe o maior zoom em que a rota cabe no box
  let z = 17;
  for (; z >= 2; z--) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { const X = lon2px(p.lng, z), Y = lat2px(p.lat, z); minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y); }
    if ((maxX - minX) <= w * 0.82 && (maxY - minY) <= h * 0.82) break;
  }
  z = Math.max(2, Math.min(17, z));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { const X = lon2px(p.lng, z), Y = lat2px(p.lat, z); minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tlX = cx - w / 2, tlY = cy - h / 2; // top-left em pixels do mundo
  const n = Math.pow(2, z);
  const tx0 = Math.floor(tlX / TILE), tx1 = Math.floor((tlX + w) / TILE);
  const ty0 = Math.floor(tlY / TILE), ty1 = Math.floor((tlY + h) / TILE);
  const jobs: Promise<{ img: HTMLImageElement | null; tx: number; ty: number }>[] = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    const wy = ty; if (wy < 0 || wy >= n) continue;
    const wx = ((tx % n) + n) % n;
    jobs.push(loadImg(`https://tile.openstreetmap.org/${z}/${wx}/${wy}.png`).then(img => ({ img, tx, ty })));
  }
  const tiles = await Promise.all(jobs);
  let drew = 0;
  for (const { img, tx, ty } of tiles) {
    if (!img) continue;
    ctx.drawImage(img, x0 + tx * TILE - tlX, y0 + ty * TILE - tlY, TILE, TILE); drew++;
  }
  if (drew === 0) return null;
  return (p: Pt) => ({ x: x0 + lon2px(p.lng, z) - tlX, y: y0 + lat2px(p.lat, z) - tlY });
}
function darkProjection(pts: Pt[], x0: number, y0: number, w: number, h: number): Proj {
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180);
  const spanX = Math.max(1e-6, (maxLng - minLng) * kx), spanY = Math.max(1e-6, maxLat - minLat);
  const scale = Math.min(w / spanX, h / spanY);
  const offX = x0 + (w - spanX * scale) / 2, offY = y0 + (h - spanY * scale) / 2;
  return (p: Pt) => ({ x: offX + (p.lng - minLng) * kx * scale, y: offY + (maxLat - p.lat) * scale });
}
function drawRoutePath(ctx: CanvasRenderingContext2D, pts: Pt[], proj: Proj, upto: number, endColor: string, ghost = false) {
  if (pts.length < 2) return;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = ghost ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.45)'; ctx.lineWidth = ghost ? 12 : 15;
  ctx.beginPath(); for (let i = 0; i <= upto; i++) { const q = proj(pts[i]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.stroke();
  ctx.strokeStyle = ghost ? 'rgba(252,82,0,0.25)' : '#FC5200'; ctx.lineWidth = ghost ? 7 : 9;
  ctx.beginPath(); for (let i = 0; i <= upto; i++) { const q = proj(pts[i]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.stroke();
  if (ghost) return;
  const s = proj(pts[0]); ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#22C55E'; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const e = proj(pts[upto]); ctx.fillStyle = endColor; ctx.beginPath(); ctx.arc(e.x, e.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function drawPanel(ctx: CanvasRenderingContext2D, run: RunDetail, W: number, H: number, panelY: number) {
  const sc = W / 1080, px = (v: number) => v * sc;
  ctx.fillStyle = '#0D1117'; ctx.fillRect(0, panelY, W, H - panelY);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9AA4AE'; ctx.font = `400 ${px(36)}px sans-serif`;
  ctx.fillText(run.dateLabel, px(70), panelY + px(110));
  const dist = run.distanceKm.toFixed(2);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `900 italic ${px(200)}px sans-serif`;
  ctx.fillText(dist, px(64), panelY + px(330));
  const dw = ctx.measureText(dist).width; // medido com a fonte grande (correto)
  ctx.fillStyle = '#FC5200'; ctx.font = `700 italic ${px(78)}px sans-serif`;
  ctx.fillText('km', px(64) + dw + px(34), panelY + px(330));
  const sy = panelY + px(490);
  const stat = (x: number, label: string, val: string) => {
    ctx.fillStyle = '#FFFFFF'; ctx.font = `800 italic ${px(72)}px sans-serif`; ctx.fillText(val, px(x), sy);
    ctx.fillStyle = '#9AA4AE'; ctx.font = `500 ${px(30)}px sans-serif`; ctx.fillText(label, px(x), sy + px(48));
  };
  stat(70, 'TEMPO', fmtDur(run.durationMin));
  stat(430, 'PACE /KM', run.paceLabel);
  if (run.calories) stat(800, 'KCAL', String(run.calories));
}
function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob | null> {
  return new Promise(res => { try { canvas.toBlob(b => res(b), type); } catch { res(null); } });
}

export default function RunDetailModal({ run, onClose }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replayLineRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(0);
  const [replaying, setReplaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recording, setRecording] = useState(false);

  const pts = run.coordinates ?? [];
  const hasRoute = pts.length > 1;

  useEffect(() => {
    if (!hasRoute || !mapEl.current) return;
    let mounted = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !mapEl.current) return;
      LRef.current = L;
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css'; link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const m = L.map(mapEl.current, { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      const latlngs = pts.map(p => [p.lat, p.lng]) as [number, number][];
      L.polyline(latlngs, { color: 'rgba(0,0,0,0.45)', weight: 9, lineCap: 'round' }).addTo(m);
      L.polyline(latlngs, { color: '#FC5200', weight: 5, lineCap: 'round' }).addTo(m);
      L.marker(latlngs[0], { icon: L.divIcon({ html: '<div style="width:12px;height:12px;border-radius:50%;background:#22C55E;border:2px solid white"></div>', className: '', iconSize: [12, 12], iconAnchor: [6, 6] }) }).addTo(m);
      L.marker(latlngs[latlngs.length - 1], { icon: L.divIcon({ html: '<div style="width:12px;height:12px;border-radius:50%;background:#EF4444;border:2px solid white"></div>', className: '', iconSize: [12, 12], iconAnchor: [6, 6] }) }).addTo(m);
      mapRef.current = m;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      m.fitBounds(L.latLngBounds(latlngs as any), { padding: [30, 30] });
      setTimeout(() => { try { m.invalidateSize(); m.fitBounds(L.latLngBounds(latlngs as any), { padding: [30, 30] }); } catch { /* */ } }, 120);
    })();
    return () => { mounted = false; if (timerRef.current) clearInterval(timerRef.current); mapRef.current?.remove(); mapRef.current = null; };
  }, [hasRoute, pts]);

  const stopReplay = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setReplaying(false);
    const m = mapRef.current;
    if (m && replayLineRef.current) { m.removeLayer(replayLineRef.current); replayLineRef.current = null; }
    if (m && markerRef.current) { m.removeLayer(markerRef.current); markerRef.current = null; }
  }, []);
  const startReplay = useCallback(() => {
    const L = LRef.current; const m = mapRef.current;
    if (!L || !m || !hasRoute) return;
    stopReplay(); idxRef.current = 0;
    const latlngs = pts.map(p => [p.lat, p.lng]) as [number, number][];
    replayLineRef.current = L.polyline([latlngs[0]], { color: '#22C55E', weight: 6, lineCap: 'round' }).addTo(m);
    markerRef.current = L.marker(latlngs[0], { icon: L.divIcon({ html: '<div style="width:16px;height:16px;border-radius:50%;background:#22C55E;border:3px solid white;box-shadow:0 0 0 5px rgba(34,197,94,0.35)"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(m);
    setReplaying(true);
    const step = Math.max(15, Math.min(90, Math.round(6000 / latlngs.length)));
    timerRef.current = setInterval(() => {
      idxRef.current++; const i = idxRef.current;
      if (i >= latlngs.length) { stopReplay(); return; }
      replayLineRef.current.addLatLng(latlngs[i]); markerRef.current.setLatLng(latlngs[i]);
      m.panTo(latlngs[i], { animate: true, duration: step / 1000 });
    }, step);
  }, [pts, hasRoute, stopReplay]);

  // ── Exportar imagem (mapa real + stats) ────────────────────────────────────
  const exportStory = useCallback(async () => {
    setExporting(true);
    try {
      const W = 1080, H = 1920, MAP_H = Math.round(H * 0.615);
      let canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      let ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0D1117'; ctx.fillRect(0, 0, W, H);
      let proj: Proj | null = null;
      if (hasRoute) { try { proj = await composeMapInto(ctx, pts, 0, 0, W, MAP_H); } catch { proj = null; } }
      if (proj && isTainted(canvas)) { // tiles sem CORS → recomeça em fundo escuro
        canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#0D1117'; ctx.fillRect(0, 0, W, H); proj = null;
      }
      if (hasRoute) drawRoutePath(ctx, pts, proj ?? darkProjection(pts, 90, 220, W - 180, MAP_H - 340), pts.length - 1, '#EF4444');
      drawPanel(ctx, run, W, H, MAP_H);
      const blob = await canvasToBlob(canvas, 'image/png');
      if (!blob) { toast.error('Falha ao gerar imagem'); return; }
      const stats = `${run.distanceKm.toFixed(2)} km · ${fmtDur(run.durationMin)} · ${run.paceLabel}/km`;
      const r = await saveOrShare(blob, `corrida-${run.distanceKm.toFixed(2)}km.png`, 'image/png', stats);
      toast.success(r === 'saved' ? 'Imagem salva!' : r === 'downloaded' ? 'Imagem baixada!' : 'Imagem pronta — escolha onde postar 🔥');
    } catch { toast.error('Erro ao exportar'); } finally { setExporting(false); }
  }, [pts, hasRoute, run]);

  // ── Exportar vídeo do replay (mapa real + rota animada) ─────────────────────
  const exportVideo = useCallback(async () => {
    if (!hasRoute) { toast.error('Sem trajeto de GPS para o vídeo'); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof MediaRecorder === 'undefined' || !(document.createElement('canvas') as any).captureStream) { toast.error('Gravação não suportada neste aparelho'); return; }
    setRecording(true);
    try {
      const W = 720, H = 1280, MAP_H = Math.round(H * 0.615);
      let canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      let ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0D1117'; ctx.fillRect(0, 0, W, H);
      let proj: Proj | null = null;
      try { proj = await composeMapInto(ctx, pts, 0, 0, W, MAP_H); } catch { proj = null; }
      if (proj && isTainted(canvas)) {
        canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#0D1117'; ctx.fillRect(0, 0, W, H); proj = null;
      }
      const animProj = proj ?? darkProjection(pts, 60, 170, W - 120, MAP_H - 260);
      // fundo estático: mapa (já desenhado) + rota fantasma + painel
      const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
      const bctx = bg.getContext('2d')!;
      bctx.fillStyle = '#0D1117'; bctx.fillRect(0, 0, W, H);
      bctx.drawImage(canvas, 0, 0);
      drawRoutePath(bctx, pts, animProj, pts.length - 1, '#EF4444', true);
      drawPanel(bctx, run, W, H, MAP_H);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = (canvas as any).captureStream(30) as MediaStream;
      const types = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mime = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise<Blob>(res => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'video/webm' })); });
      rec.start();
      const durMs = 6500, start = performance.now();
      await new Promise<void>(resolve => {
        const loop = (t: number) => {
          const p = Math.min(1, (t - start) / durMs);
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(bg, 0, 0);
          const upto = Math.max(1, Math.floor(p * (pts.length - 1)));
          drawRoutePath(ctx, pts, animProj, upto, '#FFFFFF');
          if (p < 1) requestAnimationFrame(loop); else setTimeout(() => { try { rec.stop(); } catch { /* */ } resolve(); }, 400);
        };
        requestAnimationFrame(loop);
      });
      const blob = await done;
      const ext = (rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      const stats = `${run.distanceKm.toFixed(2)} km · ${fmtDur(run.durationMin)} · ${run.paceLabel}/km`;
      const r = await saveOrShare(blob, `corrida-${run.distanceKm.toFixed(2)}km.${ext}`, blob.type || 'video/webm', stats);
      toast.success(r === 'saved' ? 'Vídeo salvo!' : r === 'downloaded' ? 'Vídeo baixado!' : 'Vídeo pronto — escolha onde postar 🔥');
    } catch { toast.error('Erro ao gerar o vídeo'); } finally { setRecording(false); }
  }, [pts, hasRoute, run]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950" style={{ paddingTop: 'env(safe-area-inset-top,0px)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <p className="text-sm font-bold text-zinc-100">{run.distanceKm.toFixed(2)} km · {fmtDur(run.durationMin)}</p>
          <p className="text-xs text-zinc-500">{run.dateLabel} · {run.paceLabel}/km</p>
        </div>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-300"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {hasRoute ? (
          <div ref={mapEl} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6">
            <p className="text-sm text-zinc-500">Esta corrida não tem trajeto de GPS salvo para reproduzir.</p>
          </div>
        )}
      </div>

      <div className="px-4 py-4 border-t border-zinc-800 space-y-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 1rem)' }}>
        {run.coachAnalysis && (
          <div className="rounded-2xl border border-[#5A8A6A]/30 bg-[#5A8A6A]/10 p-3">
            <p className="text-[11px] font-bold text-[#7FB58F] mb-1 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />Análise do Coach EDN</p>
            <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-line">{run.coachAnalysis}</p>
          </div>
        )}
        {run.hrMetrics && run.hrMetrics.avg != null ? (
          <div className="rounded-2xl border border-[#8B5A5A]/30 bg-[#8B5A5A]/10 p-3">
            <p className="text-[11px] font-bold text-[#C97B7B] mb-1.5">Frequência cardíaca</p>
            <div className="flex gap-4 text-[12px] text-zinc-300 mb-2">
              <span>Média <strong className="text-zinc-100">{run.hrMetrics.avg} bpm</strong></span>
              <span>Máx <strong className="text-zinc-100">{run.hrMetrics.max} bpm</strong></span>
              {run.hrMetrics.drift != null && <span>Deriva <strong className="text-zinc-100">{run.hrMetrics.drift > 0 ? '+' : ''}{run.hrMetrics.drift}%</strong></span>}
            </div>
            <div className="flex h-3 rounded-full overflow-hidden">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(run.hrMetrics.timeInZonePct ?? []).map((p: number, zi: number) => (
                <div key={zi} style={{ width: `${p}%` }} className={['bg-[#3A5A6A]','bg-[#5A8A6A]','bg-[#A67C3A]','bg-[#D4853A]','bg-[#C0453A]'][zi]} title={`Z${zi+1}: ${p}%`} />
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-zinc-500 mt-1"><span>Z1</span><span>Z2</span><span>Z3</span><span>Z4</span><span>Z5</span></div>
          </div>
        ) : (run.sourceLabel && run.sourceLabel !== 'Coach EDN (GPS)') ? (
          <p className="text-[11px] text-zinc-500">Atividade importada sem frequência cardíaca.</p>
        ) : null}
        {hasRoute && (
          !replaying ? (
            <button onClick={startReplay} className="w-full py-3 rounded-2xl border-2 border-white/25 text-white font-bold flex items-center justify-center gap-2">
              <Play className="h-5 w-5 fill-current" /> Ver replay da rota
            </button>
          ) : (
            <button onClick={stopReplay} className="w-full py-3 rounded-2xl bg-zinc-800 text-zinc-200 font-bold flex items-center justify-center gap-2">
              <Square className="h-4 w-4" /> Parar replay
            </button>
          )
        )}
        <button onClick={exportVideo} disabled={recording || !hasRoute} className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2">
          {recording ? 'Gravando o vídeo…' : (<><Share2 className="h-5 w-5" /> Exportar vídeo para Story</>)}
        </button>
        <button onClick={exportStory} disabled={exporting} className="w-full py-2.5 rounded-2xl border border-zinc-700 text-zinc-300 font-semibold flex items-center justify-center gap-2 text-sm">
          {exporting ? 'Gerando…' : (<><Download className="h-4 w-4" /> Salvar imagem (9:16)</>)}
        </button>
        <p className="text-[11px] text-zinc-600 text-center">Mapa real da corrida + distância, tempo e pace.</p>
      </div>
    </div>
  );
}
