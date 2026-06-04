'use client';

import { useEffect, useRef } from 'react';

interface Coord { lat: number; lng: number; }
interface Props { coordinates: Coord[]; className?: string; }

/**
 * Mapa de rota GPS usando Leaflet (já em package.json).
 * Importado dinamicamente para evitar SSR.
 */
export function GPSMap({ coordinates, className }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || coordinates.length === 0) return;
    if (mapInstanceRef.current) return; // já inicializado

    async function init() {
      const L = (await import('leaflet')).default;

      // Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const map = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: false });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        maxZoom: 19,
      }).addTo(map);

      const latlngs: [number, number][] = coordinates.map(c => [c.lat, c.lng]);

      // Route polyline
      L.polyline(latlngs, { color: '#D4853A', weight: 4, opacity: 0.85 }).addTo(map);

      // Start/end markers
      const startIcon = L.divIcon({
        html: '<div style="background:#22c55e;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>',
        className: '', iconAnchor: [6, 6],
      });
      const endIcon = L.divIcon({
        html: '<div style="background:#ef4444;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>',
        className: '', iconAnchor: [6, 6],
      });

      L.marker(latlngs[0], { icon: startIcon }).addTo(map);
      L.marker(latlngs[latlngs.length - 1], { icon: endIcon }).addTo(map);

      map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] });
    }

    init();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [coordinates]);

  if (coordinates.length === 0) return null;

  return (
    <div
      ref={mapRef}
      className={className ?? 'h-40 w-full rounded-xl overflow-hidden border border-zinc-700'}
      style={{ zIndex: 0 }}
    />
  );
}
