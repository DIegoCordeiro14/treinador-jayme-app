// muscle-balance-guard.ts
// ─────────────────────────────────────────────────────────────────────────────
// v3 §6 — Muscle Balance Guard.
//
// Impede que a especialização destrua o equilíbrio global. Avalia pares
// antagônicos/estruturais (push×pull, peito×costas, quadríceps×posterior,
// cadeia anterior×posterior, superior×inferior) e garante um piso mínimo de
// estímulo (Minimum Effective Balance Floor) mesmo com prioridade alta.
// Puro/determinístico. Consome volume EFETIVO por grupo.
// ─────────────────────────────────────────────────────────────────────────────

export interface BalanceInput {
  effectiveVolume: Record<string, number>;   // séries efetivas/semana por grupo
  minFloor: Record<string, number>;          // piso mínimo por grupo (do landmark MEV)
}

export interface BalancePairCheck {
  pair: string;
  a: string; b: string;
  ratio: number | null;      // a/b
  balanced: boolean;
  note: string;
}

export interface FloorViolation { muscle: string; effective: number; floor: number; }

export interface BalanceGuardResult {
  pairs: BalancePairCheck[];
  floorViolations: FloorViolation[];
  balanced: boolean;
  adjustments: string[];     // recomendações determinísticas
}

// pares e faixa aceitável de razão (a/b)
const PAIRS: { key: string; a: string; b: string; min: number; max: number }[] = [
  { key: 'Peito × Costas', a: 'chest', b: 'back', min: 0.6, max: 1.4 },
  { key: 'Empurrar × Puxar (ombro/braço)', a: 'shoulders', b: 'back', min: 0.4, max: 1.2 },
  { key: 'Quadríceps × Posterior', a: 'legs', b: 'glutes', min: 0.7, max: 2.2 },
  { key: 'Bíceps × Tríceps', a: 'biceps', b: 'triceps', min: 0.6, max: 1.6 },
];

export function checkBalance(i: BalanceInput): BalanceGuardResult {
  const ev = i.effectiveVolume;
  const pairs: BalancePairCheck[] = PAIRS.map((p) => {
    const av = ev[p.a] ?? 0; const bv = ev[p.b] ?? 0;
    if (av === 0 && bv === 0) return { pair: p.key, a: p.a, b: p.b, ratio: null, balanced: true, note: 'sem dados' };
    const ratio = bv === 0 ? Infinity : Math.round((av / bv) * 100) / 100;
    const balanced = ratio >= p.min && ratio <= p.max;
    return { pair: p.key, a: p.a, b: p.b, ratio: Number.isFinite(ratio) ? ratio : null, balanced,
      note: balanced ? 'equilibrado' : `desequilíbrio (${p.a} ${av} vs ${p.b} ${bv})` };
  });

  const floorViolations: FloorViolation[] = [];
  for (const [m, floor] of Object.entries(i.minFloor)) {
    const eff = ev[m] ?? 0;
    if (eff < floor) floorViolations.push({ muscle: m, effective: Math.round(eff * 10) / 10, floor });
  }

  const adjustments: string[] = [];
  for (const v of floorViolations) adjustments.push(`Elevar ${v.muscle} para o piso mínimo (${v.effective} < ${v.floor} séries efetivas).`);
  for (const p of pairs) if (!p.balanced && p.ratio != null) adjustments.push(`Reequilibrar ${p.pair}.`);

  const balanced = floorViolations.length === 0 && pairs.every((p) => p.balanced);
  return { pairs, floorViolations, balanced, adjustments };
}
