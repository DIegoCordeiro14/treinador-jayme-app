/**
 * FC média (bpm) lida do relógio via Health Connect para uma janela de tempo.
 * Retorna null fora do app nativo, sem plugin, sem permissão ou sem dados —
 * ou seja: a FC só é gravada quando há relógio conectado de fato.
 */
export async function fetchAvgHrFromHealthConnect(startMs: number, endMs: number): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const cap = w?.Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    const hc = cap?.Plugins?.HealthPlugin;
    if (!hc?.queryWorkouts) return null;
    try { await hc.requestHealthPermissions?.({ permissions: ['READ_HEART_RATE', 'READ_WORKOUTS'] }); } catch (e) { void e; }
    const r = await hc.queryWorkouts({
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
      includeHeartRate: true, includeRoute: false, includeSteps: false,
    });
    const bpms: number[] = [];
    for (const wk of (r?.workouts ?? [])) {
      for (const hr of (wk?.heartRate ?? [])) { if (hr?.bpm) bpms.push(Number(hr.bpm)); }
    }
    if (!bpms.length) return null;
    return Math.round(bpms.reduce((a: number, b: number) => a + b, 0) / bpms.length);
  } catch (e) { void e; return null; }
}
