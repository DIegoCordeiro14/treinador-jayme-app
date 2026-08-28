// split-generation-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 8 — Geração/ranking de DIVISÃO DE TREINO (split).
//
// Escolhe determinísticamente a melhor divisão a partir de: dias disponíveis,
// experiência, recuperação, dias de cardio e pontos fracos. Não "inventa" um
// split — pontua um catálogo fixo de divisões conhecidas e devolve rankeadas
// com a frequência semanal resultante por grupo.
// ─────────────────────────────────────────────────────────────────────────────

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type RecoveryCategory = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export type SplitType =
  | 'full_body'
  | 'upper_lower'
  | 'push_pull_legs'
  | 'arnold'
  | 'abc'
  | 'bro_split'
  | 'specialization';

export interface SplitDay {
  label: string;
  muscles: string[];
}

export interface SplitTemplate {
  type: SplitType;
  name: string;
  minDays: number;
  maxDays: number;
  // função que expande para N dias
  build: (days: number, weakPoint?: string | null) => SplitDay[];
}

export interface SplitInput {
  days_per_week: number;
  experience: ExperienceLevel;
  recovery?: RecoveryCategory;
  cardio_days?: number;
  weak_point?: string | null;
}

export interface RankedSplit {
  type: SplitType;
  name: string;
  days: SplitDay[];
  score: number;                 // 0..100
  weekly_frequency: Record<string, number>;
  reason: string;
}

const MG_UPPER = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
const MG_LOWER = ['legs', 'glutes', 'calves'];

const TEMPLATES: SplitTemplate[] = [
  {
    type: 'full_body',
    name: 'Full Body',
    minDays: 2,
    maxDays: 4,
    build: (days) =>
      Array.from({ length: days }, (_, i) => ({
        label: `Full Body ${String.fromCharCode(65 + i)}`,
        muscles: [...MG_UPPER, ...MG_LOWER, 'abs'],
      })),
  },
  {
    type: 'upper_lower',
    name: 'Upper / Lower',
    minDays: 4,
    maxDays: 6,
    build: (days) =>
      Array.from({ length: days }, (_, i) =>
        i % 2 === 0
          ? { label: 'Upper', muscles: [...MG_UPPER, 'abs'] }
          : { label: 'Lower', muscles: [...MG_LOWER, 'abs'] }
      ),
  },
  {
    type: 'push_pull_legs',
    name: 'Push / Pull / Legs',
    minDays: 3,
    maxDays: 6,
    build: (days) => {
      const cycle: SplitDay[] = [
        { label: 'Push', muscles: ['chest', 'shoulders', 'triceps'] },
        { label: 'Pull', muscles: ['back', 'biceps', 'forearms'] },
        { label: 'Legs', muscles: [...MG_LOWER, 'abs'] },
      ];
      return Array.from({ length: days }, (_, i) => cycle[i % 3]);
    },
  },
  {
    type: 'arnold',
    name: 'Arnold (Peito+Costas / Ombro+Braço / Perna)',
    minDays: 3,
    maxDays: 6,
    build: (days) => {
      const cycle: SplitDay[] = [
        { label: 'Peito + Costas', muscles: ['chest', 'back'] },
        { label: 'Ombro + Braço', muscles: ['shoulders', 'biceps', 'triceps'] },
        { label: 'Perna', muscles: [...MG_LOWER, 'abs'] },
      ];
      return Array.from({ length: days }, (_, i) => cycle[i % 3]);
    },
  },
  {
    type: 'abc',
    name: 'A/B/C',
    minDays: 3,
    maxDays: 3,
    build: () => [
      { label: 'A — Peito/Ombro/Tríceps', muscles: ['chest', 'shoulders', 'triceps'] },
      { label: 'B — Costas/Bíceps', muscles: ['back', 'biceps', 'forearms'] },
      { label: 'C — Pernas/Abdômen', muscles: [...MG_LOWER, 'abs'] },
    ],
  },
  {
    type: 'bro_split',
    name: 'Bro Split (1 grupo/dia)',
    minDays: 5,
    maxDays: 6,
    build: (days) => {
      const cycle: SplitDay[] = [
        { label: 'Peito', muscles: ['chest'] },
        { label: 'Costas', muscles: ['back'] },
        { label: 'Ombro', muscles: ['shoulders'] },
        { label: 'Braços', muscles: ['biceps', 'triceps'] },
        { label: 'Pernas', muscles: [...MG_LOWER] },
        { label: 'Abdômen + Panturrilha', muscles: ['abs', 'calves'] },
      ];
      return Array.from({ length: days }, (_, i) => cycle[i % 6]);
    },
  },
  {
    type: 'specialization',
    name: 'Especialização (ponto fraco 2-3x)',
    minDays: 4,
    maxDays: 6,
    build: (days, weak) => {
      const focus = weak ?? 'shoulders';
      return Array.from({ length: days }, (_, i) => {
        if (i % 2 === 0) return { label: `Foco: ${focus} + Upper`, muscles: [focus, ...MG_UPPER.filter((m) => m !== focus)] };
        return { label: 'Lower', muscles: [...MG_LOWER, 'abs'] };
      });
    },
  },
];

function weeklyFrequency(days: SplitDay[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const d of days) for (const m of d.muscles) freq[m] = (freq[m] ?? 0) + 1;
  return freq;
}

export function rankSplits(input: SplitInput): RankedSplit[] {
  const days = Math.max(2, Math.min(6, Math.round(input.days_per_week)));
  const recovery = input.recovery ?? 'good';
  const recoveryPoor = recovery === 'low' || recovery === 'critical';
  const cardioDays = input.cardio_days ?? 0;

  const results: RankedSplit[] = [];

  for (const t of TEMPLATES) {
    if (days < t.minDays || days > t.maxDays) continue;
    if (t.type === 'specialization' && !input.weak_point) continue;

    const built = t.build(days, input.weak_point);
    const freq = weeklyFrequency(built);
    let score = 50;
    const reasons: string[] = [];

    // frequência ótima ~2x por grupo (hipertrofia)
    const avgFreq = Object.values(freq).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(freq).length);
    if (avgFreq >= 1.8 && avgFreq <= 2.6) { score += 15; reasons.push('Frequência ~2x/semana por grupo (ótima p/ hipertrofia).'); }
    else if (avgFreq < 1.3) { score -= 8; reasons.push('Frequência baixa (~1x) por grupo.'); }

    // experiência
    if (input.experience === 'beginner') {
      if (t.type === 'full_body' || t.type === 'upper_lower') { score += 18; reasons.push('Alta frequência ideal para iniciante.'); }
      if (t.type === 'bro_split') { score -= 20; reasons.push('Bro split é subótimo para iniciante.'); }
    } else if (input.experience === 'advanced') {
      if (t.type === 'push_pull_legs' || t.type === 'arnold' || t.type === 'specialization') { score += 12; reasons.push('Volume por sessão adequado a avançado.'); }
    } else {
      if (t.type === 'upper_lower' || t.type === 'push_pull_legs') { score += 10; reasons.push('Bom equilíbrio volume/frequência p/ intermediário.'); }
    }

    // dias
    if (days <= 3 && t.type === 'full_body') { score += 12; reasons.push('Poucos dias — full body cobre tudo com frequência.'); }
    if (days === 4 && t.type === 'upper_lower') { score += 12; reasons.push('4 dias casam perfeitamente com upper/lower.'); }
    if (days >= 5 && t.type === 'push_pull_legs') { score += 12; reasons.push('5-6 dias permitem PPL 2x.'); }

    // recuperação baixa: penaliza splits de alto volume/dia e alta frequência
    if (recoveryPoor) {
      if (t.type === 'bro_split') score += 4; // menos frequência/músculo
      if (t.type === 'full_body') { score -= 6; reasons.push('Recuperação baixa — full body diário pode sobrecarregar.'); }
    }

    // cardio ocupa dias/recuperação
    if (cardioDays >= 3 && days >= 5) { if (t.type === 'upper_lower' || t.type === 'full_body') { score += 6; reasons.push('Cardio alto — split flexível ajuda a gerir fadiga.'); } }

    // ponto fraco
    if (input.weak_point) {
      const wf = freq[input.weak_point] ?? 0;
      if (wf >= 2) { score += 10; reasons.push(`Atinge o ponto fraco (${input.weak_point}) ${wf}x/semana.`); }
      if (t.type === 'specialization') { score += 8; reasons.push('Especialização direta no ponto fraco.'); }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    results.push({ type: t.type, name: t.name, days: built, score, weekly_frequency: freq, reason: reasons.join(' ') });
  }

  return results.sort((a, b) => b.score - a.score);
}

export function bestSplit(input: SplitInput): RankedSplit | null {
  const ranked = rankSplits(input);
  return ranked[0] ?? null;
}
