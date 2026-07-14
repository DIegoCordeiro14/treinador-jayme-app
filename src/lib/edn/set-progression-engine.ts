/**
 * Set Progression Engine — histórico por POSIÇÃO de série.
 * Separa o histórico por (exercício + tipo de série + posição) e produz um perfil
 * por posição (últimos/média/tendência/confiança), com ponderação para o recente.
 * Permite prescrever cada Working/Feeder/Warm-up conforme a resposta real do atleta
 * naquela posição — não copiando a mesma carga para todas.
 */

export type SetTypeKey = 'aquecimento' | 'feeder' | 'top' | 'working' | 'backoff' | 'corrective';

export interface SetHistoryRecord {
  performedAt: string;     // ISO da sessão
  setType: SetTypeKey;
  setPosition: number;     // posição dentro do tipo (1..n)
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
}

export interface SetProgressionProfile {
  setType: SetTypeKey;
  setPosition: number;
  totalOccurrences: number;
  completionRate: number;              // 0..1
  latestWeightKg: number | null;
  latestReps: number | null;
  latestRir: number | null;
  averageWeightKg: number | null;
  recentTrend: 'up' | 'stable' | 'down';
  confidence: number;                  // 0..100
}

const key = (t: SetTypeKey, p: number) => `${t}:${p}`;

export function buildSetProfiles(records: SetHistoryRecord[]): Map<string, SetProgressionProfile> {
  // Agrupa por sessão para atribuir posição por tipo (1º working = pos1, etc.).
  const bySessionType: Record<string, SetHistoryRecord[]> = {};
  for (const r of records) {
    const sk = `${r.performedAt}|${r.setType}`;
    (bySessionType[sk] ?? (bySessionType[sk] = [])).push(r);
  }
  // Normaliza a posição dentro de cada (sessão,tipo) quando não vier definida (>0 mantém).
  const grouped: Record<string, SetHistoryRecord[]> = {};
  for (const list of Object.values(bySessionType)) {
    list.forEach((r, idx) => {
      const pos = r.setPosition && r.setPosition > 0 ? r.setPosition : idx + 1;
      const k = key(r.setType, pos);
      (grouped[k] ?? (grouped[k] = [])).push({ ...r, setPosition: pos });
    });
  }

  const out = new Map<string, SetProgressionProfile>();
  for (const [k, list] of Object.entries(grouped)) {
    const sorted = list.filter(r => r.weightKg != null).sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime());
    if (!sorted.length) continue;
    const latest = sorted[sorted.length - 1];
    const weights = sorted.map(r => r.weightKg as number);
    const avg = Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10;
    const completionRate = list.filter(r => r.completed).length / list.length;
    // Tendência: média volume (peso×reps) da 2ª metade vs 1ª
    let recentTrend: 'up' | 'stable' | 'down' = 'stable';
    if (sorted.length >= 4) {
      const mid = Math.floor(sorted.length / 2);
      const v = (r: SetHistoryRecord) => (r.weightKg ?? 0) * (r.reps ?? 1);
      const v1 = sorted.slice(0, mid).reduce((a, r) => a + v(r), 0) / mid;
      const v2 = sorted.slice(mid).reduce((a, r) => a + v(r), 0) / (sorted.length - mid);
      if (v1 > 0) { const d = (v2 - v1) / v1; recentTrend = d > 0.03 ? 'up' : d < -0.03 ? 'down' : 'stable'; }
    }
    const confidence = Math.max(30, Math.min(100, 45 + Math.min(sorted.length, 8) * 7));
    const [t, p] = k.split(':');
    out.set(k, {
      setType: t as SetTypeKey, setPosition: Number(p),
      totalOccurrences: sorted.length, completionRate: Math.round(completionRate * 100) / 100,
      latestWeightKg: latest.weightKg, latestReps: latest.reps, latestRir: latest.rir,
      averageWeightKg: avg, recentTrend, confidence,
    });
  }
  return out;
}

// Fallback: perfil exato → mesmo tipo (pos anterior) → null.
export function profileFor(profiles: Map<string, SetProgressionProfile>, setType: SetTypeKey, position: number): SetProgressionProfile | null {
  const exact = profiles.get(key(setType, position));
  if (exact) return exact;
  for (let p = position - 1; p >= 1; p--) { const pr = profiles.get(key(setType, p)); if (pr) return pr; }
  return null;
}
