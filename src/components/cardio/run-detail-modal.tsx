'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LMap } from 'leaflet';
import { X, Play, Pause, Square, Share2, Download } from 'lucide-react';
import { toast } from 'sonner';

export interface RunDetail {
  coordinates: { lat: number; lng: number }[];
  distanceKm: number;
  durationMin: number;
  paceLabel: string;        // ex.: "8:59"
  dateLabel: string;        // ex.: "10 de jun"
  calories?: number | null;
}

interface Props { run: RunDetail; onClose: () => void; }

function fmtDur(totalMin: number): string {
  const total = Math.round(totalMin * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
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

  const pts = run.coordinates ?? [];
  const hasRoute = pts.length > 1;

  // ── Mapa ──────────────────────────────────────────────────────────────────
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
      L.polyline(latlngs, { color: '#3D2010', weight: 9, opacity: 0.35, lineCap: 'round' }).addTo(m);
      L.polyline(latlngs, { color: '#D4853A', weight: 5, opacity: 1, lineCap: 'round' }).addTo(m);
      const startIcon = L.divIcon({ html: '<div style="width:12px;height:12px;border-radius:50%;background:#5A8A6A;border:2px solid white"></div>', className: '', iconSize: [12, 12], iconAnchor: [6, 6] });
      const endIcon = L.divIcon({ html: '<div style="width:12px;height:12px;border-radius:50%;background:#D4853A;border:2px solid white"></div>', className: '', iconSize: [12, 12], iconAnchor: [6, 6] });
      L.marker(latlngs[0], { icon: startIcon }).addTo(m);
      L.marker(latlngs[latlngs.length - 1], { icon: endIcon }).addTo(m);
      mapRef.current = m;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      m.fitBounds(L.latLngBounds(latlngs as any), { padding: [30, 30] });
      setTimeout(() => { try { m.invalidateSize(); m.fitBounds(L.latLngBounds(latlngs as any), { padding: [30, 30] }); } catch { /* */ } }, 120);
    })();
    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
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
    stopReplay();
    idxRef.current = 0;
    const latlngs = pts.map(p => [p.lat, p.lng]) as [number, number][];
    replayLineRef.current = L.polyline([latlngs[0]], { color: '#5A8A6A', weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(m);
    const icon = L.divIcon({ html: '<div style="width:16px;height:16px;border-radius:50%;background:#5A8A6A;border:3px solid white;box-shadow:0 0 0 5px rgba(90,138,106,0.35)"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
    markerRef.current = L.marker(latlngs[0], { icon }).addTo(m);
    setReplaying(true);
    const step = Math.max(15, Math.min(90, Math.round(6000 / latlngs.length)));
    timerRef.current = setInterval(() => {
      idxRef.current++;
      const i = idxRef.current;
      if (i >= latlngs.length) { stopReplay(); return; }
      replayLineRef.current.addLatLng(latlngs[i]);
      markerRef.current.setLatLng(latlngs[i]);
      m.panTo(latlngs[i], { animate: true, duration: step / 1000 });
    }, step);
  }, [pts, hasRoute, stopReplay]);

  // ── Exportar imagem para Story (1080×1920) ─────────────────────────────────
  const exportStory = useCallback(async () => {
    setExporting(true);
    try {
      const W = 1080, H = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { toast.error('Não foi possível gerar a imagem'); setExporting(false); return; }

      // fundo
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0D1117'); g.addColorStop(1, '#161B22');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // rota
      if (hasRoute) {
        const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const meanLat = (minLat + maxLat) / 2;
        const kx = Math.cos((meanLat * Math.PI) / 180);
        const spanX = Math.max(1e-6, (maxLng - minLng) * kx);
        const spanY = Math.max(1e-6, (maxLat - minLat));
        const boxX = 120, boxY = 360, boxW = W - 240, boxH = 760;
        const scale = Math.min(boxW / spanX, boxH / spanY);
        const drawW = spanX * scale, drawH = spanY * scale;
        const offX = boxX + (boxW - drawW) / 2;
        const offY = boxY + (boxH - drawH) / 2;
        const proj = (p: { lat: number; lng: number }) => ({
          x: offX + (p.lng - minLng) * kx * scale,
          y: offY + (maxLat - p.lat) * scale,
        });
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(212,133,58,0.25)'; ctx.lineWidth = 22;
        ctx.beginPath(); pts.forEach((p, i) => { const q = proj(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke();
        ctx.strokeStyle = '#D4853A'; ctx.lineWidth = 10;
        ctx.beginPath(); pts.forEach((p, i) => { const q = proj(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke();
        const s0 = proj(pts[0]), s1 = proj(pts[pts.length - 1]);
        ctx.fillStyle = '#5A8A6A'; ctx.beginPath(); ctx.arc(s0.x, s0.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#D4853A'; ctx.beginPath(); ctx.arc(s1.x, s1.y, 14, 0, Math.PI * 2); ctx.fill();
      }

      // marca: logo / topo
      ctx.textAlign = 'left';
      ctx.fillStyle = '#D4853A'; ctx.font = '700 italic 56px sans-serif';
      ctx.fillText('Coach EDN', 120, 200);
      ctx.fillStyle = '#8B949E'; ctx.font = '400 34px sans-serif';
      ctx.fillText(run.dateLabel, 120, 250);

      // distância — destaque
      ctx.fillStyle = '#FFFFFF'; ctx.font = '900 italic 220px sans-serif';
      ctx.fillText(`${run.distanceKm.toFixed(2)}`, 110, 1480);
      ctx.fillStyle = '#D4853A'; ctx.font = '700 italic 90px sans-serif';
      ctx.fillText('km', 110 + ctx.measureText(`${run.distanceKm.toFixed(2)}`).width + 30, 1480);

      // stats (tempo · pace)
      const statY = 1640;
      const drawStat = (x: number, label: string, value: string) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFFFFF'; ctx.font = '800 italic 76px sans-serif';
        ctx.fillText(value, x, statY);
        ctx.fillStyle = '#8B949E'; ctx.font = '500 32px sans-serif';
        ctx.fillText(label, x, statY + 50);
      };
      drawStat(120, 'TEMPO', fmtDur(run.durationMin));
      drawStat(480, 'PACE /KM', run.paceLabel);
      if (run.calories) drawStat(820, 'KCAL', String(run.calories));

      // rodapé
      ctx.textAlign = 'center';
      ctx.fillStyle = '#586069'; ctx.font = '400 30px sans-serif';
      ctx.fillText('Corrida registrada no Coach EDN', W / 2, H - 70);

      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) { toast.error('Falha ao gerar imagem'); setExporting(false); return; }
      const file = new File([blob], `corrida-${run.distanceKm.toFixed(2)}km.png`, { type: 'image/png' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'Minha corrida', text: `${run.distanceKm.toFixed(2)} km · ${fmtDur(run.durationMin)} · ${run.paceLabel}/km` });
          setExporting(false);
          return;
        } catch { /* usuário cancelou ou não suportado → baixa */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
      toast.success('Imagem salva! Poste no seu story 🔥');
    } catch {
      toast.error('Erro ao exportar');
    } finally {
      setExporting(false);
    }
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
        <button onClick={exportStory} disabled={exporting} className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2">
          {exporting ? 'Gerando…' : (<><Share2 className="h-5 w-5" /> Exportar para Story</>)}
        </button>
        <p className="text-[11px] text-zinc-600 text-center flex items-center justify-center gap-1">
          <Download className="h-3 w-3" /> Gera uma imagem 9:16 com rota, km, tempo e pace
        </p>
      </div>
    </div>
  );
}
