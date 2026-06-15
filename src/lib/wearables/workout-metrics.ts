/**
 * Métricas do relógio (Health Connect / Android) para uma sessão de treino.
 * Lê FC (média/máx) dos registros de treino que se sobrepõem à janela e as
 * calorias ativas do período. Retorna nulls quando não há relógio/dados.
 *
 * Observação: o Health Connect só tem FC se o relógio gravou um "treino" com FC
 * cobrindo o período (e sincronizou) — por isso é opcional/best-effort.
 */
export interface WorkoutMetrics {
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHC(): any | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap?.Plugins?.HealthPlugin ?? null;
}

async function ensureInit(hc: { isHealthAvailable?: () => Promise<{ available?: boolean }>; requestHealthPermissions?: (o: unknown) => Promise<unknown> }) {
  try { await hc.isHealthAvailable?.(); } catch { /* inicializa o client */ }
  try { await hc.requestHealthPermissions?.({ permissions: ['READ_HEART_RATE', 'READ_WORKOUTS', 'READ_ACTIVE_CALORIES', 'READ_TOTAL_CALORIES'] }); } catch { /* */ }
}

export async function fetchWorkoutMetrics(startMs: number, endMs: number): Promise<WorkoutMetrics> {
  const empty: WorkoutMetrics = { avgHr: null, maxHr: null, calories: null };
  const hc = getHC();
  if (!hc?.queryWorkouts) return empty;
  try {
    await ensureInit(hc);
    const startISO = new Date(startMs).toISOString();
    const endISO = new Date(endMs).toISOString();
    const bpms: number[] = [];
    try {
      const r = await hc.queryWorkouts({ startDate: startISO, endDate: endISO, includeHeartRate: true, includeRoute: false, includeSteps: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const wk of (r?.workouts ?? [])) for (const h of (wk?.heartRate ?? [])) { const b = Number(h?.bpm ?? h?.value); if (Number.isFinite(b) && b > 0) bpms.push(b); }
    } catch { /* */ }
    let calories: number | null = null;
    try {
      const c = await hc.queryAggregated?.({ startDate: startISO, endDate: endISO, dataType: 'active-calories', bucket: 'day' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (c?.aggregatedData ?? []).reduce((s: number, a: any) => s + (Number(a?.value) || 0), 0);
      if (v > 0) calories = Math.round(v);
    } catch { /* */ }
    return {
      avgHr: bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null,
      maxHr: bpms.length ? Math.round(Math.max(...bpms)) : null,
      calories,
    };
  } catch { return empty; }
}

/** FC "quase ao vivo": último valor de FC nos últimos ~3 min (best-effort). */
export async function fetchLiveHr(): Promise<number | null> {
  const hc = getHC();
  if (!hc?.queryWorkouts) return null;
  try {
    await ensureInit(hc);
    const end = Date.now();
    const r = await hc.queryWorkouts({ startDate: new Date(end - 3 * 60 * 1000).toISOString(), endDate: new Date(end).toISOString(), includeHeartRate: true, includeRoute: false, includeSteps: false });
    let latest: { t: number; bpm: number } | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const wk of (r?.workouts ?? [])) for (const h of (wk?.heartRate ?? [])) {
      const b = Number(h?.bpm ?? h?.value); const t = new Date(h?.timestamp ?? h?.startDate ?? h?.date ?? 0).getTime();
      if (Number.isFinite(b) && b > 0 && (!latest || t >= latest.t)) latest = { t: Number.isFinite(t) ? t : end, bpm: b };
    }
    return latest ? Math.round(latest.bpm) : null;
  } catch { return null; }
}
