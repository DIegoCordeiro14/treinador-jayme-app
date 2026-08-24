'use client';
import { useState } from 'react';
import { CoachEdnHealth } from '@/native/health';
import { createClient } from '@/lib/supabase/client';
import { runHealthSync } from '@/lib/wearables/health-sync';
import { processEnrichmentQueue } from '@/lib/wearables/enrichment-queue';
import { normalizeSportType, SPORT_LABEL } from '@/lib/cardio/sport-types';

// Página interna de diagnóstico da camada nativa de saúde (Native Data Bridge).
export default function HealthDebugPage() {
  const supabase = createClient();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const add = (s: string) => setLog(l => [...l, s]);

  async function diagnose() {
    setBusy(true); setLog([]);
    try {
      const avail = await CoachEdnHealth.isAvailable();
      add(`Plataforma: ${avail.platform}`);
      add(`Health disponível? ${avail.available ? 'OK' : 'NÃO'}`);
      const perms = await CoachEdnHealth.getHealthPermissionsStatus();
      add(`Permissões concedidas? ${perms.granted ? 'OK' : 'NÃO'}`);
      if (perms.missing.length) add(`Faltando: ${perms.missing.join(', ')}`);

      const end = new Date();
      const start = new Date(end.getTime() - 24 * 3600 * 1000);
      const { workouts } = await CoachEdnHealth.queryWorkouts({ startTime: start.toISOString(), endTime: end.toISOString() });
      add(`Workouts (24h): ${workouts.length}`);
      for (const w of workouts) {
        const label = SPORT_LABEL[normalizeSportType(w.sportType)];
        add(`• ${label} — ${new Date(w.startedAt).toLocaleTimeString()} · ${Math.round(w.durationSeconds / 60)}min · rota:${w.hasRoute ? 'sim' : 'não'} · FC:${w.hasHeartRateSamples ? 'sim' : 'não'}${w.distanceMeters ? ` · ${(w.distanceMeters/1000).toFixed(2)}km` : ''}`);
        try {
          const d = await CoachEdnHealth.queryWorkoutDetails({ externalId: w.externalId, startTime: w.startedAt, endTime: w.endedAt });
          add(`   route: ${d.route.length} pontos · HR: ${d.heartRateSamples.length} amostras · origem: ${d.deviceName ?? '—'}`);
        } catch { add('   (falha ao ler detalhes)'); }
      }
    } catch (e) { add(`ERRO: ${e instanceof Error ? e.message : String(e)}`); }
    setBusy(false);
  }

  async function systemDiag() {
    setBusy(true); add('— Diagnóstico do sistema —');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { add('sem usuário'); setBusy(false); return; }
    try {
      const r = await fetch('/api/athlete-360'); const d = await r.json();
      if (d?.stateV2) {
        add(`AthleteState 2.0: v${d.stateV2.version ?? '?'} · limitador=${d.stateV2.limiter?.label ?? '—'} · segurança=${d.stateV2.safetyLevel}`);
        add(`Condições ativas: ${d.stateV2.conditions?.length ?? 0} · desconfortos: ${d.stateV2.discomforts?.length ?? 0}`);
      } else add('AthleteState 2.0: indisponível');
      if (d?.alertsUnified) add(`Alerta: ${d.alertsUnified.level} — ${d.alertsUnified.items?.[0]?.message ?? ''}`);
      if (d?.aos?.nextBestAction) add(`AOS próxima ação: [${d.aos.nextBestAction.domain}] ${d.aos.nextBestAction.action}`);
      // fila offline
      try { const q = JSON.parse(localStorage.getItem('edn_offline_queue') || '[]'); add(`Fila offline: ${Array.isArray(q) ? q.length : 0} item(s)`); } catch { add('Fila offline: n/d'); }
      // DB básico
      const [{ count: sess }, { count: cond }, { count: dec }] = await Promise.all([
        supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('physical_conditions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('athlete_decisions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      add(`DB: ${sess ?? 0} treinos · ${cond ?? 0} condições · ${dec ?? 0} decisões registradas`);
    } catch (e) { add(`ERRO diag: ${e instanceof Error ? e.message : String(e)}`); }
    setBusy(false);
  }

  async function doSync() {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { add('sem usuário'); setBusy(false); return; }
    try {
      const r = await runHealthSync(supabase, user.id);
      add(`SYNC: estado=${r.state} importadas=${r.imported} enriquecidas=${r.enriched} ignoradas=${r.skipped}`);
      const q = await processEnrichmentQueue(supabase, user.id);
      add(`FILA: processadas=${q.processed} enriquecidas=${q.enriched} reagendadas=${q.retried} desistidas=${q.gaveUp}`);
    } catch (e) { add(`ERRO sync: ${e instanceof Error ? e.message : String(e)}`); }
    setBusy(false);
  }

  return (
    <div className="p-4 max-w-lg mx-auto text-sm">
      <h1 className="text-lg font-bold text-zinc-100 mb-1">Diagnóstico — Camada Nativa de Saúde</h1>
      <p className="text-zinc-500 text-xs mb-3">Health Connect / HealthKit · uso interno</p>
      <div className="flex gap-2 mb-3">
        <button onClick={diagnose} disabled={busy} className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-100 text-xs font-semibold disabled:opacity-50">Diagnosticar</button>
        <button onClick={doSync} disabled={busy} className="px-3 py-2 rounded-lg bg-[#D4853A] text-white text-xs font-semibold disabled:opacity-50">Sincronizar agora</button>
        <button onClick={systemDiag} disabled={busy} className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-100 text-xs font-semibold disabled:opacity-50">Diagnóstico do sistema</button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-[11px] text-zinc-300 min-h-[200px]">{log.join('\n') || 'Sem dados. Toque em Diagnosticar.'}</pre>
    </div>
  );
}
