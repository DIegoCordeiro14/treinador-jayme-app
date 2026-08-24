/**
 * Alertas unificados (V9 §21) — consolida os sinais do atleta num único severity
 * de 4 níveis. Determinístico. O nível 'block' (🔴 Segurança) deve impedir a
 * sugestão de exercícios/atividades em conflito; os demais apenas orientam.
 *
 *  🟢 normal    — tudo dentro do esperado
 *  🟡 watch     — merece acompanhamento
 *  🟠 intervene — recomenda uma ação
 *  🔴 block     — segurança: restringir/impedir
 */
export type AlertLevel = 'normal' | 'watch' | 'intervene' | 'block';

export interface AlertInput {
  safetyLevel: 'none' | 'watch' | 'intervene' | 'block';   // do AthleteState 2.0
  recoveryCategory: 'excellent' | 'good' | 'moderate' | 'low' | 'critical';
  cardioLoadRisk?: 'baixo' | 'ideal' | 'elevado' | 'alto' | null;
  nutritionAdherencePct?: number | null;
  strengthTrendPct?: number | null;
}

export interface AlertItem { domain: string; level: AlertLevel; message: string }
export interface AlertResult { level: AlertLevel; items: AlertItem[]; blocks: boolean }

const RANK: Record<AlertLevel, number> = { normal: 0, watch: 1, intervene: 2, block: 3 };
export const ALERT_DOT: Record<AlertLevel, string> = { normal: '🟢', watch: '🟡', intervene: '🟠', block: '🔴' };
export const ALERT_LABEL: Record<AlertLevel, string> = { normal: 'Normal', watch: 'Atenção', intervene: 'Intervenção', block: 'Segurança' };

export function computeAlerts(i: AlertInput): AlertResult {
  const items: AlertItem[] = [];

  // Segurança física (🔴) — prioridade máxima
  if (i.safetyLevel === 'block') items.push({ domain: 'safety', level: 'block', message: 'Restrição física ativa: evite os movimentos em conflito e não progrida cargas nas regiões afetadas.' });
  else if (i.safetyLevel === 'intervene') items.push({ domain: 'safety', level: 'intervene', message: 'Condição física em acompanhamento — respeite as restrições cadastradas.' });
  else if (i.safetyLevel === 'watch') items.push({ domain: 'safety', level: 'watch', message: 'Risco articular leve — atenção à técnica.' });

  // Recuperação
  if (i.recoveryCategory === 'critical') items.push({ domain: 'recovery', level: 'intervene', message: 'Recuperação crítica — priorize descanso hoje.' });
  else if (i.recoveryCategory === 'low') items.push({ domain: 'recovery', level: 'intervene', message: 'Recuperação baixa — reduza a demanda da sessão.' });
  else if (i.recoveryCategory === 'moderate') items.push({ domain: 'recovery', level: 'watch', message: 'Recuperação moderada — mantenha RIR 2-3.' });

  // Cardio load
  if (i.cardioLoadRisk === 'alto') items.push({ domain: 'cardio', level: 'intervene', message: 'Carga de cardio alta — reduza o volume de endurance nesta semana.' });
  else if (i.cardioLoadRisk === 'elevado') items.push({ domain: 'cardio', level: 'watch', message: 'Carga de cardio subindo — acompanhe.' });

  // Nutrição
  if ((i.nutritionAdherencePct ?? 100) < 50) items.push({ domain: 'nutrition', level: 'intervene', message: 'Aderência nutricional baixa — retome a consistência.' });
  else if ((i.nutritionAdherencePct ?? 100) < 70) items.push({ domain: 'nutrition', level: 'watch', message: 'Aderência nutricional abaixo do ideal.' });

  // Performance
  if ((i.strengthTrendPct ?? 0) <= -7) items.push({ domain: 'performance', level: 'intervene', message: 'Performance caindo — considere consolidar carga ou deload.' });
  else if ((i.strengthTrendPct ?? 0) <= -3) items.push({ domain: 'performance', level: 'watch', message: 'Leve queda de performance — acompanhe.' });

  const level = items.reduce<AlertLevel>((mx, it) => (RANK[it.level] > RANK[mx] ? it.level : mx), 'normal');
  if (items.length === 0) items.push({ domain: 'geral', level: 'normal', message: 'Tudo dentro do esperado.' });
  return { level, items: items.sort((a, b) => RANK[b.level] - RANK[a.level]), blocks: level === 'block' };
}
