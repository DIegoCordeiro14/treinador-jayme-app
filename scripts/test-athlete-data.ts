// scripts/test-athlete-data.ts — suíte do Athlete Data Hub (§37).
import { resolveMeasurement, resolveAllMeasurements } from '../src/lib/athlete-data/measurement-resolver';
import { targetsFor } from '../src/lib/athlete-data/athlete-events';
import type { Measurement } from '../src/lib/athlete-data/types';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('FAIL  ' + name + (extra ? '  » ' + extra : '')); } };

const iso = (daysAgo: number, hoursAgo = 0) => new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000).toISOString();

// 1) Peso: manual de hoje vence bioimpedância de 10 dias (recência > confiança)
{
  const ms: Measurement[] = [
    { metric: 'weight', value: 96.0, source: 'bioimpedance', measuredAt: iso(10) },
    { metric: 'weight', value: 96.4, source: 'manual', measuredAt: iso(0, 1) },
  ];
  const r = resolveMeasurement('weight', ms)!;
  ok('peso: manual recente vence bioimpedância antiga', r.value === 96.4 && r.source === 'manual', JSON.stringify(r));
  ok('peso: status valid', r.status === 'valid');
  ok('peso: supersededCount = 1', r.supersededCount === 1, String(r.supersededCount));
}

// 2) Composição corporal (bodyFat) só existe na bioimpedância → vem dela
{
  const ms: Measurement[] = [
    { metric: 'bodyFat', value: 18.2, source: 'bioimpedance', measuredAt: iso(10) },
    { metric: 'weight', value: 96.4, source: 'manual', measuredAt: iso(0) },
  ];
  const r = resolveMeasurement('bodyFat', ms)!;
  ok('bodyFat: origem bioimpedância', r.source === 'bioimpedance' && r.value === 18.2);
}

// 3) Empate técnico (mesmo dia) → maior confiança de fonte vence
{
  const ms: Measurement[] = [
    { metric: 'weight', value: 95.0, source: 'manual', measuredAt: iso(0, 2) },
    { metric: 'weight', value: 95.8, source: 'bioimpedance', measuredAt: iso(0, 1) },
  ];
  const r = resolveMeasurement('weight', ms)!;
  ok('peso: empate no dia → bioimpedância (alta confiança)', r.source === 'bioimpedance', JSON.stringify(r));
}

// 4) Registro suspeito: 80kg e 1min depois 150kg → o novo é suspect, nada apagado
{
  const ms: Measurement[] = [
    { metric: 'weight', value: 80, source: 'manual', measuredAt: iso(0, 0.02) },
    { metric: 'weight', value: 150, source: 'manual', measuredAt: iso(0, 0.01) },
  ];
  const r = resolveMeasurement('weight', ms)!;
  ok('peso: salto extremo marca suspect', r.status === 'suspect' || r.suspectCount >= 1, JSON.stringify(r));
  ok('peso: escolhe o plausível (80)', r.value === 80, JSON.stringify(r));
}

// 5) Plausibilidade fisiológica: 700kg é implausível
{
  const ms: Measurement[] = [{ metric: 'weight', value: 700, source: 'manual', measuredAt: iso(0) }];
  const r = resolveMeasurement('weight', ms)!;
  ok('peso: valor fora de faixa → suspect', r.status === 'suspect', JSON.stringify(r));
}

// 6) Ausência de dados → null
{
  ok('sem medições → null', resolveMeasurement('weight', []) === null);
}

// 7) Confiança default por fonte
{
  const hi = resolveMeasurement('restingHeartRate', [{ metric: 'restingHeartRate', value: 55, source: 'wearable', measuredAt: iso(0) }])!;
  ok('RHR wearable → confiança high', hi.confidence === 'high');
  const lo = resolveMeasurement('weight', [{ metric: 'weight', value: 96, source: 'estimated', measuredAt: iso(0) }])!;
  ok('peso estimado → confiança low', lo.confidence === 'low');
}

// 8) resolveAll cobre múltiplas métricas
{
  const ms: Measurement[] = [
    { metric: 'weight', value: 96.4, source: 'manual', measuredAt: iso(0) },
    { metric: 'bodyFat', value: 18, source: 'bioimpedance', measuredAt: iso(5) },
    { metric: 'restingHeartRate', value: 52, source: 'wearable', measuredAt: iso(1) },
  ];
  const all = resolveAllMeasurements(ms);
  ok('resolveAll: 3 métricas', Object.keys(all).length === 3, Object.keys(all).join(','));
}

// 9) Invalidação por evento
{
  ok('WEIGHT_UPDATED invalida nutritionContext', targetsFor('WEIGHT_UPDATED').includes('nutritionContext'));
  ok('BIOIMPEDANCE_IMPORTED invalida evolutionSummary', targetsFor('BIOIMPEDANCE_IMPORTED').includes('evolutionSummary'));
  ok('PROFILE_UPDATED NÃO invalida projections', !targetsFor('PROFILE_UPDATED').includes('projections'));
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
