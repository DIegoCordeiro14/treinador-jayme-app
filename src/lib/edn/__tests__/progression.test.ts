/**
 * Testes unitários — Motor de Progressão EDN
 * Cobre progressão linear, volume, dupla progressão, estagnação, deload e XP.
 */
import {
  linearProgression,
  volumeProgression,
  doubleProgressionReps,
  detectStagnation,
  getDeloadRecommendation,
  xpProgress,
  xpToLevel,
  xpForNextLevel,
} from '../progression';

// ─── helpers ──────────────────────────────────────────────────────────────
function makeRecord(weight: number, date: string) {
  return {
    exercise_id: 'test-ex',
    session_date: date,
    sets: [{ set_type: 'topset' as const, weight_kg: weight, reps: 8, rir: 2, recorded_at: date }],
  };
}

// ─── 1. Progressão Linear ─────────────────────────────────────────────────
describe('linearProgression', () => {
  it('sugere incremento de carga quando series no alvo', () => {
    const result = linearProgression(100, 3, 3, 2.5);
    expect(result.suggested_weight).toBe(102.5);
  });

  it('incremento de 2.5kg', () => {
    const result = linearProgression(80, 3, 3, 2.5);
    expect(result.suggested_weight).toBe(82.5);
  });

  it('retorna mensagem de progressão', () => {
    const result = linearProgression(100, 3, 3, 2.5);
    expect(result.notes).toBeTruthy();
  });
});

// ─── 2. Progressão por Volume ─────────────────────────────────────────────
describe('volumeProgression', () => {
  it('mensagem quando abaixo do máximo de séries', () => {
    const result = volumeProgression(100, 3, 5, 2.5);
    expect(result.notes).toBeTruthy();
  });

  it('aumenta carga quando atinge máximo de séries', () => {
    const result = volumeProgression(100, 5, 5, 2.5);
    expect(result.suggested_weight).toBeGreaterThan(100);
  });
});

// ─── 3. Dupla Progressão ─────────────────────────────────────────────────
describe('doubleProgressionReps', () => {
  it('incrementa reps quando abaixo do teto', () => {
    const result = doubleProgressionReps(100, 12, 12, 18, 2.5);
    expect(result.suggested_reps).toBe(13);
    expect(result.suggested_weight).toBe(100);
  });

  it('aumenta carga e reseta reps no teto', () => {
    const result = doubleProgressionReps(100, 18, 18, 18, 2.5);
    expect(result.suggested_weight).toBeGreaterThan(100);
    expect(result.suggested_reps).toBe(12);
  });
});

// ─── 4. Detecção de Estagnação ────────────────────────────────────────────
describe('detectStagnation', () => {
  it('detecta estagnação com mesma carga por 2+ microciclos', () => {
    const records = [
      makeRecord(100, '2026-05-01'),
      makeRecord(100, '2026-05-08'),
      makeRecord(100, '2026-05-15'),
    ];
    const result = detectStagnation(records);
    expect(result.is_stagnated).toBe(true);
  });

  it('não detecta estagnação com progressão', () => {
    const records = [
      makeRecord(95,    '2026-05-01'),
      makeRecord(100,   '2026-05-08'),
      makeRecord(102.5, '2026-05-15'),
    ];
    const result = detectStagnation(records);
    expect(result.is_stagnated).toBe(false);
  });

  it('dados insuficientes retorna is_stagnated false', () => {
    const result = detectStagnation([makeRecord(100, '2026-05-01')]);
    expect(result.is_stagnated).toBe(false);
  });

  it('retorna recommendation quando estagnado', () => {
    const records = [makeRecord(100, '2026-05-01'), makeRecord(100, '2026-05-08'), makeRecord(100, '2026-05-15')];
    const result = detectStagnation(records);
    if (result.is_stagnated) {
      expect(['deload', 'change_model', 'continue']).toContain(result.recommendation);
    }
  });
});

// ─── 5. Protocolo de Deload ───────────────────────────────────────────────
describe('getDeloadRecommendation', () => {
  const stagnated = {
    is_stagnated: true,
    microcycles_without_progress: 3,
    last_progression_date: null,
    recommendation: 'deload' as const,
    message: 'Estagnado',
  };

  it('beginner: reduz carga 10%', () => {
    const result = getDeloadRecommendation('beginner', stagnated);
    expect(result.should_deload).toBe(true);
    expect(result.reduction_pct).toBe(10);
  });

  it('intermediate: reduz volume', () => {
    const result = getDeloadRecommendation('intermediate', stagnated);
    expect(result.should_deload).toBe(true);
    expect(result.type).toBe('volume_reduction');
  });

  it('advanced: reduz volume 50%', () => {
    const result = getDeloadRecommendation('advanced', stagnated);
    expect(result.should_deload).toBe(true);
    expect(result.reduction_pct).toBeGreaterThanOrEqual(40);
  });
});

// ─── 6. XP e Níveis ──────────────────────────────────────────────────────
describe('xpProgress', () => {
  it('nível 1 com 0 XP: current >= 0 (nunca negativo)', () => {
    const p = xpProgress(0);
    expect(p.current).toBeGreaterThanOrEqual(0);
    expect(p.level).toBe(1);
  });

  it('percentual nunca negativo', () => {
    expect(xpProgress(0).pct).toBeGreaterThanOrEqual(0);
    expect(xpProgress(50).pct).toBeGreaterThanOrEqual(0);
  });

  it('nível 2 a partir de 400 XP', () => {
    expect(xpToLevel(399)).toBe(1);
    expect(xpToLevel(400)).toBe(2);
  });

  it('XP para próximo nível sempre positivo', () => {
    [1, 2, 3, 5, 10].forEach(lvl => {
      expect(xpForNextLevel(lvl)).toBeGreaterThan(0);
    });
  });

  it('progressão de nível monotônica', () => {
    expect(xpProgress(400).level).toBeGreaterThan(xpProgress(0).level);
  });
});
