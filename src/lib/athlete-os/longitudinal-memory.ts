/**
 * Memória Longitudinal — AOS Bloco 12
 * Transforma a timeline + decisões + histórico em uma "memória esportiva":
 * o que funcionou, o que falhou, preferências e padrões — reutilizada pelo
 * Coach para não repetir erros e reforçar o que deu certo. Determinístico.
 */

export interface MemoryTimelineItem { kind: string; title: string; detail?: string | null; created_at: string }
export interface MemoryDecisionItem { domain: string; decision: string; reason?: string | null; created_at: string }
export interface MemoryNoteItem { kind: string; content: string }

export interface LongitudinalInput {
  timeline: MemoryTimelineItem[];
  decisions: MemoryDecisionItem[];
  notes: MemoryNoteItem[];        // athlete_memory (preferências/limitações)
  prCount90d: number;
  plateauEpisodes: number;
  deloadCount90d: number;
}

export interface LongitudinalMemory {
  worked: string[];
  failed: string[];
  preferences: string[];
  patterns: string[];
  summary: string;
}

const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;

export function buildLongitudinalMemory(i: LongitudinalInput): LongitudinalMemory {
  const worked: string[] = [];
  const failed: string[] = [];
  const patterns: string[] = [];

  // O que funcionou
  if (i.prCount90d > 0) worked.push(`${i.prCount90d} PR(s) nos últimos 90 dias — progressão respondendo.`);
  // Deload seguido de PR = deload funcionou
  const tl = [...i.timeline].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (let k = 0; k < tl.length; k++) {
    if (tl[k].kind === 'deload') {
      const prAfter = tl.slice(k + 1).find((e) => e.kind === 'pr' && daysAgo(tl[k].created_at) - daysAgo(e.created_at) <= 21);
      if (prAfter) { worked.push('Deload seguido de PR — a estratégia de recuperação funcionou.'); break; }
    }
  }
  if (i.deloadCount90d > 0 && i.prCount90d >= i.deloadCount90d) worked.push('Ciclos com deload mantiveram a progressão.');

  // O que falhou / riscos
  if (i.plateauEpisodes >= 1) failed.push(`${i.plateauEpisodes} episódio(s) de platô — mudar estímulo mais cedo.`);
  const goalChanges = i.timeline.filter((e) => e.kind === 'goal_change').length;
  if (goalChanges >= 3) failed.push('Muitas trocas de objetivo — falta de consistência prejudica o resultado.');
  if (i.prCount90d === 0 && i.deloadCount90d === 0) failed.push('Sem PRs nem deload em 90 dias — progressão pode estar estagnada.');

  // Preferências e limitações (memória explícita do atleta)
  const preferences = i.notes.filter((n) => n.kind === 'preferencia' || n.kind === 'note' || n.kind === 'running_goal').map((n) => n.content);

  // Padrões
  const decByDomain: Record<string, number> = {};
  for (const d of i.decisions) decByDomain[d.domain] = (decByDomain[d.domain] ?? 0) + 1;
  const topDomain = Object.entries(decByDomain).sort((a, b) => b[1] - a[1])[0];
  if (topDomain && topDomain[1] >= 2) patterns.push(`Ajustes mais frequentes no domínio "${topDomain[0]}".`);

  const parts: string[] = [];
  if (worked.length) parts.push(`Funciona: ${worked[0]}`);
  if (failed.length) parts.push(`Cuidado: ${failed[0]}`);
  if (preferences.length) parts.push(`Preferências: ${preferences.slice(0, 2).join('; ')}`);
  const summary = parts.join(' · ') || 'Sem histórico suficiente para memória longitudinal.';

  return { worked, failed, preferences, patterns, summary };
}
