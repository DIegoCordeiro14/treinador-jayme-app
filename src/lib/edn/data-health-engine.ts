// data-health-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hub P2 — Data Health Score (qualidade dos dados do atleta).
//
// Informa o quão confiáveis são os dados que alimentam as adaptações: perfil,
// peso, bioimpedância, treino, nutrição, wearable. Puro/determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export type SourceStatus = 'good' | 'warn' | 'missing';

export interface DataHealthInput {
  profileCompletionPct: number | null;   // 0..100 (evaluate_athlete)
  weightAgeDays: number | null;          // do canonical body state
  bioAgeDays: number | null;
  lastWorkoutAgeDays: number | null;
  nutritionLoggedDays14: number | null;  // dias registrados em 14
  wearableConnected: boolean;
}

export interface DataHealthComponent { key: string; label: string; status: SourceStatus; note: string; weight: number; }

export interface DataHealthResult {
  score: number;                         // 0..100
  level: 'high' | 'moderate' | 'low';
  components: DataHealthComponent[];
  topGap: string | null;                 // maior lacuna a resolver
}

const statusScore: Record<SourceStatus, number> = { good: 1, warn: 0.5, missing: 0 };

export function computeDataHealth(i: DataHealthInput): DataHealthResult {
  const comps: DataHealthComponent[] = [];

  const profStatus: SourceStatus = (i.profileCompletionPct ?? 0) >= 80 ? 'good' : (i.profileCompletionPct ?? 0) >= 40 ? 'warn' : 'missing';
  comps.push({ key: 'profile', label: 'Perfil', status: profStatus, weight: 0.25, note: profStatus === 'good' ? 'Completo' : `Anamnese ${i.profileCompletionPct ?? 0}%` });

  const wStatus: SourceStatus = i.weightAgeDays == null ? 'missing' : i.weightAgeDays <= 7 ? 'good' : i.weightAgeDays <= 21 ? 'warn' : 'missing';
  comps.push({ key: 'weight', label: 'Peso', status: wStatus, weight: 0.2, note: i.weightAgeDays == null ? 'Sem registro' : wStatus === 'good' ? 'Atual' : `${i.weightAgeDays} dias` });

  const bStatus: SourceStatus = i.bioAgeDays == null ? 'missing' : i.bioAgeDays <= 30 ? 'good' : i.bioAgeDays <= 60 ? 'warn' : 'missing';
  comps.push({ key: 'bio', label: 'Bioimpedância', status: bStatus, weight: 0.15, note: i.bioAgeDays == null ? 'Não importada' : `${i.bioAgeDays} dias` });

  const tStatus: SourceStatus = i.lastWorkoutAgeDays == null ? 'missing' : i.lastWorkoutAgeDays <= 5 ? 'good' : i.lastWorkoutAgeDays <= 12 ? 'warn' : 'missing';
  comps.push({ key: 'training', label: 'Treino', status: tStatus, weight: 0.2, note: i.lastWorkoutAgeDays == null ? 'Sem sessões' : tStatus === 'good' ? 'Atual' : `${i.lastWorkoutAgeDays} dias` });

  const nDays = i.nutritionLoggedDays14 ?? 0;
  const nStatus: SourceStatus = nDays >= 10 ? 'good' : nDays >= 4 ? 'warn' : 'missing';
  comps.push({ key: 'nutrition', label: 'Nutrição', status: nStatus, weight: 0.12, note: nStatus === 'good' ? 'Registro robusto' : nDays > 0 ? `${nDays}/14 dias` : 'Sem registro' });

  const weStatus: SourceStatus = i.wearableConnected ? 'good' : 'missing';
  comps.push({ key: 'wearable', label: 'Wearable', status: weStatus, weight: 0.08, note: i.wearableConnected ? 'Conectado' : 'Não conectado' });

  const totalW = comps.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((comps.reduce((a, c) => a + c.weight * statusScore[c.status], 0) / totalW) * 100);
  const level: DataHealthResult['level'] = score >= 80 ? 'high' : score >= 55 ? 'moderate' : 'low';

  // maior lacuna: componente de maior peso que não está 'good'
  const gap = [...comps].filter((c) => c.status !== 'good').sort((a, b) => b.weight - a.weight)[0];
  const topGap = gap ? `${gap.label}: ${gap.note}` : null;

  return { score, level, components: comps, topGap };
}
