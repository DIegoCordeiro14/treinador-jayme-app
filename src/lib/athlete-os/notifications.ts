/**
 * Coach Proativo — AOS Bloco 10
 * Converte a decisão do AOS + sinais em notificações inteligentes (nunca
 * genéricas): título, corpo baseado em dados reais, e um prompt para o chat.
 */
import type { AOSResult, AthleteDecision } from './index';

export interface CoachNotification {
  id: string;
  severity: 'info' | 'atencao' | 'critico' | 'positivo';
  title: string;
  body: string;
  ask: string;      // prompt pré-preenchido p/ o chat
}

const sev = (d: AthleteDecision): CoachNotification['severity'] =>
  d.domain === 'recovery' || d.domain === 'injury' ? 'critico'
  : d.kind === 'increase' ? 'positivo'
  : d.kind === 'maintain' ? 'info' : 'atencao';

export function buildNotifications(aos: AOSResult, max = 3): CoachNotification[] {
  const out: CoachNotification[] = [];
  const seen = new Set<string>();
  for (const d of aos.decisions) {
    if (d.suppressed) continue;
    if (seen.has(d.domain)) continue;
    seen.add(d.domain);
    out.push({
      id: `${d.domain}-${d.kind}`,
      severity: sev(d),
      title: d.action,
      body: `${d.reason} (confiança ${d.confidence}%${d.evidence.length ? ` · ${d.evidence.join(', ')}` : ''})`,
      ask: `${d.action} — por quê? ${d.reason} Pode detalhar e, se fizer sentido, aplicar?`,
    });
    if (out.length >= max) break;
  }
  return out;
}
